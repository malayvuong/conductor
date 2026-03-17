import { Command } from 'commander';

export function registerLogsCommand(program: Command): void {
  program
    .command('logs <runId>')
    .description('View logs for a run')
    .action(async (runId: string) => {
      console.log('Logs command called for run:', runId);
    });
}
