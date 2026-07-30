import io
import sys
import os
from PIL import Image
from fastapi.testclient import TestClient

# Ensure backend root is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.services.ocr import ocr_service

client = TestClient(app)

def test_health_check():
    response = client.get("/api/health")
    assert response.status_code == 200
    assert response.json()["status"] == "ok"

def test_ocr_service_dummy_image():
    # Create a 100x100 white image
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    # Run OCR (should succeed and return empty or minimal blocks since it's blank)
    blocks = ocr_service.extract_text(img_bytes, page_number=1)
    assert isinstance(blocks, list)

def test_upload_endpoint_image():
    # Create a simple image to upload
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    files = {"file": ("test.png", img_bytes, "image/png")}
    response = client.post("/api/upload", files=files)
    
    assert response.status_code == 200
    data = response.json()
    assert "doc_id" in data
    assert data["filename"] == "test.png"
    assert data["pages_count"] == 1
    assert isinstance(data["blocks"], list)
