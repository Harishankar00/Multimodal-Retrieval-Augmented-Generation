import React, { useState, useEffect } from "react";
import { onAuthStateChanged, signOut } from "firebase/auth";
import { auth } from "./firebase";
import Auth from "./components/Auth";
import DocumentViewer from "./components/DocumentViewer";
import ChatPane from "./components/ChatPane";

export default function App() {
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(true);
  
  // Light/Dark Theme Switcher state
  const [theme, setTheme] = useState(localStorage.getItem("theme") || "light");

  // Sidebar collapsible state
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);

  // Account Settings view switcher
  const [showSettings, setShowSettings] = useState(false);

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

  // Apply theme dynamically to document root
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", theme);
    localStorage.setItem("theme", theme);
  }, [theme]);

  // 1. Listen to Auth State Changes
  useEffect(() => {
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

  const getInitials = () => {
    if (user?.displayName) return user.displayName.substring(0, 2).toUpperCase();
    if (user?.email) return user.email.substring(0, 2).toUpperCase();
    return "US";
  };

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

        <div className="sidebar-chats-list">
          {chats.map((chat) => {
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
            overflowY: "auto"
          }}
        >
          {showSettings ? (
            /* Premium Settings Dashboard Screen */
            <div style={{
              maxWidth: "800px",
              margin: "40px auto",
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
                        <button
                          onClick={() => {
                            setActiveChatId(att.chat_id);
                            handleViewDocument(att);
                            setShowSettings(false);
                          }}
                          className="btn-icon"
                          style={{ width: "auto", padding: "0 12px", height: "30px", fontSize: "12px" }}
                        >
                          View Bounding Boxes
                        </button>
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
            /* Interactive Chat Dashboard */
            <div style={{
              display: "flex",
              flexDirection: "column",
              minHeight: "100%",
              width: "100%",
              maxWidth: "800px",
              margin: "0 auto",
              padding: "24px 24px 40px 24px",
              position: "relative"
            }}>
              {/* Chat Title Area */}
              <div style={{
                paddingBottom: "16px",
                borderBottom: "1px solid var(--border-color)",
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between"
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
                    disabled={loading}
                  >
                    {loading ? "Processing..." : "+ Add Document"}
                  </button>
                </div>
                
                <input 
                  type="file" 
                  id="doc-plus-upload" 
                  style={{ display: "none" }}
                  accept=".pdf,.png,.jpg,.jpeg"
                  onChange={handleFileChange}
                />
              </div>

              {/* Uploaded files list */}
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
                        gap: "12px",
                        boxShadow: "var(--shadow-sm)"
                      }}
                    >
                      <span style={{ maxWidth: "200px", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-primary)" }}>
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

              {/* Scrollable Chat feed container */}
              <div style={{ flex: 1 }}>
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
    </div>
  );
}
