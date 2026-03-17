import { Command } from 'commander';

export function registerTasksCommand(program: Command): void {
  program
    .command('tasks')
    .description('List all tasks')
    .action(async () => {
      console.log('Tasks command called');
    });
}
