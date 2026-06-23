'use client';

import { useEffect, useMemo, useState } from 'react';
import { useTheme } from '@principal-ade/industry-theme';
import { ThemedMonacoEditor } from '@principal-ade/industry-themed-monaco-editor';
import { DocumentView } from 'themed-markdown';
import {
  parseFrontmatter,
  stripRedundantTitleHeading,
  fmString,
} from '@principal-ade/markdown-utils';
import { X } from 'lucide-react';
import { DocumentPreview } from '@/components/document/DocumentPreview';
import { MarkdownFrontmatterHeader } from './MarkdownFrontmatterHeader';

// Markdown files render through themed-markdown (mirroring the electron-app's
// MarkdownPanel) instead of the raw Monaco source view.
function isMarkdownPath(path: string): boolean {
  const lower = (path.split('?')[0] ?? path).toLowerCase();
  return lower.endsWith('.md') || lower.endsWith('.markdown');
}

// Binary document types that render through DocumentPreview instead of Monaco.
// Starting with DOCX (client-side, high fidelity via docx-preview); PDF/PPTX
// will follow once the pdf.js worker glue / LibreOffice converter land.
function inferDocKind(path: string): 'docx' | null {
  const lower = (path.split('?')[0] ?? path).toLowerCase();
  if (lower.endsWith('.docx')) return 'docx';
  return null;
}

// Strips the leading slash / "GitHub/" / "owner/repo/" prefixes that file
// paths can arrive with, leaving a clean repo-relative path for the API.
// Mirrors the normalization in RepoTrailExplorerPage's `readFile`.
function normalizeRepoPath(path: string, owner: string, repo: string): string {
  let clean = path;
  if (clean.startsWith('/')) clean = clean.slice(1);
  if (clean.startsWith('GitHub/')) clean = clean.slice('GitHub/'.length);
  const repoPrefix = `${owner}/${repo}/`;
  if (clean.startsWith(repoPrefix)) clean = clean.slice(repoPrefix.length);
  return clean;
}

async function fetchFileContent(
  owner: string,
  repo: string,
  path: string,
): Promise<string> {
  const clean = normalizeRepoPath(path, owner, repo);
  const response = await fetch(
    `/api/github/repo/${owner}/${repo}?action=file&path=${encodeURIComponent(clean)}`,
  );
  if (!response.ok) {
    throw new Error(`Failed to read file: ${response.statusText}`);
  }
  const data = await response.json();
  if (data.content && data.encoding === 'base64') {
    const binaryString = atob(String(data.content).replace(/\n/g, ''));
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    return new TextDecoder('utf-8').decode(bytes);
  }
  return typeof data.content === 'string' ? data.content : '';
}

