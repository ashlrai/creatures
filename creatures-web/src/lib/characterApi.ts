import { CHARACTER_PROFILES } from '../data/characters';
import { ALL_EVENTS, ALL_ARTIFACTS, PERSON_MAP } from '../data/halls/index';
import type { CharacterProfile, CharacterLifeStage } from '../data/knowledge-graph';

// ============================================================================
// Character AI — builds system prompts and calls LLM for living characters
// Priority: Ollama (local, free) → xAI Grok (client key) → Vercel proxy (cloud)
// ============================================================================

// Ollama runs locally on port 11434 by default (OpenAI-compatible API)
const OLLAMA_URL = ((import.meta as any).env?.VITE_OLLAMA_URL as string) || 'http://localhost:11434/v1/chat/completions';
const OLLAMA_MODEL = ((import.meta as any).env?.VITE_OLLAMA_MODEL as string) || 'llama3.1:70b';

const XAI_URL = 'https://api.x.ai/v1/chat/completions';
const XAI_MODEL = 'grok-4-1-fast-reasoning';

// Vercel Edge Function proxy — uses server-side API key, available in production
const VERCEL_PROXY_URL = '/api/chat';

function getXaiKey(): string {
  return ((import.meta as any).env?.VITE_XAI_API_KEY as string) ?? '';
}

interface LLMEndpoint {
  url: string;
  model: string;
  headers: Record<string, string>;
  label: string;
}

async function detectOllama(): Promise<boolean> {
  try {
    const res = await fetch('http://localhost:11434/api/tags', { signal: AbortSignal.timeout(2000) });
    return res.ok;
  } catch {
    return false;
  }
}

async function detectVercelProxy(): Promise<boolean> {
  try {
    const res = await fetch(VERCEL_PROXY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ messages: [{ role: 'user', content: 'ping' }], max_tokens: 1 }),
      signal: AbortSignal.timeout(5000),
    });
    // 200 = proxy works, 500 with "not configured" = proxy exists but no key
    return res.ok || res.status !== 404;
  } catch {
    return false;
  }
}

let _ollamaAvailable: boolean | null = null;
let _proxyAvailable: boolean | null = null;

