import os
import sys
# Ensure backend directory is in the python path for direct file execution
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI, UploadFile, File, HTTPException, Depends, Form
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel
from typing import List
from PIL import Image
from firebase_admin import auth as admin_auth, firestore
from app.schemas.ocr import OCRResult, OCRBlock
from app.services.document import document_service, DATA_DIR
from app.services.vector_db import vector_db_service
from app.services.llm import llm_service
from app.services.firebase_config import db as firestore_db

app = FastAPI(
    title="Multimodal RAG API",
    description="Backend API for Multimodal Retrieval-Augmented Generation (RAG) for VQA",
    version="1.0.0"
)

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Adjust in production
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

security = HTTPBearer()

def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)):
    token = credentials.credentials
    try:
        decoded_token = admin_auth.verify_id_token(token)
        return decoded_token["uid"]
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=401,
            detail=f"Invalid or expired authentication token: {str(e)}"
        )

class HealthStatus(BaseModel):
    status: str
    message: str

@app.get("/api/health", response_model=HealthStatus)
async def health_check():
    return HealthStatus(status="ok", message="Multimodal RAG API is healthy")

class ChatCreateRequest(BaseModel):
    chat_id: str
    filename: str = None
    doc_id: str = None
    pages_count: int = 0

@app.get("/api/chats")
def get_chats(user_id: str = Depends(get_current_user)):
    try:
        chats_ref = firestore_db.collection("users").document(user_id).collection("chats")
        docs = chats_ref.order_by("created_at", direction=firestore.Query.DESCENDING).stream()
        chats = []
        for doc in docs:
            d = doc.to_dict()
            d["chat_id"] = doc.id
            if "created_at" in d and d["created_at"]:
                d["created_at"] = d["created_at"].isoformat()
            chats.append(d)
        return chats
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chats")
def create_chat(request: ChatCreateRequest, user_id: str = Depends(get_current_user)):
    try:
        chat_ref = firestore_db.collection("users").document(user_id).collection("chats").document(request.chat_id)
        chat_data = {
            "doc_id": request.doc_id,
            "filename": request.filename,
            "pages_count": request.pages_count,
            "created_at": firestore.SERVER_TIMESTAMP
        }
        chat_ref.set(chat_data)
        return {"status": "success", "chat_id": request.chat_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.delete("/api/chats/{chat_id}")
def delete_chat(chat_id: str, user_id: str = Depends(get_current_user)):
    try:
        def delete_collection(coll_ref, batch_size=10):
            docs = coll_ref.limit(batch_size).stream()
            deleted = 0
            for doc in docs:
                doc.reference.delete()
                deleted += 1
            if deleted >= batch_size:
                return delete_collection(coll_ref, batch_size)

        chat_ref = firestore_db.collection("users").document(user_id).collection("chats").document(chat_id)
        delete_collection(chat_ref.collection("documents"))
        delete_collection(chat_ref.collection("messages"))
        chat_ref.delete()
        return {"status": "success"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/chats/{chat_id}/messages")
def get_messages(chat_id: str, user_id: str = Depends(get_current_user)):
    try:
        messages_ref = firestore_db.collection("users").document(user_id).collection("chats").document(chat_id).collection("messages")
        docs = messages_ref.order_by("timestamp", direction=firestore.Query.ASCENDING).stream()
        messages = []
        for doc in docs:
            d = doc.to_dict()
            d["message_id"] = doc.id
            if "timestamp" in d and d["timestamp"]:
                d["timestamp"] = d["timestamp"].isoformat()
            # Unflatten block box coordinates in sources if present
            if "sources" in d and d["sources"]:
                for src in d["sources"]:
                    flat_box = src.get("box", [])
                    src["box"] = [flat_box[i:i+2] for i in range(0, len(flat_box), 2)]
            messages.append(d)
        return messages
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/chats/{chat_id}/upload", response_model=OCRResult)
def upload_document(chat_id: str, file: UploadFile = File(...), user_id: str = Depends(get_current_user)):
    allowed_extensions = {".jpg", ".jpeg", ".png", ".pdf"}
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed types: JPG, JPEG, PNG, PDF"
        )
    
    try:
        file_bytes = file.file.read()
        ocr_result = document_service.process_document(file_bytes, file.filename)
        
        chat_ref = firestore_db.collection("users").document(user_id).collection("chats").document(chat_id)
        chat_ref.update({
            "doc_id": ocr_result.doc_id,
            "filename": ocr_result.filename,
            "pages_count": ocr_result.pages_count
        })
        
        # Flatten the coordinates of blocks to avoid Firestore nested array constraints
        serialized_blocks = []
        for block in ocr_result.blocks:
            b_dict = block.dict()
            b_dict["box"] = [coord for point in block.box for coord in point]
            serialized_blocks.append(b_dict)

        doc_ref = chat_ref.collection("documents").document(ocr_result.doc_id)
        doc_ref.set({
            "doc_id": ocr_result.doc_id,
            "filename": ocr_result.filename,
            "pages_count": ocr_result.pages_count,
            "blocks": serialized_blocks
        })
        
        return ocr_result
    except Exception as e:
        import traceback
        traceback.print_exc()
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {str(e)}"
        )

