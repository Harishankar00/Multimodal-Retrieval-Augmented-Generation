import React, { useState } from "react";
import { 
  signInWithEmailAndPassword, 
  createUserWithEmailAndPassword, 
  signInWithPopup, 
  GoogleAuthProvider 
} from "firebase/auth";
import { auth } from "../firebase";

export default function Auth() {
  const [isSignUp, setIsSignUp] = useState(false);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);

  const handleEmailAuth = async (e) => {
    e.preventDefault();
    if (!email || !password) return;
    
    setLoading(true);
    setError(null);
    
    try {
      if (isSignUp) {
        await createUserWithEmailAndPassword(auth, email, password);
      } else {
        await signInWithEmailAndPassword(auth, email, password);
      }
    } catch (err) {
      console.error(err);
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleAuth = async () => {
    setLoading(true);
    setError(null);
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError(err.message.replace("Firebase: ", ""));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      height: "100svh",
      width: "100vw",
      background: "var(--bg-primary)"
    }}>
      <div style={{
        background: "var(--bg-secondary)",
        padding: "40px",
        borderRadius: "12px",
        boxShadow: "var(--shadow-lg)",
        border: "1px solid var(--border-color)",
        width: "100%",
        maxWidth: "400px",
        boxSizing: "border-box"
      }}>
        <h2 style={{
          textAlign: "center",
          fontFamily: "var(--font-heading)",
          fontSize: "24px",
          fontWeight: 700,
          margin: "0 0 24px 0",
          color: "var(--text-primary)"
        }}>
          {isSignUp ? "Create an Account" : "Sign In"}
        </h2>

        <form onSubmit={handleEmailAuth} style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Email Address</label>
            <input
              type="email"
              className="chat-input"
              style={{ width: "100%", padding: "10px 12px" }}
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              disabled={loading}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: "6px" }}>
            <label style={{ fontSize: "13px", fontWeight: 600, color: "var(--text-secondary)" }}>Password</label>
            <input
              type="password"
              className="chat-input"
              style={{ width: "100%", padding: "10px 12px" }}
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              disabled={loading}
            />
          </div>

          {error && (
            <div style={{ color: "#ef4444", fontSize: "13px", textAlign: "center" }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            className="btn-primary"
            style={{ padding: "12px", width: "100%", fontWeight: 600 }}
            disabled={loading}
          >
            {loading ? "Processing..." : isSignUp ? "Sign Up" : "Sign In"}
          </button>
        </form>

        <div style={{
          display: "flex",
          alignItems: "center",
          margin: "20px 0",
          color: "var(--text-muted)",
          fontSize: "12px"
        }}>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }}></div>
          <span style={{ padding: "0 10px" }}>OR</span>
          <div style={{ flex: 1, height: "1px", background: "var(--border-color)" }}></div>
        </div>

        <button
          onClick={handleGoogleAuth}
          className="btn-icon"
          style={{
            width: "100%",
            height: "42px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: "10px",
            fontSize: "14px",
            fontWeight: 600,
            cursor: "pointer",
            background: "var(--bg-secondary)",
            border: "1px solid var(--border-color)",
            borderRadius: "8px"
          }}
          disabled={loading}
        >
          Sign In with Google
        </button>

        <p style={{
          textAlign: "center",
          fontSize: "13px",
          marginTop: "24px",
          color: "var(--text-secondary)",
          margin: "24px 0 0 0"
        }}>
          {isSignUp ? "Already have an account?" : "Don't have an account?"}{" "}
          <span
            onClick={() => setIsSignUp(!isSignUp)}
            style={{
              color: "var(--color-accent)",
              cursor: "pointer",
              fontWeight: 600
            }}
          >
            {isSignUp ? "Sign In" : "Sign Up"}
          </span>
        </p>
      </div>
    </div>
  );
}
