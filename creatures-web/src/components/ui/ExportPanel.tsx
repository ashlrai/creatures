import { useState, useCallback, useRef, useEffect } from 'react';
import { useSimulationStore } from '../../stores/simulationStore';
import type { SimulationFrame } from '../../types/simulation';
import { spikesToCSV, firingRatesToCSV, downloadBlob, downloadScreenshot, exportStateSnapshot } from '../../utils/exportData';

const MAX_EXPORT_BUFFER = 500;

export function ExportPanel() {
  const frame = useSimulationStore((s) => s.frame);
  const experiment = useSimulationStore((s) => s.experiment);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  // Maintain our own frame buffer for export (since store's frameHistory is compact)
  const exportBuffer = useRef<SimulationFrame[]>([]);

  useEffect(() => {
    if (!frame) return;
    exportBuffer.current.push(frame);
    if (exportBuffer.current.length > MAX_EXPORT_BUFFER) {
      exportBuffer.current = exportBuffer.current.slice(-MAX_EXPORT_BUFFER);
    }
  }, [frame]);

  const showStatus = (msg: string) => {
    setStatus(msg);
    setTimeout(() => setStatus(null), 2000);
  };

  const handleExportSpikes = useCallback(() => {
    const frames = exportBuffer.current;
    if (frames.length === 0) return;
    const csv = spikesToCSV(frames);
    downloadBlob(csv, `neurevo-spikes-${Date.now()}.csv`);
    showStatus('Spikes exported');
  }, []);

  const handleExportRates = useCallback(() => {
    const frames = exportBuffer.current;
    if (frames.length === 0) return;
    const csv = firingRatesToCSV(frames);
    downloadBlob(csv, `neurevo-firing-rates-${Date.now()}.csv`);
    showStatus('Firing rates exported');
  }, []);

  const handleExportConnectome = useCallback(async () => {
    try {
      const res = await fetch(`/api/morphology/connectome-graph`);
      if (res.ok) {
        const data = await res.json();
        downloadBlob(JSON.stringify(data, null, 2), `neurevo-connectome-${Date.now()}.json`, 'application/json');
        showStatus('Connectome exported');
      } else {
        showStatus('Connectome API unavailable');
      }
    } catch {
      showStatus('Connectome API unavailable');
    }
  }, []);

  const handleScreenshot = useCallback(async () => {
    const canvas = document.querySelector('canvas');
    if (canvas) {
      await downloadScreenshot(canvas as HTMLCanvasElement);
      showStatus('Screenshot saved');
    }
  }, []);

  const handleExportState = useCallback(() => {
    if (!frame) return;
    const json = exportStateSnapshot(frame, experiment ? { id: experiment.id, organism: experiment.organism } : undefined);
    downloadBlob(json, `neurevo-state-${Date.now()}.json`, 'application/json');
    showStatus('State snapshot exported');
  }, [frame, experiment]);

  return (
    <div className="glass">
      <button
        style={{
          width: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          background: 'none',
          border: 'none',
          cursor: 'pointer',
          padding: 0,
          fontFamily: 'inherit',
        }}
        onClick={() => setExpanded((v) => !v)}
      >
        <span className="glass-label" style={{ margin: 0 }}>Data Export</span>
        <span style={{ fontSize: 10, color: 'var(--text-label)', transition: 'transform 0.2s', transform: expanded ? 'rotate(180deg)' : 'none' }}>
          ▼
        </span>
      </button>

      {expanded && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8 }}>
          {status && (
            <div style={{ fontSize: 10, color: 'var(--accent-green)', textAlign: 'center', padding: '2px 0' }}>
              {status}
            </div>
          )}
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={handleExportSpikes} disabled={!frame}>
            Export Spikes (CSV)
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={handleExportRates} disabled={!frame}>
            Export Firing Rates (CSV)
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={handleExportConnectome}>
            Export Connectome (JSON)
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={handleExportState} disabled={!frame}>
            Export State Snapshot
          </button>
          <button className="btn btn-ghost" style={{ width: '100%', fontSize: 11 }} onClick={handleScreenshot}>
            Screenshot Viewport
          </button>
        </div>
      )}
    </div>
  );
}
