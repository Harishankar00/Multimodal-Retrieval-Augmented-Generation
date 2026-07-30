import easyocr
import torch
import numpy as np
from PIL import Image
import io
from typing import List
from app.schemas.ocr import OCRBlock

class OCRService:
    def __init__(self):
        self._reader = None

    @property
    def reader(self) -> easyocr.Reader:
        if self._reader is None:
            use_gpu = torch.cuda.is_available()
            self._reader = easyocr.Reader(['en'], gpu=use_gpu)
        return self._reader

    def extract_text(self, image_bytes: bytes, page_number: int) -> List[OCRBlock]:
        # Convert image bytes to PIL Image and then to numpy array for EasyOCR
        try:
            image = Image.open(io.BytesIO(image_bytes)).convert("RGB")
            img_np = np.array(image)
        except Exception as e:
            raise ValueError(f"Failed to decode image bytes: {str(e)}")

        results = self.reader.readtext(img_np)
        
        blocks = []
        for bbox, text, prob in results:
            # Convert bbox coordinates to List[List[float]]
            box = [[float(coord[0]), float(coord[1])] for coord in bbox]
            blocks.append(
                OCRBlock(
                    text=text,
                    box=box,
                    confidence=float(prob),
                    page_number=page_number
                )
            )
        return blocks

ocr_service = OCRService()
