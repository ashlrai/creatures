import type { SimulationFrame } from '../types/simulation';

/** Convert spike history to CSV format */
export function spikesToCSV(
  frames: Pick<SimulationFrame, 't_ms' | 'spikes'>[],
): string {
  const rows = ['time_ms,neuron_index'];
  for (const frame of frames) {
    for (const idx of frame.spikes) {
      rows.push(`${frame.t_ms.toFixed(1)},${idx}`);
    }
  }
  return rows.join('\n');
}

/** Convert firing rate history to matrix CSV */
export function firingRatesToCSV(
  frames: Pick<SimulationFrame, 't_ms' | 'firing_rates'>[],
): string {
  if (frames.length === 0) return '';
  const nNeurons = frames[0].firing_rates.length;
  const header = ['time_ms', ...Array.from({ length: nNeurons }, (_, i) => `neuron_${i}`)];
  const rows = [header.join(',')];
  for (const frame of frames) {
    rows.push([frame.t_ms.toFixed(1), ...frame.firing_rates.map((r) => r.toFixed(3))].join(','));
  }
  return rows.join('\n');
}

/** Download a string as a file */
export function downloadBlob(content: string, filename: string, mimeType = 'text/csv'): void {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Capture the Three.js canvas as a PNG blob */
export async function captureCanvas(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error('Canvas capture failed'));
    }, 'image/png');
  });
}

/** Download a canvas screenshot */
export async function downloadScreenshot(canvas: HTMLCanvasElement, filename = 'neurevo-screenshot.png'): Promise<void> {
  const blob = await captureCanvas(canvas);
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

/** Export simulation state as JSON */
export function exportStateSnapshot(
  frame: SimulationFrame,
  experimentInfo?: Record<string, unknown>,
): string {
  return JSON.stringify({
    timestamp: new Date().toISOString(),
    experiment: experimentInfo ?? {},
    frame,
  }, null, 2);
}
