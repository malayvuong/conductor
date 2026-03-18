import type Database from 'better-sqlite3';
import { randomUUID } from 'node:crypto';
import type {
  Session, Goal, WorkPackage, Snapshot, ExecutionAttempt,
  SessionStatus, GoalStatus, WPStatus, AttemptStatus,
  PromptStrategy, SnapshotTrigger, GoalType, GoalSourceType,
} from '../../types/supervisor.js';

// ---- Sessions ----

interface CreateSessionInput {
  name: string;
  title?: string;
  project_path: string;
  engine: string;
}

export function createSession(db: Database.Database, input: CreateSessionInput): Session {
  const id = randomUUID();
  const now = new Date().toISOString();
  const title = input.title || input.name;
  db.prepare(
    `INSERT INTO sessions (id, name, title, project_path, engine, status, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, 'created', ?, ?)`
  ).run(id, input.name, title, input.project_path, input.engine, now, now);
  return getSessionById(db, id)!;
}

export function getSessionById(db: Database.Database, id: string): Session | undefined {
  return db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as Session | undefined;
}

export function getSessionByName(db: Database.Database, name: string): Session | undefined {
  return db.prepare('SELECT * FROM sessions WHERE name = ?').get(name) as Session | undefined;
}

export function getActiveSession(db: Database.Database): Session | undefined {
  // Prefer active/created, fall back to paused (e.g. after Ctrl+C interrupt)
  const active = db.prepare(
    `SELECT * FROM sessions WHERE status IN ('active', 'created') ORDER BY updated_at DESC LIMIT 1`
  ).get() as Session | undefined;
  if (active) return active;
  return db.prepare(
    `SELECT * FROM sessions WHERE status = 'paused' ORDER BY updated_at DESC LIMIT 1`
  ).get() as Session | undefined;
}

export function listSessions(db: Database.Database, filters?: { status?: string }): Session[] {
  if (filters?.status) {
    return db.prepare('SELECT * FROM sessions WHERE status = ? ORDER BY updated_at DESC').all(filters.status) as Session[];
  }
  return db.prepare('SELECT * FROM sessions ORDER BY updated_at DESC').all() as Session[];
}

