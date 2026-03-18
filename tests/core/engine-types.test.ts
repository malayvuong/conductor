import { describe, it, expect } from 'vitest';
import { getAvailableEngines, getEngine } from '../../src/core/engine/types.js';

describe('getAvailableEngines', () => {
  it('returns known engine names', () => {
    const engines = getAvailableEngines();
    expect(engines).toContain('claude');
    expect(engines).toContain('codex');
    expect(engines.length).toBeGreaterThanOrEqual(2);
  });
});

describe('getEngine', () => {
  it('returns adapter for known engine', () => {
    const adapter = getEngine('claude');
    expect(adapter.name).toBe('claude');
  });

  it('throws for unknown engine', () => {
    expect(() => getEngine('unknown')).toThrow('Unknown engine: unknown');
  });
});
