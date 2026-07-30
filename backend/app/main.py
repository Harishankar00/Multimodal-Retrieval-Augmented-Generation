import os
from fastapi import FastAPI, UploadFile, File, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

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

@app.post("/api/upload")
async def upload_file(file: UploadFile = File(...)):
    # Validate file type
    allowed_extensions = {".jpg", ".jpeg", ".png", ".pdf"}
    _, ext = os.path.splitext(file.filename.lower())
    if ext not in allowed_extensions:
        raise HTTPException(
            status_code=400,
            detail=f"Unsupported file type '{ext}'. Allowed types: JPG, JPEG, PNG, PDF"
        )
    
    # Save file or process it (skeleton for Phase 1)
    return {
        "filename": file.filename,
        "content_type": file.content_type,
        "status": "received",
        "message": "File received successfully (skeleton endpoint)"
    }

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=8000, reload=True)
