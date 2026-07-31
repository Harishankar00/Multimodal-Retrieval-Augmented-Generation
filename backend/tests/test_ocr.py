import io
import sys
import os
from PIL import Image
from fastapi.testclient import TestClient

# Ensure backend root is in python path
sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app, get_current_user
from app.services.ocr import ocr_service
from app import main
from unittest.mock import MagicMock

# Bypass Firebase authentication in unit tests
app.dependency_overrides[get_current_user] = lambda: "test_user_123"

# Mock Firestore Client globally for tests
mock_firestore = MagicMock()
main.firestore_db = mock_firestore

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
    # Ensure correct firestore mock is bound to main module for this test
    main.firestore_db = mock_firestore

    # Setup firestore mock return values
    mock_chat_doc = MagicMock()
    mock_chat_doc.exists = True
    mock_firestore.collection.return_value.document.return_value.collection.return_value.document.return_value = MagicMock()

    # Create a simple image to upload
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    files = {"file": ("test.png", img_bytes, "image/png")}
    response = client.post(
        "/api/chats/test_chat_123/upload", 
        files=files,
        headers={"Authorization": "Bearer dummy_token"}
    )
    
    assert response.status_code == 200
    data = response.json()
    assert "doc_id" in data
    assert data["filename"] == "test.png"
    assert data["pages_count"] == 1
    assert isinstance(data["blocks"], list)
