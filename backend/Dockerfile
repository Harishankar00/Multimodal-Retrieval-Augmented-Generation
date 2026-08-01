FROM python:3.10-slim

# Install system dependencies for OpenCV and EasyOCR
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libgl1 \
    libglib2.0-0 \
    && rm -rf /var/lib/apt/lists/*

# Set up a new user named "user" with UID 1000 for Hugging Face compatibility
RUN useradd -m -u 1000 user
USER user
ENV HOME=/home/user
ENV PATH=/home/user/.local/bin:$PATH

WORKDIR $HOME/app

# Copy requirements and install
COPY --chown=user requirements.txt .
RUN pip install --no-cache-dir --user -r requirements.txt

# Pre-fetch EasyOCR English models during build
RUN python -c "import easyocr; easyocr.Reader(['en'], gpu=False)"

# Copy backend app code
COPY --chown=user app/ app/

# Create directory for documents cache
RUN mkdir -p data/documents

EXPOSE 7860

# Run uvicorn on port 7860 (Hugging Face Spaces standard port)
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "7860"]
