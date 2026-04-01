import React, { useState, useMemo, useCallback, useRef, useEffect } from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import {
  ALCHEMY_ELEMENTS,
  ALCHEMY_BY_ID,
  ALCHEMY_TIERS,
  ALCHEMY_CATEGORIES,
  findRecipeResult,
  getDiscoverableFrom,
} from '../../data/alchemy';
import { getCharacterProfile, getDefaultLifeStage } from '../../lib/characterApi';
import type { AlchemyElement } from '../../data/knowledge-graph';
import { ElementCard, TIER_COLORS } from './ElementCard';
import { DiscoveryModal } from './DiscoveryModal';

// ============================================================================
// AlchemyWorkbench — the core engagement loop
// Medieval alchemy lab meets modern UI. Click-to-combine interface.
// "Just one more discovery" is the goal.
// ============================================================================

const STYLE_ID = 'alchemy-workbench-keyframes';
function ensureKeyframes() {
  if (typeof document === 'undefined') return;
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = `
    @keyframes alch-shake {
      0%, 100% { transform: translateX(0); }
      15% { transform: translateX(-6px) rotate(-1deg); }
      30% { transform: translateX(5px) rotate(1deg); }
      45% { transform: translateX(-4px); }
      60% { transform: translateX(3px); }
      75% { transform: translateX(-2px); }
    }
    @keyframes alch-slot-pulse {
      0%, 100% { box-shadow: inset 0 0 20px rgba(200,180,140,0.05); }
      50% { box-shadow: inset 0 0 30px rgba(200,180,140,0.12); }
    }
    @keyframes alch-combine-flash {
      0% { opacity: 0; }
      30% { opacity: 1; }
      100% { opacity: 0; }
    }
    @keyframes alch-hint-glow {
      0%, 100% { border-color: rgba(200,180,140,0.08); }
      50% { border-color: rgba(200,180,140,0.2); }
    }
    @keyframes alch-log-enter {
      0% { opacity: 0; transform: translateX(20px); }
      100% { opacity: 1; transform: translateX(0); }
    }
    @keyframes alch-float {
      0%, 100% { transform: translateY(0px); }
      50% { transform: translateY(-4px); }
    }
  `;
  document.head.appendChild(style);
}

type FilterCategory = 'all' | typeof ALCHEMY_CATEGORIES[number];

