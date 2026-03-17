import { describe, it, expect } from 'vitest';
import { extractInsightsFromReport, type ExtractedInsights } from '../../src/core/supervisor/compactor.js';
import type { RunReport } from '../../src/types/index.js';

function makeReport(overrides: Partial<RunReport> = {}): RunReport {
  return {
    id: 'r1', run_id: 'run1', summary: '', files_inspected_json: null,
    files_changed_json: null, verification_notes: null, final_output: null,
    root_cause: null, fix_applied: null, remaining_risks: null,
    findings: null, risks: null, recommendations: null,
    what_implemented: null, follow_ups: null,
    ...overrides,
  };
}

describe('extractInsightsFromReport', () => {
  it('returns empty insights for null report', () => {
    const result = extractInsightsFromReport(null);
    expect(result.decisions).toHaveLength(0);
    expect(result.assumptions).toHaveLength(0);
    expect(result.unresolved_questions).toHaveLength(0);
    expect(result.follow_ups).toHaveLength(0);
    expect(result.constraints).toHaveLength(0);
  });

  it('extracts decisions from ## Decisions section', () => {
    const report = makeReport({
      final_output: '## Decisions\n- Use PostgreSQL\n- Switch to REST API\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.decisions).toHaveLength(2);
    expect(result.decisions[0].decision).toBe('Use PostgreSQL');
  });

  it('extracts assumptions from ## Assumptions Made section', () => {
    const report = makeReport({
      final_output: '## Assumptions Made\n- Database already has user table\n- Auth middleware handles JWT\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.assumptions).toHaveLength(2);
    expect(result.assumptions[0]).toBe('Database already has user table');
  });

  it('extracts open questions from ## Open Questions section', () => {
    const report = makeReport({
      final_output: '## Open Questions\n- Should admin API require 2FA?\n- What is the rate limit?\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.unresolved_questions).toHaveLength(2);
  });

  it('extracts follow-ups from ## Follow-up Items section', () => {
    const report = makeReport({
      final_output: '## Follow-up Items\n- Add rate limiting\n- Write integration tests\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.follow_ups).toHaveLength(2);
  });

  it('extracts constraints from ## Constraints Discovered section', () => {
    const report = makeReport({
      final_output: '## Constraints Discovered\n- Must support PostgreSQL 14+\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.constraints).toHaveLength(1);
    expect(result.constraints[0]).toBe('Must support PostgreSQL 14+');
  });

  it('falls back to pattern matching for assumptions', () => {
    const report = makeReport({
      summary: 'Assuming that the database is PostgreSQL. Completed the task.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
  });

  it('falls back to pattern matching for follow-ups', () => {
    const report = makeReport({
      summary: 'Done. TODO: add rate limiting to the API endpoints.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.follow_ups.length).toBeGreaterThanOrEqual(1);
  });

  it('extracts from multiple text fields', () => {
    const report = makeReport({
      summary: 'Used PostgreSQL. TODO: add tests.',
      final_output: '## Assumptions Made\n- Config file exists\n\n## Summary\nDone.',
    });
    const result = extractInsightsFromReport(report);
    expect(result.assumptions.length).toBeGreaterThanOrEqual(1);
    expect(result.follow_ups.length).toBeGreaterThanOrEqual(1);
  });

  it('caps results at 10 per category', () => {
    const bullets = Array.from({ length: 15 }, (_, i) => `- Item ${i + 1}`).join('\n');
    const report = makeReport({
      final_output: `## Assumptions Made\n${bullets}\n\n## Summary\nDone.`,
    });
    const result = extractInsightsFromReport(report);
    expect(result.assumptions.length).toBeLessThanOrEqual(10);
  });
});
