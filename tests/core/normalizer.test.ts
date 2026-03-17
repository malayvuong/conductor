import { describe, it, expect } from 'vitest';
import { normalizeTask, classifyTaskType } from '../../src/core/task/normalizer.js';

describe('classifyTaskType', () => {
  it('detects debug_fix from Vietnamese keywords', () => {
    expect(classifyTaskType('sửa lỗi login không load được')).toBe('debug_fix');
    expect(classifyTaskType('fix the broken handler')).toBe('debug_fix');
    expect(classifyTaskType('không load data, kiểm tra và sửa')).toBe('debug_fix');
  });

  it('detects scan_review', () => {
    expect(classifyTaskType('review code quality in auth module')).toBe('scan_review');
    expect(classifyTaskType('kiểm tra toàn bộ API endpoints')).toBe('scan_review');
    expect(classifyTaskType('scan for security issues')).toBe('scan_review');
  });

  it('detects implement_feature', () => {
    expect(classifyTaskType('thêm tính năng export CSV')).toBe('implement_feature');
    expect(classifyTaskType('add dark mode toggle')).toBe('implement_feature');
    expect(classifyTaskType('implement pagination for users list')).toBe('implement_feature');
  });

  it('detects verify_only', () => {
    expect(classifyTaskType('verify the deployment works')).toBe('verify_only');
    expect(classifyTaskType('chạy test và xác nhận kết quả')).toBe('verify_only');
    expect(classifyTaskType('validate the output format')).toBe('verify_only');
  });

  it('defaults to debug_fix for ambiguous input', () => {
    expect(classifyTaskType('something is wrong with the app')).toBe('debug_fix');
  });
});

describe('normalizeTask', () => {
  it('produces normalized object', () => {
    const result = normalizeTask({
      raw_input: 'trong base-admin, phần cms-management không load data; hãy sửa',
      workspace_path: '/tmp/project',
      engine: 'claude',
    });

    expect(result.task_type).toBe('debug_fix');
    expect(result.raw_input).toBe('trong base-admin, phần cms-management không load data; hãy sửa');
    expect(result.workspace_path).toBe('/tmp/project');
    expect(result.engine).toBe('claude');
  });
});
