import { Command } from 'commander';
import { getDb } from '../../core/storage/db.js';
import { createTask, updateTaskNormalized } from '../../core/storage/repository.js';
import { normalizeTask } from '../../core/task/normalizer.js';
import { buildPrompt } from '../../core/prompt/builder.js';
import { log } from '../../utils/logger.js';

export function registerRunCommand(program: Command): void {
  program
    .command('run')
    .description('Run a task with an AI engine')
    .requiredOption('--engine <engine>', 'Engine to use (claude, codex)')
    .requiredOption('--path <path>', 'Workspace path')
    .requiredOption('--task <task>', 'Task description')
    .action(async (opts) => {
      const db = getDb();

      // Create task
      const task = createTask(db, {
        raw_input: opts.task,
        workspace_path: opts.path,
        engine: opts.engine,
      });
      log.info(`Task created: ${task.id.slice(0, 8)}`);

      // Normalize
      const normalized = normalizeTask({
        raw_input: opts.task,
        workspace_path: opts.path,
        engine: opts.engine,
      });
      updateTaskNormalized(db, task.id, normalized.task_type, JSON.stringify(normalized));
      log.info(`Task type: ${normalized.task_type}`);

      // Build prompt
      const promptFinal = buildPrompt({
        engine: opts.engine,
        task_type: normalized.task_type,
        variables: {
          workspace_path: opts.path,
          raw_input: opts.task,
        },
      });
      log.info(`Prompt built (${promptFinal.length} chars)`);
      console.log('\n--- Prompt ---');
      console.log(promptFinal);
      console.log('--- End Prompt ---\n');
    });
}
