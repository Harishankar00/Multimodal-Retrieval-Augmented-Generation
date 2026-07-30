# Multimodal Retrieval-Augmented Generation (RAG) Architecture & Decisions

This document details the components included in this project, the technology stack, how each function is implemented, and the specific rationale behind every technical decision.

---

## 1. Project Overview & Features

This project is a local-first Multimodal RAG system for Visual Question Answering (VQA). Unlike traditional text-only RAG pipelines, this system retains document format layouts (tables, headers, diagrams) by sending raw page images directly to the LLM alongside OCR textual coordinates.

### Key Capabilities:
* **Interactive Document Ingestion:** Supports splitting multi-page PDFs and rendering image files.
* **Spatial OCR Bounding Boxes:** Extracts layout coordinates of text segments, enabling responsive word-level highlighting on the page canvas.
* **Local FAISS Vector Indexing:** Automatically embeds text blocks locally, creating single-document vector indices for semantic query retrieval.
* **Multimodal VQA:** Sends the user query, matching spatial text blocks, and the original high-resolution page images to a vision model (via OpenRouter free routing) to yield accurate layout-aware answers without hallucinations.
* **Clean Light UI:** A sleek, authentic, light-themed split-screen workspace focusing on content readability without emojis or AI-generated styling effects.

---

## 2. Technology Stack & Selection Rationale

| Component | Selected Technology | Technical Rationale |
| :--- | :--- | :--- |
| **Frontend Framework** | **React + Vite** | Provides instant Hot Module Replacement (HMR) for fast UI development. Scaffolded using Javascript and bundled with Vite for minimal asset loading. |
| **Styling** | **Vanilla CSS** | Avoids heavy utility classes (like Tailwind) to ensure complete control over svg page canvas overlays, responsive layout transitions, and themes. |
| **Web Server** | **FastAPI** | High-performance Python async framework. Auto-generates interactive Swagger API docs `/docs` and handles file uploads efficiently. |
| **PDF Renderer** | **PyMuPDF (`fitz`)** | The fastest library in Python for loading, splitting, and rendering PDF pages as high-resolution PNG bytes. |
| **OCR Pipeline** | **EasyOCR** | Runs entirely locally (utilizing GPU if present, falling back to CPU). Extracts textual characters and layouts (4-point polygon coordinates) without external API costs or data privacy leaks. |
| **Embeddings Model** | **SentenceTransformers (`all-MiniLM-L6-v2`)** | Generates 384-dimensional semantic vectors locally. It has a lightweight memory footprint and is highly optimized for text search. |
| **Vector DB** | **FAISS (Facebook AI Similarity Search)** | Lightweight and serialized locally inside each document's directory. Eliminates the cost, configuration, and latency of external cloud vector databases. |
| **LLM Connector** | **OpenRouter API** | Utilizes the generic `openrouter/free` model router to dynamically query available free vision models (like Llama 3.2 Vision) without billing barriers. |

---

## 3. Detailed Component Breakdown

### Layout Coordinate Canvas
* **Rationale:** Traditional RAG is blind to page layouts. We crop and save each page image to `backend/data/documents/{doc_id}/page_{page_num}.png`.
* **Rendering:** The frontend renders the page image in the viewer and overlays an SVG element. The OCR coordinates are scaled dynamically to match the rendered size:
  $$\text{Scale}_x = \frac{\text{Client Width}}{\text{Natural Width}}, \quad \text{Scale}_y = \frac{\text{Client Height}}{\text{Natural Height}}$$
  This allows highlighted boxes to stay perfectly aligned even when the screen is resized.

### Prompt Engineering to Prevent Hallucinations
* **Rationale:** A common issue with RAG models is flat rejections ("Not found") or hallucinated facts when query terms don't match the context exactly.
* **Optimization:** The prompt template instructs the model to:
  1. Base answers strictly on the retrieved text coordinates and page image pixels.
  2. If the exact answer is not present, provide the closest relevant details or suggest follow-up questions that *can* be answered based on the document contents (e.g. "I could not find X, but page 1 contains Y details. Would you like to check that?").
  3. Never hallucinate facts outside the context.

---

## 4. Databases & Production Roadmap

### Why is there no SQLite / PostgreSQL yet?
The application is designed to be completely local-first and self-contained:
* Metadata is stored in a clean JSON format: `ocr_results.json` per document.
* Vector indexes are saved as: `index.faiss` per document.
* This removes the need for database installations, SQL schemas, or migrations during development.

### Roadmap for Production Deployment:
1. **Relational Database (PostgreSQL / SQLite):** Add a database to store user credentials (hashed with bcrypt), document records, and chat session histories.
2. **User Authentication:** Integrate JWT token checks on all REST endpoints (`/api/upload`, `/api/query`) to ensure private multi-tenant access control.
3. **Cloud Migration & Deployment:**
   * **Backend:** Package into a Docker container and deploy to Google Cloud Run or AWS ECS (with CPU/GPU bindings).
   * **Frontend:** Compile to static assets and deploy to Vercel, Netlify, or AWS S3.
   * **CI/CD:** Set up GitHub Actions to run pytest and auto-deploy to production on every main-branch push.
