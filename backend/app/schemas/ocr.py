from pydantic import BaseModel
from typing import List, Optional

class OCRBlock(BaseModel):
    text: str
    box: List[List[float]]  # Bounding box as [[x1, y1], [x2, y2], [x3, y3], [x4, y4]]
    confidence: float
    page_number: int  # 1-indexed page number
    doc_id: Optional[str] = None  # optional parent document reference

class OCRResult(BaseModel):
    doc_id: str
    filename: str
    pages_count: int
    blocks: List[OCRBlock]
