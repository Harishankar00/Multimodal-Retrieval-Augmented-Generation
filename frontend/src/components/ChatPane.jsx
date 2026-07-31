import React, { useState, useEffect } from "react";
import { auth } from "../firebase";

export default function ChatPane({ chatId, docId, activeBlock, setActiveBlock, setActivePage, onViewDocument, activeChatDocuments }) {
  const [query, setQuery] = useState("");
  const [messages, setMessages] = useState([]);
  const [loading, setLoading] = useState(false);
  const [overallUsage, setOverallUsage] = useState({
    total_tokens: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    prompt_limit: 131072,
    completion_limit: 4096,
    limits: null
  });

  useEffect(() => {
    if (!chatId) {
      setMessages([]);
      return;
    }

    const loadHistory = async () => {
      setLoading(true);
      try {
        const token = await auth.currentUser?.getIdToken();
        const res = await fetch(`http://localhost:8000/api/chats/${chatId}/messages`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const history = await res.json();
          setMessages(history);
          
          // Re-calculate session totals from history
          let total = 0, prompt = 0, completion = 0, lastLimits = null;
          history.forEach(msg => {
            if (msg.usage) {
              total += msg.usage.total_tokens || 0;
              prompt += msg.usage.prompt_tokens || 0;
              completion += msg.usage.completion_tokens || 0;
              if (msg.usage.limits) lastLimits = msg.usage.limits;
            }
          });
          setOverallUsage({
            total_tokens: total,
            prompt_tokens: prompt,
            completion_tokens: completion,
            prompt_limit: 131072,
            completion_limit: 4096,
            limits: lastLimits
          });
        }
      } catch (err) {
        console.error("Error loading chat history:", err);
      } finally {
        setLoading(false);
      }
    };

    loadHistory();
  }, [chatId]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!query.trim() || loading || !chatId) return;

    const userMessage = { role: "user", text: query };
    setMessages((prev) => [...prev, userMessage]);
    setQuery("");
    setLoading(true);

    try {
      const token = await auth.currentUser?.getIdToken();
      const response = await fetch("http://localhost:8000/api/query", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: chatId,
          query: userMessage.text,
          limit: 3
        })
      });

      if (!response.ok) {
        throw new Error("Failed to query the document");
      }

      const data = await response.json();
      const assistantMessage = {
        role: "assistant",
        text: data.answer,
        sources: data.sources || [],
        usage: data.usage || null
      };
      setMessages((prev) => [...prev, assistantMessage]);

      // Update overall session usage metrics
      if (data.usage) {
        setOverallUsage((prev) => ({
          total_tokens: prev.total_tokens + (data.usage.total_tokens || 0),
          prompt_tokens: prev.prompt_tokens + (data.usage.prompt_tokens || 0),
          completion_tokens: prev.completion_tokens + (data.usage.completion_tokens || 0),
          prompt_limit: data.usage.prompt_limit || prev.prompt_limit,
          completion_limit: data.usage.completion_limit || prev.completion_limit,
          limits: data.usage.limits || prev.limits
        }));
      }
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

  const handleSourceClick = (src) => {
    const docMeta = activeChatDocuments.find(d => d.doc_id === src.doc_id);
    if (docMeta) {
      onViewDocument(docMeta, src.page_number, src);
    } else if (activeChatDocuments.length > 0) {
      onViewDocument(activeChatDocuments[0], src.page_number, src);
    }
  };

  return (
    <div className="chat-container">
      <div className="chat-history">
        {messages.length === 0 ? (
          <div style={{ margin: "auto", textAlign: "center", color: "var(--text-muted)", fontSize: "14px", maxWidth: "400px" }}>
            {activeChatDocuments.length === 0 
              ? "Click '+ Add Document' above to upload one or more documents, then ask questions about them here."
              : "Ask questions about the uploaded document(s) here."
            }
          </div>
        ) : (
          messages.map((msg, idx) => (
            <div key={idx} className={`chat-message ${msg.role} ${msg.isError ? "error" : ""}`}>
              <div>{msg.text}</div>
              {msg.sources && msg.sources.length > 0 && (
                <div className="sources-container">
                  <div className="source-header">Sources:</div>
                  {msg.sources.map((src, sIdx) => {
                    const docMeta = activeChatDocuments.find(d => d.doc_id === src.doc_id);
                    const filename = docMeta ? docMeta.filename : "document";
                    return (
                      <div 
                        key={sIdx} 
                        className="source-pill"
                        onClick={() => handleSourceClick(src)}
                        title={`View page ${src.page_number} of ${filename}`}
                      >
                        Page {src.page_number} ({filename}): "{src.text.slice(0, 30)}..."
                      </div>
                    );
                  })}
                </div>
              )}
              {msg.usage && (
                <div style={{ 
                  marginTop: "12px", 
                  fontSize: "11px", 
                  color: "var(--text-muted)", 
                  borderTop: "1px solid var(--border-color)", 
                  paddingTop: "8px" 
                }}>
                  <div>
                    Tokens: {msg.usage.total_tokens} (Prompt: {msg.usage.prompt_tokens}, Completion: {msg.usage.completion_tokens})
                  </div>
                  {msg.usage.limits && msg.usage.limits.usage !== undefined && (
                    <div style={{ marginTop: "2px" }}>
                      OpenRouter Usage: ${msg.usage.limits.usage.toFixed(4)}
                      {msg.usage.limits.limit !== null && ` / $${msg.usage.limits.limit}`}
                    </div>
                  )}
                </div>
              )}
            </div>
          ))
        )}

        {loading && (
          <div className="chat-message assistant" style={{ fontStyle: "italic", color: "var(--text-muted)" }}>
            Thinking...
          </div>
        )}
      </div>

      {overallUsage.total_tokens > 0 && (
        <div style={{
          padding: "10px 24px",
          fontSize: "12px",
          color: "var(--text-secondary)",
          borderTop: "1px solid var(--border-color)",
          background: "var(--bg-secondary)",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center"
        }}>
          <span>
            Input: <strong>{overallUsage.prompt_tokens}/{overallUsage.prompt_limit}</strong> tokens used | Output: <strong>{overallUsage.completion_tokens}/{overallUsage.completion_limit}</strong> tokens used
          </span>
          {overallUsage.limits && overallUsage.limits.usage !== undefined && (
            <span>
              Key Remaining: <strong>
                {overallUsage.limits.limit !== null && overallUsage.limits.limit > 0 && overallUsage.limits.limit_remaining !== null
                  ? `$${overallUsage.limits.limit_remaining.toFixed(4)}`
                  : `Spent $${overallUsage.limits.usage.toFixed(4)}`
                }
              </strong>
            </span>
          )}
        </div>
      )}

      <form onSubmit={handleSubmit} className="chat-input-bar">
        <input
          type="text"
          className="chat-input"
          placeholder={chatId && activeChatDocuments.length > 0 ? "Ask a question..." : !chatId ? "Select or create a chat session first" : "Please upload a document first"}
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          disabled={!chatId || activeChatDocuments.length === 0 || loading}
        />
        <button 
          type="submit" 
          className="btn-primary"
          disabled={!chatId || activeChatDocuments.length === 0 || !query.trim() || loading}
        >
          Send
        </button>
      </form>
    </div>
  );
}
