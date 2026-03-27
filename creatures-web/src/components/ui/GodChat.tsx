import { useState, useCallback, useRef, useEffect } from 'react';
import { API_BASE } from '../../config';

interface ChatMessage {
  role: 'user' | 'assistant';
  content: string;
  timestamp: number;
}

interface Props {
  bwId: string | null;
}

export function GodChat({ bwId }: Props) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [input, setInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  const sendMessage = useCallback(async (question: string) => {
    if (!bwId || !question.trim() || loading) return;

    const userMsg: ChatMessage = { role: 'user', content: question, timestamp: Date.now() };
    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setLoading(true);

    try {
      const res = await fetch(`${API_BASE}/api/god/ask`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bw_id: bwId, question }),
      });
      const data = await res.json();
      const aiMsg: ChatMessage = { role: 'assistant', content: data.answer ?? 'No response', timestamp: Date.now() };
      setMessages(prev => [...prev, aiMsg]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI unavailable — check connection', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [bwId, loading]);

  const quickAction = useCallback(async (endpoint: string, label: string) => {
    if (!bwId || loading) return;
    setMessages(prev => [...prev, { role: 'user', content: label, timestamp: Date.now() }]);
    setLoading(true);
    try {
      const res = await fetch(`${API_BASE}/api/god/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ bw_id: bwId, question: label }),
      });
      const data = await res.json();
      const content = data.answer ?? data.proposal ?? data.anomalies ?? data.story ?? data.suggestions ?? 'No response';
      setMessages(prev => [...prev, { role: 'assistant', content, timestamp: Date.now() }]);
    } catch {
      setMessages(prev => [...prev, { role: 'assistant', content: 'AI unavailable', timestamp: Date.now() }]);
    } finally {
      setLoading(false);
    }
  }, [bwId, loading]);

  if (!bwId) return null;

  // Collapsed: just a button
  if (!expanded) {
    return (
      <button onClick={() => setExpanded(true)} style={{
        position: 'absolute', top: 12, right: 12, zIndex: 20,
        background: 'rgba(6, 8, 18, 0.85)', backdropFilter: 'blur(12px)',
        border: '1px solid rgba(100, 130, 200, 0.2)', borderRadius: 8,
        padding: '8px 14px', color: '#ffcc88', fontSize: 12,
        cursor: 'pointer', fontFamily: 'var(--font-mono)',
        display: 'flex', alignItems: 'center', gap: 6,
      }}>
        <span style={{ fontSize: 16 }}>&#10022;</span> Ask AI
      </button>
    );
  }

  return (
    <div style={{
      position: 'absolute', top: 12, right: 12, zIndex: 20,
      width: 380, maxHeight: 500,
      background: 'rgba(6, 8, 18, 0.92)', backdropFilter: 'blur(16px)',
      border: '1px solid rgba(100, 130, 200, 0.15)', borderRadius: 12,
      display: 'flex', flexDirection: 'column', overflow: 'hidden',
    }}>
      {/* Header */}
      <div style={{
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        padding: '10px 14px', borderBottom: '1px solid rgba(80, 130, 200, 0.1)',
      }}>
        <span style={{ color: '#ffcc88', fontSize: 13, fontWeight: 600, fontFamily: 'var(--font-mono)' }}>
          &#10022; God Agent
        </span>
        <button onClick={() => setExpanded(false)} style={{
          background: 'none', border: 'none', color: 'var(--text-label)',
          cursor: 'pointer', fontSize: 16, padding: 0,
        }}>&times;</button>
      </div>

      {/* Quick actions */}
      <div style={{ display: 'flex', gap: 4, padding: '8px 10px', flexWrap: 'wrap' }}>
        {[
          { label: "What's interesting?", endpoint: 'ask' },
          { label: 'Propose experiment', endpoint: 'propose-experiment' },
          { label: 'Detect anomalies', endpoint: 'detect-anomalies' },
          { label: 'Tell the story', endpoint: 'story' },
          { label: 'Suggest tuning', endpoint: 'suggest-tuning' },
        ].map(({ label, endpoint }) => (
          <button key={endpoint} onClick={() => quickAction(endpoint, label)}
            disabled={loading}
            style={{
              background: 'rgba(255, 204, 136, 0.06)', border: '1px solid rgba(255, 204, 136, 0.15)',
              borderRadius: 6, padding: '3px 8px', fontSize: 9, color: '#ffcc88',
              cursor: loading ? 'wait' : 'pointer', fontFamily: 'var(--font-mono)',
            }}>
            {label}
          </button>
        ))}
      </div>

      {/* Messages */}
      <div style={{
        flex: 1, overflowY: 'auto', padding: '8px 10px',
        display: 'flex', flexDirection: 'column', gap: 8,
        maxHeight: 300, minHeight: 100,
      }}>
        {messages.length === 0 && (
          <div style={{ color: 'var(--text-label)', fontSize: 11, textAlign: 'center', padding: 20 }}>
            Ask me anything about this ecosystem
          </div>
        )}
        {messages.map((msg, i) => (
          <div key={i} style={{
            padding: '6px 10px', borderRadius: 8, fontSize: 11, lineHeight: 1.5,
            background: msg.role === 'user' ? 'rgba(0, 180, 255, 0.08)' : 'rgba(255, 204, 136, 0.06)',
            border: `1px solid ${msg.role === 'user' ? 'rgba(0, 180, 255, 0.15)' : 'rgba(255, 204, 136, 0.1)'}`,
            color: msg.role === 'user' ? '#88ccff' : 'rgba(220, 228, 236, 0.8)',
            alignSelf: msg.role === 'user' ? 'flex-end' : 'flex-start',
            maxWidth: '90%', whiteSpace: 'pre-wrap',
          }}>
            {msg.content}
          </div>
        ))}
        {loading && (
          <div style={{ color: '#ffcc88', fontSize: 10, fontStyle: 'italic' }}>
            God Agent is thinking...
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{
        display: 'flex', gap: 6, padding: '8px 10px',
        borderTop: '1px solid rgba(80, 130, 200, 0.1)',
      }}>
        <input
          type="text" value={input} disabled={loading}
          onChange={e => setInput(e.target.value)}
          onKeyDown={e => e.key === 'Enter' && sendMessage(input)}
          placeholder="Ask about evolution..."
          style={{
            flex: 1, background: 'rgba(10, 14, 28, 0.6)', border: '1px solid rgba(80, 130, 200, 0.1)',
            borderRadius: 6, padding: '6px 10px', color: '#dce4ec', fontSize: 11,
            fontFamily: 'var(--font-mono)', outline: 'none',
          }}
        />
        <button onClick={() => sendMessage(input)} disabled={loading || !input.trim()} style={{
          background: 'rgba(255, 204, 136, 0.1)', border: '1px solid rgba(255, 204, 136, 0.2)',
          borderRadius: 6, padding: '4px 12px', color: '#ffcc88', fontSize: 11,
          cursor: loading ? 'wait' : 'pointer',
        }}>
          Ask
        </button>
      </div>
    </div>
  );
}
