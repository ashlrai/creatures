import React from 'react';
import { useMuseumStore } from '../../stores/museumStore';
import { ARTIFACT_MAP, PERSON_MAP, CONCEPT_MAP, EVENT_MAP, ALL_EVENTS } from '../../data/halls/index';

const ARTIFACT_TYPE_LABELS: Record<string, string> = {
  artwork: 'Artwork',
  document: 'Document',
  invention: 'Invention',
  building: 'Building',
  'scientific-work': 'Scientific Work',
  text: 'Text',
  instrument: 'Instrument',
  map: 'Map',
};

export function ArtifactView() {
  const { selectedArtifactId, navigate, goBack } = useMuseumStore();
  const artifact = selectedArtifactId ? ARTIFACT_MAP.get(selectedArtifactId) : null;

  if (!artifact) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#667' }}>
        <p>Artifact not found.</p>
        <button onClick={goBack} style={linkBtnStyle}>Go back</button>
      </div>
    );
  }

  const creators = artifact.creatorIds.map(id => PERSON_MAP.get(id)).filter(Boolean);
  const concepts = artifact.conceptIds.map(id => CONCEPT_MAP.get(id)).filter(Boolean);
  const relatedEvents = ALL_EVENTS.filter(e => e.artifactIds.includes(artifact.id));

  return (
    <div style={{ maxWidth: 800, margin: '0 auto', padding: '24px 20px' }}>
      {/* Back button */}
      <button onClick={goBack} style={linkBtnStyle}>&larr; Back</button>

      {/* Header */}
      <div style={{ marginTop: 16 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
          <span style={{
            padding: '3px 10px', borderRadius: 4, fontSize: 11, fontWeight: 600,
            background: 'rgba(26, 188, 156, 0.15)', color: '#1abc9c', border: '1px solid rgba(26, 188, 156, 0.3)',
          }}>
            {ARTIFACT_TYPE_LABELS[artifact.type] || artifact.type}
          </span>
          <span style={{ color: '#889', fontSize: 13 }}>{artifact.date}</span>
        </div>
        <h1 style={{ fontSize: 28, fontWeight: 700, margin: 0, color: '#f0ede8' }}>{artifact.name}</h1>
        {artifact.currentLocation && (
          <p style={{ color: '#889', fontSize: 13, marginTop: 4 }}>Currently at: {artifact.currentLocation}</p>
        )}
      </div>

      {/* Description */}
      <div style={{
        marginTop: 20, padding: 16, borderRadius: 8,
        background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.06)',
        lineHeight: 1.7, color: '#ccc', fontSize: 14,
      }}>
        {artifact.description}
      </div>

      {/* Significance */}
      <div style={{
        marginTop: 16, padding: 16, borderRadius: 8,
        background: 'rgba(241, 196, 15, 0.06)', borderLeft: '3px solid rgba(241, 196, 15, 0.4)',
        lineHeight: 1.7, color: '#d4c896', fontSize: 14,
      }}>
        <strong style={{ color: '#f1c40f' }}>Significance:</strong> {artifact.significance}
      </div>

      {/* Creators */}
      {creators.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#aab', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Created by
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {creators.map(person => person && (
              <button
                key={person.id}
                onClick={() => navigate('person', person.id)}
                style={{
                  padding: '8px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.1)',
                  background: 'rgba(255,255,255,0.04)', color: '#ddd', cursor: 'pointer',
                  fontSize: 13, transition: 'all 0.2s',
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
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#aab', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Related Events
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            {relatedEvents.map(event => (
              <button
                key={event.id}
                onClick={() => navigate('event', event.id)}
                style={{
                  padding: '10px 14px', borderRadius: 6, border: '1px solid rgba(255,255,255,0.08)',
                  background: 'rgba(255,255,255,0.02)', color: '#ccc', cursor: 'pointer',
                  fontSize: 13, textAlign: 'left', transition: 'all 0.2s',
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

      {/* Related Concepts */}
      {concepts.length > 0 && (
        <div style={{ marginTop: 24 }}>
          <h3 style={{ fontSize: 14, fontWeight: 600, color: '#aab', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 1 }}>
            Concepts
          </h3>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {concepts.map(concept => concept && (
              <span key={concept.id} style={{
                padding: '4px 10px', borderRadius: 12, fontSize: 12,
                background: 'rgba(155, 89, 182, 0.12)', color: '#b39ddb', border: '1px solid rgba(155, 89, 182, 0.2)',
              }}>
                {concept.name}
              </span>
            ))}
          </div>
        </div>
      )}

      {/* Domain tags */}
      <div style={{ marginTop: 24, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
        {artifact.domainIds.map(d => (
          <span key={d} style={{
            padding: '3px 8px', borderRadius: 10, fontSize: 11,
            background: 'rgba(255,255,255,0.05)', color: '#889',
          }}>
            {d}
          </span>
        ))}
      </div>
    </div>
  );
}

const linkBtnStyle: React.CSSProperties = {
  background: 'none', border: 'none', color: '#6ba3d6', cursor: 'pointer',
  fontSize: 13, padding: 0, fontFamily: 'inherit',
};
