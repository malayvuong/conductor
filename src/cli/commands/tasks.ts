import { Command } from 'commander';
import { getDb } from '../../core/storage/db.js';
import { listTasks } from '../../core/storage/repository.js';

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('List all tasks')
    .action(async () => {
      const db = getDb();
      const tasks = listTasks(db);
      if (tasks.length === 0) {
        console.log('No tasks yet.');
        return;
      }
      for (const t of tasks) {
        const shortId = t.id.slice(0, 8);
        console.log(`[${shortId}] ${t.status.padEnd(10)} ${t.engine.padEnd(8)} ${t.raw_input.slice(0, 60)}`);
      }
    });
}
