import { Command } from 'commander';
import { getDb } from '../../core/storage/db.js';
import { getRunLogs } from '../../core/storage/repository.js';
import { findRunByPrefix } from '../../utils/lookup.js';
import { interpretLogLine, formatEventForDisplay } from '../../core/engine/log-interpreter.js';
import type { StreamType } from '../../types/index.js';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs <runId>')
    .description('View logs for a run')
    .option('--tail <n>', 'Show last N lines', '0')
    .option('--stream <type>', 'Filter by stream type (stdout, stderr, system)')
    .option('--raw', 'Show raw persisted lines without parsing')
    .action(async (runId: string, opts) => {
      const db = getDb();

      // Support short IDs
      const run = findRunByPrefix(db, runId);
      if (!run) {
        console.error(`Run not found: ${runId}`);
        process.exit(1);
      }

      let logs = getRunLogs(db, run.id);

      if (opts.stream) {
        logs = logs.filter(l => l.stream_type === opts.stream);
      }

      const tail = parseInt(opts.tail, 10);
      if (tail > 0) {
        logs = logs.slice(-tail);
      }

      if (logs.length === 0) {
        console.log('No logs found.');
        return;
      }

      let displayCount = 0;
      for (const entry of logs) {
        if (opts.raw) {
          // Raw mode: show exactly what's persisted
          const prefix = entry.stream_type === 'stderr' ? '[ERR] ' : '';
          console.log(`${entry.seq.toString().padStart(5)} ${prefix}${entry.line}`);
          displayCount++;
        } else {
          // Parsed mode: interpret and display human-readable
          const event = interpretLogLine(entry.stream_type as StreamType, entry.line);
          const display = formatEventForDisplay(event);
          if (display) {
            console.log(`${entry.seq.toString().padStart(5)} ${display}`);
            displayCount++;
          }
        }
      }

      console.log(`\n--- ${displayCount} lines (${logs.length} total) ---`);
    });
}
