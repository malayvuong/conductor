import { describe, it, expect } from 'vitest';
import { LiveRunTracker } from '../../src/core/supervisor/live-tracker.js';

describe('LiveRunTracker', () => {
  it('starts with zero files and no tool', () => {
    const tracker = new LiveRunTracker();
    expect(tracker.getFilesTouched()).toBe(0);
    expect(tracker.getLastTool()).toBeNull();
  });

  it('tracks unique files from Claude streaming JSON', () => {
    const tracker = new LiveRunTracker();

    // Simulate Claude streaming assistant event with tool_use
    const editEvent = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Edit',
          input: { file_path: '/src/foo.ts' },
        }],
      },
    });

    const writeEvent = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Write',
          input: { file_path: '/src/bar.ts' },
        }],
      },
    });

    // Same file again — should not double count
    const editAgain = JSON.stringify({
      type: 'assistant',
      message: {
        content: [{
          type: 'tool_use',
          name: 'Edit',
          input: { file_path: '/src/foo.ts' },
        }],
      },
    });

    tracker.recordLine('stdout', editEvent);
    expect(tracker.getFilesTouched()).toBe(1);
    expect(tracker.getLastTool()).toBe('Edit');

    tracker.recordLine('stdout', writeEvent);
    expect(tracker.getFilesTouched()).toBe(2);
    expect(tracker.getLastTool()).toBe('Write');

    tracker.recordLine('stdout', editAgain);
    expect(tracker.getFilesTouched()).toBe(2); // deduped
    expect(tracker.getLastTool()).toBe('Edit');
  });

  it('ignores stderr lines', () => {
    const tracker = new LiveRunTracker();
    tracker.recordLine('stderr', 'some error');
    expect(tracker.getFilesTouched()).toBe(0);
    expect(tracker.getLastTool()).toBeNull();
  });

  it('ignores non-tool stdout lines', () => {
    const tracker = new LiveRunTracker();
    tracker.recordLine('stdout', 'just a text line');
    tracker.recordLine('stdout', JSON.stringify({ type: 'result', total_cost_usd: 0.05 }));
    expect(tracker.getFilesTouched()).toBe(0);
    expect(tracker.getLastTool()).toBeNull();
  });

  it('tracks elapsed time', async () => {
    const tracker = new LiveRunTracker();
    // Elapsed should be >= 0 immediately
    expect(tracker.getElapsedSeconds()).toBeGreaterThanOrEqual(0);
  });
});
