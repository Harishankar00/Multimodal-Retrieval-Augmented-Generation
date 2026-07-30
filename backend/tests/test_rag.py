import os
import sys
import io
import pytest
from unittest.mock import patch
from PIL import Image
from fastapi.testclient import TestClient

sys.path.append(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from app.main import app
from app.config import settings

client = TestClient(app)

def test_query_endpoint_mocked():
    # 1. Create a dummy image
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    # Upload to create index
    upload_response = client.post("/api/upload", files={"file": ("invoice.png", img_bytes, "image/png")})
    assert upload_response.status_code == 200
    doc_id = upload_response.json()["doc_id"]

    # 2. Mock query_gemini call to avoid external API dependencies during normal tests
    mocked_answer = "This is a mocked answer for the query."
    with patch("app.services.llm.llm_service.query_gemini", return_value=mocked_answer) as mock_method:
        response = client.post("/api/query", json={
            "doc_id": doc_id,
            "query": "What is the total amount?",
            "limit": 3
        })
        
        assert response.status_code == 200
        data = response.json()
        assert data["answer"] == mocked_answer
        assert isinstance(data["sources"], list)
        mock_method.assert_called_once()
def check_api_key_works():
    api_key = os.getenv("GEMINI_API_KEY")
    if not api_key:
        return False
    try:
        from google import genai
        client = genai.Client(api_key=api_key)
        client.models.generate_content(
            model=os.getenv("GEMINI_MODEL", "gemini-2.0-flash"),
            contents=["test"]
        )
        return True
    except Exception:
        return False

@pytest.mark.skipif(not os.getenv("GEMINI_API_KEY") or not check_api_key_works(), reason="GEMINI_API_KEY not configured or has rate/quota limits")
def test_query_endpoint_real_api():
    # 1. Create a dummy image
    img = Image.new("RGB", (100, 100), color="white")
    img_bytes_io = io.BytesIO()
    img.save(img_bytes_io, format="PNG")
    img_bytes = img_bytes_io.getvalue()

    # Upload
    upload_response = client.post("/api/upload", files={"file": ("invoice.png", img_bytes, "image/png")})
    assert upload_response.status_code == 200
    doc_id = upload_response.json()["doc_id"]

    # 2. Real query call
    response = client.post("/api/query", json={
        "doc_id": doc_id,
        "query": "Hello, please answer with exactly the word 'Test'.",
        "limit": 3
    })
    
    assert response.status_code == 200
    data = response.json()
    assert "answer" in data
    assert isinstance(data["answer"], str)
    assert len(data["answer"]) > 0
