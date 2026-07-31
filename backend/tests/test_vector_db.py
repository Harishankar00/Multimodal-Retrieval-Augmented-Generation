import os
import sys
import io
from PIL import Image
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app, get_current_user
from app.schemas.ocr import OCRBlock
from app.services.vector_db import vector_db_service
from app import main
from unittest.mock import MagicMock

# Bypass Firebase authentication in unit tests
app.dependency_overrides[get_current_user] = lambda: "test_user_123"

# Mock Firestore Client globally for tests
mock_firestore = MagicMock()
main.firestore_db = mock_firestore

client = TestClient(app)

def test_vector_db_indexing_and_searching():
    doc_id = "test-doc-123"
    blocks = [
        OCRBlock(text="Machine learning and artificial intelligence algorithms.", box=[[0,0],[1,0],[1,1],[0,1]], confidence=0.99, page_number=1),
        OCRBlock(text="Quarterly budget, finance reports, and revenue spreadsheet.", box=[[0,0],[1,0],[1,1],[0,1]], confidence=0.95, page_number=1),
    ]

    # Create index
    vector_db_service.create_index(doc_id, blocks)

    # Search for finance related terms
    finance_results = vector_db_service.search_index(doc_id, query="revenue and budget reports", top_k=1)
    assert len(finance_results) == 1
    assert "budget" in finance_results[0].text

    # Search for AI related terms
    ai_results = vector_db_service.search_index(doc_id, query="neural networks and machine learning", top_k=1)
    assert len(ai_results) == 1
    assert "artificial intelligence" in ai_results[0].text

    # Clean up generated index files for this test doc
    doc_dir = os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "data", "documents", doc_id)
    if os.path.exists(doc_dir):
        for file in ["index.faiss", "index_metadata.json"]:
            path = os.path.join(doc_dir, file)
            if os.path.exists(path):
                os.remove(path)
        os.rmdir(doc_dir)

def test_search_endpoint():
    # Setup firestore mock return values
    mock_chat_doc = MagicMock()
    mock_chat_doc.exists = True
    mock_firestore.collection.return_value.document.return_value.collection.return_value.document.return_value = MagicMock()

    # 1. Upload a dummy image to generate an index
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    upload_response = client.post(
        "/api/chats/test_chat_123/upload", 
        files={"file": ("invoice.png", img_bytes, "image/png")},
        headers={"Authorization": "Bearer dummy_token"}
    )
    assert upload_response.status_code == 200
    upload_data = upload_response.json()
    doc_id = upload_data["doc_id"]

    # 2. Query search endpoint (which should be empty or return nothing because the image was blank)
    search_response = client.get(
        f"/api/search?doc_id={doc_id}&query=test&limit=3",
        headers={"Authorization": "Bearer dummy_token"}
    )
    assert search_response.status_code == 200
    search_data = search_response.json()
    assert isinstance(search_data, list)
