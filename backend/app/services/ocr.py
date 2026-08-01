import os
import io
import base64
import json
import httpx
from PIL import Image
from typing import List
from app.config import settings
from app.schemas.ocr import OCRBlock

class OCRService:
    def extract_text(self, image_bytes: bytes, page_number: int) -> List[OCRBlock]:
        if not settings.LLM_API_KEY:
            # Return empty if API key is missing
            return []

        # Convert image bytes to base64
        try:
            b64_str = base64.b64encode(image_bytes).decode("utf-8")
        except Exception as e:
            raise ValueError(f"Failed to encode image to base64: {str(e)}")

        prompt = """Perform high-accuracy OCR on the attached document image.
Extract all distinct text blocks (headings, paragraphs, lists, table cells).
For each text block, provide:
1. The exact text content.
2. The normalized bounding box coordinates on a 0-1000 scale as [ymin, xmin, ymax, xmax].

You MUST respond with a valid JSON array matching this structure:
[
  {
    "text": "Extracted text content",
    "box": [ymin, xmin, ymax, xmax]
  }
]
Do not include any markdown styling, code blocks, or extra text. Output only the raw JSON array."""

        payload = {
            "model": "google/gemini-2.5-flash",  # Use Gemini 2.5 Flash for multimodal OCR
            "messages": [
                {
                    "role": "user",
                    "content": [
                        {
                            "type": "text",
                            "text": prompt
                        },
                        {
                            "type": "image_url",
                            "image_url": {
                                "url": f"data:image/png;base64,{b64_str}"
                            }
                        }
                    ]
                }
            ],
            "response_format": {"type": "json_object"},
            "max_tokens": 4000
        }

        headers = {
            "Authorization": f"Bearer {settings.LLM_API_KEY}",
            "Content-Type": "application/json"
        }

        try:
            url = f"{settings.LLM_API_BASE.rstrip('/')}/chat/completions"
            response = httpx.post(url, headers=headers, json=payload, timeout=30.0)
            if response.status_code != 200:
                raise ValueError(f"OCR API request failed: {response.text}")
                
            response_data = response.json()
            raw_content = response_data["choices"][0]["message"]["content"].strip()
            
            # Clean markdown code blocks if present
            if raw_content.startswith("```"):
                lines = raw_content.splitlines()
                if lines[0].startswith("```"):
                    lines = lines[1:]
                if lines[-1].startswith("```"):
                    lines = lines[:-1]
                raw_content = "\n".join(lines).strip()

            blocks_data = json.loads(raw_content)
            
            if isinstance(blocks_data, dict):
                for k, v in blocks_data.items():
                    if isinstance(v, list):
                        blocks_data = v
                        break
            
            if not isinstance(blocks_data, list):
                raise ValueError("OCR response is not a JSON list")

            blocks = []
            for item in blocks_data:
                text = item.get("text", "").strip()
                if not text:
                    continue
                
                box_coords = item.get("box", [0, 0, 1000, 1000])
                if len(box_coords) == 4:
                    ymin, xmin, ymax, xmax = box_coords
                else:
                    ymin, xmin, ymax, xmax = 0, 0, 1000, 1000
                
                # Convert [ymin, xmin, ymax, xmax] to standard 4-corner coordinates [[x,y], [x,y], [x,y], [x,y]]
                box = [
                    [float(xmin), float(ymin)],
                    [float(xmax), float(ymin)],
                    [float(xmax), float(ymax)],
                    [float(xmin), float(ymax)]
                ]
                
                blocks.append(
                    OCRBlock(
                        text=text,
                        box=box,
                        confidence=1.0,
                        page_number=page_number
                    )
                )
            return blocks
        except Exception as e:
            print(f"Cloud OCR failed: {e}")
            return []

ocr_service = OCRService()
