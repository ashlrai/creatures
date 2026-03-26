import { useState, useCallback, useRef, useEffect } from 'react';
import {
  type ShareableState,
  generateShareUrl,
  summarizeState,
} from '../../utils/shareableState';

interface SharePanelProps {
  state: ShareableState;
  onClose: () => void;
}

/**
 * Modal panel for sharing the current experiment state.
 * Shows a copyable URL, state summary, and JSON download button.
 */
export function SharePanel({ state, onClose }: SharePanelProps) {
  const [copied, setCopied] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const url = generateShareUrl(state);
  const summary = summarizeState(state);

  // Select all on focus
  const handleFocus = useCallback(() => {
    inputRef.current?.select();
  }, []);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }).catch(() => {
      // Fallback: select the input for manual copy
      inputRef.current?.select();
    });
  }, [url]);

  const handleDownloadJson = useCallback(() => {
    const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
    const blobUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = blobUrl;
    a.download = `neurevo-state-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(blobUrl);
  }, [state]);

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Close on backdrop click
  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  return (
    <div style={styles.overlay} onClick={handleBackdropClick}>
      <div style={styles.panel}>
        {/* Header */}
        <div style={styles.header}>
          <span style={styles.title}>Share Experiment</span>
          <button style={styles.closeBtn} onClick={onClose} title="Close">
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
              <path d="M3 3l8 8M11 3l-8 8" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* State summary */}
        <div style={styles.summarySection}>
          <div style={styles.sectionLabel}>Current State</div>
          <div style={styles.summaryText}>{summary}</div>
        </div>

        {/* URL input */}
        <div style={styles.urlSection}>
          <div style={styles.sectionLabel}>Shareable URL</div>
          <div style={styles.urlRow}>
            <input
              ref={inputRef}
              style={styles.urlInput}
              value={url}
              readOnly
              onFocus={handleFocus}
            />
            <button
              style={{
                ...styles.copyBtn,
                ...(copied ? styles.copyBtnCopied : {}),
              }}
              onClick={handleCopy}
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        {/* Actions */}
        <div style={styles.actions}>
          <button style={styles.downloadBtn} onClick={handleDownloadJson}>
            <svg width="14" height="14" viewBox="0 0 14 14" fill="none" style={{ marginRight: 6 }}>
              <path d="M7 2v7M4 6.5L7 9.5 10 6.5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" strokeLinejoin="round" />
              <path d="M2 11h10" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
            </svg>
            Download State (JSON)
          </button>
        </div>

        {/* Hint */}
        <div style={styles.hint}>
          Anyone with this URL can restore the exact experiment configuration.
        </div>
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  overlay: {
    position: 'fixed',
    inset: 0,
    zIndex: 200,
    background: 'rgba(0, 0, 0, 0.5)',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    animation: 'overlayFadeIn 0.15s ease-out',
  },
  panel: {
    background: 'rgba(10, 14, 28, 0.95)',
    backdropFilter: 'blur(20px)',
    border: '1px solid rgba(0, 150, 255, 0.15)',
    borderRadius: 12,
    padding: '20px 24px',
    width: '100%',
    maxWidth: 480,
    margin: '0 16px',
  },
  header: {
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
    paddingBottom: 12,
    borderBottom: '1px solid rgba(80, 130, 200, 0.07)',
  },
  title: {
    fontSize: 14,
    fontWeight: 600,
    color: 'rgba(200, 220, 255, 0.9)',
    letterSpacing: '-0.2px',
  },
  closeBtn: {
    width: 28,
    height: 28,
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'rgba(255, 255, 255, 0.04)',
    border: '1px solid rgba(80, 130, 200, 0.07)',
    borderRadius: 6,
    cursor: 'pointer',
    color: 'rgba(140, 170, 200, 0.5)',
    transition: 'all 0.15s',
  },
  sectionLabel: {
    fontSize: 9,
    fontWeight: 600,
    textTransform: 'uppercase' as const,
    letterSpacing: '0.08em',
    color: 'rgba(140, 170, 200, 0.5)',
    marginBottom: 6,
  },
  summarySection: {
    marginBottom: 16,
  },
  summaryText: {
    fontSize: 12,
    color: 'rgba(220, 228, 236, 0.8)',
    lineHeight: 1.5,
    padding: '8px 10px',
    background: 'rgba(255, 255, 255, 0.02)',
    border: '1px solid rgba(80, 130, 200, 0.07)',
    borderRadius: 6,
  },
  urlSection: {
    marginBottom: 16,
  },
  urlRow: {
    display: 'flex',
    gap: 6,
  },
  urlInput: {
    flex: 1,
    padding: '6px 10px',
    borderRadius: 6,
    border: '1px solid rgba(80, 130, 200, 0.07)',
    background: 'rgba(255, 255, 255, 0.03)',
    color: 'rgba(220, 228, 236, 0.85)',
    fontSize: 11,
    fontFamily: 'var(--font-mono)',
    outline: 'none',
    transition: 'border-color 0.2s',
  },
  copyBtn: {
    padding: '6px 14px',
    borderRadius: 6,
    border: '1px solid rgba(0, 150, 255, 0.2)',
    background: 'linear-gradient(135deg, #0066aa, #0088cc)',
    color: 'white',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'all 0.2s',
    whiteSpace: 'nowrap' as const,
  },
  copyBtnCopied: {
    background: 'linear-gradient(135deg, #007744, #009966)',
    borderColor: 'rgba(0, 255, 136, 0.2)',
  },
  actions: {
    display: 'flex',
    gap: 8,
    marginBottom: 12,
  },
  downloadBtn: {
    display: 'flex',
    alignItems: 'center',
    padding: '7px 14px',
    borderRadius: 7,
    border: '1px solid rgba(80, 130, 200, 0.07)',
    background: 'rgba(255, 255, 255, 0.04)',
    color: 'rgba(180, 200, 220, 0.45)',
    fontSize: 11,
    fontWeight: 600,
    fontFamily: 'var(--font-sans)',
    cursor: 'pointer',
    transition: 'all 0.2s',
  },
  hint: {
    fontSize: 10,
    color: 'rgba(140, 170, 200, 0.35)',
    lineHeight: 1.4,
    textAlign: 'center' as const,
  },
};
