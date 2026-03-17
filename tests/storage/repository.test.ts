import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/core/storage/db.js';
import {
  createTask,
  getTaskById,
  listTasks,
  updateTaskStatus,
  createRun,
  getRunById,
  getRunsByTaskId,
  updateRunStatus,
  updateRunPid,
  updateRunFinished,
  appendRunLog,
  getRunLogs,
  createHeartbeat,
  getHeartbeatsByRunId,
  saveReport,
  getReportByRunId,
} from '../../src/core/storage/repository.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('tasks', () => {
  it('creates and retrieves a task', () => {
    const task = createTask(db, {
      raw_input: 'fix the login bug',
      workspace_path: '/tmp/project',
      engine: 'claude',
    });
    expect(task.id).toBeDefined();
    expect(task.raw_input).toBe('fix the login bug');
    expect(task.status).toBe('created');

    const fetched = getTaskById(db, task.id);
    expect(fetched).toBeDefined();
    expect(fetched!.id).toBe(task.id);
  });

  it('lists tasks', () => {
    createTask(db, { raw_input: 'task 1', workspace_path: '/tmp/a', engine: 'claude' });
    createTask(db, { raw_input: 'task 2', workspace_path: '/tmp/b', engine: 'codex' });
    const tasks = listTasks(db);
    expect(tasks).toHaveLength(2);
  });

  it('updates task status', () => {
    const task = createTask(db, { raw_input: 'task', workspace_path: '/tmp', engine: 'claude' });
    updateTaskStatus(db, task.id, 'running');
    const updated = getTaskById(db, task.id);
    expect(updated!.status).toBe('running');
  });
});

describe('runs', () => {
  it('creates and retrieves a run', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, {
      task_id: task.id,
      engine: 'claude',
      command: 'claude',
      args_json: '["--print"]',
      prompt_final: 'Fix the bug',
    });
    expect(run.id).toBeDefined();
    expect(run.status).toBe('queued');

    const fetched = getRunById(db, run.id);
    expect(fetched).toBeDefined();
    expect(fetched!.task_id).toBe(task.id);
  });

  it('gets runs by task id', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p1' });
    createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p2' });
    const runs = getRunsByTaskId(db, task.id);
    expect(runs).toHaveLength(2);
  });

  it('updates run status and pid', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p' });
    updateRunStatus(db, run.id, 'running');
    updateRunPid(db, run.id, 12345);
    const updated = getRunById(db, run.id);
    expect(updated!.status).toBe('running');
    expect(updated!.pid).toBe(12345);
  });

  it('updates run finished state', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p' });
    updateRunFinished(db, run.id, 'completed', 0);
    const updated = getRunById(db, run.id);
    expect(updated!.status).toBe('completed');
    expect(updated!.exit_code).toBe(0);
    expect(updated!.finished_at).toBeDefined();
  });
});

describe('run_logs', () => {
  it('appends and retrieves logs', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p' });

    appendRunLog(db, run.id, 'stdout', 'line 1');
    appendRunLog(db, run.id, 'stdout', 'line 2');
    appendRunLog(db, run.id, 'stderr', 'error line');

    const logs = getRunLogs(db, run.id);
    expect(logs).toHaveLength(3);
    expect(logs[0].seq).toBe(1);
    expect(logs[1].seq).toBe(2);
    expect(logs[2].stream_type).toBe('stderr');
  });
});

describe('heartbeats', () => {
  it('creates and retrieves heartbeats', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p' });

    createHeartbeat(db, { run_id: run.id, status: 'alive', summary: 'processing', no_output_seconds: 0 });
    createHeartbeat(db, { run_id: run.id, status: 'idle', summary: 'waiting', no_output_seconds: 30 });

    const heartbeats = getHeartbeatsByRunId(db, run.id);
    expect(heartbeats).toHaveLength(2);
    expect(heartbeats[1].no_output_seconds).toBe(30);
  });
});

describe('reports', () => {
  it('saves and retrieves a report', () => {
    const task = createTask(db, { raw_input: 'test', workspace_path: '/tmp', engine: 'claude' });
    const run = createRun(db, { task_id: task.id, engine: 'claude', command: 'claude', args_json: '[]', prompt_final: 'p' });

    saveReport(db, {
      run_id: run.id,
      summary: 'Fixed the bug',
      root_cause: 'Missing null check',
      fix_applied: 'Added null check in handler',
      files_changed_json: '["src/handler.ts"]',
      verification_notes: 'Tests pass',
      remaining_risks: null,
    });

    const report = getReportByRunId(db, run.id);
    expect(report).toBeDefined();
    expect(report!.summary).toBe('Fixed the bug');
    expect(report!.root_cause).toBe('Missing null check');
  });
});
