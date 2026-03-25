import { create } from 'zustand';

export type OpsinType = 'ChR2' | 'NpHR' | 'custom';

export interface LightPattern {
  type: 'continuous' | 'pulse' | 'ramp';
  frequency: number;    // Hz for pulse mode
  dutyCycle: number;    // 0-1 for pulse mode
  duration: number;     // ms total duration
  intensity: number;    // 0-1
}

export interface OptogeneticsConfig {
  id: string;
  opsin: OpsinType;
  targetNeurons: string[];
  pattern: LightPattern;
  isActive: boolean;
}

export interface ClosedLoopRule {
  id: string;
  triggerNeuronId: string;
  triggerMetric: 'firing_rate';
  triggerThreshold: number;
  triggerComparison: '>' | '<';
  actionConfigId: string;
  cooldownMs: number;
  lastTriggered: number;
  enabled: boolean;
}

interface OptogeneticsState {
  configs: OptogeneticsConfig[];
  closedLoopRules: ClosedLoopRule[];
  activeTimers: Map<string, number>;

  addConfig: (config: Omit<OptogeneticsConfig, 'id'>) => void;
  removeConfig: (id: string) => void;
  updateConfig: (id: string, updates: Partial<OptogeneticsConfig>) => void;
  activateConfig: (id: string) => void;
  deactivateConfig: (id: string) => void;

  addClosedLoopRule: (rule: Omit<ClosedLoopRule, 'id' | 'lastTriggered'>) => void;
  removeClosedLoopRule: (id: string) => void;
  toggleClosedLoopRule: (id: string) => void;
  updateClosedLoopLastTriggered: (id: string, timestamp: number) => void;
}

let nextId = 1;
let nextRuleId = 1;

function computeCurrent(opsin: OpsinType, intensity: number): number {
  // ChR2 is excitatory (positive current), NpHR is inhibitory (negative current)
  const sign = opsin === 'NpHR' ? -1 : 1;
  return intensity * 25 * sign;
}

function dispatchStimulate(neuronIds: string[], current: number) {
  window.dispatchEvent(new CustomEvent('neurevo-command', {
    detail: { type: 'stimulate', neuron_ids: neuronIds, current },
  }));
}

function dispatchClearStimuli() {
  window.dispatchEvent(new CustomEvent('neurevo-command', {
    detail: { type: 'clear_stimuli' },
  }));
}

function startPatternTimer(config: OptogeneticsConfig): number {
  const { pattern, opsin, targetNeurons } = config;
  const current = computeCurrent(opsin, pattern.intensity);

  if (pattern.type === 'continuous') {
    // Send stimulate immediately, set a timer to stop after duration
    dispatchStimulate(targetNeurons, current);
    const timerId = window.setTimeout(() => {
      dispatchClearStimuli();
      // Mark inactive after duration expires
      useOptogeneticsStore.getState().deactivateConfig(config.id);
    }, pattern.duration);
    return timerId;
  }

  if (pattern.type === 'pulse') {
    const periodMs = 1000 / pattern.frequency;
    const onMs = periodMs * pattern.dutyCycle;
    let elapsed = 0;
    let isOn = true;

    // Fire first stimulate immediately
    dispatchStimulate(targetNeurons, current);

    const intervalId = window.setInterval(() => {
      elapsed += periodMs;

      if (elapsed >= pattern.duration) {
        window.clearInterval(intervalId);
        dispatchClearStimuli();
        useOptogeneticsStore.getState().deactivateConfig(config.id);
        return;
      }

      // Toggle: at each period start, turn on; after onMs, turn off
      if (isOn) {
        // We were on, now go off after duty cycle portion
        window.setTimeout(() => {
          dispatchClearStimuli();
        }, onMs);
      }
      // At the start of each interval, stimulate
      dispatchStimulate(targetNeurons, current);
      isOn = true;
    }, periodMs);

    // Also schedule the off-phase for the first pulse
    window.setTimeout(() => {
      dispatchClearStimuli();
    }, onMs);

    return intervalId;
  }

  if (pattern.type === 'ramp') {
    // Linear ramp from 0 to intensity over duration
    const steps = 20;
    const stepMs = pattern.duration / steps;
    let step = 0;

    const intervalId = window.setInterval(() => {
      step++;
      if (step > steps) {
        window.clearInterval(intervalId);
        dispatchClearStimuli();
        useOptogeneticsStore.getState().deactivateConfig(config.id);
        return;
      }
      const rampIntensity = (step / steps) * pattern.intensity;
      const rampCurrent = computeCurrent(opsin, rampIntensity);
      dispatchStimulate(targetNeurons, rampCurrent);
    }, stepMs);

    return intervalId;
  }

  return 0;
}

export const useOptogeneticsStore = create<OptogeneticsState>((set, get) => ({
  configs: [],
  closedLoopRules: [],
  activeTimers: new Map<string, number>(),

  addConfig: (config) => {
    const id = `opto_${nextId++}`;
    set((state) => ({
      configs: [...state.configs, { ...config, id }],
    }));
  },

  removeConfig: (id) => {
    // Clear timer if active
    const state = get();
    const timerId = state.activeTimers.get(id);
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      window.clearTimeout(timerId);
      dispatchClearStimuli();
    }
    const nextTimers = new Map(state.activeTimers);
    nextTimers.delete(id);
    set({
      configs: state.configs.filter((c) => c.id !== id),
      activeTimers: nextTimers,
    });
  },

  updateConfig: (id, updates) => {
    set((state) => ({
      configs: state.configs.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    }));
  },

  activateConfig: (id) => {
    const state = get();
    const config = state.configs.find((c) => c.id === id);
    if (!config || config.targetNeurons.length === 0) return;

    // Clear existing timer if any
    const existingTimer = state.activeTimers.get(id);
    if (existingTimer !== undefined) {
      window.clearInterval(existingTimer);
      window.clearTimeout(existingTimer);
    }

    const updatedConfig = { ...config, isActive: true };
    const timerId = startPatternTimer(updatedConfig);

    const nextTimers = new Map(state.activeTimers);
    nextTimers.set(id, timerId);

    set({
      configs: state.configs.map((c) =>
        c.id === id ? { ...c, isActive: true } : c
      ),
      activeTimers: nextTimers,
    });
  },

  deactivateConfig: (id) => {
    const state = get();
    const timerId = state.activeTimers.get(id);
    if (timerId !== undefined) {
      window.clearInterval(timerId);
      window.clearTimeout(timerId);
      dispatchClearStimuli();
    }
    const nextTimers = new Map(state.activeTimers);
    nextTimers.delete(id);

    set({
      configs: state.configs.map((c) =>
        c.id === id ? { ...c, isActive: false } : c
      ),
      activeTimers: nextTimers,
    });
  },

  addClosedLoopRule: (rule) => {
    const id = `clr_${nextRuleId++}`;
    set((state) => ({
      closedLoopRules: [...state.closedLoopRules, { ...rule, id, lastTriggered: 0 }],
    }));
  },

  removeClosedLoopRule: (id) => {
    set((state) => ({
      closedLoopRules: state.closedLoopRules.filter((r) => r.id !== id),
    }));
  },

  toggleClosedLoopRule: (id) => {
    set((state) => ({
      closedLoopRules: state.closedLoopRules.map((r) =>
        r.id === id ? { ...r, enabled: !r.enabled } : r
      ),
    }));
  },

  updateClosedLoopLastTriggered: (id, timestamp) => {
    set((state) => ({
      closedLoopRules: state.closedLoopRules.map((r) =>
        r.id === id ? { ...r, lastTriggered: timestamp } : r
      ),
    }));
  },
}));
