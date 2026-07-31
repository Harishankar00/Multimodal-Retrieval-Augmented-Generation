import os
from dotenv import load_dotenv

# Load environment variables from .env file if it exists
load_dotenv(override=True)

class Settings:
    LLM_API_KEY: str = os.getenv("LLM_API_KEY", os.getenv("GEMINI_API_KEY", ""))
    LLM_API_BASE: str = os.getenv("LLM_API_BASE", "https://openrouter.ai/api/v1")
    LLM_MODEL: str = os.getenv("LLM_MODEL", os.getenv("GEMINI_MODEL", "openrouter/free"))
    INPUT_TOKEN_LIMIT: int = int(os.getenv("INPUT_TOKEN_LIMIT", "50000"))
    OUTPUT_TOKEN_LIMIT: int = int(os.getenv("OUTPUT_TOKEN_LIMIT", "10000"))
    HOST: str = os.getenv("HOST", "0.0.0.0")
    PORT: int = int(os.getenv("PORT", "8000"))

settings = Settings()
