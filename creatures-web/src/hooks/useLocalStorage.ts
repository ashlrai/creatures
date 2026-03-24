import { useState, useEffect, useCallback } from 'react';

/**
 * useState backed by localStorage. Reads the stored value on mount,
 * writes it back whenever it changes.
 */
export function useLocalStorage<T>(key: string, initial: T): [T, (v: T) => void] {
  const [value, setValue] = useState<T>(() => {
    try {
      const stored = localStorage.getItem(key);
      return stored ? (JSON.parse(stored) as T) : initial;
    } catch {
      return initial;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch {
      // localStorage full or unavailable — silently ignore
    }
  }, [key, value]);

  return [value, setValue];
}
