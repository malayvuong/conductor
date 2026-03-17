export const SCHEMA_SQL = `
CREATE TABLE IF NOT EXISTS tasks (
  id TEXT PRIMARY KEY,
  raw_input TEXT NOT NULL,
  workspace_path TEXT NOT NULL,
  engine TEXT NOT NULL,
  task_type TEXT,
  normalized_json TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS runs (
  id TEXT PRIMARY KEY,
  task_id TEXT NOT NULL REFERENCES tasks(id),
  engine TEXT NOT NULL,
  command TEXT NOT NULL DEFAULT '',
  args_json TEXT NOT NULL DEFAULT '[]',
  prompt_final TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'queued',
  pid INTEGER,
  started_at TEXT,
  finished_at TEXT,
  exit_code INTEGER,
  resumed_from_run_id TEXT REFERENCES runs(id),
  cost_usd REAL,
  duration_seconds REAL
);

CREATE TABLE IF NOT EXISTS run_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  seq INTEGER NOT NULL,
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  stream_type TEXT NOT NULL,
  line TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS heartbeat_events (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  run_id TEXT NOT NULL REFERENCES runs(id),
  timestamp TEXT NOT NULL DEFAULT (datetime('now')),
  status TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',
  no_output_seconds REAL NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS run_reports (
  id TEXT PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES runs(id),
  summary TEXT NOT NULL DEFAULT '',
  files_inspected_json TEXT,
  files_changed_json TEXT,
  verification_notes TEXT,
  final_output TEXT,
  root_cause TEXT,
  fix_applied TEXT,
  remaining_risks TEXT,
  findings TEXT,
  risks TEXT,
  recommendations TEXT,
  what_implemented TEXT,
  follow_ups TEXT
);

CREATE INDEX IF NOT EXISTS idx_runs_task_id ON runs(task_id);
CREATE INDEX IF NOT EXISTS idx_run_logs_run_id ON run_logs(run_id);
CREATE INDEX IF NOT EXISTS idx_heartbeat_events_run_id ON heartbeat_events(run_id);
CREATE INDEX IF NOT EXISTS idx_run_reports_run_id ON run_reports(run_id);

-- Supervisor Layer

CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  title TEXT NOT NULL,
  project_path TEXT NOT NULL,
  engine TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'created',
  active_goal_id TEXT,
  working_summary TEXT,
  decisions TEXT,
  constraints TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS goals (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  title TEXT NOT NULL,
  description TEXT NOT NULL,
  goal_type TEXT,
  source_type TEXT,
  status TEXT NOT NULL DEFAULT 'created',
  completion_rules TEXT,
  source_file TEXT,
  closeout_summary TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS work_packages (
  id TEXT PRIMARY KEY,
  goal_id TEXT NOT NULL REFERENCES goals(id),
  parent_wp_id TEXT REFERENCES work_packages(id),
  seq INTEGER NOT NULL DEFAULT 0,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'pending',
  done_criteria TEXT,
  dependencies TEXT,
  retry_count INTEGER NOT NULL DEFAULT 0,
  retry_budget INTEGER NOT NULL DEFAULT 3,
  last_progress_at TEXT,
  blocker_type TEXT,
  blocker_detail TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS snapshots (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  goal_id TEXT NOT NULL REFERENCES goals(id),
  current_wp_id TEXT REFERENCES work_packages(id),
  trigger TEXT NOT NULL,
  summary TEXT NOT NULL,
  completed_items TEXT,
  in_progress_items TEXT,
  remaining_items TEXT,
  decisions TEXT,
  constraints TEXT,
  related_files TEXT,
  blockers_encountered TEXT,
  next_action TEXT NOT NULL,
  assumptions TEXT,
  unresolved_questions TEXT,
  follow_ups TEXT,
  run_id TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS execution_attempts (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES sessions(id),
  goal_id TEXT NOT NULL REFERENCES goals(id),
  wp_id TEXT REFERENCES work_packages(id),
  attempt_no INTEGER NOT NULL DEFAULT 1,
  run_id TEXT REFERENCES runs(id),
  snapshot_id TEXT REFERENCES snapshots(id),
  status TEXT NOT NULL DEFAULT 'running',
  progress_detected INTEGER NOT NULL DEFAULT 0,
  files_changed_count INTEGER NOT NULL DEFAULT 0,
  wp_completed_count INTEGER NOT NULL DEFAULT 0,
  prompt_strategy TEXT,
  blocker_type TEXT,
  blocker_detail TEXT,
  notes TEXT,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  ended_at TEXT
);

CREATE INDEX IF NOT EXISTS idx_sessions_name ON sessions(name);
CREATE INDEX IF NOT EXISTS idx_goals_session ON goals(session_id);
CREATE INDEX IF NOT EXISTS idx_wps_goal ON work_packages(goal_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_session ON snapshots(session_id);
CREATE INDEX IF NOT EXISTS idx_snapshots_goal ON snapshots(goal_id);
CREATE INDEX IF NOT EXISTS idx_attempts_goal ON execution_attempts(goal_id);
CREATE INDEX IF NOT EXISTS idx_attempts_wp ON execution_attempts(wp_id);
`;

/**
 * Migrate existing run_reports tables to add new columns.
 * Safe to call on fresh DBs (columns already exist from CREATE TABLE).
 */
export function migrateSchema(db: import('better-sqlite3').Database): void {
  migrateReportColumns(db);
  // Add new columns to runs table
  const runColumns = [
    'resumed_from_run_id TEXT REFERENCES runs(id)',
    'cost_usd REAL',
    'duration_seconds REAL',
  ];
  for (const col of runColumns) {
    try { db.exec(`ALTER TABLE runs ADD COLUMN ${col}`); } catch { /* already exists */ }
  }
  // Add name column to sessions (v2 session-first)
  try { db.exec(`ALTER TABLE sessions ADD COLUMN name TEXT NOT NULL DEFAULT ''`); } catch { /* already exists */ }
  // Add source_type and closeout_summary to goals
  try { db.exec(`ALTER TABLE goals ADD COLUMN source_type TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE goals ADD COLUMN closeout_summary TEXT`); } catch { /* already exists */ }
  // Add enhanced compaction columns to snapshots
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN assumptions TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN unresolved_questions TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN follow_ups TEXT`); } catch { /* already exists */ }
}

function migrateReportColumns(db: import('better-sqlite3').Database): void {
  const newColumns = [
    'files_inspected_json TEXT',
    'final_output TEXT',
    'findings TEXT',
    'risks TEXT',
    'recommendations TEXT',
    'what_implemented TEXT',
    'follow_ups TEXT',
  ];
  for (const col of newColumns) {
    try {
      db.exec(`ALTER TABLE run_reports ADD COLUMN ${col}`);
    } catch {
      // Column already exists — ignore
    }
  }
}
