/**
 * Compactor — builds snapshots between runs.
 *
 * A snapshot captures the full state of goal execution so that
 * the next run can continue seamlessly without repeating work.
 */

import type { WorkPackage, Snapshot, SnapshotTrigger } from '../../types/supervisor.js';
import type { RunReport } from '../../types/index.js';

interface BuildSnapshotInput {
  sessionId: string;
  goalId: string;
  currentWP: WorkPackage;
  allWPs: WorkPackage[];
  report: RunReport | null;
  previousSnapshot: Snapshot | null;
  trigger: SnapshotTrigger;
  runId: string | null;
}

export interface SnapshotData {
  session_id: string;
  goal_id: string;
  current_wp_id: string;
  trigger: SnapshotTrigger;
  summary: string;
  completed_items: string;
  in_progress_items: string;
  remaining_items: string;
  decisions: string;
  constraints: string;
  related_files: string;
  blockers_encountered: string;
  assumptions: string;
  unresolved_questions: string;
  follow_ups: string;
  next_action: string;
  run_id: string | null;
}

/**
 * Build a snapshot from the current state after a run.
 */
export function buildSnapshotData(input: BuildSnapshotInput): SnapshotData {
  const { sessionId, goalId, currentWP, allWPs, report, previousSnapshot, trigger, runId } = input;

  // Categorize WPs
  const completed = allWPs.filter(wp => wp.status === 'completed');
  const active = allWPs.filter(wp => wp.status === 'active');
  const pending = allWPs.filter(wp => wp.status === 'pending');
  const blocked = allWPs.filter(wp => wp.status === 'blocked' || wp.status === 'failed');

  // Build completed items
  const completedItems = completed.map(wp => ({
    wp_id: wp.id,
    title: wp.title,
    result_summary: '', // Could be enriched from reports
  }));

  // Build in-progress items
  const inProgressItems = active.map(wp => ({
    wp_id: wp.id,
    title: wp.title,
    progress_so_far: report?.summary?.slice(0, 200) || '',
  }));

  // Build remaining items
  const remainingItems = pending.map(wp => ({
    wp_id: wp.id,
    title: wp.title,
  }));

  // Merge related files
  const prevFiles = safeParseArray(previousSnapshot?.related_files);
  const newInspected = safeParseArray(report?.files_inspected_json);
  const newChanged = safeParseArray(report?.files_changed_json);
  const allFiles = [...new Set([...prevFiles, ...newInspected, ...newChanged])];

  // Merge decisions — extract from report content
  const insights = extractInsightsFromReport(report);
  const extractedDecisions = insights.decisions;
  const prevDecisions = safeParseArray(previousSnapshot?.decisions);
  const allDecisions = mergeUnique(prevDecisions, extractedDecisions, d => typeof d === 'string' ? d : d.decision);

  // Merge constraints
  const prevConstraints = safeParseArray(previousSnapshot?.constraints);

  // Gather blockers
  const blockerItems = blocked.map(wp => ({
    type: wp.blocker_type || 'unknown',
    detail: wp.blocker_detail || wp.title,
    resolution: wp.status === 'completed' ? 'resolved' : 'unresolved',
  }));

  // Build summary
  const summary = buildCompactSummary(report, trigger, completed.length, allWPs.length);

  // Determine next action
  const nextAction = determineNextAction(currentWP, pending, report);

  return {
    session_id: sessionId,
    goal_id: goalId,
    current_wp_id: currentWP.id,
    trigger,
    summary,
    completed_items: JSON.stringify(completedItems),
    in_progress_items: JSON.stringify(inProgressItems),
    remaining_items: JSON.stringify(remainingItems),
    decisions: JSON.stringify(allDecisions),
    constraints: JSON.stringify(prevConstraints),
    related_files: JSON.stringify(allFiles),
    blockers_encountered: JSON.stringify(blockerItems),
    assumptions: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.assumptions), insights.assumptions)),
    unresolved_questions: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.unresolved_questions), insights.unresolved_questions)),
    follow_ups: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.follow_ups), insights.follow_ups)),
    next_action: nextAction,
    run_id: runId,
  };
}

function buildCompactSummary(
  report: RunReport | null, trigger: SnapshotTrigger,
  completedCount: number, totalCount: number,
): string {
  const progress = `${completedCount}/${totalCount} WPs completed`;

  if (!report) {
    return `${progress}. Trigger: ${trigger}. No report available.`;
  }

  const reportSummary = report.summary?.slice(0, 300) || 'No summary.';
  return `${progress}. ${reportSummary}`;
}

function determineNextAction(
  currentWP: WorkPackage, pendingWPs: WorkPackage[], report: RunReport | null,
): string {
  // If current WP is still active, continue it
  if (currentWP.status === 'active' || currentWP.status === 'pending') {
    if (report?.summary) {
      return `Continue work on "${currentWP.title}". Previous run progress: ${report.summary.slice(0, 200)}`;
    }
    return `Complete "${currentWP.title}"`;
  }

  // Current WP done — next pending WP
  if (pendingWPs.length > 0) {
    return `Start "${pendingWPs[0].title}"`;
  }

  return 'All work packages completed. Verify final state.';
}

