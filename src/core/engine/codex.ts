import { execSync } from 'node:child_process';
import type { EngineAdapter, EngineCommand, EngineCommandInput } from './types.js';

export class CodexAdapter implements EngineAdapter {
  name = 'codex';

  buildCommand(input: EngineCommandInput): EngineCommand {
    return {
      executable: 'codex',
      args: [
        '--quiet',
        '--auto-edit',
        input.prompt,
      ],
      env: {},
    };
  }

  validateExecutable(): boolean {
    try {
      execSync('which codex', { stdio: 'ignore' });
      return true;
    } catch {
      return false;
    }
  }
}
