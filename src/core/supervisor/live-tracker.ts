/**
 * Tracks live execution stats during a single engine run.
 * Fed by streaming output lines, provides current state for heartbeat display.
 */

import { interpretLogLine } from '../engine/log-interpreter.js';

export class LiveRunTracker {
  private filesTouched = new Set<string>();
  private lastToolName: string | null = null;
  private startedAt = Date.now();

  /** Process a streaming output line to extract tool/file activity. */
  recordLine(stream: 'stdout' | 'stderr', line: string): void {
    if (stream !== 'stdout') return;
    const event = interpretLogLine('stdout', line);
    if (event.type === 'tool_use') {
      this.lastToolName = event.toolName;
      if (event.filePath) {
        this.filesTouched.add(event.filePath);
      }
    }
  }

  /** Number of unique files touched so far. */
  getFilesTouched(): number {
    return this.filesTouched.size;
  }

  /** Last tool name seen (e.g. "Edit", "Write", "Read"). */
  getLastTool(): string | null {
    return this.lastToolName;
  }

  /** Seconds since run started. */
  getElapsedSeconds(): number {
    return Math.round((Date.now() - this.startedAt) / 1000);
  }
}
