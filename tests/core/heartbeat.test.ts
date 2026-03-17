import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { HeartbeatMonitor } from '../../src/core/heartbeat/monitor.js';

describe('HeartbeatMonitor', () => {
  let events: { status: string; noOutputSeconds: number }[];

  beforeEach(() => {
    events = [];
    vi.useFakeTimers();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('emits alive heartbeat when output is recent', () => {
    const monitor = new HeartbeatMonitor({
      intervalMs: 1000,
      stuckThresholdSeconds: 30,
      onHeartbeat: (status, summary, noOutputSeconds) => {
        events.push({ status, noOutputSeconds });
      },
    });

    monitor.start();
    monitor.recordOutput('some log line');

    vi.advanceTimersByTime(1000);
    expect(events.length).toBe(1);
    expect(events[0].status).toBe('alive');
    expect(events[0].noOutputSeconds).toBeLessThan(5);

    monitor.stop();
  });

  it('emits suspected_stuck when no output for too long', () => {
    const monitor = new HeartbeatMonitor({
      intervalMs: 1000,
      stuckThresholdSeconds: 5,
      onHeartbeat: (status, summary, noOutputSeconds) => {
        events.push({ status, noOutputSeconds });
      },
    });

    monitor.start();
    // No recordOutput call

    vi.advanceTimersByTime(6000);
    const stuckEvents = events.filter(e => e.status === 'suspected_stuck');
    expect(stuckEvents.length).toBeGreaterThan(0);

    monitor.stop();
  });
});
