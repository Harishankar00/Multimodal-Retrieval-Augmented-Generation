import React, { useState, useEffect, useRef } from "react";
import ReactMarkdown from "react-markdown";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./components/Auth";
import DocumentViewer from "./components/DocumentViewer";
import ChatPane from "./components/ChatPane";

function TokenAnalyticsChart({ data }) {
  if (!data || data.length === 0) {
    return <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>No token usage recorded in the last 7 days.</div>;
  }

  // Calculate scaling factors
  const maxCost = Math.max(...data.map(d => d.cost), 0.0001); // fallback min scale
  const chartHeight = 150;
  const chartWidth = 500;
  const paddingLeft = 60;
  const paddingBottom = 25;

  const barWidth = 24;
  const barSpacing = (chartWidth - paddingLeft) / data.length;

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "16px", marginTop: "12px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <h4 style={{ margin: 0, fontSize: "14px", color: "var(--text-secondary)", fontWeight: 600 }}>Daily OpenRouter Cost Split</h4>
        <span style={{ fontSize: "12px", color: "var(--color-accent)", fontWeight: 700 }}>
          7-Day Total: ${data.reduce((sum, d) => sum + d.cost, 0).toFixed(6)}
        </span>
      </div>

      <div style={{ width: "100%", overflowX: "auto" }}>
        <svg viewBox={`0 0 ${chartWidth} ${chartHeight + paddingBottom}`} style={{ width: "100%", height: "200px" }}>
          <defs>
            <linearGradient id="amber-chart-gradient" x1="0" y1="0" x2="0" y2="1">
              <stop offset="0%" stopColor="#f59e0b" />
              <stop offset="100%" stopColor="#d97706" stopOpacity="0.2" />
            </linearGradient>
          </defs>

          {/* Grid lines */}
          {[0, 0.25, 0.5, 0.75, 1].map((ratio, i) => {
            const y = chartHeight - ratio * chartHeight;
            return (
              <line
                key={i}
                x1={paddingLeft}
                y1={y}
                x2={chartWidth}
                y2={y}
                style={{ stroke: "var(--border-color)", strokeWidth: 1, strokeDasharray: "4 4" }}
              />
            );
          })}

          {/* Chart Bars */}
          {data.map((day, idx) => {
            const barHeight = (day.cost / maxCost) * (chartHeight - 15);
            const x = paddingLeft + idx * barSpacing + (barSpacing - barWidth) / 2;
            const y = chartHeight - barHeight;
            const dateObj = new Date(day.date);
            const dateLabel = dateObj.toLocaleDateString(undefined, { weekday: "short", day: "numeric" });

            return (
              <g key={idx}>
                <rect
                  x={x}
                  y={y}
                  width={barWidth}
                  height={barHeight}
                  fill="url(#amber-chart-gradient)"
                  stroke="#f59e0b"
                  strokeWidth="1.5"
                  rx={3}
                  style={{ transition: "all 0.3s ease", cursor: "pointer" }}
                />
                
                {/* Date Label */}
                <text
                  x={x + barWidth / 2}
                  y={chartHeight + 16}
                  textAnchor="middle"
                  style={{ fontSize: "9px", fill: "var(--text-secondary)", fontFamily: "inherit" }}
                >
                  {dateLabel}
                </text>

                {/* Tooltip content on hover */}
                <title>{`Date: ${day.date}\nCost: $${day.cost.toFixed(6)}\nPrompt: ${day.prompt_tokens} tokens\nCompletion: ${day.completion_tokens} tokens`}</title>
              </g>
            );
          })}

          {/* Y Axis cost labels */}
          {[0, 0.5, 1].map((ratio, i) => {
            const y = chartHeight - ratio * chartHeight;
            const labelValue = ratio * maxCost;
            return (
              <text
                key={i}
                x={paddingLeft - 8}
                y={y + 3}
                textAnchor="end"
                style={{ fontSize: "9px", fill: "var(--text-secondary)", fontFamily: "inherit" }}
              >
                {`$${labelValue.toFixed(4)}`}
              </text>
            );
          })}
        </svg>
      </div>
    </div>
  );
}

