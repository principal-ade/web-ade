"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdf.js needs a worker. Resolve it from the installed pdfjs-dist via a URL the
// bundler (Vite/Next/Turbopack) can fingerprint and serve.
//
// This module (and react-pdf with it) is intentionally loaded lazily from
// DocumentPreview — only when a PDF is actually viewed — so opening a DOCX
// never drags pdf.js or its worker into the bundle.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** Renders every page of a PDF with pdf.js (via react-pdf), sized to the
 * container width. Consistent across browsers — no reliance on a native plugin. */
export function PdfView({ src, className }: { src: string; className?: string }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [width, setWidth] = useState(0);
  const [numPages, setNumPages] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const update = () => setWidth(el.clientWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  // Cap page width so very wide containers don't blow the pages up.
  const pageWidth = width ? Math.min(width - 24, 1100) : undefined;

  return (
    <div
      ref={wrapRef}
      className={className}
      style={{ height: "100%", overflow: "auto", padding: 12 }}
    >
      {error ? (
        <div style={{ padding: 24, color: "#c00", fontFamily: "system-ui" }}>
          Failed to render PDF: {error}{" "}
          <a href={src} target="_blank" rel="noreferrer">
            Open directly
          </a>
        </div>
      ) : (
        <Document
          file={src}
          onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
          onLoadError={(e) => setError(e.message)}
          loading={
            <div style={{ padding: 24, color: "#888", fontFamily: "system-ui" }}>
              Loading PDF…
            </div>
          }
        >
          {Array.from({ length: numPages }, (_, i) => (
            <div
              key={i}
              style={{
                margin: "0 auto 16px",
                width: "fit-content",
                boxShadow: "0 1px 6px rgba(0,0,0,0.18)",
              }}
            >
              <Page
                pageNumber={i + 1}
                width={pageWidth}
                renderAnnotationLayer
                renderTextLayer
              />
            </div>
          ))}
        </Document>
      )}
    </div>
  );
}

export default PdfView;
