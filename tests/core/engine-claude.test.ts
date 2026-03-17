import { describe, it, expect } from 'vitest';
import { ClaudeAdapter } from '../../src/core/engine/claude.js';

describe('ClaudeAdapter', () => {
  const adapter = new ClaudeAdapter();

  it('has correct name and streaming flag', () => {
    expect(adapter.name).toBe('claude');
    expect(adapter.streaming).toBe(true);
  });

  it('builds command with stream-json output and stdin prompt', () => {
    const cmd = adapter.buildCommand({
      prompt: 'Fix the bug in login handler',
      workspacePath: '/Users/test/project',
    });

    expect(cmd.executable).toBe('claude');
    expect(cmd.args).toContain('--print');
    expect(cmd.args).toContain('--output-format');
    expect(cmd.args).toContain('stream-json');
    expect(cmd.args).toContain('--verbose');
    expect(cmd.args).toContain('--dangerously-skip-permissions');
    expect(cmd.stdin).toBe('Fix the bug in login handler');
    expect(cmd.args.some(a => a.includes('Fix the bug'))).toBe(false);
  });
});
