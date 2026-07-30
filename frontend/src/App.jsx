import React, { useState } from "react";
import DocumentViewer from "./components/DocumentViewer";
import ChatPane from "./components/ChatPane";

export default function App() {
  const [docId, setDocId] = useState(null);
  const [pagesCount, setPagesCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  const handleUpload = async (file) => {
    if (!file) return;
    
    // Validate extensions
    const allowed = [".png", ".jpg", ".jpeg", ".pdf"];
    const ext = file.name.substring(file.name.lastIndexOf(".")).toLowerCase();
    if (!allowed.includes(ext)) {
      setError(`Unsupported file type. Please upload a PDF or an Image.`);
      return;
    }

    setLoading(true);
    setError(null);

    const formData = new FormData();
    formData.append("file", file);

    try {
      const response = await fetch("http://localhost:8000/api/upload", {
        method: "POST",
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to process document");
      }

      const data = await response.json();
      setDocId(data.doc_id);
      setPagesCount(data.pages_count);
      setBlocks(data.blocks || []);
      setActivePage(1);
      setActiveBlock(null);
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during file upload.");
    } finally {
      setLoading(false);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    setIsDragOver(true);
  };

  const handleDragLeave = () => {
    setIsDragOver(false);
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setIsDragOver(false);
    const files = e.dataTransfer.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const handleReset = () => {
    setDocId(null);
    setPagesCount(0);
    setActivePage(1);
    setBlocks([]);
    setActiveBlock(null);
    setError(null);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", width: "100%" }}>
      <header className="app-header">
        <div className="app-logo">
          📄 <span>Multimodal RAG VQA</span>
        </div>
        
        {docId && (
          <button className="btn-primary" onClick={handleReset} style={{ height: "36px", padding: "0 16px" }}>
            Upload New Document
          </button>
        )}
      </header>

      <div className="workspace">
        {!docId ? (
          <div className="upload-container">
            {loading ? (
              <div className="loading-overlay">
                <div className="spinner"></div>
                <h3 style={{ fontFamily: "var(--font-heading)" }}>Ingesting Document & Running OCR...</h3>
                <p style={{ color: "var(--text-secondary)", fontSize: "14px" }}>
                  This may take a moment to compute spatial text layouts.
                </p>
              </div>
            ) : (
              <>
                <div
                  className="upload-dropzone"
                  onDragOver={handleDragOver}
                  onDragLeave={handleDragLeave}
                  onDrop={handleDrop}
                  onClick={() => document.getElementById("file-input").click()}
                  style={{
                    borderColor: isDragOver ? "var(--color-accent)" : "var(--border-color)",
                    background: isDragOver ? "var(--bg-tertiary)" : "var(--bg-secondary)"
                  }}
                >
                  <div className="upload-icon">📥</div>
                  <div className="upload-title">Drag & drop your document here</div>
                  <div className="upload-desc">Supports PDF, PNG, JPG, JPEG</div>
                  <input
                    type="file"
                    id="file-input"
                    style={{ display: "none" }}
                    accept=".pdf,.png,.jpg,.jpeg"
                    onChange={handleFileChange}
                  />
                </div>
                {error && (
                  <div style={{ color: "#ef4444", marginTop: "16px", fontSize: "14px" }}>
                    ⚠️ {error}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <>
            <div className="pane-left">
              <DocumentViewer
                docId={docId}
                pagesCount={pagesCount}
                activePage={activePage}
                setActivePage={setActivePage}
                blocks={blocks}
                activeBlock={activeBlock}
                setActiveBlock={setActiveBlock}
              />
            </div>
            <div className="pane-right">
              <ChatPane
                docId={docId}
                activeBlock={activeBlock}
                setActiveBlock={setActiveBlock}
                setActivePage={setActivePage}
              />
            </div>
          </>
        )}
      </div>
    </div>
  );
}
