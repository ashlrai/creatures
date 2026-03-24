"""Standard neuroscience metrics for spiking neural network analysis.

Provides quantitative measures used in real neuroscience research:
- Firing statistics (rate, CV, Fano factor)
- Oscillation detection via FFT
- Information flow estimation (transfer entropy proxy)
- Population synchrony

References:
    - Dayan & Abbott, "Theoretical Neuroscience" (2001)
    - Schreiber, "Measuring Information Transfer" (2000)
    - C. elegans locomotion: Wen et al., J. Neuroscience 32(36), 2012
"""

from __future__ import annotations

import logging
from typing import TYPE_CHECKING

import numpy as np
from scipy import signal as scipy_signal

if TYPE_CHECKING:
    from creatures.connectome.types import Connectome

logger = logging.getLogger(__name__)


def compute_firing_statistics(
    spike_indices: list[int] | np.ndarray,
    spike_times_ms: list[float] | np.ndarray,
    n_neurons: int,
    duration_ms: float,
) -> dict:
    """Compute standard neuroscience metrics from spike data.

    Args:
        spike_indices: Neuron index for each spike event.
        spike_times_ms: Time (ms) for each spike event.
        n_neurons: Total number of neurons in the network.
        duration_ms: Total recording duration in ms.

    Returns:
        Dictionary with:
            mean_firing_rates: per-neuron mean rate (Hz), shape (n_neurons,)
            cv_isi: coefficient of variation of inter-spike intervals per neuron
            fano_factors: Fano factor (spike count variance / mean) per neuron
            population_synchrony: fraction of timesteps with >10% neurons co-active
            active_fraction: fraction of neurons that fired at least once
    """
    spike_indices = np.asarray(spike_indices, dtype=int)
    spike_times_ms = np.asarray(spike_times_ms, dtype=float)
    duration_s = duration_ms / 1000.0

    # --- Per-neuron spike trains ---
    trains: dict[int, np.ndarray] = {}
    for idx in range(n_neurons):
        mask = spike_indices == idx
        trains[idx] = np.sort(spike_times_ms[mask])

    # Mean firing rate (Hz)
    mean_rates = np.zeros(n_neurons)
    for idx, t in trains.items():
        mean_rates[idx] = len(t) / duration_s if duration_s > 0 else 0.0

    # Coefficient of variation of ISI (regularity measure)
    # CV = std(ISI) / mean(ISI). CV=1 for Poisson, CV<1 for regular, CV>1 for bursty
    cv_isi = np.full(n_neurons, np.nan)
    for idx, t in trains.items():
        if len(t) >= 3:
            isi = np.diff(t)
            mean_isi = np.mean(isi)
            if mean_isi > 0:
                cv_isi[idx] = float(np.std(isi) / mean_isi)

    # Fano factor: Var(count) / Mean(count) in fixed time bins
    bin_size_ms = 50.0
    n_bins = max(1, int(duration_ms / bin_size_ms))
    bin_edges = np.linspace(0, duration_ms, n_bins + 1)
    fano_factors = np.full(n_neurons, np.nan)
    for idx, t in trains.items():
        if len(t) >= 2:
            counts, _ = np.histogram(t, bins=bin_edges)
            mean_count = np.mean(counts)
            if mean_count > 0:
                fano_factors[idx] = float(np.var(counts) / mean_count)

    # Population synchrony: in each 1ms bin, what fraction of neurons spike?
    sync_bin_ms = 1.0
    n_sync_bins = max(1, int(duration_ms / sync_bin_ms))
    sync_counts = np.zeros(n_sync_bins)
    if len(spike_times_ms) > 0:
        bin_idx = np.clip(
            (spike_times_ms / sync_bin_ms).astype(int), 0, n_sync_bins - 1
        )
        # Count unique neurons per bin
        for b in range(n_sync_bins):
            neurons_in_bin = np.unique(spike_indices[bin_idx == b])
            sync_counts[b] = len(neurons_in_bin)

    threshold = n_neurons * 0.10  # 10% co-activation
    population_synchrony = float(np.mean(sync_counts >= threshold)) if n_neurons > 0 else 0.0

    active_fraction = float(np.mean(mean_rates > 0))

    return {
        "mean_firing_rates": mean_rates,
        "cv_isi": cv_isi,
        "fano_factors": fano_factors,
        "population_synchrony": population_synchrony,
        "active_fraction": active_fraction,
        "total_spikes": len(spike_indices),
        "mean_rate_hz": float(np.mean(mean_rates)),
        "max_rate_hz": float(np.max(mean_rates)) if n_neurons > 0 else 0.0,
    }


