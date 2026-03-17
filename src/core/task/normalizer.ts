import type { TaskType } from '../../types/index.js';

interface NormalizeInput {
  raw_input: string;
  workspace_path: string;
  engine: string;
}

interface NormalizedTask {
  raw_input: string;
  workspace_path: string;
  engine: string;
  task_type: TaskType;
}

const DEBUG_FIX_PATTERNS = [
  /sửa/i, /fix/i, /lỗi/i, /bug/i, /error/i, /broken/i,
  /không\s*(load|chạy|hoạt động|hiện|work)/i, /crash/i, /fail/i,
];

const SCAN_REVIEW_PATTERNS = [
  /review/i, /scan/i, /kiểm\s*tra/i, /audit/i, /check/i, /inspect/i,
  /analyze/i, /phân\s*tích/i,
];

const IMPLEMENT_PATTERNS = [
  /thêm/i, /add/i, /implement/i, /create/i, /build/i, /tạo/i,
  /tính\s*năng/i, /feature/i, /new/i,
];

const VERIFY_PATTERNS = [
  /verify/i, /xác\s*nhận/i, /test\s+only/i, /chạy\s+test/i,
  /validate/i, /confirm/i,
];

export function classifyTaskType(input: string): TaskType {
  // Priority order: debug_fix > scan_review > implement > verify > default
  for (const pattern of DEBUG_FIX_PATTERNS) {
    if (pattern.test(input)) return 'debug_fix';
  }
  for (const pattern of SCAN_REVIEW_PATTERNS) {
    if (pattern.test(input)) return 'scan_review';
  }
  for (const pattern of IMPLEMENT_PATTERNS) {
    if (pattern.test(input)) return 'implement_feature';
  }
  for (const pattern of VERIFY_PATTERNS) {
    if (pattern.test(input)) return 'verify_only';
  }
  // Default
  return 'debug_fix';
}

export function normalizeTask(input: NormalizeInput): NormalizedTask {
  const task_type = classifyTaskType(input.raw_input);
  return {
    raw_input: input.raw_input,
    workspace_path: input.workspace_path,
    engine: input.engine,
    task_type,
  };
}
