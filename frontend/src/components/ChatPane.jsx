import React, { useState } from "react";

export default function ChatPane({ docId, activeBlock, setActiveBlock, setActivePage }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading || !docId) return;

    const userMessage = { role: "user", text: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const response = await fetch("http://localhost:8000/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          doc_id: docId,
          query: userMessage.text,
          limit: 3
        })
      });

      if (!response.ok) {
        throw new Error("Failed to get response from Gemini");
      }

      const data = await response.json();
      const assistantMessage = {
        role: "assistant",
        text: data.answer,
        sources: data.sources || []
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (err) {
      console.error(err);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", text: `Error: ${err.message || "Failed to communicate with LLM"}`, isError: true }
      ]);
    } finally {
      setLoading(false);
    }
  };

  const handleSourceClick = (block) => {
    // Navigate viewer to the source page and highlight the bounding box
    setActivePage(block.page_number);
    setActiveBlock(block);
  };

  return (
    <div className="chat-container">
      <div className="viewer-toolbar">
        <h2 style={{ margin: 0, fontSize: "16px", fontFamily: "var(--font-heading)" }}>Interactive Chat</h2>
      </div>

      <div className="chat-history">
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
            Ask questions about the uploaded document.
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role} ${msg.isError ? "error" : ""}`}>
              <div>{msg.text}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  <div className="source-header">Sources:</div>
                  {msg.sources.map((src, sIdx) => (
                    <div 
                      key={sIdx} 
                      className="source-pill"
                      onClick={() => handleSourceClick(src)}
                    >
                      📄 Page {src.page_number}: "{src.text.slice(0, 40)}..."
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="chat-message assistant" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
            Gemini is thinking...
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder={docId ? "Ask a question..." : "Please upload a document first"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!docId || loading}
        />
        <button 
          type="submit" 
          className="btn-primary"
          disabled={!docId || !query.trim() || loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