def detect_oscillations(
    firing_rates_history: np.ndarray,
    dt_ms: float,
    neuron_labels: list[str] | None = None,
) -> dict:
    """Detect oscillatory patterns in neural activity using FFT.

    Args:
        firing_rates_history: (n_timesteps, n_neurons) array of firing rates.
        dt_ms: Time between samples in ms.
        neuron_labels: Optional neuron ID labels for reporting.

    Returns:
        Dictionary with:
            peak_frequency_hz: dominant oscillation frequency
            power_spectrum: (frequencies, power) for population average
            locomotion_band_power: power in 0.5-2 Hz band (C. elegans crawling)
            phase_relationships: dict of neuron-pair phase offsets (if labels given)
    """
    rates = np.asarray(firing_rates_history, dtype=float)
    if rates.ndim == 1:
        rates = rates.reshape(-1, 1)

    n_steps, n_neurons = rates.shape
    if n_steps < 8:
        return {
            "peak_frequency_hz": 0.0,
            "power_spectrum": (np.array([]), np.array([])),
            "locomotion_band_power": 0.0,
            "phase_relationships": {},
        }

    dt_s = dt_ms / 1000.0
    fs = 1.0 / dt_s  # sampling frequency Hz

    # Population-averaged signal
    pop_signal = np.mean(rates, axis=1)
    pop_signal = pop_signal - np.mean(pop_signal)  # detrend

    # Compute power spectrum
    freqs = np.fft.rfftfreq(n_steps, d=dt_s)
    fft_vals = np.fft.rfft(pop_signal)
    power = np.abs(fft_vals) ** 2

    # Exclude DC component
    if len(freqs) > 1:
        peak_idx = np.argmax(power[1:]) + 1
        peak_freq = float(freqs[peak_idx])
    else:
        peak_freq = 0.0

    # Power in C. elegans locomotion band (0.5-2 Hz crawling frequency)
    loco_mask = (freqs >= 0.5) & (freqs <= 2.0)
    total_power = float(np.sum(power[1:])) if len(power) > 1 else 1e-10
    loco_power = float(np.sum(power[loco_mask])) / max(total_power, 1e-10)

    # Phase relationships between neuron groups (if labels provided)
    phase_rels = {}
    if neuron_labels is not None and n_neurons >= 2 and peak_freq > 0:
        # Compute phase at peak frequency for each neuron
        phases = np.zeros(n_neurons)
        for i in range(n_neurons):
            sig = rates[:, i] - np.mean(rates[:, i])
            fft_i = np.fft.rfft(sig)
            if len(fft_i) > peak_idx:
                phases[i] = np.angle(fft_i[peak_idx])

        # Report phase differences for VA/VB (dorsal/ventral motor pairs)
        va_indices = [i for i, l in enumerate(neuron_labels) if l.startswith("VA")]
        vb_indices = [i for i, l in enumerate(neuron_labels) if l.startswith("VB")]
        da_indices = [i for i, l in enumerate(neuron_labels) if l.startswith("DA")]
        db_indices = [i for i, l in enumerate(neuron_labels) if l.startswith("DB")]

        def _mean_phase_diff(group_a: list[int], group_b: list[int]) -> float | None:
            if not group_a or not group_b:
                return None
            diffs = []
            for a in group_a:
                for b in group_b:
                    diff = (phases[a] - phases[b] + np.pi) % (2 * np.pi) - np.pi
                    diffs.append(diff)
            return float(np.mean(diffs))

        va_vb = _mean_phase_diff(va_indices, vb_indices)
        if va_vb is not None:
            phase_rels["VA_vs_VB"] = va_vb
        da_db = _mean_phase_diff(da_indices, db_indices)
        if da_db is not None:
            phase_rels["DA_vs_DB"] = da_db
        # Dorsal vs ventral
        dorsal = da_indices + [i for i, l in enumerate(neuron_labels) if l.startswith("DD")]
        ventral = [i for i, l in enumerate(neuron_labels) if l.startswith("VD")] + vb_indices
        dv = _mean_phase_diff(dorsal, ventral)
        if dv is not None:
            phase_rels["dorsal_vs_ventral"] = dv

    return {
        "peak_frequency_hz": peak_freq,
        "power_spectrum": (freqs, power),
        "locomotion_band_power": loco_power,
        "phase_relationships": phase_rels,
    }


