#!/usr/bin/env node
import { Command } from 'commander';
import { registerRunCommand } from './commands/run.js';
import { registerTasksCommand } from './commands/tasks.js';
import { registerLogsCommand } from './commands/logs.js';
import { registerReportCommand } from './commands/report.js';

const program = new Command();

program
  .name('conductor')
  .description('Supervisor for AI coding CLIs')
  .version('0.1.0');

registerRunCommand(program);
registerTasksCommand(program);
registerLogsCommand(program);
registerReportCommand(program);

program.parse();
