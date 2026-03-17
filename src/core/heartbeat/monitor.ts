import type { HeartbeatStatus } from '../../types/index.js';

export interface HeartbeatConfig {
  intervalMs: number;
  stuckThresholdSeconds: number;
  onHeartbeat: (status: HeartbeatStatus, summary: string, noOutputSeconds: number) => void;
}

export class HeartbeatMonitor {
  private config: HeartbeatConfig;
  private timer: ReturnType<typeof setInterval> | null = null;
  private lastOutputAt: number = Date.now();
  private lastLine: string = '';

  constructor(config: HeartbeatConfig) {
    this.config = config;
  }

  start(): void {
    this.lastOutputAt = Date.now();
    this.timer = setInterval(() => this.tick(), this.config.intervalMs);
  }

  stop(): void {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  recordOutput(line: string): void {
    this.lastOutputAt = Date.now();
    this.lastLine = line.slice(0, 100);
  }

  private tick(): void {
    const noOutputSeconds = (Date.now() - this.lastOutputAt) / 1000;

    let status: HeartbeatStatus;
    let summary: string;

    if (noOutputSeconds > this.config.stuckThresholdSeconds) {
      status = 'suspected_stuck';
      summary = `No output for ${Math.round(noOutputSeconds)}s`;
    } else if (noOutputSeconds > this.config.stuckThresholdSeconds / 2) {
      status = 'idle';
      summary = `Idle ${Math.round(noOutputSeconds)}s. Last: ${this.lastLine}`;
    } else {
      status = 'alive';
      summary = this.lastLine || 'Running';
    }

    this.config.onHeartbeat(status, summary, noOutputSeconds);
  }
}
