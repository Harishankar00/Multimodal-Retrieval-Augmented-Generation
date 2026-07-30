import os
import io
import base64
import httpx
from PIL import Image
from typing import List
from app.config import settings
from app.schemas.ocr import OCRBlock

def image_to_base64(image: Image.Image) -> str:
    """Helper to convert a PIL Image into a base64 encoded string."""
    try:
        buffered = io.BytesIO()
        image.save(buffered, format="PNG")
        return base64.b64encode(buffered.getvalue()).decode("utf-8")
    except Exception as e:
        raise ValueError(f"Failed to encode image to base64: {str(e)}")

class LLMService:
    def query_llm(self, query: str, retrieved_blocks: List[OCRBlock], page_images: List[Image.Image]) -> str:
        # 1. Gracefully handle missing API key configuration
        if not settings.LLM_API_KEY:
            return "LLM Configuration Error: LLM_API_KEY environment variable is not set. Please create a backend/.env file and define it to enable VQA."

        # 2. Build the textual context prompt with layout coordinates
        context_text = ""
        for i, block in enumerate(retrieved_blocks):
            context_text += f"Block {i+1} (Page {block.page_number}, Bounding Box: {block.box}):\n{block.text}\n\n"

        prompt = f"""You are an assistant answering questions about the attached document page images.
Below is the text content extracted by OCR from the relevant parts of the document along with their page numbers and layout coordinates:

{context_text}

Using both the text content above and the visual page images attached, answer the user's question accurately.
Provide a clear, natural language answer.

Guidelines:
1. Base your answer strictly on the provided document text blocks and visual images.
2. If the exact answer to the question cannot be directly found in the context, do NOT simply say "I don't know" or "Not found". Instead:
   - Provide the most closely relevant information available in the document.
   - Offer logical suggestions or follow-up prompts that help the user find what they need (e.g., "The document does not detail X, but page 2 has related figures for Y. Would you like to know about Z instead?").
   - Clearly guide the user on what kind of questions they can ask based on what the document context contains.
3. Keep the tone helpful, professional, and constructive. Avoid hallucinating facts not present in the document.

User Question: {query}
Answer:"""

        # 3. Compile OpenAI-compatible multimodal content list
        content_list = []
        
        # Add textual prompt
        content_list.append({
            "type": "text",
            "text": prompt
        })

        # Add image URLs formatted as base64 data URLs
        for img in page_images:
            try:
                b64_str = image_to_base64(img)
                content_list.append({
                    "type": "image_url",
                    "image_url": {
                        "url": f"data:image/png;base64,{b64_str}"
                    }
                })
            except Exception as e:
                return f"⚠️ LLM Preparation Error: Failed to encode document page image: {str(e)}"

        # 4. Construct API payload
        payload = {
            "model": settings.LLM_MODEL,
            "messages": [
                {
                    "role": "user",
                    "content": content_list
                }
            ]
        }

        headers = {
            "Authorization": f"Bearer {settings.LLM_API_KEY}",
            "Content-Type": "application/json"
        }

        # 5. Call OpenAI-compatible REST endpoint
        try:
            url = f"{settings.LLM_API_BASE.rstrip('/')}/chat/completions"
            response = httpx.post(url, headers=headers, json=payload, timeout=60.0)
            
            if response.status_code != 200:
                return f"LLM API Error: Request failed with status code {response.status_code}.\n\nDetails: {response.text}"
                
            response_data = response.json()
            if "choices" in response_data and len(response_data["choices"]) > 0:
                return response_data["choices"][0]["message"]["content"]
            else:
                return f"LLM API Response Error: Received unexpected payload format: {str(response_data)}"
                
        except Exception as e:
            return f"LLM API Connection Error: Failed to connect to the model provider endpoint.\n\nDetails: {str(e)}"

llm_service = LLMService()
