import { Command } from 'commander';

export function registerReportCommand(program: Command): void {
  program
    .command('report <runId>')
    .description('View report for a run')
    .action(async (runId: string) => {
      console.log('Report command called for run:', runId);
    });
}