export function updateSessionStatus(db: Database.Database, id: string, status: SessionStatus): void {
  db.prepare('UPDATE sessions SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id);
}

export function updateSessionGoal(db: Database.Database, id: string, goalId: string): void {
  db.prepare('UPDATE sessions SET active_goal_id = ?, updated_at = ? WHERE id = ?')
    .run(goalId, new Date().toISOString(), id);
}

export function updateSessionSummary(db: Database.Database, id: string, summary: string): void {
  db.prepare('UPDATE sessions SET working_summary = ?, updated_at = ? WHERE id = ?')
    .run(summary, new Date().toISOString(), id);
}

export function updateSessionDecisions(db: Database.Database, id: string, decisions: string): void {
  db.prepare('UPDATE sessions SET decisions = ?, updated_at = ? WHERE id = ?')
    .run(decisions, new Date().toISOString(), id);
}

// ---- Goals ----

interface CreateGoalInput {
  session_id: string;
  title: string;
  description: string;
  goal_type?: GoalType | null;
  source_type?: GoalSourceType | null;
  completion_rules?: string | null;
  source_file?: string | null;
}

export function createGoal(db: Database.Database, input: CreateGoalInput): Goal {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO goals (id, session_id, title, description, goal_type, source_type, status, completion_rules, source_file, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'created', ?, ?, ?, ?)`
  ).run(id, input.session_id, input.title, input.description, input.goal_type ?? null, input.source_type ?? null, input.completion_rules ?? null, input.source_file ?? null, now, now);
  return getGoalById(db, id)!;
}

export function getGoalById(db: Database.Database, id: string): Goal | undefined {
  return db.prepare('SELECT * FROM goals WHERE id = ?').get(id) as Goal | undefined;
}

export function getGoalsBySession(db: Database.Database, sessionId: string): Goal[] {
  return db.prepare('SELECT * FROM goals WHERE session_id = ? ORDER BY created_at ASC').all(sessionId) as Goal[];
}

export function updateGoalStatus(db: Database.Database, id: string, status: GoalStatus): void {
  db.prepare('UPDATE goals SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id);
}

export function updateGoalCloseout(db: Database.Database, id: string, closeoutJson: string): void {
  db.prepare('UPDATE goals SET closeout_summary = ?, updated_at = ? WHERE id = ?')
    .run(closeoutJson, new Date().toISOString(), id);
}

export function getGoalBySeq(db: Database.Database, sessionId: string, seq: number): Goal | undefined {
  if (seq < 1) return undefined;
  const goals = db.prepare(
    'SELECT * FROM goals WHERE session_id = ? ORDER BY created_at ASC, rowid ASC'
  ).all(sessionId) as Goal[];
  return goals[seq - 1];
}

export function listGoals(db: Database.Database, filters?: { status?: string }): Goal[] {
  if (filters?.status) {
    return db.prepare('SELECT * FROM goals WHERE status = ? ORDER BY updated_at DESC').all(filters.status) as Goal[];
  }
  return db.prepare('SELECT * FROM goals ORDER BY updated_at DESC').all() as Goal[];
}

// ---- Work Packages ----

interface CreateWPInput {
  goal_id: string;
  parent_wp_id?: string | null;
  seq: number;
  title: string;
  description?: string;
  done_criteria?: string | null;
  dependencies?: string | null;
  retry_budget?: number;
}

export function createWorkPackage(db: Database.Database, input: CreateWPInput): WorkPackage {
  const id = randomUUID();
  const now = new Date().toISOString();
  db.prepare(
    `INSERT INTO work_packages (id, goal_id, parent_wp_id, seq, title, description, status, done_criteria, dependencies, retry_budget, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 'pending', ?, ?, ?, ?, ?)`
  ).run(id, input.goal_id, input.parent_wp_id ?? null, input.seq, input.title, input.description ?? '', input.done_criteria ?? null, input.dependencies ?? null, input.retry_budget ?? 3, now, now);
  return getWPById(db, id)!;
}

export function getWPById(db: Database.Database, id: string): WorkPackage | undefined {
  return db.prepare('SELECT * FROM work_packages WHERE id = ?').get(id) as WorkPackage | undefined;
}

export function getWPsByGoal(db: Database.Database, goalId: string): WorkPackage[] {
  return db.prepare('SELECT * FROM work_packages WHERE goal_id = ? ORDER BY seq ASC').all(goalId) as WorkPackage[];
}

export function updateWPStatus(db: Database.Database, id: string, status: WPStatus): void {
  db.prepare('UPDATE work_packages SET status = ?, updated_at = ? WHERE id = ?')
    .run(status, new Date().toISOString(), id);
}

export function incrementWPRetry(db: Database.Database, id: string): void {
  db.prepare('UPDATE work_packages SET retry_count = retry_count + 1, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), id);
}

export function updateWPBlocker(db: Database.Database, id: string, type: string | null, detail: string | null): void {
  db.prepare('UPDATE work_packages SET blocker_type = ?, blocker_detail = ?, updated_at = ? WHERE id = ?')
    .run(type, detail, new Date().toISOString(), id);
}

export function updateWPProgress(db: Database.Database, id: string): void {
  db.prepare('UPDATE work_packages SET last_progress_at = ?, updated_at = ? WHERE id = ?')
    .run(new Date().toISOString(), new Date().toISOString(), id);
}

// ---- Snapshots ----

interface CreateSnapshotInput {
  session_id: string;
  goal_id: string;
  current_wp_id?: string | null;
  trigger: SnapshotTrigger;
  summary: string;
  completed_items?: string | null;
  in_progress_items?: string | null;
  remaining_items?: string | null;
  decisions?: string | null;
  constraints?: string | null;
  related_files?: string | null;
  blockers_encountered?: string | null;
  next_action: string;
  run_id?: string | null;
  assumptions?: string | null;
  unresolved_questions?: string | null;
  follow_ups?: string | null;
}

export function createSnapshot(db: Database.Database, input: CreateSnapshotInput): Snapshot {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO snapshots (id, session_id, goal_id, current_wp_id, trigger, summary, completed_items, in_progress_items, remaining_items, decisions, constraints, related_files, blockers_encountered, next_action, run_id, assumptions, unresolved_questions, follow_ups)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).run(
    id, input.session_id, input.goal_id, input.current_wp_id ?? null,
    input.trigger, input.summary,
    input.completed_items ?? null, input.in_progress_items ?? null, input.remaining_items ?? null,
    input.decisions ?? null, input.constraints ?? null, input.related_files ?? null,
    input.blockers_encountered ?? null, input.next_action, input.run_id ?? null,
    input.assumptions ?? null, input.unresolved_questions ?? null, input.follow_ups ?? null,
  );
  return getSnapshotById(db, id)!;
}

export function getSnapshotById(db: Database.Database, id: string): Snapshot | undefined {
  return db.prepare('SELECT * FROM snapshots WHERE id = ?').get(id) as Snapshot | undefined;
}

export function getLatestSnapshot(db: Database.Database, goalId: string): Snapshot | undefined {
  return db.prepare('SELECT * FROM snapshots WHERE goal_id = ? ORDER BY rowid DESC LIMIT 1').get(goalId) as Snapshot | undefined;
}

export function getSnapshotsByGoal(db: Database.Database, goalId: string): Snapshot[] {
  return db.prepare('SELECT * FROM snapshots WHERE goal_id = ? ORDER BY created_at ASC').all(goalId) as Snapshot[];
}

// ---- Execution Attempts ----

interface CreateAttemptInput {
  session_id: string;
  goal_id: string;
  wp_id?: string | null;
  attempt_no: number;
  run_id?: string | null;
  snapshot_id?: string | null;
  prompt_strategy?: PromptStrategy | null;
}

export function createAttempt(db: Database.Database, input: CreateAttemptInput): ExecutionAttempt {
  const id = randomUUID();
  db.prepare(
    `INSERT INTO execution_attempts (id, session_id, goal_id, wp_id, attempt_no, run_id, snapshot_id, status, prompt_strategy)
     VALUES (?, ?, ?, ?, ?, ?, ?, 'running', ?)`
  ).run(id, input.session_id, input.goal_id, input.wp_id ?? null, input.attempt_no, input.run_id ?? null, input.snapshot_id ?? null, input.prompt_strategy ?? null);
  return getAttemptById(db, id)!;
}

export function getAttemptById(db: Database.Database, id: string): ExecutionAttempt | undefined {
  return db.prepare('SELECT * FROM execution_attempts WHERE id = ?').get(id) as ExecutionAttempt | undefined;
}

export function getAttemptsByGoal(db: Database.Database, goalId: string): ExecutionAttempt[] {
  return db.prepare('SELECT * FROM execution_attempts WHERE goal_id = ? ORDER BY started_at ASC').all(goalId) as ExecutionAttempt[];
}

export function getAttemptsByWP(db: Database.Database, wpId: string): ExecutionAttempt[] {
  return db.prepare('SELECT * FROM execution_attempts WHERE wp_id = ? ORDER BY started_at ASC').all(wpId) as ExecutionAttempt[];
}

export function updateAttemptFinished(
  db: Database.Database, id: string,
  status: AttemptStatus, progressDetected: boolean,
  filesChangedCount: number, wpCompletedCount: number,
  notes?: string | null, blockerType?: string | null, blockerDetail?: string | null,
): void {
  db.prepare(
    `UPDATE execution_attempts SET status = ?, ended_at = ?, progress_detected = ?, files_changed_count = ?, wp_completed_count = ?, notes = ?, blocker_type = ?, blocker_detail = ? WHERE id = ?`
  ).run(status, new Date().toISOString(), progressDetected ? 1 : 0, filesChangedCount, wpCompletedCount, notes ?? null, blockerType ?? null, blockerDetail ?? null, id);
}

export function updateAttemptRunId(db: Database.Database, id: string, runId: string): void {
  db.prepare('UPDATE execution_attempts SET run_id = ? WHERE id = ?').run(runId, id);
}

/** Get the most recent running attempt for a goal (if any). */
export function getRunningAttempt(db: Database.Database, goalId: string): ExecutionAttempt | undefined {
  return db.prepare(
    `SELECT * FROM execution_attempts WHERE goal_id = ? AND status = 'running' ORDER BY started_at DESC LIMIT 1`
  ).get(goalId) as ExecutionAttempt | undefined;
}
