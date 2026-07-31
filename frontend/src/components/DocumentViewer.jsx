import React, { useState, useEffect, useRef } from "react";

function DocumentPage({ pageNumber, docId, blocks, activeBlock, setActiveBlock, searchQuery }) {
  const imgRef = useRef(null);
  const [scaleState, setScaleState] = useState({ x: 1, y: 1 });
  const [imgSizeState, setImgSizeState] = useState({ width: 0, height: 0 });

  const imageUrl = `http://localhost:8000/api/documents/${docId}/pages/${pageNumber}`;

  const updateScale = () => {
    if (imgRef.current) {
      const { naturalWidth, naturalHeight, clientWidth, clientHeight } = imgRef.current;
      if (naturalWidth && naturalHeight) {
        setScaleState({
          x: clientWidth / naturalWidth,
          y: clientHeight / naturalHeight
        });
        setImgSizeState({
          width: clientWidth,
          height: clientHeight
        });
      }
    }
  };

  useEffect(() => {
    window.addEventListener("resize", updateScale);
    return () => window.removeEventListener("resize", updateScale);
  }, []);

  const pageBlocks = blocks.filter((b) => b.page_number === pageNumber);

  return (
    <div 
      className="document-page-wrapper" 
      style={{ 
        position: "relative",
        width: "fit-content",
        margin: "12px auto 24px auto",
        boxShadow: "var(--shadow-md)",
        borderRadius: "8px",
        overflow: "hidden",
        border: "1px solid var(--border-color)",
        background: "var(--bg-secondary)"
      }}
    >
      <img
        ref={imgRef}
        src={imageUrl}
        alt={`Document Page ${pageNumber}`}
        className="document-page-image"
        onLoad={updateScale}
        style={{ display: "block", maxWidth: "100%", height: "auto" }}
      />
      {imgSizeState.width > 0 && (
        <svg 
          className="ocr-svg-overlay" 
          viewBox={`0 0 ${imgSizeState.width} ${imgSizeState.height}`}
          style={{ 
            position: "absolute",
            top: 0,
            left: 0,
            width: imgSizeState.width, 
            height: imgSizeState.height,
            pointerEvents: "none"
          }}
        >
          {pageBlocks.map((block, idx) => {
            const points = block.box
              .map((pt) => `${pt[0] * scaleState.x},${pt[1] * scaleState.y}`)
              .join(" ");

            const isSearchMatch = searchQuery && 
              block.text.toLowerCase().includes(searchQuery.toLowerCase());

            const isActive = activeBlock && 
              JSON.stringify(activeBlock.box) === JSON.stringify(block.box) &&
              activeBlock.text === block.text;

            // Bounding box fill/stroke style
            let strokeColor = "transparent";
            let fillColor = "transparent";
            
            if (isActive) {
              strokeColor = "var(--color-accent)";
              fillColor = "rgba(245, 158, 11, 0.25)";
            } else if (isSearchMatch) {
              strokeColor = "#10b981"; // green highlight for search matches
              fillColor = "rgba(16, 185, 129, 0.15)";
            }

            return (
              <polygon
                key={idx}
                points={points}
                style={{
                  stroke: strokeColor,
                  fill: fillColor,
                  strokeWidth: (isActive || isSearchMatch) ? 2 : 0,
                  pointerEvents: "all",
                  cursor: "pointer",
                  transition: "all 0.15s ease"
                }}
                onClick={() => setActiveBlock(block)}
              >
                <title>{block.text} (Confidence: {(block.confidence * 100).toFixed(1)}%)</title>
              </polygon>
            );
          })}
        </svg>
      )}
      <div style={{
        position: "absolute",
        bottom: "8px",
        right: "8px",
        background: "rgba(0,0,0,0.6)",
        color: "#ffffff",
        padding: "2px 8px",
        fontSize: "11px",
        borderRadius: "4px",
        pointerEvents: "none"
      }}>
        Page {pageNumber}
      </div>
    </div>
  );
}

export default function DocumentViewer({ docId, pagesCount, activePage, setActivePage, blocks, activeBlock, setActiveBlock }) {
  const [searchQuery, setSearchQuery] = useState("");
  const pageRefs = useRef({});

  // Trigger scroll to activePage when activePage changes from Chat citations
  useEffect(() => {
    if (activePage && pageRefs.current[activePage]) {
      pageRefs.current[activePage].scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }, [activePage]);

  // Trigger scroll to first search match when searchQuery changes
  useEffect(() => {
    if (searchQuery.trim() === "") return;
    const lowerQuery = searchQuery.toLowerCase();
    
    // Find the first block matching the query
    const firstMatch = blocks.find(b => b.text.toLowerCase().includes(lowerQuery));
    if (firstMatch) {
      const matchPage = firstMatch.page_number;
      setActivePage(matchPage);
      if (pageRefs.current[matchPage]) {
        pageRefs.current[matchPage].scrollIntoView({ behavior: "smooth", block: "center" });
      }
    }
  }, [searchQuery, blocks, setActivePage]);

  // Create array of page numbers [1, 2, ..., pagesCount]
  const pages = Array.from({ length: pagesCount || 0 }, (_, i) => i + 1);

  return (
    <div className="viewer-container" style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--bg-primary)" }}>
      <div className="viewer-toolbar" style={{ display: "flex", flexDirection: "column", gap: "10px", padding: "16px 24px", borderBottom: "1px solid var(--border-color)", background: "var(--bg-secondary)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%" }}>
          <h2 style={{ margin: 0, fontSize: "15px", fontFamily: "var(--font-heading)", color: "var(--text-primary)" }}>Document View</h2>
          <span style={{ fontSize: "13px", color: "var(--text-secondary)" }}>{pagesCount} pages</span>
        </div>
        
        {/* Keyword Search Input */}
        <div style={{ position: "relative", width: "100%" }}>
          <input
            type="text"
            placeholder="Search words in document..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              width: "100%",
              padding: "8px 12px",
              fontSize: "13px",
              borderRadius: "6px",
              border: "1px solid var(--border-color)",
              background: "var(--bg-primary)",
              color: "var(--text-primary)",
              outline: "none"
            }}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery("")}
              style={{
                position: "absolute",
                right: "8px",
                top: "50%",
                transform: "translateY(-50%)",
                background: "transparent",
                border: "none",
                cursor: "pointer",
                color: "var(--text-secondary)",
                fontSize: "12px"
              }}
            >
              Clear
            </button>
          )}
        </div>
      </div>

      <div className="viewer-content" style={{ flex: 1, overflowY: "auto", padding: "16px" }}>
        {docId && pagesCount > 0 ? (
          pages.map((pageNum) => (
            <div 
              key={pageNum} 
              ref={(el) => (pageRefs.current[pageNum] = el)}
              style={{ scrollMarginTop: "20px" }}
            >
              <DocumentPage
                pageNumber={pageNum}
                docId={docId}
                blocks={blocks}
                activeBlock={activeBlock}
                setActiveBlock={setActiveBlock}
                searchQuery={searchQuery}
              />
            </div>
          ))
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: "14px", textAlign: "center", marginTop: "40px" }}>
            No document loaded
          </div>
        )}
      </div>
    </div>
  );
}
