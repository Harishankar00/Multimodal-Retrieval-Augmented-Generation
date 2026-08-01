import os
import json
import re
import math
from typing import List
from app.schemas.ocr import OCRBlock

# Define storage directory for processed documents
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data", "documents")

class VectorDBService:
    def create_index(self, doc_id: str, blocks: List[OCRBlock]) -> None:
        doc_dir = os.path.join(DATA_DIR, doc_id)
        if not os.path.exists(doc_dir):
            os.makedirs(doc_dir, exist_ok=True)

        # Save metadata mapping (the text blocks themselves)
        metadata_path = os.path.join(doc_dir, "index_metadata.json")
        serialized_blocks = [block.model_dump() for block in blocks]
        with open(metadata_path, "w", encoding="utf-8") as f:
            json.dump(serialized_blocks, f, ensure_ascii=False, indent=2)

    def search_index(self, doc_id: str, query: str, top_k: int = 3) -> List[OCRBlock]:
        doc_dir = os.path.join(DATA_DIR, doc_id)
        metadata_path = os.path.join(doc_dir, "index_metadata.json")

        if not os.path.exists(metadata_path):
            return []

        # Load metadata
        with open(metadata_path, "r", encoding="utf-8") as f:
            serialized_blocks = json.load(f)

        if not serialized_blocks:
            return []

        # Tokenize query
        query_tokens = re.findall(r'\w+', query.lower())
        if not query_tokens:
            return [OCRBlock(**b) for b in serialized_blocks[:top_k]]

        # BM25 parameters
        k1 = 1.5
        b = 0.75

        # 1. Tokenize document blocks and build stats
        docs_tokens = []
        doc_freqs = {}  # Number of blocks containing each term
        total_len = 0

        for block in serialized_blocks:
            text = block.get("text", "")
            tokens = re.findall(r'\w+', text.lower())
            docs_tokens.append(tokens)
            total_len += len(tokens)
            
            # Record unique tokens in this block for doc_freqs
            unique_tokens = set(tokens)
            for token in unique_tokens:
                doc_freqs[token] = doc_freqs.get(token, 0) + 1

        doc_count = len(serialized_blocks)
        avg_doc_len = total_len / doc_count if doc_count > 0 else 1.0

        # 2. Score each block
        scores = []
        for idx, block_tokens in enumerate(docs_tokens):
            score = 0.0
            doc_len = len(block_tokens)
            
            # Term frequencies within this block
            tf_dict = {}
            for token in block_tokens:
                tf_dict[token] = tf_dict.get(token, 0) + 1

            for token in query_tokens:
                if token not in tf_dict:
                    continue
                tf = tf_dict[token]
                n_q = doc_freqs.get(token, 0)
                
                # Smoothed IDF formula
                idf = math.log((doc_count - n_q + 0.5) / (n_q + 0.5) + 1.0)
                
                # BM25 formula
                numerator = tf * (k1 + 1)
                denominator = tf + k1 * (1.0 - b + b * (doc_len / avg_doc_len))
                score += idf * (numerator / denominator)
                
            scores.append((score, idx))

        # 3. Sort blocks by score descending
        scores.sort(key=lambda x: x[0], reverse=True)

        results = []
        for score, idx in scores[:top_k]:
            results.append(OCRBlock(**serialized_blocks[idx]))

        return results

vector_db_service = VectorDBService()
