"use client";

import { Suspense, lazy, useEffect, useRef, useState } from "react";

// react-pdf / pdf.js are heavy and need bundler-specific worker glue. Load them
// only when a PDF is actually viewed, so the DOCX and PPTX paths never pay that
// cost (and a DOCX-only host doesn't need the pdf.js worker wired up).
const PdfView = lazy(() => import("./PdfView"));

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
    return (
      <Suspense
        fallback={
          <div style={{ padding: 24, color: "#888", fontFamily: "system-ui" }}>
            Loading PDF…
          </div>
        }
      >
        <PdfView src={src} className={className} />
      </Suspense>
    );
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

export default DocumentPreview;
