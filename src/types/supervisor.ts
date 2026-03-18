// ---- Supervisor Layer Types ----

export type SessionStatus = 'created' | 'active' | 'paused' | 'archived';
export type GoalStatus = 'created' | 'active' | 'paused' | 'completed' | 'failed' | 'hard_blocked' | 'abandoned';
export type GoalType = 'execute_plan' | 'implement' | 'debug' | 'review' | 'custom' | 'ad_hoc';
export type GoalSourceType = 'plan_file' | 'inline_task';
export type WPStatus = 'pending' | 'active' | 'completed' | 'failed' | 'blocked' | 'skipped';
export type AttemptStatus = 'running' | 'completed' | 'failed' | 'stalled' | 'needs_recovery';
export type PromptStrategy = 'normal' | 'focused' | 'surgical' | 'recovery';
export type BlockerType = 'soft' | 'hard';
export type SnapshotTrigger = 'run_completed' | 'run_failed' | 'manual' | 'stall_recovery';

export interface Session {
  id: string;
  name: string;             // user-facing reusable label (e.g. "solo-defender")
  title: string;
  project_path: string;
  engine: string;
  status: SessionStatus;
  run_index: number;         // auto-incrementing per label (1, 2, 3...)
  active_goal_id: string | null;
  working_summary: string | null;
  decisions: string | null;   // JSON: [{decision, reason, wp_id?, at}]
  constraints: string | null; // JSON: string[]
  created_at: string;
  updated_at: string;
}

export interface Goal {
  id: string;
  session_id: string;
  title: string;
  description: string;
  goal_type: GoalType | null;
  source_type: GoalSourceType | null;
  status: GoalStatus;
  completion_rules: string | null; // JSON
  source_file: string | null;
  closeout_summary: string | null; // JSON: structured closeout when goal ends
  created_at: string;
  updated_at: string;
}

export interface WorkPackage {
  id: string;
  goal_id: string;
  parent_wp_id: string | null;
  seq: number;
  title: string;
  description: string;
  status: WPStatus;
  done_criteria: string | null;
  dependencies: string | null; // JSON: [wp_id, ...]
  retry_count: number;
  retry_budget: number;
  last_progress_at: string | null;
  blocker_type: BlockerType | null;
  blocker_detail: string | null;
  created_at: string;
  updated_at: string;
}

export interface Snapshot {
  id: string;
  session_id: string;
  goal_id: string;
  current_wp_id: string | null;
  trigger: SnapshotTrigger;
  summary: string;
  completed_items: string | null;   // JSON
  in_progress_items: string | null; // JSON
  remaining_items: string | null;   // JSON
  decisions: string | null;         // JSON
  constraints: string | null;       // JSON
  related_files: string | null;     // JSON
  blockers_encountered: string | null; // JSON
  assumptions: string | null;           // JSON: string[]
  unresolved_questions: string | null;  // JSON: string[]
  follow_ups: string | null;            // JSON: string[]
  next_action: string;
  run_id: string | null;
  created_at: string;
}

export interface ExecutionAttempt {
  id: string;
  session_id: string;
  goal_id: string;
  wp_id: string | null;
  attempt_no: number;
  run_id: string | null;
  snapshot_id: string | null;
  status: AttemptStatus;
  progress_detected: number; // 0 or 1
  files_changed_count: number;
  wp_completed_count: number;
  prompt_strategy: PromptStrategy | null;
  blocker_type: BlockerType | null;
  blocker_detail: string | null;
  notes: string | null;
  started_at: string;
  ended_at: string | null;
}
