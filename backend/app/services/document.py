import os
import uuid
import json
import fitz
from typing import List, Tuple
from app.schemas.ocr import OCRResult, OCRBlock
from app.services.ocr import ocr_service
from app.services.vector_db import vector_db_service

# Define storage directory for processed documents
BASE_DIR = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
DATA_DIR = os.path.join(BASE_DIR, "data", "documents")

class DocumentService:
    @staticmethod
    def _create_doc_dir(doc_id: str) -> str:
        doc_dir = os.path.join(DATA_DIR, doc_id)
        os.makedirs(doc_dir, exist_ok=True)
        return doc_dir

    @classmethod
    def process_document(cls, file_bytes: bytes, filename: str) -> OCRResult:
        doc_id = str(uuid.uuid4())
        doc_dir = cls._create_doc_dir(doc_id)
        
        _, ext = os.path.splitext(filename.lower())
        blocks: List[OCRBlock] = []
        pages_count = 0

        # Save raw original file
        original_file_path = os.path.join(doc_dir, f"original{ext}")
        with open(original_file_path, "wb") as f:
            f.write(file_bytes)

        if ext == ".pdf":
            try:
                pdf_doc = fitz.open(stream=file_bytes, filetype="pdf")
                pages_count = len(pdf_doc)
                
                for page_idx in range(pages_count):
                    page = pdf_doc.load_page(page_idx)
                    pix = page.get_pixmap()
                    img_bytes = pix.tobytes("png")
                    
                    # Save page image
                    page_img_path = os.path.join(doc_dir, f"page_{page_idx + 1}.png")
                    with open(page_img_path, "wb") as f:
                        f.write(img_bytes)
                    
                    # Run OCR
                    page_blocks = ocr_service.extract_text(img_bytes, page_number=page_idx + 1)
                    blocks.extend(page_blocks)
                
                pdf_doc.close()
            except Exception as e:
                raise ValueError(f"Failed to process PDF file: {str(e)}")
        else:
            # Handle JPG, JPEG, PNG image
            pages_count = 1
            try:
                # Save as page_1.png (can write the raw bytes since it's already an image)
                page_img_path = os.path.join(doc_dir, "page_1.png")
                with open(page_img_path, "wb") as f:
                    f.write(file_bytes)
                
                # Run OCR
                page_blocks = ocr_service.extract_text(file_bytes, page_number=1)
                blocks.extend(page_blocks)
            except Exception as e:
                raise ValueError(f"Failed to process image file: {str(e)}")

        # Set parent doc_id for each OCR block
        for block in blocks:
            block.doc_id = doc_id

        ocr_result = OCRResult(
            doc_id=doc_id,
            filename=filename,
            pages_count=pages_count,
            blocks=blocks
        )

        # Cache OCR result as JSON
        result_json_path = os.path.join(doc_dir, "ocr_results.json")
        with open(result_json_path, "w", encoding="utf-8") as f:
            json.dump(ocr_result.model_dump(), f, ensure_ascii=False, indent=2)

        # Build the vector database index
        vector_db_service.create_index(doc_id, ocr_result.blocks)

        return ocr_result

document_service = DocumentService()
