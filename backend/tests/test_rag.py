import os
import sys
import io
import pytest
from unittest.mock import patch, MagicMock
from PIL import Image
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app, get_current_user
from app import main

# 1. Bypass Firebase authentication in unit tests
app.dependency_overrides[get_current_user] = lambda: "test_user_123"

# 2. Mock Firestore Client globally for tests
mock_firestore = MagicMock()
main.firestore_db = mock_firestore

client = TestClient(app)

def test_query_endpoint_mocked():
    # Ensure correct firestore mock is bound to main module for this test
    main.firestore_db = mock_firestore

    # Setup firestore mock return values for active document lookup
    mock_chat_doc = MagicMock()
    mock_chat_doc.exists = True
    
    mock_chat_ref = MagicMock()
    mock_chat_ref.get.return_value = mock_chat_doc
    
    mock_firestore.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_chat_ref
    mock_firestore.collection.return_value.document.return_value.collection.return_value.document.return_value.get.return_value = mock_chat_doc

    # Configure mock collection documents subcollection stream
    mock_doc_snap = MagicMock()
    mock_docs_collection = MagicMock()
    mock_docs_collection.stream.return_value = [mock_doc_snap]
    mock_chat_ref.collection.return_value = mock_docs_collection

    # Create a dummy image
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    # Upload to create index
    chat_id = "test_chat_123"
    upload_response = client.post(
        f"/api/chats/{chat_id}/upload", 
        files={"file": ("invoice.png", img_bytes, "image/png")},
        headers={"Authorization": "Bearer dummy_token"}
    )
    assert upload_response.status_code == 200
    doc_id = upload_response.json()["doc_id"]
    
    # Configure mock chat document to return the parsed doc_id and subcollection IDs
    mock_chat_doc.to_dict.return_value = {"doc_id": doc_id}
    mock_doc_snap.id = doc_id

    # Mock query_llm call
    mocked_answer = "This is a mocked answer for the query."
    with patch("app.services.llm.llm_service.query_llm", return_value=(mocked_answer, {"prompt_tokens": 10, "completion_tokens": 5, "total_tokens": 15})) as mock_method:
        response = client.post(
            "/api/query", 
            json={
                "chat_id": chat_id,
                "query": "What is the total amount?",
                "limit": 3
            },
            headers={"Authorization": "Bearer dummy_token"}
        )
        
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == mocked_answer
        assert isinstance(data["sources"], list)
        mock_method.assert_called_once()

def test_share_chat_endpoint():
    main.firestore_db = mock_firestore
    mock_chat_doc = MagicMock()
    mock_chat_doc.exists = True
    mock_chat_doc.to_dict.return_value = {"filename": "Test Chat", "uploaded_documents": []}
    
    mock_messages_stream = MagicMock()
    mock_messages_stream.order_by.return_value.stream.return_value = []
    
    mock_chat_ref = MagicMock()
    mock_chat_ref.get.return_value = mock_chat_doc
    mock_chat_ref.collection.return_value = mock_messages_stream
    
    mock_firestore.collection.return_value.document.return_value.collection.return_value.document.return_value = mock_chat_ref
    
    response = client.post("/api/chats/test_chat_123/share")
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "success"
    assert "share_id" in data
    assert "share_url" in data

def test_get_shared_chat_endpoint():
    main.firestore_db = mock_firestore
    mock_shared_doc = MagicMock()
    mock_shared_doc.exists = True
    mock_shared_doc.to_dict.return_value = {
        "share_id": "share_abc",
        "title": "Test Shared Chat",
        "messages": [],
        "uploaded_documents": [],
        "created_at": None
    }
    
    mock_firestore.collection.return_value.document.return_value.get.return_value = mock_shared_doc
    
    response = client.get("/api/shared/share_abc")
    assert response.status_code == 200
    data = response.json()
    assert data["share_id"] == "share_abc"
    assert data["title"] == "Test Shared Chat"

def test_analytics_endpoint():
    main.firestore_db = mock_firestore
    mock_chat_snap = MagicMock()
    mock_firestore.collection.return_value.document.return_value.collection.return_value.stream.return_value = [mock_chat_snap]
    
    mock_msg_snap = MagicMock()
    mock_msg_snap.to_dict.return_value = {
        "usage": {"prompt_tokens": 100, "completion_tokens": 50, "total_tokens": 150},
        "timestamp": MagicMock()
    }
    mock_chat_snap.reference.collection.return_value.stream.return_value = [mock_msg_snap]
    
    response = client.get("/api/analytics/token-usage")
    assert response.status_code == 200
    data = response.json()
    assert isinstance(data, list)
    assert len(data) == 7

