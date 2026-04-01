import React, { useState, useRef, useEffect, useCallback } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { PERSON_MAP } from '../../data/halls/index';
import {
  getCharacterProfile,
  getLifeStage,
  getDefaultLifeStage,
  generateSuggestedQuestions,
  streamCharacterResponse,
} from '../../lib/characterApi';

// ============================================================================
// CharacterChat — Live conversation with historical figures powered by xAI Grok
// ============================================================================

export function CharacterChat() {
  const {
    activeConversation, addMessage, endConversation,
    visitedEntityIds, startConversation,
  } = useMuseumStore();

  const [input, setInput] = useState('');
  const [isStreaming, setIsStreaming] = useState(false);
  const [streamingContent, setStreamingContent] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  if (!activeConversation) return null;

  const profile = getCharacterProfile(activeConversation.characterId);
  if (!profile) return null;

  const stage = getLifeStage(profile, activeConversation.lifeStageId)
    ?? getDefaultLifeStage(profile);
  const person = PERSON_MAP.get(profile.personId);
  const name = person?.name ?? profile.personId;

  const suggestedQuestions = activeConversation.messages.length === 0
    ? generateSuggestedQuestions(profile, stage)
    : [];

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [activeConversation.messages.length, streamingContent]);

  const sendMessage = useCallback(async (text: string) => {
    if (!text.trim() || isStreaming) return;

    addMessage('user', text.trim());
    setInput('');
    setIsStreaming(true);
    setStreamingContent('');

    const allMessages = [
      ...activeConversation.messages,
      { role: 'user' as const, content: text.trim() },
    ];

    let fullResponse = '';
    try {
      for await (const chunk of streamCharacterResponse(
        profile, stage, allMessages, Array.from(visitedEntityIds),
      )) {
        fullResponse += chunk;
        setStreamingContent(fullResponse);
      }
    } catch (err) {
      console.error('Chat error:', err);
      fullResponse = fullResponse || '*A distant look crosses my face.* Forgive me — my thoughts elude me.';
    }

    addMessage('assistant', fullResponse);
    setStreamingContent('');
    setIsStreaming(false);
    inputRef.current?.focus();
  }, [activeConversation, profile, stage, isStreaming, addMessage, visitedEntityIds]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage(input);
    }
  };

  const handleLifeStageChange = (stageId: string) => {
    endConversation();
    startConversation(activeConversation.characterId, stageId);
  };

  return (
    <div style={styles.panel}>
      {/* Header */}
      <div style={styles.header}>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#f0ede8' }}>{name}</div>
          <div style={{ fontSize: 12, color: '#998', marginTop: 2 }}>{stage.label}</div>
        </div>

        {/* Life stage selector */}
        {profile.lifeStages.length > 1 && (
          <select
            value={activeConversation.lifeStageId}
            onChange={e => handleLifeStageChange(e.target.value)}
            style={styles.stageSelect}
          >
            {profile.lifeStages.map(s => (
              <option key={s.id} value={s.id}>{s.label}</option>
            ))}
          </select>
        )}

        <button onClick={endConversation} style={styles.closeBtn} title="End conversation">
          &times;
        </button>
      </div>

      {/* Character intro */}
      {activeConversation.messages.length === 0 && (
        <div style={styles.intro}>
          <div style={{ fontSize: 13, color: '#aaa', lineHeight: 1.6, fontStyle: 'italic' }}>
            *{name} looks up from {stage.currentWork[0] ?? 'their work'} and regards you with curiosity.*
          </div>
          <div style={{ fontSize: 12, color: '#778', marginTop: 8, lineHeight: 1.5 }}>
            <strong style={{ color: '#998' }}>Mood:</strong> {stage.mood}
          </div>
        </div>
      )}

      {/* Messages */}
      <div style={styles.messagesArea}>
        {activeConversation.messages.map((msg, i) => (
          <div key={i} style={{
            ...styles.messageBubble,
            ...(msg.role === 'user' ? styles.userBubble : styles.assistantBubble),
          }}>
            {msg.role === 'assistant' && (
              <div style={{ fontSize: 10, color: '#886', marginBottom: 4, fontWeight: 600 }}>{name}</div>
            )}
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {renderMarkdown(msg.content)}
            </div>
          </div>
        ))}

        {/* Streaming response */}
        {isStreaming && streamingContent && (
          <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
            <div style={{ fontSize: 10, color: '#886', marginBottom: 4, fontWeight: 600 }}>{name}</div>
            <div style={{ whiteSpace: 'pre-wrap', lineHeight: 1.6 }}>
              {renderMarkdown(streamingContent)}
              <span style={styles.cursor}>|</span>
            </div>
          </div>
        )}

        {/* Typing indicator */}
        {isStreaming && !streamingContent && (
          <div style={{ ...styles.messageBubble, ...styles.assistantBubble }}>
            <div style={{ fontSize: 10, color: '#886', marginBottom: 4, fontWeight: 600 }}>{name}</div>
            <div style={styles.typing}>
              <span style={styles.dot} /><span style={{ ...styles.dot, animationDelay: '0.2s' }} /><span style={{ ...styles.dot, animationDelay: '0.4s' }} />
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Suggested questions */}
      {suggestedQuestions.length > 0 && (
        <div style={styles.suggestions}>
          {suggestedQuestions.map((q, i) => (
            <button
              key={i}
              onClick={() => sendMessage(q)}
              style={styles.suggestionPill}
              onMouseEnter={e => { e.currentTarget.style.background = 'rgba(200,160,80,0.15)'; e.currentTarget.style.borderColor = 'rgba(200,160,80,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
            >
              {q}
            </button>
          ))}
        </div>
      )}

      {/* Input */}
      <div style={styles.inputArea}>
        <input
          ref={inputRef}
          value={input}
          onChange={e => setInput(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder={`Ask ${name} anything...`}
          disabled={isStreaming}
          style={styles.input}
          autoFocus
        />
        <button
          onClick={() => sendMessage(input)}
          disabled={isStreaming || !input.trim()}
          style={{
            ...styles.sendBtn,
            opacity: isStreaming || !input.trim() ? 0.4 : 1,
          }}
        >
          Send
        </button>
      </div>
    </div>
  );
}

// Simple markdown: *italic* rendering
function renderMarkdown(text: string): React.ReactNode {
  const parts = text.split(/(\*[^*]+\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith('*') && part.endsWith('*') && part.length > 2) {
      return <em key={i} style={{ color: '#b8a070' }}>{part.slice(1, -1)}</em>;
    }
    return <span key={i}>{part}</span>;
  });
}

// ── Inject typing animation ──────────────────────────────────────────────

if (typeof document !== 'undefined') {
  const styleId = 'character-chat-styles';
  if (!document.getElementById(styleId)) {
    const style = document.createElement('style');
    style.id = styleId;
    style.textContent = `
      @keyframes cc-blink { 0%,50% { opacity: 1 } 51%,100% { opacity: 0 } }
      @keyframes cc-bounce { 0%,80%,100% { transform: translateY(0) } 40% { transform: translateY(-4px) } }
    `;
    document.head.appendChild(style);
  }
}

// ── Styles ──────────────────────────────────────────────────────────────

const styles: Record<string, React.CSSProperties> = {
  panel: {
    position: 'fixed', right: 0, top: 0, bottom: 0, width: 400,
    background: 'rgba(12, 10, 18, 0.97)', borderLeft: '1px solid rgba(255,255,255,0.08)',
    backdropFilter: 'blur(20px)', display: 'flex', flexDirection: 'column',
    zIndex: 100, fontFamily: "'Inter', -apple-system, sans-serif",
  },
  header: {
    display: 'flex', alignItems: 'center', gap: 10,
    padding: '14px 16px', borderBottom: '1px solid rgba(255,255,255,0.06)',
  },
  stageSelect: {
    background: 'rgba(255,255,255,0.06)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 6, color: '#ccc', fontSize: 11, padding: '4px 8px',
    cursor: 'pointer', fontFamily: 'inherit',
  },
  closeBtn: {
    background: 'none', border: 'none', color: '#667', fontSize: 22,
    cursor: 'pointer', padding: '0 4px', lineHeight: 1,
  },
  intro: {
    padding: '16px', borderBottom: '1px solid rgba(255,255,255,0.04)',
  },
  messagesArea: {
    flex: 1, overflowY: 'auto', padding: '12px 16px',
    display: 'flex', flexDirection: 'column', gap: 10,
  },
  messageBubble: {
    padding: '10px 14px', borderRadius: 10, fontSize: 13, maxWidth: '88%',
  },
  userBubble: {
    alignSelf: 'flex-end', background: 'rgba(100, 140, 200, 0.15)',
    border: '1px solid rgba(100, 140, 200, 0.2)', color: '#c8d8f0',
  },
  assistantBubble: {
    alignSelf: 'flex-start', background: 'rgba(180, 150, 90, 0.08)',
    border: '1px solid rgba(180, 150, 90, 0.15)', color: '#d4ccb8',
  },
  cursor: {
    animation: 'cc-blink 1s infinite', color: '#b8a070',
  },
  typing: {
    display: 'flex', gap: 4, padding: '4px 0',
  },
  dot: {
    width: 6, height: 6, borderRadius: '50%', background: '#886',
    animation: 'cc-bounce 1.4s infinite',
    display: 'inline-block',
  } as any,
  suggestions: {
    padding: '8px 16px', display: 'flex', flexWrap: 'wrap', gap: 6,
    borderTop: '1px solid rgba(255,255,255,0.04)',
  },
  suggestionPill: {
    padding: '6px 12px', borderRadius: 16, fontSize: 12,
    background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.1)',
    color: '#bba', cursor: 'pointer', fontFamily: 'inherit',
    transition: 'all 0.2s',
  },
  inputArea: {
    display: 'flex', gap: 8, padding: '12px 16px',
    borderTop: '1px solid rgba(255,255,255,0.08)',
  },
  input: {
    flex: 1, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)',
    borderRadius: 8, padding: '10px 14px', color: '#ddd', fontSize: 13,
    fontFamily: 'inherit', outline: 'none',
  },
  sendBtn: {
    background: 'rgba(200, 160, 80, 0.2)', border: '1px solid rgba(200, 160, 80, 0.3)',
    borderRadius: 8, padding: '8px 16px', color: '#d4b868', fontSize: 13,
    cursor: 'pointer', fontFamily: 'inherit', fontWeight: 600,
  },
};
