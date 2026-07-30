import os
import json
import numpy as np
import faiss
from sentence_transformers import SentenceTransformer
from typing import List
from app.schemas.ocr import OCRBlock

# Define storage directory for processed documents
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data", "documents")

class VectorDBService:
    def __init__(self):
        self._model = None

    @property
    def model(self) -> SentenceTransformer:
        if self._model is None:
            self._model = SentenceTransformer('all-MiniLM-L6-v2')
        return self._model

    def create_index(self, doc_id: str, blocks: List[OCRBlock]) -> None:
        doc_dir = os.path.join(DATA_DIR, doc_id)
        if not os.path.exists(doc_dir):
            os.makedirs(doc_dir, exist_ok=True)

        if not blocks:
            # Handle empty blocks case (e.g. empty PDF or image with no text)
            metadata_path = os.path.join(doc_dir, "index_metadata.json")
            with open(metadata_path, "w", encoding="utf-8") as f:
                json.dump([], f)
            return

        # 1. Extract texts
        texts = [block.text for block in blocks]

        # 2. Compute embeddings
        embeddings = self.model.encode(texts, convert_to_numpy=True)
        embeddings = embeddings.astype('float32')
        faiss.normalize_L2(embeddings)

        # 3. Create FAISS index
        dimension = embeddings.shape[1]
        index = faiss.IndexFlatIP(dimension)
        index.add(embeddings)

        # 4. Save index
        index_path = os.path.join(doc_dir, "index.faiss")
        faiss.write_index(index, index_path)

        # 5. Save metadata mapping
        metadata_path = os.path.join(doc_dir, "index_metadata.json")
        serialized_blocks = [block.model_dump() for block in blocks]
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(serialized_blocks, f, ensure_ascii=False, indent=2)

    def search_index(self, doc_id: str, query: str, top_k: int = 3) -> List[OCRBlock]:
        doc_dir = os.path.join(DATA_DIR, doc_id)
        index_path = os.path.join(doc_dir, "index.faiss")
        metadata_path = os.path.join(doc_dir, "index_metadata.json")

        if not os.path.exists(index_path) or not os.path.exists(metadata_path):
            return []

        # Load metadata
        with open(metadata_path, "r", encoding="utf-8") as f:
            serialized_blocks = json.load(f)

        if not serialized_blocks:
            return []

        # Load FAISS index
        index = faiss.read_index(index_path)

        # Embed query
        query_embedding = self.model.encode([query], convert_to_numpy=True)
        query_embedding = query_embedding.astype('float32')
        faiss.normalize_L2(query_embedding)

        # Cap top_k to maximum items in the index
        search_k = min(top_k, len(serialized_blocks))
        if search_k <= 0:
            return []

        # Search index
        distances, indices = index.search(query_embedding, search_k)

        results = []
        for idx in indices[0]:
            if idx != -1 and idx < len(serialized_blocks):
                results.append(OCRBlock(**serialized_blocks[idx]))

        return results

vector_db_service = VectorDBService()
