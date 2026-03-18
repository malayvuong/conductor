import { Command } from 'commander';
import { loadConfig, getConfigPath } from '../../core/config/service.js';
import { getAvailableEngines, getEngine } from '../../core/engine/types.js';
import { getDb } from '../../core/storage/db.js';
import { getActiveSession, listSessions } from '../../core/storage/supervisor-repository.js';

interface Check {
  label: string;
  ok: boolean;
  detail: string;
}

export function registerDoctorCommand(program: Command): void {
  program
    .command('doctor')
    .description('Check environment and configuration')
    .action(() => {
      const checks: Check[] = [];
      const suggestions: string[] = [];

      // 1. Config file
      const config = loadConfig();
      const hasConfig = Object.keys(config).length > 0;
      checks.push({
        label: 'Config file',
        ok: hasConfig,
        detail: hasConfig ? getConfigPath() : 'not created yet',
      });

      // 2. Default engine
      const hasEngine = !!config.defaultEngine;
      checks.push({
        label: 'Default engine',
        ok: hasEngine,
        detail: hasEngine ? config.defaultEngine! : 'not set',
      });
      if (!hasEngine) {
        suggestions.push('cdx config set engine claude');
      }

      // 3. Engine executables
      const engines = getAvailableEngines();
      for (const name of engines) {
        const adapter = getEngine(name);
        const available = adapter.validateExecutable();
        checks.push({
          label: `Engine: ${name}`,
          ok: available,
          detail: available ? 'found in PATH' : 'not found in PATH',
        });
      }

      // 4. Default path
      const hasPath = !!config.defaultPath;
      checks.push({
        label: 'Default path',
        ok: hasPath,
        detail: hasPath ? config.defaultPath! : 'not set (will use cwd)',
      });

      // 5. Active session
      let hasSession = false;
      let sessionDetail = 'none';
      try {
        const db = getDb();
        const active = getActiveSession(db);
        if (active) {
          hasSession = true;
          sessionDetail = `${active.name} #${active.run_index} [${active.status}]`;
        } else {
          const all = listSessions(db);
          if (all.length > 0) {
            sessionDetail = `none active (${all.length} total)`;
          }
        }
      } catch {
        sessionDetail = 'database not initialized';
      }
      checks.push({
        label: 'Active session',
        ok: hasSession,
        detail: sessionDetail,
      });
      if (!hasSession && hasEngine) {
        suggestions.push('cdx session start <name>');
      }

      // 6. Environment variable
      const envEngine = process.env.DEFAULT_ENGINE;
      if (envEngine) {
        checks.push({
          label: 'Env: DEFAULT_ENGINE',
          ok: true,
          detail: envEngine,
        });
      }

      // ---- Output ----
      console.log('');
      for (const c of checks) {
        const icon = c.ok ? 'OK' : '--';
        console.log(`  [${icon}] ${c.label.padEnd(20)} ${c.detail}`);
      }

      if (suggestions.length > 0) {
        console.log('');
        console.log('Next steps:');
        for (const s of suggestions) {
          console.log(`  ${s}`);
        }
      } else {
        console.log('');
        console.log('Ready to go.');
      }
      console.log('');
    });
}
