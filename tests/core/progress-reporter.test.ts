import { describe, it, expect } from 'vitest';
import { formatProgressEvent } from '../../src/core/supervisor/progress-reporter.js';
import type { ProgressEvent } from '../../src/core/supervisor/progress-reporter.js';

describe('formatProgressEvent', () => {
  it('formats goal_start event', () => {
    const event: ProgressEvent = {
      type: 'goal_start',
      session: 'cms-project',
      goal: 'Implement CMS',
    };
    expect(formatProgressEvent(event)).toBe(
      '── session: cms-project | goal: Implement CMS ──'
    );
  });

  it('formats wp_start event', () => {
    const event: ProgressEvent = {
      type: 'wp_start',
      wpIndex: 1,
      wpTotal: 3,
      title: 'Scan structure',
      attempt: 1,
      strategy: 'normal',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 1/3] Scan structure — attempt 1 (normal)'
    );
  });

  it('formats wp_progress event', () => {
    const event: ProgressEvent = {
      type: 'wp_progress',
      wpIndex: 1,
      wpTotal: 3,
      detail: '3 files inspected',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 1/3] progress — 3 files inspected'
    );
  });

  it('formats wp_completed event', () => {
    const event: ProgressEvent = {
      type: 'wp_completed',
      wpIndex: 2,
      wpTotal: 3,
    };
    expect(formatProgressEvent(event)).toBe('[WP 2/3] completed');
  });

  it('formats wp_failed event', () => {
    const event: ProgressEvent = {
      type: 'wp_failed',
      wpIndex: 3,
      wpTotal: 3,
      reason: 'retries exhausted',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 3/3] failed (retries exhausted)'
    );
  });

  it('formats hard_blocker event', () => {
    const event: ProgressEvent = {
      type: 'hard_blocker',
      wpIndex: 2,
      wpTotal: 3,
      detail: 'missing test framework',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 2/3] hard blocker: missing test framework'
    );
  });

  it('formats goal_end event', () => {
    const event: ProgressEvent = {
      type: 'goal_end',
      completed: 2,
      total: 3,
      attempts: 3,
      cost: 0.1842,
    };
    expect(formatProgressEvent(event)).toBe(
      '── result: 2/3 completed | 3 attempts | $0.1842 ──'
    );
  });

  it('formats goal_end with zero cost', () => {
    const event: ProgressEvent = {
      type: 'goal_end',
      completed: 0,
      total: 1,
      attempts: 1,
      cost: 0,
    };
    expect(formatProgressEvent(event)).toBe(
      '── result: 0/1 completed | 1 attempts | $0.0000 ──'
    );
  });

  it('formats heartbeat event with all fields', () => {
    const event: ProgressEvent = {
      type: 'heartbeat',
      wpIndex: 3,
      wpTotal: 20,
      status: 'alive',
      idleSeconds: 5,
      filesTouched: 14,
      lastTool: 'Edit',
      strategy: 'normal',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 3/20] heartbeat: alive | files: 14 | idle: 5s | last: Edit | strategy: normal'
    );
  });

  it('formats heartbeat event without files or tool', () => {
    const event: ProgressEvent = {
      type: 'heartbeat',
      wpIndex: 1,
      wpTotal: 5,
      status: 'idle',
      idleSeconds: 35,
      filesTouched: 0,
      lastTool: null,
      strategy: 'focused',
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 1/5] heartbeat: idle | idle: 35s | strategy: focused'
    );
  });

  it('formats stall_warning event', () => {
    const event: ProgressEvent = {
      type: 'stall_warning',
      wpIndex: 3,
      wpTotal: 20,
      idleSeconds: 65,
    };
    expect(formatProgressEvent(event)).toBe(
      '[WP 3/20] no output for 65s — possible stall'
    );
  });
});