function safeParseArray(json: string | null | undefined): any[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}

/** @deprecated Use extractInsightsFromReport instead */
export function extractDecisionsFromReport(report: RunReport | null): Array<{ decision: string; reason?: string }> {
  return extractInsightsFromReport(report).decisions;
}

export interface ExtractedInsights {
  decisions: Array<{ decision: string; reason?: string }>;
  assumptions: string[];
  unresolved_questions: string[];
  follow_ups: string[];
  constraints: string[];
}

export function extractInsightsFromReport(report: RunReport | null): ExtractedInsights {
  if (!report) return { decisions: [], assumptions: [], unresolved_questions: [], follow_ups: [], constraints: [] };

  const decisions: Array<{ decision: string; reason?: string }> = [];
  const assumptions: string[] = [];
  const unresolvedQuestions: string[] = [];
  const followUps: string[] = [];
  const constraints: string[] = [];

  const texts = [report.final_output, report.summary, report.what_implemented].filter(Boolean) as string[];

  for (const text of texts) {
    // --- Structured section extraction ---
    extractSection(text, /##\s*(?:Design\s+)?Decisions?\s*\n([\s\S]*?)(?=\n##|$)/i, decisions, d => ({ decision: d }));
    extractSectionStrings(text, /##\s*Assumptions?\s*Made?\s*\n([\s\S]*?)(?=\n##|$)/i, assumptions);
    extractSectionStrings(text, /##\s*Open\s*Questions?\s*\n([\s\S]*?)(?=\n##|$)/i, unresolvedQuestions);
    extractSectionStrings(text, /##\s*Follow[- ]?up\s*Items?\s*\n([\s\S]*?)(?=\n##|$)/i, followUps);
    extractSectionStrings(text, /##\s*Constraints?\s*Discovered?\s*\n([\s\S]*?)(?=\n##|$)/i, constraints);

    // --- Decision pattern fallback ---
    const decisionPatterns = [
      /(?:decided|choosing|chose) to (.{10,100}?)(?:\.|$)/gi,
      /(?:switched|changed) from (.{5,60}) to (.{5,60})(?:\.|$)/gi,
      /(?:using|adopted|picked) (.{5,80}) (?:instead of|over|rather than) (.{5,80})(?:\.|$)/gi,
    ];
    for (const pattern of decisionPatterns) {
      let match;
      while ((match = pattern.exec(text)) !== null) {
        const decision = match[0].trim().replace(/\.$/, '');
        if (!decisions.some(d => d.decision === decision)) {
          decisions.push({ decision });
        }
      }
    }

    // --- Pattern fallback for other categories ---
    const assumptionPattern = /assuming that (.{10,150}?)(?:\.|$)/gi;
    let match;
    while ((match = assumptionPattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (!assumptions.includes(item)) assumptions.push(item);
    }

    const todoPattern = /TODO:\s*(.{5,150}?)(?:\.|$)/gi;
    while ((match = todoPattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (!followUps.includes(item)) followUps.push(item);
    }
  }

  return {
    decisions: decisions.slice(0, 10),
    assumptions: assumptions.slice(0, 10),
    unresolved_questions: unresolvedQuestions.slice(0, 10),
    follow_ups: followUps.slice(0, 10),
    constraints: constraints.slice(0, 10),
  };
}

function extractSection<T>(text: string, pattern: RegExp, target: T[], transform: (bullet: string) => T): void {
  const match = pattern.exec(text);
  if (!match) return;
  const lines = match[1].split('\n');
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.+)/.exec(line);
    if (bullet) {
      target.push(transform(bullet[1].trim()));
    }
  }
}

function extractSectionStrings(text: string, pattern: RegExp, target: string[]): void {
  const match = pattern.exec(text);
  if (!match) return;
  const lines = match[1].split('\n');
  for (const line of lines) {
    const bullet = /^\s*[-*]\s+(.+)/.exec(line);
    if (bullet) {
      const item = bullet[1].trim();
      if (!target.includes(item)) target.push(item);
    }
  }
}

function mergeUnique<T>(existing: T[], additions: T[], key: (item: T) => string): T[] {
  const seen = new Set(existing.map(key));
  const merged = [...existing];
  for (const item of additions) {
    const k = key(item);
    if (!seen.has(k)) {
      seen.add(k);
      merged.push(item);
    }
  }
  return merged;
}

function mergeStringArrays(existing: string[], additions: string[]): string[] {
  const seen = new Set(existing);
  const merged = [...existing];
  for (const item of additions) {
    if (!seen.has(item)) {
      seen.add(item);
      merged.push(item);
    }
  }
  return merged;
}