def compute_information_flow(
    spike_indices: list[int] | np.ndarray,
    spike_times_ms: list[float] | np.ndarray,
    n_neurons: int,
    duration_ms: float,
    connectome: Connectome,
    bin_ms: float = 5.0,
) -> dict:
    """Estimate information flow direction through the network.

    Uses a transfer entropy proxy: for connected neuron pairs (A->B),
    measure whether A's past activity predicts B's future activity better
    than B's past alone. This is computed as conditional mutual information
    on binned spike trains.

    Args:
        spike_indices: Neuron index per spike.
        spike_times_ms: Time per spike.
        n_neurons: Total neuron count.
        duration_ms: Recording duration.
        connectome: The connectome for neuron type information.
        bin_ms: Bin size for discretizing spike trains.

    Returns:
        Dictionary with:
            sensory_to_inter_flow: mean TE from sensory to interneurons
            inter_to_motor_flow: mean TE from interneurons to motor neurons
            sensory_to_motor_flow: overall S->I->M flow index (0-1)
            top_information_pairs: list of (pre_id, post_id, TE) top 10
    """
    from creatures.connectome.types import NeuronType

    spike_indices = np.asarray(spike_indices, dtype=int)
    spike_times_ms = np.asarray(spike_times_ms, dtype=float)

    n_bins = max(1, int(duration_ms / bin_ms))
    neuron_ids = connectome.neuron_ids
    id_to_idx = connectome.neuron_id_to_index

    # Build binned spike trains: (n_neurons, n_bins) binary
    binned = np.zeros((n_neurons, n_bins), dtype=np.int8)
    if len(spike_times_ms) > 0:
        bin_idx = np.clip((spike_times_ms / bin_ms).astype(int), 0, n_bins - 1)
        for s_idx, b_idx in zip(spike_indices, bin_idx):
            if 0 <= s_idx < n_neurons:
                binned[s_idx, b_idx] = 1

    # Transfer entropy proxy: TE(X->Y) ~ I(Y_t; X_{t-1} | Y_{t-1})
    # Simplified: correlation between X[t-1] and Y[t] after removing Y[t-1] effect
    def _transfer_entropy_proxy(x_train: np.ndarray, y_train: np.ndarray) -> float:
        """Simplified transfer entropy using conditional correlation."""
        if len(x_train) < 3:
            return 0.0
        x_past = x_train[:-1].astype(float)
        y_past = y_train[:-1].astype(float)
        y_future = y_train[1:].astype(float)

        # TE proxy: partial correlation of x_past with y_future given y_past
        # Use residual method
        if np.std(y_past) < 1e-10 or np.std(x_past) < 1e-10:
            return 0.0

        # Regress y_future on y_past
        y_past_mean = np.mean(y_past)
        if np.var(y_past) > 0:
            beta = np.cov(y_future, y_past)[0, 1] / np.var(y_past)
            residual = y_future - beta * (y_past - y_past_mean) - np.mean(y_future)
        else:
            residual = y_future - np.mean(y_future)

        # Correlation of residual with x_past
        if np.std(residual) < 1e-10:
            return 0.0
        corr = np.abs(np.corrcoef(residual, x_past)[0, 1])
        return float(corr) if np.isfinite(corr) else 0.0

    # Classify neurons
    sensory_idx = set()
    inter_idx = set()
    motor_idx = set()
    for nid, neuron in connectome.neurons.items():
        idx = id_to_idx.get(nid)
        if idx is None:
            continue
        if neuron.neuron_type == NeuronType.SENSORY:
            sensory_idx.add(idx)
        elif neuron.neuron_type == NeuronType.MOTOR:
            motor_idx.add(idx)
        else:
            inter_idx.add(idx)

    # Sample synapse pairs for TE computation (limit to avoid O(N^2))
    s_to_i_te = []
    i_to_m_te = []
    all_te_pairs = []

    # Use actual synapses from connectome
    for syn in connectome.synapses[:500]:  # cap at 500 for speed
        pre = id_to_idx.get(syn.pre_id)
        post = id_to_idx.get(syn.post_id)
        if pre is None or post is None:
            continue
        if pre >= n_neurons or post >= n_neurons:
            continue

        te = _transfer_entropy_proxy(binned[pre], binned[post])
        all_te_pairs.append((syn.pre_id, syn.post_id, te))

        if pre in sensory_idx and post in inter_idx:
            s_to_i_te.append(te)
        elif pre in inter_idx and post in motor_idx:
            i_to_m_te.append(te)

    s_to_i_flow = float(np.mean(s_to_i_te)) if s_to_i_te else 0.0
    i_to_m_flow = float(np.mean(i_to_m_te)) if i_to_m_te else 0.0

    # Overall flow index: geometric mean of S->I and I->M flow
    if s_to_i_flow > 0 and i_to_m_flow > 0:
        flow_index = float(np.sqrt(s_to_i_flow * i_to_m_flow))
    else:
        flow_index = 0.0

    # Top pairs by TE
    all_te_pairs.sort(key=lambda x: -x[2])
    top_pairs = all_te_pairs[:10]

    return {
        "sensory_to_inter_flow": s_to_i_flow,
        "inter_to_motor_flow": i_to_m_flow,
        "sensory_to_motor_flow": flow_index,
        "top_information_pairs": top_pairs,
    }


