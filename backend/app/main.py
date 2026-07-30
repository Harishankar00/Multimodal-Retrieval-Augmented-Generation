import os
import sys
# Ensure backend directory is in the python path for direct file execution
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.responses import FileResponse
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from PIL import Image
from app.schemas.ocr import OCRResult, OCRBlock
from app.services.document import document_service, DATA_DIR
from app.services.vector_db import vector_db_service
from app.services.llm import llm_service

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

class HealthStatus(BaseModel):
    status: str
    message: str

@app.get("/api/health", response_model=HealthStatus)
async def health_check():
    return HealthStatus(status="ok", message="Multimodal RAG API is healthy")

@app.post("/api/upload", response_model=OCRResult)
def upload_file(file: UploadFile = File(...)):
    # Validate file type
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
        return ocr_result
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to process document: {str(e)}"
        )

@app.get("/api/search", response_model=List[OCRBlock])
def search_document(doc_id: str, query: str, limit: int = 3):
    try:
        results = vector_db_service.search_index(doc_id, query, top_k=limit)
        return results
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to search document vector database: {str(e)}"
        )

class QueryRequest(BaseModel):
    doc_id: str
    query: str
    limit: int = 3

class QueryResponse(BaseModel):
    answer: str
    sources: List[OCRBlock]

@app.post("/api/query", response_model=QueryResponse)
def query_document(request: QueryRequest):
    try:
        # 1. Search for most relevant blocks in vector DB
        blocks = vector_db_service.search_index(request.doc_id, request.query, top_k=request.limit)

        # 2. Extract unique page numbers and load page images
        unique_pages = sorted(list(set(block.page_number for block in blocks)))
        
        page_images = []
        for page_num in unique_pages:
            page_path = os.path.join(DATA_DIR, request.doc_id, f"page_{page_num}.png")
            if os.path.exists(page_path):
                page_images.append(Image.open(page_path).convert("RGB"))

        # Fallback to page 1 if no pages are mapped
        if not page_images:
            page_1_path = os.path.join(DATA_DIR, request.doc_id, "page_1.png")
            if os.path.exists(page_1_path):
                page_images.append(Image.open(page_1_path).convert("RGB"))

        # 3. Request LLM response
        answer = llm_service.query_llm(request.query, blocks, page_images)

        return QueryResponse(answer=answer, sources=blocks)
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail=f"Failed to query document: {str(e)}"
        )

@app.get("/api/documents/{doc_id}/pages/{page_num}")
def get_document_page(doc_id: str, page_num: int):
    page_path = os.path.join(DATA_DIR, doc_id, f"page_{page_num}.png")
    if not os.path.exists(page_path):
        raise HTTPException(
            status_code=404,
            detail="Document page image not found"
        )
    return FileResponse(page_path)

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
