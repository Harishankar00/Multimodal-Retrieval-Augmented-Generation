import React, { useState, useEffect, useRef } from "react";

export default function DocumentViewer({ docId, pagesCount, activePage, setActivePage, blocks, activeBlock, setActiveBlock }) {
  const [scale, setScale] = useState({ x: 1, y: 1 });
  const [imgSize, setImgSize] = useState({ width: 0, height: 0 });
  const imgRef = useRef(null);

  const imageUrl = docId ? `http://localhost:8000/api/documents/${docId}/pages/${activePage}` : null;

  // Recalculate scaling whenever active page, image load, or window resize occurs
  const updateScale = () => {
    if (imgRef.current) {
      const { naturalWidth, naturalHeight, clientWidth, clientHeight } = imgRef.current;
      if (naturalWidth && naturalHeight) {
        setScale({
          x: clientWidth / naturalWidth,
          y: clientHeight / naturalHeight
        });
        setImgSize({
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

  // Filter blocks belonging to the currently active page
  const pageBlocks = blocks.filter((b) => b.page_number === activePage);

  return (
    <div className="viewer-container">
      <div className="viewer-toolbar">
        <h2 style={{ margin: 0, fontSize: "16px", fontFamily: "var(--font-heading)" }}>Document View</h2>
        
        {pagesCount > 1 && (
          <div className="pagination">
            <button 
              className="btn-icon" 
              onClick={() => setActivePage((p) => Math.max(1, p - 1))} 
              disabled={activePage === 1}
              title="Previous Page"
            >
              ←
            </button>
            <span>Page {activePage} of {pagesCount}</span>
            <button 
              className="btn-icon" 
              onClick={() => setActivePage((p) => Math.min(pagesCount, p + 1))} 
              disabled={activePage === pagesCount}
              title="Next Page"
            >
              →
            </button>
          </div>
        )}
      </div>

      <div className="viewer-content">
        {imageUrl ? (
          <div className="document-page-wrapper" style={{ width: "fit-content" }}>
            <img
              ref={imgRef}
              src={imageUrl}
              alt={`Document Page ${activePage}`}
              className="document-page-image"
              onLoad={updateScale}
              style={{ display: "block" }}
            />
            {imgSize.width > 0 && (
              <svg 
                className="ocr-svg-overlay" 
                viewBox={`0 0 ${imgSize.width} ${imgSize.height}`}
                style={{ width: imgSize.width, height: imgSize.height }}
              >
                {pageBlocks.map((block, idx) => {
                  // Map points of the bounding box polygon to responsive client coordinates
                  const points = block.box
                    .map((pt) => `${pt[0] * scale.x},${pt[1] * scale.y}`)
                    .join(" ");

                  const isActive = activeBlock && 
                    JSON.stringify(activeBlock.box) === JSON.stringify(block.box) &&
                    activeBlock.text === block.text;

                  return (
                    <polygon
                      key={idx}
                      points={points}
                      className={`ocr-bbox-polygon ${isActive ? "active" : ""}`}
                      onClick={() => setActiveBlock(block)}
                    >
                      <title>{block.text} (Confidence: {(block.confidence * 100).toFixed(1)}%)</title>
                    </polygon>
                  );
                })}
              </svg>
            )}
          </div>
        ) : (
          <div style={{ color: "var(--text-muted)", fontSize: "14px" }}>
            No document loaded
          </div>
        )}
      </div>
    </div>
  );
}