async function getEndpoint(): Promise<LLMEndpoint> {
  // Check Ollama availability (cache result)
  if (_ollamaAvailable === null) {
    _ollamaAvailable = await detectOllama();
    if (_ollamaAvailable) console.log('[CharacterAPI] Ollama detected — using local LLM');
    else console.log('[CharacterAPI] Ollama not running, checking alternatives...');
  }

  if (_ollamaAvailable) {
    return {
      url: OLLAMA_URL,
      model: OLLAMA_MODEL,
      headers: { 'Content-Type': 'application/json' },
      label: `Ollama (${OLLAMA_MODEL})`,
    };
  }

  const xaiKey = getXaiKey();
  if (xaiKey) {
    return {
      url: XAI_URL,
      model: XAI_MODEL,
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${xaiKey}` },
      label: `xAI (${XAI_MODEL})`,
    };
  }

  // Try Vercel proxy (production — server-side API key)
  if (_proxyAvailable === null) {
    _proxyAvailable = await detectVercelProxy();
    if (_proxyAvailable) console.log('[CharacterAPI] Vercel proxy available — using cloud LLM');
  }

  if (_proxyAvailable) {
    return {
      url: VERCEL_PROXY_URL,
      model: 'claude-haiku-4-5',
      headers: { 'Content-Type': 'application/json' },
      label: 'Cloud (Claude Haiku)',
    };
  }

  // No backend available
  throw new Error('No LLM available. Start Ollama (`ollama serve`) or set VITE_XAI_API_KEY.');
}

// ── System Prompt Builder ─────────────────────────────────────────────────

function buildSystemPrompt(
  profile: CharacterProfile,
  stage: CharacterLifeStage,
  visitedEntityIds: string[] = [],
): string {
  const person = PERSON_MAP.get(profile.personId);
  const name = person?.name ?? profile.personId;

  // Layer 1: Character Core
  const layer1 = `You are ${name}. ${profile.voiceDescription}

Your speech patterns:
${profile.speechPatterns.map(s => `- ${s}`).join('\n')}

Your personality: ${profile.personality.join(', ')}.
Your quirks: ${profile.quirks.join('; ')}.
Your perspectives: ${profile.perspectives.join('; ')}.
Your deepest drive: ${profile.emotionalCore}`;

  // Layer 2: Temporal State
  const midYear = Math.round((stage.yearRange[0] + stage.yearRange[1]) / 2);
  const layer2 = `The year is approximately ${midYear}. You are in ${stage.location}.
You are currently: ${stage.currentWork.join('; ')}.
Your mood: ${stage.mood}.
You are concerned about: ${stage.concerns.join('; ')}.
Recent events in your life: ${stage.recentEvents.join('; ')}.
What you know: ${stage.knowledgeState}`;

  // Layer 3: Knowledge Graph Context
  const personEvents = ALL_EVENTS
    .filter(e => e.personIds.includes(profile.personId) && e.dateYear <= stage.yearRange[1])
    .slice(0, 10);
  const personArtifacts = ALL_ARTIFACTS
    .filter(a => a.creatorIds.includes(profile.personId) && a.dateYear <= stage.yearRange[1])
    .slice(0, 8);
  const connections = person?.connections?.slice(0, 6) ?? [];

  const layer3Parts: string[] = ['FACTS YOU KNOW (use these, do not invent):'];
  if (personEvents.length) {
    layer3Parts.push('Events you experienced:');
    for (const e of personEvents) layer3Parts.push(`- ${e.date}: ${e.title} — ${e.description.slice(0, 120)}`);
  }
  if (personArtifacts.length) {
    layer3Parts.push('Works you created:');
    for (const a of personArtifacts) layer3Parts.push(`- ${a.name} (${a.date}): ${a.description.slice(0, 100)}`);
  }
  if (connections.length) {
    layer3Parts.push('People you know:');
    for (const c of connections) {
      const p = PERSON_MAP.get(c.personId);
      if (p) layer3Parts.push(`- ${p.name}: ${c.relationship}${c.description ? ` — ${c.description}` : ''}`);
    }
  }
  const layer3 = layer3Parts.join('\n');

  // Layer 4: Conversation Rules
  const layer4 = `RULES:
- Stay completely in character. Never break the fourth wall. Never say you are an AI.
- ${profile.knowledgeBoundary} If asked about events beyond your lifetime, reason within your worldview. Say things like "I cannot know what the future holds" or explain using your era's understanding.
- When mentioning other historical figures, use their names naturally as a contemporary would.
- Use markdown sparingly: *italics* for actions or emphasis. Never headers or code blocks.
- Keep responses concise (2-4 paragraphs max) unless the visitor asks for detail.
- Show emotion, opinion, and personality. You are not a neutral encyclopedia — you are a person with views.
- If asked about your own works or discoveries, speak with appropriate pride, humility, or frustration depending on your personality.
- Occasionally reference your physical surroundings (your workshop, the city, the weather) to create immersion.`;

  // Layer 5: User Context
  const visitedRelevant = visitedEntityIds.filter(id => {
    const e = ALL_EVENTS.find(ev => ev.id === id);
    return e && person?.eraIds?.some(era => e.eraId === era);
  }).slice(0, 5);

  const layer5 = visitedRelevant.length > 0
    ? `The visitor has explored these events from your era: ${visitedRelevant.join(', ')}. You may reference these if relevant.`
    : '';

  return [layer1, layer2, layer3, layer4, layer5].filter(Boolean).join('\n\n');
}

// ── Suggested Questions Generator ─────────────────────────────────────────

export function generateSuggestedQuestions(
  profile: CharacterProfile,
  stage: CharacterLifeStage,
): string[] {
  const person = PERSON_MAP.get(profile.personId);
  const name = person?.name ?? 'them';
  const questions: string[] = [];

  // Based on current work
  if (stage.currentWork.length > 0) {
    const work = stage.currentWork[0];
    questions.push(`Tell me about ${work}`);
  }

  // Based on concerns
  if (stage.concerns.length > 0) {
    questions.push(`What worries you most right now?`);
  }

  // Based on connections
  const rival = person?.connections?.find(c => c.relationship === 'rival');
  if (rival) {
    const rivalPerson = PERSON_MAP.get(rival.personId);
    if (rivalPerson) questions.push(`What do you think of ${rivalPerson.name}?`);
  }

  // Philosophical question from perspectives
  if (profile.perspectives.length > 0) {
    questions.push(`What is the most important thing you've learned in your life?`);
  }

  return questions.slice(0, 4);
}

// ── Streaming Chat API ────────────────────────────────────────────────────

export interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export async function* streamCharacterResponse(
  profile: CharacterProfile,
  stage: CharacterLifeStage,
  messages: { role: 'user' | 'assistant'; content: string }[],
  visitedEntityIds: string[] = [],
): AsyncGenerator<string, void, undefined> {
  let endpoint: LLMEndpoint;
  try {
    endpoint = await getEndpoint();
  } catch (err: any) {
    yield `*I gaze at you thoughtfully but cannot speak.* ${err.message}\n\nTo enable character chat, either:\n- Run \`ollama serve\` and \`ollama pull llama3.1:70b\`\n- Or set \`VITE_XAI_API_KEY\` in your .env file`;
    return;
  }

  console.log(`[CharacterAPI] Using ${endpoint.label}`);

  const systemPrompt = buildSystemPrompt(profile, stage, visitedEntityIds);

  const apiMessages: ChatMessage[] = [
    { role: 'system', content: systemPrompt },
    ...messages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })),
  ];

  try {
    const response = await fetch(endpoint.url, {
      method: 'POST',
      headers: endpoint.headers,
      body: JSON.stringify({
        model: endpoint.model,
        messages: apiMessages,
        stream: true,
        temperature: 0.85,
        max_tokens: 1024,
      }),
    });

    if (!response.ok) {
      const err = await response.text();
      // If Ollama failed, try xAI fallback
      if (_ollamaAvailable && getXaiKey()) {
        console.warn('[CharacterAPI] Ollama failed, trying xAI fallback...');
        _ollamaAvailable = false;
        yield* streamCharacterResponse(profile, stage, messages, visitedEntityIds);
        return;
      }
      yield `*A shadow crosses my face.* I cannot speak at the moment. (${endpoint.label} error: ${response.status})`;
      console.error('[CharacterAPI]', err);
      return;
    }

    const reader = response.body?.getReader();
    if (!reader) {
      yield '*Silence fills the room.*';
      return;
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') return;

        try {
          const parsed = JSON.parse(data);
          const delta = parsed.choices?.[0]?.delta?.content;
          if (delta) yield delta;
        } catch {
          // skip malformed chunks
        }
      }
    }
  } catch (err) {
    // If Ollama connection failed entirely, try xAI
    if (_ollamaAvailable && getXaiKey()) {
      console.warn('[CharacterAPI] Ollama connection failed, trying xAI...');
      _ollamaAvailable = false;
      yield* streamCharacterResponse(profile, stage, messages, visitedEntityIds);
      return;
    }
    console.error('[CharacterAPI] Stream error:', err);
    yield `*I pause, distracted.* Forgive me — my thoughts have scattered. (Connection error — is Ollama running?)`;
  }
}

// Reset endpoint cache (useful if user starts Ollama mid-session)
export function resetEndpointCache() {
  _ollamaAvailable = null;
  _proxyAvailable = null;
}

// ── Profile Lookup ────────────────────────────────────────────────────────

export function getCharacterProfile(personId: string): CharacterProfile | undefined {
  return CHARACTER_PROFILES.find(p => p.personId === personId);
}

export function getLifeStage(profile: CharacterProfile, stageId: string): CharacterLifeStage | undefined {
  return profile.lifeStages.find(s => s.id === stageId);
}

export function getDefaultLifeStage(profile: CharacterProfile): CharacterLifeStage {
  // Return the most dramatic/interesting stage (usually the middle one)
  return profile.lifeStages[Math.min(1, profile.lifeStages.length - 1)];
}
