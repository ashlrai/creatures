import { Component, type ReactNode } from 'react';

// ── Lightweight error boundary for sidebar panels ───────────────────────────
// Prevents a single failing panel from crashing the entire sidebar.

interface PanelErrorBoundaryProps {
  children: ReactNode;
  name?: string;
}

interface PanelErrorBoundaryState {
  hasError: boolean;
  errorMessage: string | null;
}

export class PanelErrorBoundary extends Component<PanelErrorBoundaryProps, PanelErrorBoundaryState> {
  state: PanelErrorBoundaryState = { hasError: false, errorMessage: null };

  static getDerivedStateFromError(error: Error): PanelErrorBoundaryState {
    return { hasError: true, errorMessage: error.message };
  }

  componentDidCatch(error: Error) {
    console.warn(`[PanelErrorBoundary${this.props.name ? `: ${this.props.name}` : ''}]`, error);
  }

  render() {
    if (this.state.hasError) {
      return (
        <div
          className="glass"
          style={{
            padding: '8px 10px',
            fontSize: 10,
            color: 'var(--text-label)',
            textAlign: 'center',
          }}
        >
          <div style={{ marginBottom: 4, color: 'rgba(255, 100, 100, 0.6)' }}>
            {this.props.name ?? 'Panel'} failed to render
          </div>
          <button
            className="btn btn-ghost"
            style={{ fontSize: 9, padding: '2px 8px' }}
            onClick={() => this.setState({ hasError: false, errorMessage: null })}
          >
            Retry
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Global error boundary ───────────────────────────────────────────────────

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
  showDetails: boolean;
  copied: boolean;
}

export class GlobalErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  state: ErrorBoundaryState = {
    error: null,
    errorInfo: null,
    showDetails: false,
    copied: false,
  };

  static getDerivedStateFromError(error: Error): Partial<ErrorBoundaryState> {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    console.error('[GlobalErrorBoundary] Uncaught error:', error, errorInfo);
    this.setState({ errorInfo });
  }

  handleReload = () => {
    window.location.reload();
  };

  handleCopyError = () => {
    const { error, errorInfo } = this.state;
    const details = [
      `Error: ${error?.message}`,
      `Stack: ${error?.stack}`,
      `Component Stack: ${errorInfo?.componentStack}`,
      `URL: ${window.location.href}`,
      `Time: ${new Date().toISOString()}`,
      `UserAgent: ${navigator.userAgent}`,
    ].join('\n\n');

    navigator.clipboard.writeText(details).then(() => {
      this.setState({ copied: true });
      setTimeout(() => this.setState({ copied: false }), 2000);
    });
  };

  render() {
    if (this.state.error) {
      return (
        <div style={{
          width: '100vw',
          height: '100vh',
          background: '#020206',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", "Inter", Roboto, sans-serif',
        }}>
          <div style={{
            maxWidth: 440,
            padding: '32px 36px',
            background: 'rgba(10, 14, 26, 0.8)',
            border: '1px solid rgba(255, 60, 80, 0.15)',
            borderRadius: 12,
            textAlign: 'center',
          }}>
            <div style={{
              fontSize: 18,
              fontWeight: 700,
              color: '#dce4ec',
              marginBottom: 8,
              letterSpacing: '-0.3px',
            }}>
              Something went wrong
            </div>
            <div style={{
              fontSize: 13,
              color: 'rgba(180, 200, 220, 0.5)',
              marginBottom: 24,
              lineHeight: 1.5,
            }}>
              The simulator encountered an unexpected error. You can reload to try again.
            </div>
            <div style={{ display: 'flex', gap: 10, justifyContent: 'center', marginBottom: 16 }}>
              <button
                onClick={this.handleReload}
                style={{
                  padding: '9px 24px',
                  borderRadius: 7,
                  border: 'none',
                  background: 'linear-gradient(135deg, #0066aa, #0088cc)',
                  color: 'white',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                  boxShadow: '0 2px 12px rgba(0, 120, 255, 0.2)',
                }}
              >
                Reload
              </button>
              <button
                onClick={this.handleCopyError}
                style={{
                  padding: '9px 18px',
                  borderRadius: 7,
                  border: '1px solid rgba(80, 130, 200, 0.15)',
                  background: 'rgba(255, 255, 255, 0.04)',
                  color: 'rgba(180, 200, 220, 0.6)',
                  fontWeight: 600,
                  fontSize: 13,
                  cursor: 'pointer',
                }}
              >
                {this.state.copied ? 'Copied' : 'Copy error details'}
              </button>
            </div>
            <button
              onClick={() => this.setState((s) => ({ showDetails: !s.showDetails }))}
              style={{
                background: 'none',
                border: 'none',
                color: 'rgba(140, 170, 200, 0.4)',
                fontSize: 11,
                cursor: 'pointer',
                padding: '4px 8px',
              }}
            >
              {this.state.showDetails ? 'Hide details' : 'Show details'}
            </button>
            {this.state.showDetails && (
              <div style={{
                marginTop: 12,
                padding: 12,
                background: 'rgba(0, 0, 0, 0.3)',
                borderRadius: 6,
                textAlign: 'left',
                maxHeight: 200,
                overflowY: 'auto',
              }}>
                <div style={{
                  fontSize: 11,
                  fontFamily: '"SF Mono", "Fira Code", monospace',
                  color: 'rgba(255, 100, 100, 0.8)',
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  lineHeight: 1.5,
                }}>
                  {this.state.error.message}
                  {this.state.error.stack && (
                    <>
                      {'\n\n'}
                      <span style={{ color: 'rgba(140, 170, 200, 0.35)' }}>
                        {this.state.error.stack}
                      </span>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