export function AlchemyWorkbench() {
  // --- Store ---
  const discoveredIds = useMuseumStore((s) => s.discoveredAlchemyIds);
  const discoverAlchemy = useMuseumStore((s) => s.discoverAlchemy);
  const addXp = useMuseumStore((s) => s.addXp);
  const navigate = useMuseumStore((s) => s.navigate);
  const startConversation = useMuseumStore((s) => s.startConversation);

  // --- Local state ---
  const [slotA, setSlotA] = useState<AlchemyElement | null>(null);
  const [slotB, setSlotB] = useState<AlchemyElement | null>(null);
  const [discoveryModal, setDiscoveryModal] = useState<{
    element: AlchemyElement;
    a: AlchemyElement;
    b: AlchemyElement;
  } | null>(null);
  const [shaking, setShaking] = useState(false);
  const [failMessage, setFailMessage] = useState('');
  const [filterCategory, setFilterCategory] = useState<FilterCategory>('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [discoveryLog, setDiscoveryLog] = useState<AlchemyElement[]>([]);
  const [combineFlash, setCombineFlash] = useState(false);

  const workbenchRef = useRef<HTMLDivElement>(null);

  useEffect(() => { ensureKeyframes(); }, []);

  // --- Derived data ---
  const discoveredElements = useMemo(() => {
    return ALCHEMY_ELEMENTS.filter((e) => discoveredIds.has(e.id));
  }, [discoveredIds]);

  const filteredElements = useMemo(() => {
    let els = discoveredElements;
    if (filterCategory !== 'all') {
      els = els.filter((e) => e.category === filterCategory);
    }
    if (searchTerm.trim()) {
      const term = searchTerm.toLowerCase();
      els = els.filter((e) => e.name.toLowerCase().includes(term));
    }
    // Sort by tier, then name
    return els.sort((a, b) => a.tier - b.tier || a.name.localeCompare(b.name));
  }, [discoveredElements, filterCategory, searchTerm]);

  const totalElements = ALCHEMY_ELEMENTS.length;
  const discoveredCount = discoveredIds.size;
  const progressPercent = Math.round((discoveredCount / totalElements) * 100);

  // How many new things are currently discoverable
  const discoverableCount = useMemo(() => {
    return getDiscoverableFrom(discoveredIds).length;
  }, [discoveredIds]);

  // --- Element selection ---
  const handleSelectElement = useCallback((element: AlchemyElement) => {
    setFailMessage('');
    if (slotA?.id === element.id) {
      // Deselect A
      setSlotA(null);
      return;
    }
    if (slotB?.id === element.id) {
      // Deselect B
      setSlotB(null);
      return;
    }
    if (!slotA) {
      setSlotA(element);
    } else if (!slotB) {
      setSlotB(element);
    } else {
      // Both full — replace A, shift B out
      setSlotA(slotB);
      setSlotB(element);
    }
  }, [slotA, slotB]);

  // --- Combine ---
  const handleCombine = useCallback(() => {
    if (!slotA || !slotB) return;

    const result = findRecipeResult(slotA.id, slotB.id);

    if (result) {
      if (discoveredIds.has(result.id)) {
        // Already discovered
        setFailMessage(`You already discovered ${result.name}!`);
        setShaking(true);
        setTimeout(() => setShaking(false), 500);
        return;
      }

      // Flash effect
      setCombineFlash(true);
      setTimeout(() => setCombineFlash(false), 400);

      // Discover!
      discoverAlchemy(result.id);
      const xpReward = (result.tier + 1) * 15;
      addXp(xpReward);

      // Add to discovery log
      setDiscoveryLog((prev) => [result, ...prev].slice(0, 20));

      // Show modal (with unlock action handlers)
      setDiscoveryModal({ element: result, a: slotA, b: slotB });

      // Process unlocks
      if (result.unlocksCharacterId) {
        const profile = getCharacterProfile(result.unlocksCharacterId);
        if (profile) {
          console.log(`[Alchemy] Unlocked character: ${result.unlocksCharacterId}`);
        }
      }
      if (result.unlocksEventId) {
        console.log(`[Alchemy] Unlocked event: ${result.unlocksEventId}`);
      }

      // Clear slots
      setSlotA(null);
      setSlotB(null);
      setFailMessage('');
    } else {
      // No valid combination
      setFailMessage('No discovery... try a different combination.');
      setShaking(true);
      setTimeout(() => {
        setShaking(false);
        setFailMessage('');
      }, 1500);
    }
  }, [slotA, slotB, discoveredIds, discoverAlchemy, addXp]);

  // Auto-combine when both slots are filled
  useEffect(() => {
    if (slotA && slotB) {
      const t = setTimeout(handleCombine, 350);
      return () => clearTimeout(t);
    }
  }, [slotA, slotB, handleCombine]);

  // --- Grouped by tier for display ---
  const elementsByTier = useMemo(() => {
    const tiers = new Map<number, AlchemyElement[]>();
    for (const el of filteredElements) {
      const list = tiers.get(el.tier) ?? [];
      list.push(el);
      tiers.set(el.tier, list);
    }
    return tiers;
  }, [filteredElements]);

  // Active categories (that have discovered elements)
  const activeCategories = useMemo(() => {
    const cats = new Set<string>();
    for (const el of discoveredElements) cats.add(el.category);
    return cats;
  }, [discoveredElements]);

  return (
    <div style={{
      display: 'flex',
      width: '100%',
      height: '100%',
      minHeight: 0,
      background: 'linear-gradient(180deg, rgba(8,6,14,1) 0%, rgba(14,12,22,1) 50%, rgba(10,8,16,1) 100%)',
      fontFamily: 'system-ui, -apple-system, sans-serif',
      color: 'rgba(200,220,240,0.9)',
      position: 'relative',
      overflow: 'hidden',
    }}>

      {/* ================================================================ */}
      {/* LEFT PANEL — Your Elements                                       */}
      {/* ================================================================ */}
      <div style={{
        width: 340,
        minWidth: 280,
        maxWidth: 400,
        display: 'flex',
        flexDirection: 'column',
        borderRight: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.15)',
      }}>
        {/* Header */}
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            marginBottom: 10,
          }}>
            <h3 style={{
              margin: 0,
              fontSize: 14,
              fontWeight: 700,
              color: 'rgba(200,180,140,0.9)',
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
            }}>
              Your Elements
            </h3>
            <span style={{
              fontSize: 11,
              color: 'rgba(200,220,240,0.4)',
              fontFamily: 'var(--font-mono, monospace)',
            }}>
              {discoveredCount} / {totalElements}
            </span>
          </div>

          {/* Progress bar */}
          <div style={{
            width: '100%',
            height: 4,
            background: 'rgba(255,255,255,0.05)',
            borderRadius: 2,
            overflow: 'hidden',
            marginBottom: 10,
          }}>
            <div style={{
              width: `${progressPercent}%`,
              height: '100%',
              background: 'linear-gradient(90deg, #8B7355, #F1C40F)',
              borderRadius: 2,
              transition: 'width 0.5s ease',
            }} />
          </div>

          {/* Discoverable hint */}
          {discoverableCount > 0 && (
            <div style={{
              fontSize: 10,
              color: 'rgba(200,180,140,0.6)',
              marginBottom: 8,
            }}>
              {discoverableCount} new combination{discoverableCount !== 1 ? 's' : ''} possible
            </div>
          )}

          {/* Search */}
          <input
            type="text"
            placeholder="Search elements..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            style={{
              width: '100%',
              padding: '7px 10px',
              background: 'rgba(255,255,255,0.04)',
              border: '1px solid rgba(255,255,255,0.07)',
              borderRadius: 8,
              color: 'rgba(200,220,240,0.9)',
              fontSize: 12,
              outline: 'none',
              fontFamily: 'inherit',
              marginBottom: 8,
              boxSizing: 'border-box',
            }}
          />

          {/* Category filters */}
          <div style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 4,
          }}>
            <FilterPill
              label="All"
              active={filterCategory === 'all'}
              onClick={() => setFilterCategory('all')}
            />
            {ALCHEMY_CATEGORIES.filter((c) => activeCategories.has(c)).map((cat) => (
              <FilterPill
                key={cat}
                label={cat.charAt(0).toUpperCase() + cat.slice(1)}
                active={filterCategory === cat}
                onClick={() => setFilterCategory(cat as FilterCategory)}
              />
            ))}
          </div>
        </div>

        {/* Element grid, grouped by tier */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
        }}>
          {Array.from(elementsByTier.entries())
            .sort(([a], [b]) => a - b)
            .map(([tier, elements]) => (
              <div key={tier} style={{ marginBottom: 12 }}>
                {/* Tier label */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 8,
                  marginBottom: 6,
                  padding: '0 4px',
                }}>
                  <div style={{
                    width: 8,
                    height: 8,
                    borderRadius: '50%',
                    background: TIER_COLORS[tier] ?? '#666',
                    boxShadow: `0 0 6px ${TIER_COLORS[tier] ?? '#666'}55`,
                  }} />
                  <span style={{
                    fontSize: 10,
                    fontWeight: 600,
                    color: TIER_COLORS[tier] ?? '#666',
                    letterSpacing: '0.06em',
                    textTransform: 'uppercase',
                  }}>
                    Tier {tier}
                  </span>
                  <div style={{
                    flex: 1,
                    height: 1,
                    background: `${TIER_COLORS[tier] ?? '#666'}22`,
                  }} />
                </div>

                <div style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  gap: 4,
                }}>
                  {elements.map((el) => (
                    <ElementCard
                      key={el.id}
                      element={el}
                      discovered
                      selected={slotA?.id === el.id || slotB?.id === el.id}
                      compact
                      onClick={() => handleSelectElement(el)}
                    />
                  ))}
                </div>
              </div>
            ))}

          {filteredElements.length === 0 && (
            <div style={{
              textAlign: 'center',
              padding: '40px 20px',
              color: 'rgba(200,220,240,0.3)',
              fontSize: 13,
            }}>
              {searchTerm ? 'No elements match your search.' : 'No elements in this category yet.'}
            </div>
          )}

          {/* Undiscovered teaser */}
          {discoveredCount < totalElements && (
            <div style={{
              marginTop: 16,
              padding: '12px',
              background: 'rgba(255,255,255,0.02)',
              borderRadius: 10,
              border: '1px dashed rgba(200,180,140,0.1)',
              textAlign: 'center',
            }}>
              <span style={{ fontSize: 11, color: 'rgba(200,180,140,0.4)' }}>
                {totalElements - discoveredCount} elements remain undiscovered...
              </span>
            </div>
          )}
        </div>
      </div>

      {/* ================================================================ */}
      {/* CENTER — The Workbench                                           */}
      {/* ================================================================ */}
      <div
        ref={workbenchRef}
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          position: 'relative',
          padding: 32,
          minWidth: 0,
        }}
      >
        {/* Ambient glow */}
        <div style={{
          position: 'absolute',
          top: '40%',
          left: '50%',
          width: 400,
          height: 400,
          transform: 'translate(-50%, -50%)',
          background: 'radial-gradient(circle, rgba(200,180,140,0.04) 0%, transparent 70%)',
          pointerEvents: 'none',
        }} />

        {/* Title */}
        <h2 style={{
          margin: '0 0 6px',
          fontSize: 22,
          fontWeight: 700,
          color: 'rgba(200,180,140,0.85)',
          letterSpacing: '0.08em',
          textTransform: 'uppercase',
          textAlign: 'center',
        }}>
          Alchemy Workbench
        </h2>
        <p style={{
          margin: '0 0 32px',
          fontSize: 12,
          color: 'rgba(200,220,240,0.35)',
          textAlign: 'center',
        }}>
          Combine two elements to discover the building blocks of civilization
        </p>

        {/* Combine flash overlay */}
        {combineFlash && (
          <div style={{
            position: 'absolute',
            inset: 0,
            background: 'radial-gradient(circle at 50% 50%, rgba(241,196,15,0.15), transparent 60%)',
            animation: 'alch-combine-flash 0.4s ease-out forwards',
            pointerEvents: 'none',
            zIndex: 5,
          }} />
        )}

        {/* The two slots + combine indicator */}
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: 32,
          marginBottom: 24,
          animation: shaking ? 'alch-shake 0.5s ease-out' : 'none',
          position: 'relative',
          zIndex: 2,
        }}>
          {/* Slot A */}
          <WorkbenchSlot
            element={slotA}
            label="First Element"
            onClear={() => setSlotA(null)}
          />

          {/* Combine symbol */}
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            gap: 4,
          }}>
            <div style={{
              width: 44,
              height: 44,
              borderRadius: '50%',
              background: slotA && slotB
                ? 'linear-gradient(135deg, rgba(200,180,140,0.2), rgba(200,180,140,0.08))'
                : 'rgba(255,255,255,0.03)',
              border: slotA && slotB
                ? '1px solid rgba(200,180,140,0.3)'
                : '1px solid rgba(255,255,255,0.06)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: 20,
              color: slotA && slotB ? 'rgba(200,180,140,0.8)' : 'rgba(200,220,240,0.2)',
              transition: 'all 0.3s ease',
              animation: slotA && !slotB ? 'alch-slot-pulse 2s ease-in-out infinite' : 'none',
            }}>
              +
            </div>
          </div>

          {/* Slot B */}
          <WorkbenchSlot
            element={slotB}
            label="Second Element"
            onClear={() => setSlotB(null)}
          />
        </div>

        {/* Fail message */}
        {failMessage && (
          <div style={{
            marginBottom: 16,
            padding: '8px 20px',
            background: 'rgba(231,76,60,0.1)',
            border: '1px solid rgba(231,76,60,0.2)',
            borderRadius: 8,
            fontSize: 12,
            color: 'rgba(231,76,60,0.8)',
            textAlign: 'center',
          }}>
            {failMessage}
          </div>
        )}

        {/* Instructions */}
        {!slotA && (
          <div style={{
            marginTop: 8,
            padding: '16px 24px',
            background: 'rgba(255,255,255,0.02)',
            borderRadius: 12,
            border: '1px solid rgba(200,180,140,0.08)',
            maxWidth: 320,
            textAlign: 'center',
            animation: 'alch-hint-glow 3s ease-in-out infinite',
          }}>
            <div style={{ fontSize: 28, marginBottom: 8 }}>
              &#x2697;&#xFE0F;
            </div>
            <p style={{
              margin: 0,
              fontSize: 12,
              lineHeight: 1.6,
              color: 'rgba(200,220,240,0.4)',
            }}>
              Select an element from the left panel to begin.
              Every combination mirrors how real scientific progress works &mdash;
              each discovery unlocks new possibilities.
            </p>
          </div>
        )}

        {slotA && !slotB && (
          <div style={{
            fontSize: 12,
            color: 'rgba(200,180,140,0.5)',
            textAlign: 'center',
            animation: 'alch-float 2s ease-in-out infinite',
          }}>
            Now select a second element to combine with {slotA.icon} {slotA.name}
          </div>
        )}

        {/* Stats row at bottom */}
        <div style={{
          position: 'absolute',
          bottom: 20,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          gap: 24,
        }}>
          <StatBadge
            label="Discovered"
            value={`${discoveredCount} / ${totalElements}`}
            color="rgba(200,180,140,0.7)"
          />
          <StatBadge
            label="Progress"
            value={`${progressPercent}%`}
            color="#F1C40F"
          />
          <StatBadge
            label="Possible"
            value={`${discoverableCount}`}
            color="#5B8C5A"
          />
        </div>
      </div>

      {/* ================================================================ */}
      {/* RIGHT PANEL — Discovery Log                                      */}
      {/* ================================================================ */}
      <div style={{
        width: 280,
        minWidth: 220,
        maxWidth: 320,
        display: 'flex',
        flexDirection: 'column',
        borderLeft: '1px solid rgba(255,255,255,0.05)',
        background: 'rgba(0,0,0,0.1)',
      }}>
        <div style={{
          padding: '16px 16px 12px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <h3 style={{
            margin: 0,
            fontSize: 14,
            fontWeight: 700,
            color: 'rgba(200,180,140,0.9)',
            letterSpacing: '0.06em',
            textTransform: 'uppercase',
          }}>
            Discovery Log
          </h3>
        </div>

        <div style={{
          flex: 1,
          overflowY: 'auto',
          padding: '8px 12px',
        }}>
          {discoveryLog.length === 0 ? (
            <div style={{
              textAlign: 'center',
              padding: '40px 16px',
              color: 'rgba(200,220,240,0.2)',
            }}>
              <div style={{ fontSize: 32, marginBottom: 12, opacity: 0.4 }}>
                &#x1F4DC;
              </div>
              <p style={{ fontSize: 12, margin: 0, lineHeight: 1.5 }}>
                Your discoveries will appear here.
                Start combining elements to unlock the
                history of science and civilization.
              </p>
            </div>
          ) : (
            discoveryLog.map((el, i) => (
              <LogEntry key={`${el.id}-${i}`} element={el} index={i} />
            ))
          )}
        </div>

        {/* Quick hints: what to try next */}
        {discoveryLog.length > 0 && discoverableCount > 0 && (
          <div style={{
            padding: '12px 16px',
            borderTop: '1px solid rgba(255,255,255,0.05)',
          }}>
            <div style={{
              fontSize: 10,
              color: 'rgba(200,180,140,0.5)',
              fontWeight: 600,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              marginBottom: 4,
            }}>
              Hint
            </div>
            <div style={{
              fontSize: 11,
              color: 'rgba(200,220,240,0.35)',
              lineHeight: 1.5,
            }}>
              Try combining elements of different categories.
              Some elements can be combined with themselves!
            </div>
          </div>
        )}
      </div>

      {/* ================================================================ */}
      {/* DISCOVERY MODAL                                                  */}
      {/* ================================================================ */}
      {discoveryModal && (
        <DiscoveryModal
          element={discoveryModal.element}
          ingredientA={discoveryModal.a}
          ingredientB={discoveryModal.b}
          onClose={() => setDiscoveryModal(null)}
          onNavigateToEvent={(eventId) => {
            setDiscoveryModal(null);
            navigate('event', eventId);
          }}
          onTalkToCharacter={(characterId) => {
            setDiscoveryModal(null);
            const profile = getCharacterProfile(characterId);
            if (profile) {
              const stage = getDefaultLifeStage(profile);
              startConversation(characterId, stage.id);
            }
          }}
        />
      )}
    </div>
  );
}