def classify_firing_pattern(spike_times: list[float], duration_ms: float) -> str:
    """Classify a neuron's firing pattern based on its spike train.

    Categories:
        - 'silent': no spikes
        - 'tonic': regular, steady firing (CV_ISI < 0.5)
        - 'bursting': clustered spikes with pauses (CV_ISI > 1.0, Fano > 1.5)
        - 'rhythmic': periodic firing with moderate regularity (0.3 < CV_ISI < 0.7, detectable periodicity)
        - 'irregular': none of the above

    Args:
        spike_times: Sorted spike times in ms for a single neuron.
        duration_ms: Total recording duration in ms.

    Returns:
        One of 'silent', 'tonic', 'bursting', 'irregular', 'rhythmic'.
    """
    times = np.asarray(spike_times, dtype=float)
    if len(times) < 2 or duration_ms <= 0:
        return "silent"

    rate_hz = len(times) / (duration_ms / 1000.0)
    if rate_hz < 0.1:
        return "silent"

    isi = np.diff(times)
    if len(isi) == 0:
        return "silent"

    mean_isi = np.mean(isi)
    if mean_isi <= 0:
        return "irregular"

    cv_isi = float(np.std(isi) / mean_isi)

    # Fano factor on 50ms bins
    bin_size_ms = 50.0
    n_bins = max(1, int(duration_ms / bin_size_ms))
    counts, _ = np.histogram(times, bins=np.linspace(0, duration_ms, n_bins + 1))
    mean_count = np.mean(counts)
    fano = float(np.var(counts) / mean_count) if mean_count > 0 else 0.0

    # Bursting: high variability in ISI and clustered spikes
    if cv_isi > 1.0 and fano > 1.5:
        return "bursting"

    # Tonic: very regular firing
    if cv_isi < 0.5:
        # Check for rhythmicity via autocorrelation peak
        if len(isi) >= 8:
            isi_centered = isi - np.mean(isi)
            autocorr = np.correlate(isi_centered, isi_centered, mode="full")
            autocorr = autocorr[len(autocorr) // 2 :]
            if len(autocorr) > 2 and autocorr[0] > 0:
                autocorr = autocorr / autocorr[0]
                # Look for a secondary peak (rhythmic signature)
                peaks = []
                for i in range(1, len(autocorr) - 1):
                    if autocorr[i] > autocorr[i - 1] and autocorr[i] > autocorr[i + 1]:
                        if autocorr[i] > 0.3:
                            peaks.append(i)
                if peaks:
                    return "rhythmic"
        return "tonic"

    # Moderate CV — check for rhythmic pattern
    if 0.3 < cv_isi < 0.7 and len(isi) >= 8:
        isi_centered = isi - np.mean(isi)
        autocorr = np.correlate(isi_centered, isi_centered, mode="full")
        autocorr = autocorr[len(autocorr) // 2 :]
        if len(autocorr) > 2 and autocorr[0] > 0:
            autocorr = autocorr / autocorr[0]
            peaks = []
            for i in range(1, len(autocorr) - 1):
                if autocorr[i] > autocorr[i - 1] and autocorr[i] > autocorr[i + 1]:
                    if autocorr[i] > 0.3:
                        peaks.append(i)
            if peaks:
                return "rhythmic"

    return "irregular"


def synchrony_index(spike_trains: dict[str, list[float]], bin_ms: float = 5.0) -> float:
    """Compute population synchrony index (0-1) using binned spike count correlation.

    Higher values indicate more synchronous population activity.
    Uses the SPIKE-distance-inspired approach: bin all spike trains, compute
    pairwise Pearson correlations of binned counts, return mean correlation.

    Args:
        spike_trains: Mapping of neuron_id -> sorted spike times (ms).
        bin_ms: Bin width in ms for discretizing spike trains.

    Returns:
        Synchrony index between 0.0 (asynchronous) and 1.0 (perfectly synchronous).
        Returns 0.0 if fewer than 2 active neurons.
    """
    # Filter to active neurons only
    active_trains = {k: v for k, v in spike_trains.items() if len(v) > 0}
    if len(active_trains) < 2:
        return 0.0

    # Determine time range
    all_times = np.concatenate([np.asarray(t) for t in active_trains.values()])
    t_max = float(np.max(all_times))
    n_bins = max(1, int(t_max / bin_ms) + 1)

    # Build binned matrix: (n_neurons, n_bins)
    neuron_ids = list(active_trains.keys())
    binned = np.zeros((len(neuron_ids), n_bins))
    for i, nid in enumerate(neuron_ids):
        times = np.asarray(active_trains[nid])
        indices = np.clip((times / bin_ms).astype(int), 0, n_bins - 1)
        for idx in indices:
            binned[i, idx] += 1

    # Population vector correlation: compute mean pairwise correlation
    # For efficiency, use population rate vector approach instead of all pairs
    pop_rate = np.mean(binned, axis=0)
    if np.std(pop_rate) < 1e-10:
        return 0.0

    # Synchrony = mean of individual neuron correlations with population
    correlations = []
    for i in range(len(neuron_ids)):
        if np.std(binned[i]) < 1e-10:
            continue
        corr = np.corrcoef(binned[i], pop_rate)[0, 1]
        if np.isfinite(corr):
            correlations.append(corr)

    if not correlations:
        return 0.0

    # Map from [-1, 1] correlation to [0, 1] synchrony
    mean_corr = float(np.mean(correlations))
    return float(np.clip((mean_corr + 1.0) / 2.0, 0.0, 1.0))


def network_state_summary(firing_rates: dict[str, float], n_neurons: int) -> dict:
    """Summarize the current network state from firing rates.

    Args:
        firing_rates: Mapping of neuron_id -> firing rate (Hz).
        n_neurons: Total number of neurons in the network.

    Returns:
        Dictionary with:
            active_count: number of neurons with rate > 0.1 Hz
            silent_count: number of neurons with rate <= 0.1 Hz
            active_fraction: active_count / n_neurons
            mean_rate: mean firing rate across all neurons (Hz)
            max_rate: maximum firing rate (Hz)
            top_neuron: ID of the most active neuron
            classification: 'quiescent' / 'sparse' / 'moderate' / 'active' / 'hyperactive'
    """
    if not firing_rates or n_neurons == 0:
        return {
            "active_count": 0,
            "silent_count": n_neurons,
            "active_fraction": 0.0,
            "mean_rate": 0.0,
            "max_rate": 0.0,
            "top_neuron": None,
            "classification": "quiescent",
        }

    rates = np.array(list(firing_rates.values()))
    active_mask = rates > 0.1
    active_count = int(np.sum(active_mask))
    silent_count = n_neurons - active_count
    active_fraction = active_count / n_neurons if n_neurons > 0 else 0.0
    mean_rate = float(np.mean(rates))
    max_rate = float(np.max(rates))

    # Find top neuron
    top_neuron = max(firing_rates, key=firing_rates.get) if firing_rates else None

    # Classify network state
    if active_fraction < 0.01:
        classification = "quiescent"
    elif active_fraction < 0.1:
        classification = "sparse"
    elif active_fraction < 0.4:
        classification = "moderate"
    elif active_fraction < 0.8:
        classification = "active"
    else:
        classification = "hyperactive"

    return {
        "active_count": active_count,
        "silent_count": silent_count,
        "active_fraction": round(active_fraction, 4),
        "mean_rate": round(mean_rate, 2),
        "max_rate": round(max_rate, 2),
        "top_neuron": top_neuron,
        "classification": classification,
    }


def cross_correlation(
    spike_indices: np.ndarray,
    spike_times_ms: np.ndarray,
    neuron_a: int,
    neuron_b: int,
    max_lag_ms: float = 50.0,
    bin_ms: float = 1.0,
) -> tuple[np.ndarray, np.ndarray]:
    """Compute cross-correlation between two neurons' spike trains.

    Args:
        spike_indices: Neuron index per spike.
        spike_times_ms: Spike times in ms.
        neuron_a, neuron_b: Indices of the two neurons.
        max_lag_ms: Maximum lag to compute.
        bin_ms: Bin size for discretization.

    Returns:
        (lags_ms, correlation) arrays.
    """
    mask_a = spike_indices == neuron_a
    mask_b = spike_indices == neuron_b
    times_a = spike_times_ms[mask_a]
    times_b = spike_times_ms[mask_b]

    if len(times_a) < 2 or len(times_b) < 2:
        lags = np.arange(-max_lag_ms, max_lag_ms + bin_ms, bin_ms)
        return lags, np.zeros(len(lags))

    # Bin spike trains
    t_max = max(np.max(times_a), np.max(times_b))
    n_bins = int(t_max / bin_ms) + 1
    train_a = np.zeros(n_bins)
    train_b = np.zeros(n_bins)

    for t in times_a:
        idx = min(int(t / bin_ms), n_bins - 1)
        train_a[idx] += 1
    for t in times_b:
        idx = min(int(t / bin_ms), n_bins - 1)
        train_b[idx] += 1

    # Normalize
    train_a = (train_a - np.mean(train_a)) / (np.std(train_a) + 1e-10)
    train_b = (train_b - np.mean(train_b)) / (np.std(train_b) + 1e-10)

    # Cross-correlate
    max_lag_bins = int(max_lag_ms / bin_ms)
    cc = np.correlate(train_a, train_b, mode="full")
    cc = cc / len(train_a)

    center = len(cc) // 2
    start = max(0, center - max_lag_bins)
    end = min(len(cc), center + max_lag_bins + 1)
    cc_trimmed = cc[start:end]

    lags = np.arange(-(end - center), end - center) * bin_ms
    # Recompute lags to match trimmed length
    lags = np.arange(start - center, end - center) * bin_ms

    return lags, cc_trimmed