// A right-docked drawer that shows the source of a single file, read-only.
// Driven purely by `filePath`; intentionally independent of the trail overlay
// and trail selection — it just renders whatever file is handed to it.
export const FileSourcePanel: React.FC<{
  owner: string;
  repo: string;
  filePath: string | null;
  onClose: () => void;
}> = ({ owner, repo, filePath, onClose }) => {
  const { theme } = useTheme();
  const open = filePath !== null;

  // Hold the last opened path so the file stays rendered while the panel
  // slides back out (filePath clears before the transition finishes).
  const [shownPath, setShownPath] = useState<string | null>(filePath);
  useEffect(() => {
    if (filePath) setShownPath(filePath);
  }, [filePath]);

  const [content, setContent] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Binary documents bypass the text read + Monaco entirely and stream their
  // raw bytes straight into DocumentPreview.
  const docKind = shownPath ? inferDocKind(shownPath) : null;
  const docSrc =
    shownPath && docKind
      ? `/api/github/repo/${owner}/${repo}?action=raw&path=${encodeURIComponent(
          normalizeRepoPath(shownPath, owner, repo),
        )}`
      : null;

  useEffect(() => {
    if (!shownPath || inferDocKind(shownPath)) return;
    let cancelled = false;
    setLoading(true);
    setError(null);
    setContent(null);
    fetchFileContent(owner, repo, shownPath)
      .then((text) => {
        if (!cancelled) setContent(text);
      })
      .catch((e: unknown) => {
        if (!cancelled) {
          setError(e instanceof Error ? e.message : 'Failed to load file.');
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [owner, repo, shownPath]);

  // Escape closes the drawer while it's open.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, onClose]);

  const basename = shownPath ? shownPath.split('/').pop() || shownPath : '';

  // Markdown files render rich (front matter header + DocumentView); everything
  // else stays in the read-only Monaco source view. Splitting the front matter
  // out keeps themed-markdown from treating the leading `---` block as a slide.
  const isMarkdown = shownPath ? isMarkdownPath(shownPath) : false;
  const parsedMarkdown = useMemo(() => {
    if (!isMarkdown || content === null) return null;
    const { data, body } = parseFrontmatter(content);
    return {
      data,
      body: stripRedundantTitleHeading(body, fmString(data.title)),
    };
  }, [isMarkdown, content]);

  return (
    <div
      aria-hidden={!open}
      style={{
        position: 'fixed',
        top: 0,
        right: 0,
        bottom: 0,
        zIndex: 40,
        width: 'min(560px, 92vw)',
        display: 'flex',
        flexDirection: 'column',
        background: theme.colors.backgroundSecondary,
        borderLeft: `1px solid ${theme.colors.border}`,
        boxShadow: open ? '-12px 0 32px rgba(0,0,0,0.35)' : 'none',
        transform: open ? 'translateX(0)' : 'translateX(100%)',
        transition: 'transform 220ms ease',
        pointerEvents: open ? 'auto' : 'none',
      }}
    >
      {/* Header — file identity + close. */}
      <div
        style={{
          flex: '0 0 auto',
          display: 'flex',
          alignItems: 'flex-start',
          gap: 8,
          padding: '12px 14px',
          borderBottom: `1px solid ${theme.colors.border}`,
        }}
      >
        <div style={{ flex: 1, minWidth: 0 }}>
          <div
            title={shownPath ?? undefined}
            style={{
              fontFamily: theme.fonts.monospace ?? theme.fonts.body,
              fontSize: theme.fontSizes[2],
              fontWeight: theme.fontWeights.semibold,
              color: theme.colors.text,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
            }}
          >
            {basename}
          </div>
          <div
            title={shownPath ?? undefined}
            style={{
              marginTop: 2,
              fontFamily: theme.fonts.monospace ?? theme.fonts.body,
              fontSize: theme.fontSizes[0],
              color: theme.colors.textSecondary,
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              whiteSpace: 'nowrap',
              direction: 'rtl',
              textAlign: 'left',
            }}
          >
            {shownPath}
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Close"
          title="Close"
          style={{
            all: 'unset',
            flex: '0 0 auto',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            width: 26,
            height: 26,
            borderRadius: 6,
            cursor: 'pointer',
            color: theme.colors.textSecondary,
          }}
        >
          <X size={16} />
        </button>
      </div>

      {/* Body — source, with loading / error fallbacks. */}
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {docKind && docSrc ? (
          <div style={{ position: 'absolute', inset: 0, overflow: 'auto' }}>
            <DocumentPreview src={docSrc} kind={docKind} />
          </div>
        ) : error ? (
          <div
            style={{
              padding: 16,
              fontSize: theme.fontSizes[1],
              color: theme.colors.textMuted,
            }}
          >
            {error}
          </div>
        ) : loading || content === null ? (
          <div
            style={{
              padding: 16,
              fontSize: theme.fontSizes[1],
              color: theme.colors.textMuted,
            }}
          >
            Loading file…
          </div>
        ) : isMarkdown && parsedMarkdown ? (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              display: 'flex',
              flexDirection: 'column',
              background: theme.colors.background,
            }}
          >
            <MarkdownFrontmatterHeader data={parsedMarkdown.data} />
            {/* DocumentView keeps its own internal scroll. */}
            <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
              <DocumentView
                content={parsedMarkdown.body}
                theme={theme}
                slideIdPrefix="repo-file-source"
                maxWidth="100%"
                onCheckboxChange={() => {}}
                onLinkClick={(href: string) => {
                  // External links open in a new tab; in-page anchors are left
                  // to the renderer's own scroll handling.
                  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(href) || href.startsWith('mailto:')) {
                    window.open(href, '_blank', 'noopener,noreferrer');
                  }
                }}
              />
            </div>
          </div>
        ) : (
          <ThemedMonacoEditor
            theme={theme}
            path={shownPath ?? undefined}
            value={content}
            height="100%"
            hideStatusBar
            options={{
              readOnly: true,
              domReadOnly: true,
              minimap: { enabled: false },
              scrollBeyondLastLine: false,
              wordWrap: 'on',
              fontSize: 13,
              lineNumbersMinChars: 3,
            }}
          />
        )}
      </div>
    </div>
  );
};
