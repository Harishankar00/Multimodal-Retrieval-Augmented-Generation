import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./components/Auth";
import DocumentViewer from "./components/DocumentViewer";
import ChatPane from "./components/ChatPane";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Chats list & active chat context
  const [chats, setChats] = useState([]);
  const [activeChatId, setActiveChatId] = useState(null);

  // Active viewing document overlay state
  const [viewingDoc, setViewingDoc] = useState(null);
  const [activePage, setActivePage] = useState(1);
  const [blocks, setBlocks] = useState([]);
  const [activeBlock, setActiveBlock] = useState(null);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  // 1. Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (!currentUser) {
        setChats([]);
        setActiveChatId(null);
        setViewingDoc(null);
      }
    });
    return unsubscribe;
  }, []);

  // 2. Fetch User's Chats on Login
  useEffect(() => {
    if (!user) return;
    loadChats();
  }, [user]);

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

  // 3. Load layout blocks when viewingDoc changes
  useEffect(() => {
    if (!viewingDoc || !activeChatId) {
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
  }, [viewingDoc, activeChatId]);

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

  // Find active chat details
  const activeChat = chats.find((c) => c.chat_id === activeChatId);
  const activeChatDocuments = activeChat?.uploaded_documents || [];
  const activeChatTitle = activeChatDocuments[0]?.filename || activeChat?.filename || "Untitled Chat";

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
    <div className="app-container" style={{ position: "relative", overflow: "hidden" }}>
      {/* 1. Left Sidebar Chat Workspace Switcher */}
      <aside className="sidebar">
        <div className="sidebar-header">
          <span className="sidebar-title">Multimodal RAG</span>
        </div>
        
        <button className="btn-new-chat" onClick={handleCreateChat}>
          New Chat
        </button>

        <div className="sidebar-chats-list">
          {chats.map((chat) => {
            const chatDocs = chat.uploaded_documents || [];
            const displayTitle = chatDocs[0]?.filename || chat.filename || "Empty Chat";
            
            return (
              <div 
                key={chat.chat_id} 
                className={`sidebar-chat-item ${activeChatId === chat.chat_id ? "active" : ""}`}
                onClick={() => {
                  setActiveChatId(chat.chat_id);
                  setViewingDoc(null);
                  setError(null);
                }}
              >
                <span style={{ 
                  overflow: "hidden", 
                  textOverflow: "ellipsis", 
                  whiteSpace: "nowrap",
                  maxWidth: "160px"
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
          <div className="sidebar-user-email">{user.email}</div>
          <button className="btn-logout" onClick={handleLogout}>
            Sign Out
          </button>
        </div>
      </aside>

      {/* 2. Main Content Workspace */}
      <div style={{ 
        flex: 1, 
        display: "flex", 
        height: "100%", 
        overflow: "hidden", 
        position: "relative" 
      }}>
        {/* Chat Interface centered inside main content area */}
        <main className="main-content" style={{ 
          position: "relative",
          marginRight: viewingDoc ? "50%" : "0%",
          transition: "margin-right 0.3s cubic-bezier(0.4, 0, 0.2, 1)"
        }}>
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
          ) : (
            <div style={{
              display: "flex",
              flexDirection: "column",
              height: "100%",
              width: "100%",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "0 24px"
            }}>
              {/* Top header listing all active documents inside the chat room */}
              <div style={{
                padding: "16px 0",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
              }}>
                <div style={{ display: "flex", flexDirection: "column", gap: "2px" }}>
                  <h2 style={{ margin: 0, fontSize: "16px", fontWeight: 700, fontFamily: "var(--font-heading)" }}>
                    {activeChatTitle}
                  </h2>
                  <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                    {activeChatDocuments.length} document(s) uploaded
                  </span>
                </div>
                
                {/* Trigger document upload dialog via plus trigger */}
                <button 
                  onClick={() => document.getElementById("doc-plus-upload").click()}
                  className="btn-primary"
                  style={{ fontSize: "13px", padding: "8px 16px", borderRadius: "8px", fontWeight: 600 }}
                  disabled={loading}
                >
                  {loading ? "Processing..." : "+ Add Document"}
                </button>
                <input 
                  type="file" 
                  id="doc-plus-upload" 
                  style={{ display: "none" }}
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
              </div>

              {/* List of uploaded files at top of chat */}
              {activeChatDocuments.length > 0 && (
                <div style={{
                  display: "flex",
                  flexWrap: "wrap",
                  gap: "8px",
                  padding: "12px 0",
                  borderBottom: "1px solid var(--border-color)"
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
                        gap: "12px"
                      }}
                    >
                      <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {doc.filename}
                      </span>
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
                    </div>
                  ))}
                </div>
              )}

              {/* Chat pane taking remaining center screen height */}
              <div style={{ flex: 1, minHeight: 0, position: "relative" }}>
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

        {/* 3. Sliding Bounding Box Document Viewer Modal Drawer */}
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
                maxWidth: "80%"
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
    </div>
  );
}
