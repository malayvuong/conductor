import { execSync } from 'node:child_process';
import type { EngineAdapter, EngineCommand, EngineCommandInput } from './types.js';

export class ClaudeAdapter implements EngineAdapter {
  name = 'claude';
  streaming = true;

  buildCommand(input: EngineCommandInput): EngineCommand {
    return {
      executable: 'claude',
      args: [
        '--print',
        '--output-format', 'stream-json',
        '--verbose',
        '--dangerously-skip-permissions',
      ],
      env: {},
      stdin: input.prompt,
    };
  }

  validateExecutable(): boolean {
    try {
      execSync('which claude', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