function SharedChatView() {
  const shareId = window.location.pathname.split("/share/")[1];
  const [sharedData, setSharedData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Document viewer state
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);

  useEffect(() => {
    const fetchShared = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/shared/${shareId}`);
        if (res.ok) {
          const data = await res.json();
          setSharedData(data);
        } else {
          setError("Shared conversation not found or expired.");
        }
      } catch (err) {
        setError("Failed to connect to backend: " + err.message);
      } finally {
        setLoading(false);
      }
    };
    fetchShared();
  }, [shareId]);

  // Load layout blocks when viewingDoc changes
  useEffect(() => {
    if (!viewingDoc) {
      setBlocks([]);
      return;
    }
    const fetchBlocks = async () => {
      try {
        const res = await fetch(`http://localhost:8000/api/chats/${sharedData.share_id}/documents/${viewingDoc.doc_id}`);
        if (res.ok) {
          const docData = await res.json();
          setBlocks(docData.blocks || []);
        }
      } catch (err) {
        console.error("Failed to fetch shared document blocks:", err);
      }
    };
    fetchBlocks();
  }, [viewingDoc]);

  const handleViewDocument = (docMeta, pageNum = 1, highlightBlock = null) => {
    setViewingDoc(docMeta);
    setActivePage(pageNum);
    setActiveBlock(highlightBlock);
  };

  if (loading) {
    return (
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)" }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "100vh", background: "var(--bg-primary)", color: "var(--text-secondary)", gap: "16px" }}>
        <h3>Error</h3>
        <p>{error}</p>
        <button className="btn-primary" onClick={() => window.location.href = "/"}>Go to App Home</button>
      </div>
    );
  }

  const activeChatDocuments = sharedData.uploaded_documents || [];

  return (
    <div className="app-container" style={{ position: "relative", overflow: "hidden", display: "flex", height: "100vh" }}>
      <div style={{ flex: 1, display: "flex", height: "100%", overflow: "hidden", position: "relative" }}>
        <main className="main-content" style={{ position: "relative", marginRight: viewingDoc ? "50%" : "0%", transition: "margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)", overflow: "hidden" }}>
          <div style={{ display: "flex", flexDirection: "column", height: "100%", overflow: "hidden" }}>
            {/* Header */}
            <div style={{ padding: "24px 24px 16px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", justifyContent: "space-between", alignItems: "center", background: "var(--bg-secondary)" }}>
              <div>
                <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                  {sharedData.title}
                </h2>
                <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                  Shared Conversation Log
                </span>
              </div>
              <button className="btn-primary" onClick={() => window.location.href = "/"} style={{ fontSize: "13px", padding: "8px 16px" }}>
                Sign In to Chat
              </button>
            </div>

            {/* Document list */}
            {activeChatDocuments.length > 0 && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: "8px", padding: "12px 24px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
                {activeChatDocuments.map((doc, idx) => (
                  <div key={idx} style={{ background: "var(--bg-secondary)", border: "1px solid var(--border-color)", borderRadius: "8px", padding: "6px 12px", fontSize: "13px", display: "flex", alignItems: "center", gap: "12px" }}>
                    <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                      {doc.filename}
                    </span>
                    <button onClick={() => handleViewDocument(doc)} style={{ background: "transparent", border: "none", color: "var(--color-accent)", fontWeight: 600, cursor: "pointer", fontSize: "12px", padding: 0 }}>
                      View
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Scrollable messages container */}
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <div className="chat-container">
                <div className="chat-history">
                  {sharedData.messages.map((msg, idx) => (
                    <div key={idx} className={`chat-message ${msg.role}`}>
                      <div className="chat-message-text">
                        <ReactMarkdown>{msg.text}</ReactMarkdown>
                      </div>
                      {msg.sources && msg.sources.length > 0 && (
                        <div className="sources-container">
                          <div className="source-header">Sources:</div>
                          {msg.sources.map((src, sIdx) => {
                            const docMeta = activeChatDocuments.find(d => d.doc_id === src.doc_id);
                            const filename = docMeta ? docMeta.filename : "document";
                            return (
                              <div key={sIdx} className="source-pill" onClick={() => handleViewDocument(docMeta || { doc_id: src.doc_id, filename }, src.page_number, src)}>
                                Page {src.page_number} ({filename}): "{src.text.slice(0, 30)}..."
                              </div>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  ))}
                  <div style={{ textAlign: "center", padding: "20px 0", color: "var(--text-muted)", fontSize: "12px" }}>
                    End of shared transcript.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Sliding document viewer */}
        {viewingDoc && (
          <aside style={{ position: "absolute", right: 0, top: 0, width: "50%", height: "100%", background: "var(--bg-secondary)", borderLeft: "1px solid var(--border-color)", boxShadow: "var(--shadow-lg)", display: "flex", flexDirection: "column", zIndex: 100 }}>
            <div style={{ padding: "16px 24px", borderBottom: "1px solid var(--border-color)", display: "flex", alignItems: "center", justifyContent: "space-between", background: "var(--bg-secondary)" }}>
              <span style={{ fontFamily: "var(--font-heading)", fontWeight: 700, fontSize: "15px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", maxWidth: "80%", color: "var(--text-primary)" }}>
                Viewing: {viewingDoc.filename}
              </span>
              <button onClick={() => setViewingDoc(null)} className="btn-icon" style={{ width: "32px", height: "32px" }}>
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <DocumentViewer docId={viewingDoc.doc_id} pagesCount={viewingDoc.pages_count} activePage={activePage} setActivePage={setActivePage} blocks={blocks} activeBlock={activeBlock} setActiveBlock={setActiveBlock} />
            </div>
          </aside>
        )}
      </div>
    </div>
  );
}

export default function App() {
  // Check shared route status
  const isShareRoute = window.location.pathname.startsWith("/share/");

  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Light/Dark Theme Switcher state
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Sidebar collapsible state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Account Settings view switcher
  const [showSettings, setShowSettings] = useState(false);

  // Analytics graph states
  const [analyticsData, setAnalyticsData] = useState([]);
  const [loadingAnalytics, setLoadingAnalytics] = useState(false);

  // Chats list & active chat context
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);
  const [sidebarSearch, setSidebarSearch] = useState("");

  // Share conversation settings
  const [shareUrl, setShareUrl] = useState(null);

  // Active viewing document overlay state
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // Apply theme dynamically to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // 1. Listen to Auth State Changes
  useEffect(() => {
    if (isShareRoute) {
      setAuthLoading(false);
      return;
    }
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setChats([]);
        setActiveChatId(null);
        setViewingDoc(null);
        setShowSettings(false);
      }
    });
    return unsubscribe;
  }, [isShareRoute]);

  // 2. Fetch User's Chats on Login
  useEffect(() => {
    if (!user || isShareRoute) return;
    loadChats();
  }, [user, isShareRoute]);

  // Polling logic when any chat document is currently processing OCR in the backend
  useEffect(() => {
    if (isShareRoute) return;
    const hasActiveProcessing = chats.some(c => c.processing_progress !== undefined && c.processing_progress !== null);
    if (!hasActiveProcessing || !user) return;

    const interval = setInterval(() => {
      loadChats(activeChatId);
    }, 2000);

    return () => clearInterval(interval);
  }, [chats, activeChatId, user, isShareRoute]);

  // 3. Load daily token usage history when settings screen opens
  useEffect(() => {
    if (showSettings && user && !isShareRoute) {
      fetchAnalytics();
    }
  }, [showSettings, user, isShareRoute]);

  const loadChats = async (selectId = null) => {
    try {
      const token = await user.getIdToken();
      const response = await fetch("http://localhost:8000/api/chats", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const chatsList = await response.json();
        setChats(chatsList);
        
        // Select active chat
        if (selectId) {
          setActiveChatId(selectId);
        } else if (chatsList.length > 0 && !activeChatId) {
          setActiveChatId(chatsList[0].chat_id);
        }
      } else {
        const detail = await response.text();
        setError(`Backend authorization check failed (${response.status}): ${detail || "Token verification failed"}. Please configure your backend FIREBASE_CREDENTIALS environment variable.`);
      }
    } catch (err) {
      console.error("Failed to load user chats:", err);
      setError(`Failed to connect to backend: ${err.message}`);
    }
  };

  const fetchAnalytics = async () => {
    setLoadingAnalytics(true);
    try {
      const token = await user.getIdToken();
      const res = await fetch("http://localhost:8000/api/analytics/token-usage", {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const data = await res.json();
        setAnalyticsData(data);
      }
    } catch (err) {
      console.error("Failed to load analytics data:", err);
    } finally {
      setLoadingAnalytics(false);
    }
  };

  // 4. Load layout blocks when viewingDoc changes
  useEffect(() => {
    if (!viewingDoc || !activeChatId || isShareRoute) {
      setBlocks([]);
      return;
    }

    const fetchBlocks = async () => {
      try {
        const token = await user.getIdToken();
        const res = await fetch(`http://localhost:8000/api/chats/${activeChatId}/documents/${viewingDoc.doc_id}`, {
          headers: {
            "Authorization": `Bearer ${token}`
          }
        });
        if (res.ok) {
          const docData = await res.json();
          setBlocks(docData.blocks || []);
        }
      } catch (err) {
        console.error("Failed to fetch document layout blocks:", err);
      }
    };

    fetchBlocks();
  }, [viewingDoc, activeChatId, isShareRoute]);

  const handleCreateChat = async () => {
    if (!user) return;
    const newChatId = "chat_" + Math.random().toString(36).substring(2, 11);
    
    try {
      const token = await user.getIdToken();
      const response = await fetch("http://localhost:8000/api/chats", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${token}`
        },
        body: JSON.stringify({
          chat_id: newChatId
        })
      });
      
      if (response.ok) {
        const newChat = {
          chat_id: newChatId,
          doc_id: null,
          filename: null,
          pages_count: 0,
          created_at: new Date().toISOString(),
          uploaded_documents: []
        };
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChatId);
        setViewingDoc(null);
        setShowSettings(false);
        setError(null);
      } else {
        const detail = await response.text();
        setError(`Failed to create chat session (${response.status}): ${detail || "Token verification failed"}. Check your backend credentials.`);
      }
    } catch (err) {
      console.error("Failed to create new chat session:", err);
      setError(`Failed to create chat session: ${err.message}`);
    }
  };

  const handleDeleteChat = async (e, chatIdToDelete) => {
    e.stopPropagation();
    if (!user) return;
    
    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:8000/api/chats/${chatIdToDelete}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      
      if (response.ok) {
        setChats((prev) => prev.filter((c) => c.chat_id !== chatIdToDelete));
        if (activeChatId === chatIdToDelete) {
          setActiveChatId(null);
          setViewingDoc(null);
        }
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
    }
  };

  const handleDeleteDocument = async (docIdToDelete) => {
    if (!activeChatId || !user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:8000/api/chats/${activeChatId}/documents/${docIdToDelete}`, {
        method: "DELETE",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        if (viewingDoc && viewingDoc.doc_id === docIdToDelete) {
          setViewingDoc(null);
        }
        await loadChats(activeChatId);
      }
    } catch (err) {
      console.error("Failed to delete document:", err);
    }
  };

  const handleUpload = async (file) => {
    if (!file || !activeChatId) return;
    
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
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:8000/api/chats/${activeChatId}/upload`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        },
        body: formData
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || "Failed to process document");
      }

      // Reload chats to refresh the subcollection documents array
      await loadChats(activeChatId);
    } catch (err) {
      console.error(err);
      setError(err.message || "An error occurred during file upload.");
    } finally {
      setLoading(false);
    }
  };

  const handleFileChange = (e) => {
    const files = e.target.files;
    if (files.length > 0) {
      handleUpload(files[0]);
    }
  };

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

  const handleViewDocument = (docMeta, pageNum = 1, highlightBlock = null) => {
    setViewingDoc(docMeta);
    setActivePage(pageNum);
    setActiveBlock(highlightBlock);
  };

  const handleExportTranscript = async () => {
    if (!activeChatId || !user) return;
    try {
      const token = await user.getIdToken();
      const res = await fetch(`http://localhost:8000/api/chats/${activeChatId}/messages`, {
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (res.ok) {
        const history = await res.json();
        let mdContent = `# Chat Transcript: ${activeChatTitle}\n`;
        mdContent += `Exported: ${new Date().toLocaleString()}\n\n---\n\n`;
        
        history.forEach(msg => {
          const roleName = msg.role === "user" ? "User" : "Assistant";
          mdContent += `### **${roleName}**\n\n${msg.text}\n\n`;
          if (msg.sources && msg.sources.length > 0) {
            mdContent += `*Sources:*\n`;
            msg.sources.forEach(src => {
              mdContent += `- Page ${src.page_number} (${src.filename || "document"}): "${src.text.slice(0, 80)}..."\n`;
            });
            mdContent += `\n`;
          }
          mdContent += `---\n\n`;
        });
        
        // Trigger browser download
        const blob = new Blob([mdContent], { type: "text/markdown;charset=utf-8;" });
        const link = document.createElement("a");
        link.href = URL.createObjectURL(blob);
        link.setAttribute("download", `chat_${activeChatId}_transcript.md`);
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
      }
    } catch (err) {
      console.error("Failed to export transcript:", err);
    }
  };

  const handleShareChat = async () => {
    if (!activeChatId || !user) return;
    try {
      const token = await user.getIdToken();
      const response = await fetch(`http://localhost:8000/api/chats/${activeChatId}/share`, {
        method: "POST",
        headers: {
          "Authorization": `Bearer ${token}`
        }
      });
      if (response.ok) {
        const data = await response.json();
        const publicUrl = `${window.location.protocol}//${window.location.host}/share/${data.share_id}`;
        setShareUrl(publicUrl);
      }
    } catch (err) {
      console.error("Failed to share chat:", err);
    }
  };

  const getInitials = () => {
    if (user?.displayName) return user.displayName.substring(0, 2).toUpperCase();
    if (user?.email) return user.email.substring(0, 2).toUpperCase();
    return "US";
  };

  if (isShareRoute) {
    return <SharedChatView />;
  }

  if (authLoading) {
    return (
      <div style={{
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        height: "100vh",
        width: "100vw",
        background: "var(--bg-primary)"
      }}>
        <div className="spinner"></div>
      </div>
    );
  }

  if (!user) {
    return <Auth />;
  }

  // Find active chat details
  const activeChat = chats.find((c) => c.chat_id === activeChatId);
  const activeChatDocuments = activeChat?.uploaded_documents || [];
  const activeChatTitle = activeChatDocuments[0]?.filename || activeChat?.filename || "Untitled Chat";

  // Gather all attachments list across all chats for the settings panel
  const allAttachments = chats.reduce((acc, c) => {
    const docs = c.uploaded_documents || [];
    docs.forEach(doc => {
      acc.push({
        ...doc,
        chat_id: c.chat_id,
        chat_title: docs[0]?.filename || c.filename || "Untitled Chat"
      });
    });
    return acc;
  }, []);

  return (
    <div className="app-container" style={{ position: "relative", overflow: "hidden" }}>
      {/* Sidebar - Collapsible sliding container */}
      <aside 
        className="sidebar"
        style={{
          width: isSidebarCollapsed ? "0" : "260px",
          minWidth: isSidebarCollapsed ? "0" : "260px",
          opacity: isSidebarCollapsed ? 0 : 1,
          overflow: "hidden",
          transition: "all 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}
      >
        <div className="sidebar-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <span className="sidebar-title" style={{ whiteSpace: "nowrap" }}>Multimodal RAG</span>
          <button 
            onClick={() => setIsSidebarCollapsed(true)}
            className="btn-icon"
            style={{ border: "none", background: "transparent", fontSize: "16px", padding: 0, width: "auto", height: "auto" }}
            title="Collapse Sidebar"
          >
            ◀
          </button>
        </div>
        
        <button className="btn-new-chat" onClick={handleCreateChat} style={{ whiteSpace: "nowrap" }}>
          New Chat
        </button>

        {/* Sidebar Search Input */}
        <div style={{ padding: "0 16px 12px 16px", whiteSpace: "nowrap" }}>
          <input
            type="text"
            placeholder="Search chats..."
            value={sidebarSearch}
            onChange={(e) => setSidebarSearch(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "12px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              outline: "none"
            }}
          />
        </div>

        <div className="sidebar-chats-list">
          {chats.filter((chat) => {
            const chatDocs = chat.uploaded_documents || [];
            const displayTitle = (chatDocs[0]?.filename || chat.filename || "Empty Chat").toLowerCase();
            return displayTitle.includes(sidebarSearch.toLowerCase());
          }).map((chat) => {
            const chatDocs = chat.uploaded_documents || [];
            const displayTitle = chatDocs[0]?.filename || chat.filename || "Empty Chat";
            
            return (
              <div 
                key={chat.chat_id} 
                className={`sidebar-chat-item ${activeChatId === chat.chat_id && !showSettings ? "active" : ""}`}
                onClick={() => {
                  setActiveChatId(chat.chat_id);
                  setViewingDoc(null);
                  setShowSettings(false);
                  setError(null);
                }}
                style={{ whiteSpace: "nowrap" }}
              >
                <span style={{ 
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap",
                  maxWidth: "140px"
                }}>
                  {displayTitle}
                </span>
                <button 
                  className="sidebar-chat-delete" 
                  onClick={(e) => handleDeleteChat(e, chat.chat_id)}
                  title="Delete Chat"
                  style={{ fontSize: "12px", padding: "2px 6px" }}
                >
                  Delete
                </button>
              </div>
            );
          })}
        </div>

        <div className="sidebar-footer">
          {/* User Profile Capsule linking to settings dashboard */}
          <div 
            onClick={() => setShowSettings(true)}
            style={{
              display: "flex",
              alignItems: "center",
              gap: "12px",
              padding: "8px 12px",
              borderRadius: "8px",
              cursor: "pointer",
              background: "var(--bg-tertiary)",
              transition: "background 0.2s",
              border: showSettings ? "1px solid var(--color-accent)" : "1px solid transparent"
            }}
            title="Account Settings"
          >
            {user.photoURL ? (
              <img 
                src={user.photoURL} 
                alt="Profile" 
                style={{ width: "32px", height: "32px", borderRadius: "50%", objectFit: "cover" }} 
              />
            ) : (
              <div style={{
                width: "32px",
                height: "32px",
                borderRadius: "50%",
                background: "var(--color-accent)",
                color: "#ffffff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: "13px",
                fontWeight: 700
              }}>
                {getInitials()}
              </div>
            )}
            <div style={{ flex: 1, overflow: "hidden" }}>
              <div style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {user.displayName || user.email.split("@")[0]}
              </div>
              <div style={{ fontSize: "11px", color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                Account Settings
              </div>
            </div>
          </div>
        </div>
      </aside>

      {/* Main Content Workspace Panel */}
      <div style={{ 
        flex: 1, 
        display: "flex", 
        height: "100%", 
        overflow: "hidden", 
        position: "relative" 
      }}>
        {/* Floating Sidebar toggle indicator when collapsed */}
        {isSidebarCollapsed && (
          <button 
            onClick={() => setIsSidebarCollapsed(false)}
            className="btn-icon"
            style={{
              position: "absolute",
              left: "16px",
              top: "16px",
              zIndex: 10,
              background: "var(--bg-secondary)",
              boxShadow: "var(--shadow-md)",
              border: "1px solid var(--border-color)"
            }}
            title="Open Sidebar"
          >
            ☰
          </button>
        )}

        {/* Center Main Dashboard container */}
        <main 
          className="main-content" 
          style={{ 
            position: "relative",
            marginRight: viewingDoc ? "50%" : "0%",
            transition: "margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)",
            overflow: "hidden"
          }}
        >
          {showSettings ? (
            /* Settings Dashboard wrapped in local scroll container */
            <div style={{ flex: 1, overflowY: "auto", height: "100%", padding: "40px 0" }}>
              <div style={{
                maxWidth: "800px",
                margin: "0 auto",
                padding: "0 24px",
                display: "flex",
                flexDirection: "column",
                gap: "24px"
              }}>
                <div style={{ display: "flex", alignItems: "center", gap: "16px" }}>
                  <button 
                    className="btn-icon" 
                    onClick={() => setShowSettings(false)}
                    style={{ width: "auto", padding: "0 14px", height: "36px" }}
                  >
                    ← Back to Chat
                  </button>
                  <h2 style={{ margin: 0, fontSize: "22px", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                    Account Settings
                  </h2>
                </div>

                {/* Profile Card */}
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "24px",
                  display: "flex",
                  alignItems: "center",
                  gap: "24px",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  {user.photoURL ? (
                    <img 
                      src={user.photoURL} 
                      alt="Profile" 
                      style={{ width: "72px", height: "72px", borderRadius: "50%", objectFit: "cover", border: "2px solid var(--color-accent)" }} 
                    />
                  ) : (
                    <div style={{
                      width: "72px",
                      height: "72px",
                      borderRadius: "50%",
                      background: "var(--color-accent)",
                      color: "#ffffff",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      fontSize: "24px",
                      fontWeight: 700
                    }}>
                      {getInitials()}
                    </div>
                  )}
                  <div style={{ display: "flex", flexDirection: "column", gap: "4px" }}>
                    <div style={{ fontSize: "18px", fontWeight: 700, color: "var(--text-primary)" }}>
                      {user.displayName || "Workspace User"}
                    </div>
                    <div style={{ fontSize: "14px", color: "var(--text-secondary)" }}>
                      Email: {user.email}
                    </div>
                    <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      Joined: {new Date(user.metadata.creationTime).toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' })}
                    </div>
                  </div>
                </div>

                {/* Token usage analytics card */}
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: "16px", fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                    Usage Analytics
                  </h3>
                  {loadingAnalytics ? (
                    <div style={{ padding: "20px 0", textAlign: "center", color: "var(--text-muted)", fontSize: "14px" }}>
                      Loading token analytics...
                    </div>
                  ) : (
                    <TokenAnalyticsChart data={analyticsData} />
                  )}
                </div>

                {/* Chat Sessions History List */}
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                    Your Active Conversations ({chats.length})
                  </h3>
                  {chats.length === 0 ? (
                    <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>No conversations started yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {chats.map((c, idx) => {
                        const chatDocs = c.uploaded_documents || [];
                        return (
                          <div 
                            key={idx}
                            onClick={() => {
                              setActiveChatId(c.chat_id);
                              setShowSettings(false);
                              setViewingDoc(null);
                            }}
                            style={{
                              padding: "12px 16px",
                              border: "1px solid var(--border-color)",
                              borderRadius: "8px",
                              display: "flex",
                              justifyContent: "space-between",
                              alignItems: "center",
                              cursor: "pointer",
                              transition: "background 0.2s"
                            }}
                            className="settings-chat-item-hover"
                          >
                            <span style={{ fontSize: "14px", fontWeight: 500, color: "var(--color-accent)" }}>
                              {chatDocs[0]?.filename || c.filename || "Empty Chat Room"}
                            </span>
                            <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                              {chatDocs.length} attachment(s)
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                {/* Files Attached List */}
                <div style={{
                  background: "var(--bg-secondary)",
                  border: "1px solid var(--border-color)",
                  borderRadius: "12px",
                  padding: "24px",
                  boxShadow: "var(--shadow-sm)"
                }}>
                  <h3 style={{ margin: "0 0 16px 0", fontSize: "16px", fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                    Attached Documents ({allAttachments.length})
                  </h3>
                  {allAttachments.length === 0 ? (
                    <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>No documents uploaded yet.</div>
                  ) : (
                    <div style={{ display: "flex", flexDirection: "column", gap: "8px" }}>
                      {allAttachments.map((att, idx) => (
                        <div 
                          key={idx}
                          style={{
                            padding: "12px 16px",
                            border: "1px solid var(--border-color)",
                            borderRadius: "8px",
                            display: "flex",
                            justifyContent: "space-between",
                            alignItems: "center"
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                            <span style={{ fontSize: "14px", fontWeight: 600, color: "var(--text-primary)" }}>
                              {att.filename}
                            </span>
                            <span style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                              From Chat: {att.chat_title}
                            </span>
                          </div>
                          <div style={{ display: "flex", gap: "8px" }}>
                            <button
                              onClick={() => {
                                setActiveChatId(att.chat_id);
                                handleViewDocument(att);
                                setShowSettings(false);
                              }}
                              className="btn-icon"
                              style={{ width: "auto", padding: "0 12px", height: "30px", fontSize: "12px" }}
                            >
                              View
                            </button>
                            <button
                              onClick={() => {
                                handleDeleteDocument(att.doc_id);
                              }}
                              style={{
                                background: "transparent",
                                border: "1px solid #ef4444",
                                color: "#ef4444",
                                borderRadius: "6px",
                                padding: "0 12px",
                                height: "30px",
                                fontSize: "12px",
                                cursor: "pointer"
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                {/* Actions list */}
                <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "16px" }}>
                  <button 
                    onClick={handleLogout}
                    style={{
                      padding: "12px 24px",
                      background: "transparent",
                      border: "1px solid #ef4444",
                      color: "#ef4444",
                      borderRadius: "8px",
                      fontWeight: 600,
                      cursor: "pointer",
                      fontSize: "14px",
                      transition: "all 0.2s"
                    }}
                    className="btn-signout-red"
                  >
                    Sign Out
                  </button>
                </div>
              </div>
            </div>
          ) : !activeChatId ? (
            /* Welcome Area */
            <div style={{ 
              margin: "auto", 
              textAlign: "center", 
              color: "var(--text-secondary)",
              fontFamily: "var(--font-heading)",
              maxWidth: "500px",
              padding: "20px",
              marginTop: "100px"
            }}>
              <h3>Welcome</h3>
              <p style={{ color: "var(--text-muted)", fontSize: "14px" }}>
                Click "New Chat" or select a chat session from the sidebar to get started.
              </p>
              {error && (
                <div style={{ color: "#ef4444", marginTop: "24px", fontSize: "14px", border: "1px solid #fee2e2", background: "#fef2f2", padding: "12px", borderRadius: "8px" }}>
                  <strong>Configuration Notice:</strong> {error}
                </div>
              )}
            </div>
          ) : (
            /* Interactive Chat Dashboard wrapped in flex column height 100% to lock scrolling */
            <div style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "100%",
              position: "relative",
              overflow: "hidden"
            }}>
              {/* Static Header Container */}
              <div style={{
                padding: "24px 24px 16px 24px",
                borderBottom: "1px solid var(--border-color)",
                background: "var(--bg-secondary)",
                zIndex: 10
              }}>
                <div style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  width: "100%",
                  maxWidth: "800px",
                  margin: "0 auto"
                }}>
                  <div style={{ display: "flex", flexDirection: "column", gap: "2px", paddingLeft: isSidebarCollapsed ? "44px" : "0" }}>
                    <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>
                      {activeChatTitle}
                    </h2>
                    <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                      {activeChatDocuments.length} document(s) uploaded
                    </span>
                  </div>
                  
                  <div style={{ display: "flex", alignItems: "center" }}>
                    {/* Realtime progress tracker bar */}
                    {activeChat && activeChat.processing_progress !== undefined && activeChat.processing_progress !== null && (
                      <div style={{
                        marginRight: "16px",
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "flex-end",
                        gap: "4px"
                      }}>
                        <div style={{ fontSize: "11px", color: "var(--text-muted)", fontWeight: 500 }}>
                          OCR Processing: {activeChat.processing_progress}%
                        </div>
                        <div style={{
                          width: "100px",
                          height: "5px",
                          background: "var(--border-color)",
                          borderRadius: "3px",
                          overflow: "hidden"
                        }}>
                          <div style={{
                            width: `${activeChat.processing_progress}%`,
                            height: "100%",
                            background: "var(--color-accent)",
                            transition: "width 0.3s ease"
                          }}></div>
                        </div>
                      </div>
                    )}

                    {/* Share chat button */}
                    <button 
                      onClick={handleShareChat}
                      className="btn-icon"
                      style={{ marginRight: "8px", width: "auto", padding: "0 12px", fontSize: "12px", fontWeight: 600 }}
                      title="Share Conversation"
                    >
                      Share
                    </button>

                    {/* Export transcript button */}
                    <button 
                      onClick={handleExportTranscript}
                      className="btn-icon"
                      style={{ marginRight: "8px", width: "auto", padding: "0 12px", fontSize: "12px", fontWeight: 600 }}
                      title="Export Chat Transcript"
                    >
                      Export
                    </button>

                    {/* Sun/Moon Toggle Theme switcher */}
                    <button 
                      onClick={() => setTheme((t) => (t === "light" ? "dark" : "light"))}
                      className="btn-icon"
                      style={{ marginRight: "12px" }}
                      title={theme === "light" ? "Switch to Dark Mode" : "Switch to Light Mode"}
                    >
                      {theme === "light" ? "🌙" : "☀️"}
                    </button>

                    <button 
                      onClick={() => document.getElementById("doc-plus-upload").click()}
                      className="btn-primary"
                      style={{ fontSize: "13px", padding: "8px 16px", borderRadius: "8px", fontWeight: 600 }}
                      disabled={loading || (activeChat && activeChat.processing_progress !== undefined && activeChat.processing_progress !== null)}
                    >
                      {loading || (activeChat && activeChat.processing_progress !== undefined && activeChat.processing_progress !== null) ? "Processing..." : "+ Add Document"}
                    </button>
                  </div>
                </div>
                
                <input 
                  type="file" 
                  id="doc-plus-upload" 
                  style={{ display: "none" }}
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />

                {/* Uploaded files list inside static header */}
                {activeChatDocuments.length > 0 && (
                  <div style={{
                    display: "flex",
                    flexWrap: "wrap",
                    gap: "8px",
                    paddingTop: "12px",
                    marginTop: "12px",
                    borderTop: "1px solid var(--border-color)",
                    width: "100%",
                    maxWidth: "800px",
                    margin: "12px auto 0 auto"
                  }}>
                    {activeChatDocuments.map((doc, idx) => (
                      <div 
                        key={idx} 
                        style={{
                          background: "var(--bg-secondary)",
                          border: "1px solid var(--border-color)",
                          borderRadius: "8px",
                          padding: "6px 12px",
                          fontSize: "13px",
                          display: "flex",
                          alignItems: "center",
                          gap: "12px",
                          boxShadow: "var(--shadow-sm)"
                        }}
                      >
                        <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
                          {doc.filename}
                        </span>
                        <div style={{ display: "flex", alignItems: "center", gap: "6px" }}>
                          <button 
                            onClick={() => handleViewDocument(doc)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "var(--color-accent)",
                              fontWeight: 600,
                              cursor: "pointer",
                              fontSize: "12px",
                              padding: 0
                            }}
                          >
                            View
                          </button>
                          <button 
                            onClick={() => handleDeleteDocument(doc.doc_id)}
                            style={{
                              background: "transparent",
                              border: "none",
                              color: "#ef4444",
                              fontWeight: 700,
                              cursor: "pointer",
                              fontSize: "14px",
                              padding: "0 4px",
                              lineHeight: 1
                            }}
                            title="Delete Document"
                          >
                            ×
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Scrollable Chat feed container */}
              <div style={{ flex: 1, overflow: "hidden", position: "relative", width: "100%" }}>
                <ChatPane
                  chatId={activeChatId}
                  docId={activeChatDocuments.length > 0 ? "active" : null}
                  activeBlock={activeBlock}
                  setActiveBlock={setActiveBlock}
                  setActivePage={setActivePage}
                  onViewDocument={handleViewDocument}
                  activeChatDocuments={activeChatDocuments}
                />
              </div>
            </div>
          )}
        </main>

        {/* Sliding Bounding Box Document Viewer Modal Drawer */}
        {viewingDoc && (
          <aside style={{
            position: "absolute",
            right: 0,
            top: 0,
            width: "50%",
            height: "100%",
            background: "var(--bg-secondary)",
            borderLeft: "1px solid var(--border-color)",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            zIndex: 100
          }}>
            <div style={{
              padding: "16px 24px",
              borderBottom: "1px solid var(--border-color)",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              background: "var(--bg-secondary)"
            }}>
              <span style={{ 
                fontFamily: "var(--font-heading)", 
                fontWeight: 700, 
                fontSize: "15px",
                overflow: "hidden",
                textOverflow: "ellipsis",
                whiteSpace: "nowrap",
                maxWidth: "80%",
                color: "var(--text-primary)"
              }}>
                Viewing: {viewingDoc.filename}
              </span>
              <button 
                onClick={() => setViewingDoc(null)}
                className="btn-icon"
                style={{ width: "32px", height: "32px" }}
              >
                Close
              </button>
            </div>
            <div style={{ flex: 1, overflow: "hidden", position: "relative" }}>
              <DocumentViewer
                docId={viewingDoc.doc_id}
                pagesCount={viewingDoc.pages_count}
                activePage={activePage}
                setActivePage={setActivePage}
                blocks={blocks}
                activeBlock={activeBlock}
                setActiveBlock={setActiveBlock}
              />
            </div>
          </aside>
        )}
      </div>

      {/* Share Conversation Link Dialog Box */}
      {shareUrl && (
        <div style={{
          position: "fixed",
          top: 0,
          left: 0,
          width: "100vw",
          height: "100vh",
          background: "rgba(0,0,0,0.6)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 1000
        }}>
          <div style={{
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "12px",
            padding: "24px",
            width: "90%",
            maxWidth: "500px",
            boxShadow: "var(--shadow-lg)",
            display: "flex",
            flexDirection: "column",
            gap: "16px"
          }}>
            <h3 style={{ margin: 0, color: "var(--text-primary)", fontFamily: "var(--font-heading)", fontSize: "18px", fontWeight: 700 }}>Share Conversation</h3>
            <p style={{ fontSize: "13px", color: "var(--text-secondary)", margin: 0 }}>
              Anyone with this public link can view this chat history snapshot:
            </p>
            <div style={{
              display: "flex",
              gap: "8px",
              background: "var(--bg-primary)",
              border: "1px solid var(--border-color)",
              padding: "8px 12px",
              borderRadius: "6px"
            }}>
              <input
                type="text"
                readOnly
                value={shareUrl}
                style={{
                  flex: 1,
                  background: "transparent",
                  border: "none",
                  color: "var(--text-primary)",
                  fontSize: "12px",
                  outline: "none"
                }}
                id="share-link-input"
              />
              <button
                onClick={() => {
                  const copyText = document.getElementById("share-link-input");
                  copyText.select();
                  navigator.clipboard.writeText(copyText.value);
                  alert("Copied to clipboard!");
                }}
                style={{
                  background: "var(--color-accent)",
                  color: "#ffffff",
                  border: "none",
                  padding: "6px 12px",
                  borderRadius: "4px",
                  fontSize: "12px",
                  cursor: "pointer",
                  fontWeight: 600
                }}
              >
                Copy
              </button>
            </div>
            <div style={{ display: "flex", justifyContent: "flex-end" }}>
              <button
                className="btn-primary"
                onClick={() => setShareUrl(null)}
                style={{ width: "auto", padding: "0 16px", height: "36px" }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
