import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./components/Auth";
import DocumentViewer from "./components/DocumentViewer";
import ChatPane from "./components/ChatPane";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Chats list & active chat
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  // Active chat document state
  const [docId, setDocId] = useState(null);
  const [pagesCount, setPagesCount] = useState(0);
  const [activePage, setActivePage] = useState(1);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [isDragOver, setIsDragOver] = useState(false);

  // 1. Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setChats([]);
        setActiveChatId(null);
        handleResetWorkspace();
      }
    });
    return unsubscribe;
  }, []);

  // 2. Fetch User's Chats on Login or active context
  useEffect(() => {
    if (!user) return;
    loadChats();
  }, [user]);

  const loadChats = async () => {
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
        
        // Select the first chat automatically if none is selected
        if (chatsList.length > 0 && !activeChatId) {
          selectChat(chatsList[0]);
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

  const handleResetWorkspace = () => {
    setDocId(null);
    setPagesCount(0);
    setActivePage(1);
    setBlocks([]);
    setActiveBlock(null);
    setError(null);
  };

  const selectChat = async (chat) => {
    setActiveChatId(chat.chat_id);
    setError(null);
    
    if (chat.doc_id) {
      setDocId(chat.doc_id);
      setPagesCount(chat.pages_count);
      setActivePage(1);
      setActiveBlock(null);
      setBlocks([]); // Clear before load
      
      try {
        const token = await user.getIdToken();
        const res = await fetch(`http://localhost:8000/api/chats/${chat.chat_id}/documents/${chat.doc_id}`, {
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
    } else {
      handleResetWorkspace();
    }
  };

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
          created_at: new Date().toISOString()
        };
        setChats((prev) => [newChat, ...prev]);
        setActiveChatId(newChatId);
        handleResetWorkspace();
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
          handleResetWorkspace();
        }
      }
    } catch (err) {
      console.error("Failed to delete chat session:", err);
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

      const data = await response.json();
      setDocId(data.doc_id);
      setPagesCount(data.pages_count);
      setBlocks(data.blocks || []);
      setActivePage(1);
      setActiveBlock(null);
      
      // Update chat session locally in array
      setChats((prev) => 
        prev.map((c) => 
          c.chat_id === activeChatId 
            ? { ...c, doc_id: data.doc_id, filename: data.filename, pages_count: data.pages_count }
            : c
        )
      );
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

  const handleLogout = async () => {
    try {
      await signOut(auth);
    } catch (err) {
      console.error("Sign out error:", err);
    }
  };

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

  return (
    <div className="app-container">
      {/* 1. Left Sidebar Chat Workspace Switcher */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Multimodal RAG</span>
        </div>
        
        <button className="btn-new-chat" onClick={handleCreateChat}>
          New Chat
        </button>

        <div className="sidebar-chats-list">
          {chats.map((chat) => (
            <div 
              key={chat.chat_id} 
              className={`sidebar-chat-item ${activeChatId === chat.chat_id ? "active" : ""}`}
              onClick={() => selectChat(chat)}
            >
              <span style={{ 
                overflow: "hidden", 
                textOverflow: "ellipsis", 
                whiteSpace: "nowrap",
                maxWidth: "160px"
              }}>
                {chat.filename || "Untitled Chat"}
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
          ))}
        </div>

        <div className="sidebar-footer">
          <div className="sidebar-user-email">{user.email}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Main Active Chat Content Panel */}
      <main className="main-content">
        {!activeChatId ? (
          <div style={{ 
            margin: "auto", 
            textAlign: "center", 
            color: "var(--text-secondary)",
            fontFamily: "var(--font-heading)",
            maxWidth: "500px",
            padding: "20px"
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
        ) : !docId ? (
          <div className="upload-container" style={{ margin: "auto" }}>
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
                  <div style={{ fontSize: "32px", color: "var(--color-accent)", marginBottom: "16px" }}>+</div>
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
                  <div style={{ color: "#ef4444", marginTop: "16px", fontSize: "14px", textAlign: "center" }}>
                    Error: {error}
                  </div>
                )}
              </>
            )}
          </div>
        ) : (
          <div style={{ display: "flex", flex: 1, height: "100%", overflow: "hidden" }}>
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
                chatId={activeChatId}
                docId={docId}
                activeBlock={activeBlock}
                setActiveBlock={setActiveBlock}
                setActivePage={setActivePage}
              />
            </div>
          </div>
        )}
      </main>
    </div>
  );
}