// ============================================================================
// Sub-components
// ============================================================================

function WorkbenchSlot({
  element,
  label,
  onClear,
}: {
  element: AlchemyElement | null;
  label: string;
  onClear: () => void;
}) {
  const tierColor = element ? (TIER_COLORS[element.tier] ?? '#666') : 'rgba(200,180,140,0.15)';

  return (
    <div style={{
      position: 'relative',
      width: 150,
      height: 170,
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      gap: 8,
      background: element
        ? `linear-gradient(160deg, ${tierColor}15, rgba(15,12,25,0.95))`
        : 'rgba(255,255,255,0.015)',
      border: element
        ? `2px solid ${tierColor}55`
        : '2px dashed rgba(200,180,140,0.12)',
      borderRadius: 16,
      transition: 'all 0.3s ease',
      animation: !element ? 'alch-slot-pulse 3s ease-in-out infinite' : 'none',
      boxShadow: element
        ? `0 0 30px ${tierColor}15, inset 0 0 20px ${tierColor}08`
        : 'inset 0 0 20px rgba(200,180,140,0.02)',
    }}>
      {element ? (
        <>
          <span style={{ fontSize: 48, lineHeight: 1 }}>{element.icon}</span>
          <span style={{
            fontSize: 13,
            fontWeight: 600,
            color: 'rgba(220,230,245,0.9)',
            textAlign: 'center',
            padding: '0 8px',
          }}>
            {element.name}
          </span>
          <span style={{
            fontSize: 9,
            color: `${tierColor}BB`,
            fontFamily: 'var(--font-mono, monospace)',
            textTransform: 'uppercase',
            letterSpacing: '0.08em',
          }}>
            Tier {element.tier} &middot; {element.category}
          </span>

          {/* Clear button */}
          <button
            onClick={(e) => { e.stopPropagation(); onClear(); }}
            style={{
              position: 'absolute',
              top: 6,
              right: 6,
              width: 20,
              height: 20,
              borderRadius: '50%',
              background: 'rgba(255,255,255,0.06)',
              border: '1px solid rgba(255,255,255,0.1)',
              color: 'rgba(200,220,240,0.4)',
              fontSize: 10,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontFamily: 'inherit',
              padding: 0,
              lineHeight: 1,
            }}
            title="Clear slot"
          >
            &times;
          </button>
        </>
      ) : (
        <>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            border: '2px dashed rgba(200,180,140,0.12)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <span style={{
              fontSize: 24,
              color: 'rgba(200,180,140,0.15)',
            }}>
              ?
            </span>
          </div>
          <span style={{
            fontSize: 10,
            color: 'rgba(200,220,240,0.2)',
            textTransform: 'uppercase',
            letterSpacing: '0.06em',
          }}>
            {label}
          </span>
        </>
      )}
    </div>
  );
}

