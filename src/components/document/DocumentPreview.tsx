"use client";

import { useEffect, useRef, useState } from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

// pdf.js needs a worker. Resolve it from the installed pdfjs-dist via a URL the
// bundler (Vite/Next/Turbopack) can fingerprint and serve.
pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url,
).toString();

/** Which engine to use for DOCX. docx-preview = high visual fidelity (pages,
 * tables, images, styles). mammoth = clean semantic HTML, text-first, loses
 * most layout but is great for search/indexing/diffing. */
export type DocxRenderer = "docx-preview" | "mammoth";

export type DocumentKind = "docx" | "pdf" | "pptx";

export interface DocumentPreviewProps {
  /** URL to fetch the document bytes from (static fixture, GitHub download_url, etc.). */
  src: string;
  /** Document type. Inferred from the src extension when omitted. */
  kind?: DocumentKind;
  /** DOCX engine. Ignored for PDFs/PPTX. */
  renderer?: DocxRenderer;
  className?: string;
}

function inferKind(src: string): DocumentKind | null {
  const lower = (src.split("?")[0] ?? src).toLowerCase();
  if (lower.endsWith(".pdf")) return "pdf";
  if (lower.endsWith(".docx")) return "docx";
  if (lower.endsWith(".pptx")) return "pptx";
  return null;
}

export function DocumentPreview({
  src,
  kind,
  renderer = "docx-preview",
  className,
}: DocumentPreviewProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const resolvedKind = kind ?? inferKind(src);

  useEffect(() => {
    if (resolvedKind !== "docx" && resolvedKind !== "pptx") return;
    let cancelled = false;
    const container = containerRef.current;
    if (!container) return;

    setLoading(true);
    setError(null);
    container.innerHTML = "";

    (async () => {
      try {
        const res = await fetch(src);
        if (!res.ok) throw new Error(`fetch ${res.status}`);
        const buffer = await res.arrayBuffer();
        if (cancelled) return;

        if (resolvedKind === "pptx") {
          const { init } = await import("pptx-preview");
          const previewer = init(container, {
            width: container.clientWidth || 960,
            height: Math.round((container.clientWidth || 960) * 0.5625),
            mode: "list",
          });
          await previewer.preview(buffer);
        } else if (renderer === "mammoth") {
          const mammoth = await import("mammoth");
          const { value } = await mammoth.convertToHtml({ arrayBuffer: buffer });
          if (cancelled) return;
          container.innerHTML = value;
        } else {
          const { renderAsync } = await import("docx-preview");
          await renderAsync(buffer, container, undefined, {
            className: "docx",
            inWrapper: true,
            ignoreWidth: false,
            ignoreHeight: false,
            breakPages: true,
            experimental: true,
          });
        }
        if (!cancelled) setLoading(false);
      } catch (e) {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : String(e));
          setLoading(false);
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [src, resolvedKind, renderer]);

  if (resolvedKind === "pdf") {
    return <PdfView src={src} className={className} />;
  }

  if (resolvedKind !== "docx" && resolvedKind !== "pptx") {
    return <div className={className}>Unsupported document type for: {src}</div>;
  }

  return (
    <div className={className} style={{ position: "relative", overflow: "auto" }}>
      {loading && (
        <div style={{ padding: 24, color: "#888", fontFamily: "system-ui" }}>
          Rendering document…
        </div>
      )}
      {error && (
        <div style={{ padding: 24, color: "#c00", fontFamily: "system-ui" }}>
          Failed to render: {error}
        </div>
      )}
      {/* docx-preview / mammoth inject their DOM here */}
      <div ref={containerRef} />
    </div>
  );
}

/** Renders every page of a PDF with pdf.js (via react-pdf), sized to the
 * container width. Consistent across browsers — no reliance on a native plugin. */
function PdfView({ src, className }: { src: string; className?: string }) {
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

export default DocumentPreview;
