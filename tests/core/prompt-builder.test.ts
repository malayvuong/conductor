import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../../src/core/prompt/builder.js';

describe('buildPrompt', () => {
  it('builds prompt from template with variable substitution', () => {
    const result = buildPrompt({
      engine: 'claude',
      task_type: 'debug_fix',
      variables: {
        workspace_path: '/Users/test/project',
        raw_input: 'fix the login bug',
      },
    });

    expect(result).toContain('/Users/test/project');
    expect(result).toContain('fix the login bug');
    expect(result).toContain('Root cause');
  });

  it('builds prompt for codex engine', () => {
    const result = buildPrompt({
      engine: 'codex',
      task_type: 'scan_review',
      variables: {
        workspace_path: '/tmp/project',
        raw_input: 'review all API endpoints',
      },
    });

    expect(result).toContain('/tmp/project');
    expect(result).toContain('review all API endpoints');
  });

  it('throws on unknown engine', () => {
    expect(() => buildPrompt({
      engine: 'unknown',
      task_type: 'debug_fix',
      variables: { workspace_path: '/tmp', raw_input: 'test' },
    })).toThrow();
  });

  it('throws on unknown task_type', () => {
    expect(() => buildPrompt({
      engine: 'claude',
      task_type: 'unknown_type' as any,
      variables: { workspace_path: '/tmp', raw_input: 'test' },
    })).toThrow();
  });
});
