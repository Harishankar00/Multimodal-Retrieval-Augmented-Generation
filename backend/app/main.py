import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List
from app.schemas.ocr import OCRResult, OCRBlock
from app.services.document import document_service
from app.services.vector_db import vector_db_service

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

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
