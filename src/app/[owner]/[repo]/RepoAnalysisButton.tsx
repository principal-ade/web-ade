'use client';

/**
 * MVP control for the Freestyle VM repo-analysis job + contribution viewer.
 *
 * Runs the analysis (boots a VM, clones, blames) and lists the contributors it
 * returns. Clicking a contributor highlights the files they own on the 3D city
 * (a "contribution coverage" layer); clicking again clears it. The result is
 * cached in localStorage by RepoAnalysisProvider, so re-running is opt-in (↻)
 * rather than on every reload.
 */
import { useRepoAnalysis } from './RepoAnalysisContext';

const PANEL_STYLE: React.CSSProperties = {
  position: 'fixed',
  bottom: 16,
  right: 16,
  zIndex: 100,
  display: 'flex',
  flexDirection: 'column',
  alignItems: 'stretch',
  gap: 6,
  fontSize: 12,
  width: 280,
};

export function RepoAnalysisButton() {
  const {
    state,
    analysis,
    run,
    clear,
    contributors,
    selectedEmail,
    setSelectedEmail,
  } = useRepoAnalysis();

  const running = state.kind === 'running';

  return (
    <div style={PANEL_STYLE}>
      {state.kind === 'error' && (
        <div
          style={{
            background: 'rgba(0,0,0,0.8)',
            color: '#f0a0a0',
            padding: '6px 10px',
            borderRadius: 6,
          }}
        >
          {state.message}
        </div>
      )}

      {analysis && (
        <div
          style={{
            background: 'rgba(0,0,0,0.82)',
            color: '#ddd',
            padding: 8,
            borderRadius: 8,
            maxHeight: 320,
            overflowY: 'auto',
          }}
        >
          <div
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              marginBottom: 6,
              color: '#9fe3a0',
            }}
          >
            <span>
              {analysis.fileCount} files · {analysis.authorCount} authors
            </span>
            <button
              type="button"
              onClick={clear}
              title="Clear cache & re-run"
              style={{
                background: 'transparent',
                color: '#9aa',
                border: '1px solid #444',
                borderRadius: 6,
                padding: '1px 6px',
                cursor: 'pointer',
              }}
            >
              ↻
            </button>
          </div>

          {selectedEmail && (
            <button
              type="button"
              onClick={() => setSelectedEmail(null)}
              style={{
                width: '100%',
                marginBottom: 6,
                background: '#1e3a5f',
                color: '#cfe3ff',
                border: 'none',
                borderRadius: 6,
                padding: '4px 8px',
                cursor: 'pointer',
              }}
            >
              Clear contributor highlight
            </button>
          )}

          {contributors.map((c) => {
            const active = c.email.toLowerCase() === selectedEmail;
            return (
              <button
                key={c.email}
                type="button"
                onClick={() =>
                  setSelectedEmail(active ? null : c.email)
                }
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  gap: 8,
                  width: '100%',
                  textAlign: 'left',
                  background: active ? '#2563eb' : 'transparent',
                  color: active ? 'white' : '#cdd',
                  border: 'none',
                  borderRadius: 6,
                  padding: '4px 8px',
                  cursor: 'pointer',
                }}
              >
                <span
                  style={{
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                    whiteSpace: 'nowrap',
                  }}
                  title={`${c.name} <${c.email}>`}
                >
                  {c.name}
                </span>
                <span style={{ opacity: 0.7, flexShrink: 0 }}>
                  {c.lines.toLocaleString()} ln
                </span>
              </button>
            );
          })}
        </div>
      )}

      <button
        type="button"
        onClick={run}
        disabled={running}
        style={{
          background: running ? '#555' : '#2563eb',
          color: 'white',
          padding: '8px 14px',
          borderRadius: 8,
          border: 'none',
          cursor: running ? 'wait' : 'pointer',
          fontWeight: 600,
        }}
      >
        {running
          ? 'Analyzing repo…'
          : analysis
            ? 'Re-analyze repo (VM)'
            : 'Analyze repo (VM)'}
      </button>
    </div>
  );
}