@app.get("/api/search", response_model=List[OCRBlock])
def search_document(doc_id: str, query: str, limit: int = 3, user_id: str = Depends(get_current_user)):
    try:
        results = vector_db_service.search_index(doc_id, query, top_k=limit)
        return results
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search document vector database: {str(e)}"
        )

class QueryRequest(BaseModel):
    chat_id: str
    query: str
    limit: int = 3

class QueryResponse(BaseModel):
    answer: str
    sources: List[OCRBlock]
    usage: dict = None

@app.post("/api/query", response_model=QueryResponse)
def query_document(request: QueryRequest, user_id: str = Depends(get_current_user)):
    try:
        chat_ref = firestore_db.collection("users").document(user_id).collection("chats").document(request.chat_id)
        chat_doc = chat_ref.get()
        if not chat_doc.exists:
            raise HTTPException(status_code=404, detail="Chat session not found")
        
        chat_data = chat_doc.to_dict()
        doc_id = chat_data.get("doc_id")
        if not doc_id:
            raise HTTPException(status_code=400, detail="No document uploaded for this chat session")

        blocks = vector_db_service.search_index(doc_id, request.query, top_k=request.limit)

        unique_pages = sorted(list(set(block.page_number for block in blocks)))
        
        page_images = []
        for page_num in unique_pages:
            page_path = os.path.join(DATA_DIR, doc_id, f"page_{page_num}.png")
            if os.path.exists(page_path):
                page_images.append(Image.open(page_path).convert("RGB"))

        if not page_images:
            page_1_path = os.path.join(DATA_DIR, doc_id, "page_1.png")
            if os.path.exists(page_1_path):
                page_images.append(Image.open(page_1_path).convert("RGB"))

        answer, usage = llm_service.query_llm(request.query, blocks, page_images)

        messages_ref = chat_ref.collection("messages")
        
        messages_ref.add({
            "role": "user",
            "text": request.query,
            "timestamp": firestore.SERVER_TIMESTAMP
        })
        
        # Flatten box coordinates for Firestore serialization in messages subcollection
        serialized_sources = []
        for block in blocks:
            b_dict = block.dict()
            b_dict["box"] = [coord for point in block.box for coord in point]
            serialized_sources.append(b_dict)

        messages_ref.add({
            "role": "assistant",
            "text": answer,
            "sources": serialized_sources,
            "usage": usage,
            "timestamp": firestore.SERVER_TIMESTAMP
        })

        return QueryResponse(answer=answer, sources=blocks, usage=usage)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query document: {str(e)}"
        )

@app.get("/api/documents/{doc_id}/pages/{page_num}")
def get_document_page(doc_id: str, page_num: int, user_id: str = Depends(get_current_user)):
    page_path = os.path.join(DATA_DIR, doc_id, f"page_{page_num}.png")
    if not os.path.exists(page_path):
        raise HTTPException(
            status_code=404,
            detail="Document page image not found"
        )
    return FileResponse(page_path)

@app.get("/api/chats/{chat_id}/documents/{doc_id}")
def get_chat_document(chat_id: str, doc_id: str, user_id: str = Depends(get_current_user)):
    try:
        doc_ref = firestore_db.collection("users").document(user_id).collection("chats").document(chat_id).collection("documents").document(doc_id)
        doc_snap = doc_ref.get()
        if not doc_snap.exists:
            raise HTTPException(status_code=404, detail="Document layout data not found")
        data = doc_snap.to_dict()
        # Unflatten the box coordinates back to List[List[float]]
        if data and "blocks" in data:
            for block in data["blocks"]:
                flat_box = block.get("box", [])
                block["box"] = [flat_box[i:i+2] for i in range(0, len(flat_box), 2)]
        return data
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
