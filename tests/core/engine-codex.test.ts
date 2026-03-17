import { describe, it, expect } from 'vitest';
import { CodexAdapter } from '../../src/core/engine/codex.js';

describe('CodexAdapter', () => {
  const adapter = new CodexAdapter();

  it('has correct name', () => {
    expect(adapter.name).toBe('codex');
  });

  it('builds command with prompt and workspace path', () => {
    const cmd = adapter.buildCommand({
      prompt: 'Review the API endpoints',
      workspacePath: '/Users/test/project',
    });

    expect(cmd.executable).toBe('codex');
    expect(cmd.args.some(a => a.includes('Review the API'))).toBe(true);
  });
});
