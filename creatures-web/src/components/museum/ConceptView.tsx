import React from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { CONCEPT_MAP, PERSON_MAP, ALL_EVENTS } from '../../data/halls/index';
import { DOMAINS, type Domain } from '../../data/knowledge-graph';

export function ConceptView() {
  const { selectedConceptId, navigate, goBack } = useMuseumStore();
  const concept = selectedConceptId ? CONCEPT_MAP.get(selectedConceptId) : null;

  if (!concept) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#667' }}>
        <p>Concept not found.</p>
        <button onClick={goBack} style={linkBtnStyle}>Go back</button>
      </div>
    );
  }

  const relatedConcepts = concept.relatedConceptIds.map(id => CONCEPT_MAP.get(id)).filter(Boolean);
  const keyPeople = concept.keyPersonIds.map(id => PERSON_MAP.get(id)).filter(Boolean);
  const relatedEvents = ALL_EVENTS.filter(e => e.conceptIds.includes(concept.id));
  const domains = concept.domainIds
    .map(id => DOMAINS.find((d: Domain) => d.id === id))
    .filter(Boolean);

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back button */}
      <button onClick={goBack} style={linkBtnStyle}>&larr; Back</button>

      {/* Header */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: 'rgba(155, 89, 182, 0.15)', color: '#b39ddb', border: '1px solid rgba(155, 89, 182, 0.3)',
          }}>
            Concept
          </span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#f0ede8' }}>{concept.name}</h1>
      </div>

      {/* Description */}
      <div style={{
        marginTop: 20, padding: 16, borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        lineHeight: 1.7, color: '#ccc', fontSize: 14,
      }}>
        {concept.description}
      </div>

      {/* Domains */}
      {domains.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionHeadingStyle}>Domains</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {domains.map(domain => domain && (
              <span key={domain.id} style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 12,
                background: `${domain.color}18`, color: domain.color, border: `1px solid ${domain.color}33`,
              }}>
                {domain.icon} {domain.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Related Concepts */}
      {relatedConcepts.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionHeadingStyle}>Related Concepts</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {relatedConcepts.map(rc => rc && (
              <button
                key={rc.id}
                onClick={() => navigate('concept', rc.id)}
                style={{
                  padding: '6px 12px', borderRadius: 12, fontSize: 12,
                  background: 'rgba(155, 89, 182, 0.12)', color: '#b39ddb',
                  border: '1px solid rgba(155, 89, 182, 0.2)', cursor: 'pointer',
                  transition: 'all 0.2s', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(155, 89, 182, 0.22)'; e.currentTarget.style.borderColor = 'rgba(155, 89, 182, 0.4)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(155, 89, 182, 0.12)'; e.currentTarget.style.borderColor = 'rgba(155, 89, 182, 0.2)'; }}
              >
                {rc.name}
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Key People */}
      {keyPeople.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionHeadingStyle}>Key People</h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {keyPeople.map(person => person && (
              <button
                key={person.id}
                onClick={() => navigate('person', person.id)}
                style={{
                  padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', color: '#ddd', cursor: 'pointer',
                  fontSize: 13, transition: 'all 0.2s', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.08)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.2)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.04)'; e.currentTarget.style.borderColor = 'rgba(255,255,255,0.1)'; }}
              >
                {person.name}
                <span style={{ color: '#778', marginLeft: 6, fontSize: 11 }}>{person.roles.slice(0, 2).join(', ')}</span>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* Related Events */}
      {relatedEvents.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={sectionHeadingStyle}>Related Events</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {relatedEvents.map(event => (
              <button
                key={event.id}
                onClick={() => navigate('event', event.id)}
                style={{
                  padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)', color: '#ccc', cursor: 'pointer',
                  fontSize: 13, textAlign: 'left', transition: 'all 0.2s', fontFamily: 'inherit',
                }}
                onMouseEnter={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'rgba(255,255,255,0.02)'; }}
              >
                <span style={{ color: '#889', fontSize: 11, marginRight: 8 }}>{event.date}</span>
                {event.title}
              </button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const sectionHeadingStyle: React.CSSProperties = {
  fontSize: 14, fontWeight: 600, color: '#aab', marginBottom: 10,
  textTransform: 'uppercase', letterSpacing: 1,
};

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#6ba3d6', cursor: 'pointer',
  fontSize: 13, padding: 0, fontFamily: 'inherit',
};