function FilterPill({
  label,
  active,
  onClick,
}: {
  label: string;
  active: boolean;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '3px 10px',
        fontSize: 10,
        borderRadius: 12,
        border: active ? '1px solid rgba(200,180,140,0.4)' : '1px solid rgba(255,255,255,0.06)',
        background: active ? 'rgba(200,180,140,0.12)' : 'rgba(255,255,255,0.02)',
        color: active ? 'rgba(200,180,140,0.9)' : 'rgba(200,220,240,0.4)',
        cursor: 'pointer',
        fontFamily: 'inherit',
        fontWeight: active ? 600 : 400,
        transition: 'all 0.15s ease',
        outline: 'none',
      }}
    >
      {label}
    </button>
  );
}

function LogEntry({ element, index }: { element: AlchemyElement; index: number }) {
  const tierColor = TIER_COLORS[element.tier] ?? '#666';

  return (
    <div style={{
      display: 'flex',
      alignItems: 'flex-start',
      gap: 10,
      padding: '10px 8px',
      borderBottom: '1px solid rgba(255,255,255,0.03)',
      animation: `alch-log-enter 0.3s ease-out ${index * 0.05}s both`,
    }}>
      <span style={{
        fontSize: 24,
        lineHeight: 1,
        flexShrink: 0,
        filter: `drop-shadow(0 0 4px ${tierColor}44)`,
      }}>
        {element.icon}
      </span>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{
          fontSize: 12,
          fontWeight: 600,
          color: 'rgba(220,230,245,0.9)',
          marginBottom: 2,
        }}>
          {element.name}
        </div>
        <div style={{
          fontSize: 10,
          color: 'rgba(200,220,240,0.4)',
          lineHeight: 1.4,
          display: '-webkit-box',
          WebkitLineClamp: 2,
          WebkitBoxOrient: 'vertical' as any,
          overflow: 'hidden',
        }}>
          {element.description.substring(0, 100)}...
        </div>
        {element.year && (
          <span style={{
            fontSize: 9,
            color: `${tierColor}88`,
            fontFamily: 'var(--font-mono, monospace)',
          }}>
            {element.year}
          </span>
        )}
      </div>
    </div>
  );
}

function StatBadge({
  label,
  value,
  color,
}: {
  label: string;
  value: string;
  color: string;
}) {
  return (
    <div style={{
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      gap: 2,
    }}>
      <span style={{
        fontSize: 15,
        fontWeight: 700,
        color,
        fontFamily: 'var(--font-mono, monospace)',
      }}>
        {value}
      </span>
      <span style={{
        fontSize: 8,
        color: 'rgba(200,220,240,0.3)',
        letterSpacing: '0.08em',
        textTransform: 'uppercase',
      }}>
        {label}
      </span>
    </div>
  );
}
