import os
from google import genai
from PIL import Image
from typing import List
from app.config import settings
from app.schemas.ocr import OCRBlock

class LLMService:
    def __init__(self):
        self._client = None

    @property
    def client(self) -> genai.Client:
        if self._client is None:
            api_key = settings.GEMINI_API_KEY
            if not api_key:
                raise ValueError("GEMINI_API_KEY environment variable is not set. Please set it in your .env file.")
            self._client = genai.Client(api_key=api_key)
        return self._client

    def query_gemini(self, query: str, retrieved_blocks: List[OCRBlock], page_images: List[Image.Image]) -> str:
        # Construct the context prompt with text and coordinates
        context_text = ""
        for i, block in enumerate(retrieved_blocks):
            context_text += f"Block {i+1} (Page {block.page_number}, Bounding Box: {block.box}):\n{block.text}\n\n"

        prompt = f"""You are an assistant answering questions about the attached document page images.
Below is the text content extracted by OCR from the relevant parts of the document along with their page numbers and layout coordinates:

{context_text}

Using both the text content above and the visual page images attached, answer the user's question accurately.
Provide a clear, natural language answer. If the answer is not found or cannot be inferred from the context, state that clearly.

User Question: {query}
Answer:"""

        # Combine text prompt and page images for Gemini Multimodal input
        contents = []
        contents.extend(page_images)
        contents.append(prompt)

        try:
            response = self.client.models.generate_content(
                model=settings.GEMINI_MODEL,
                contents=contents
            )
            return response.text
        except Exception as e:
            raise RuntimeError(f"Error calling Gemini API: {str(e)}")

llm_service = LLMService()
