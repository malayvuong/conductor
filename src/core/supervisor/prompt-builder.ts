/**
 * Goal-aware prompt builder.
 *
 * Builds structured prompts for engine execution within the supervisor loop.
 * Each prompt includes: goal context, current WP, snapshot state, strategy instructions.
 */

import type { Goal, WorkPackage, Snapshot, PromptStrategy, Session } from '../../types/supervisor.js';

interface BuildGoalPromptInput {
  session: Session;
  goal: Goal;
  wp: WorkPackage;
  snapshot: Snapshot | null;
  strategy: PromptStrategy;
  allWPs: WorkPackage[];
}

/**
 * Build a goal-driven prompt for the engine.
 */
export function buildGoalPrompt(input: BuildGoalPromptInput): string {
  const { session, goal, wp, snapshot, strategy, allWPs } = input;
  const isAdHoc = goal.source_type === 'inline_task' || goal.goal_type === 'ad_hoc';

  const parts: string[] = [];

  // Header
  parts.push(`You are working in the directory: ${session.project_path}`);
  parts.push('');

  // Goal — ad-hoc tasks get a more directive prompt
  if (isAdHoc) {
    parts.push('## Task');
    parts.push(goal.description);
    parts.push('');
    parts.push('This is a direct task (no plan file). Complete it fully.');
    parts.push('Do NOT claim completion without evidence (changed files, test results, concrete output).');
    parts.push('');
  } else {
    parts.push('## Goal');
    parts.push(goal.description);
    parts.push('');
  }

  // Current WP
  parts.push('## Current work package');
  parts.push(`**${wp.title}**`);
  if (wp.description && wp.description !== wp.title) {
    parts.push('');
    parts.push(wp.description);
  }
  if (wp.done_criteria) {
    parts.push('');
    parts.push(`Done when: ${wp.done_criteria}`);
  }
  parts.push('');

  // State from snapshot
  if (snapshot) {
    appendSnapshotContext(parts, snapshot);
  }

  // Strategy-specific instructions
  appendStrategyInstructions(parts, strategy, snapshot);

  // Remaining work (brief, for context only) — only for plan mode
  if (!isAdHoc) {
    const remaining = allWPs.filter(w => w.status === 'pending' && w.id !== wp.id);
    if (remaining.length > 0) {
      parts.push('## Remaining work packages (for context, do not work on these now)');
      for (const r of remaining) {
        parts.push(`- ${r.title}`);
      }
      parts.push('');
    }
  }

  // Reporting instructions — ad-hoc tasks get stricter requirements
  parts.push('## When you finish');
  parts.push('Write a brief structured report with:');
  parts.push('- ## Summary — what you did');
  parts.push('- ## Files Changed — list of files you created or modified');
  parts.push('- ## Status — "completed" if the work package is done, or "in_progress" with what remains');
  parts.push('- ## Blockers — any issues that prevent completion (if any)');

  if (isAdHoc) {
    parts.push('');
    parts.push('IMPORTANT: Only report "completed" if you have concrete evidence:');
    parts.push('- Files were actually changed or created');
    parts.push('- Tests pass (if applicable)');
    parts.push('- The task objective is verifiably met');
    parts.push('Do NOT report "completed" based on analysis alone — take action.');
  }

  parts.push('');
  parts.push('If applicable, also include:');
  parts.push('- ## Assumptions Made — list any assumptions you made during this work');
  parts.push('- ## Open Questions — anything unclear that needs human input');
  parts.push('- ## Follow-up Items — work outside current scope that should be done next');
  parts.push('- ## Constraints Discovered — any technical/business constraints you encountered');

  return parts.join('\n');
}

function appendSnapshotContext(parts: string[], snapshot: Snapshot): void {
  // Completed items
  const completed = parseJSON(snapshot.completed_items) as any[];
  if (completed && completed.length > 0) {
    parts.push('## Already completed (DO NOT redo these)');
    for (const item of completed) {
      const summary = item.result_summary ? `: ${item.result_summary}` : '';
      parts.push(`- ${item.title}${summary}`);
    }
    parts.push('');
  }

  // Decisions
  const decisions = parseJSON(snapshot.decisions) as any[];
  if (decisions && decisions.length > 0) {
    parts.push('## Decisions already made (follow these)');
    for (const d of decisions) {
      const reason = d.reason ? ` (reason: ${d.reason})` : '';
      parts.push(`- ${d.decision}${reason}`);
    }
    parts.push('');
  }

  // Related files
  const files = parseJSON(snapshot.related_files) as string[];
  if (files && files.length > 0) {
    parts.push('## Files involved so far');
    for (const f of files) {
      parts.push(`- ${f}`);
    }
    parts.push('');
  }

  // Blockers encountered
  const blockers = parseJSON(snapshot.blockers_encountered) as any[];
  if (blockers && blockers.length > 0) {
    parts.push('## Blockers encountered and resolved');
    for (const b of blockers) {
      const resolution = b.resolution ? ` → ${b.resolution}` : '';
      parts.push(`- ${b.detail}${resolution}`);
    }
    parts.push('');
  }

  // In-progress context
  const inProgress = parseJSON(snapshot.in_progress_items) as any[];
  if (inProgress && inProgress.length > 0) {
    parts.push('## Work in progress');
    for (const item of inProgress) {
      const progress = item.progress_so_far ? `: ${item.progress_so_far}` : '';
      parts.push(`- ${item.title}${progress}`);
    }
    parts.push('');
  }
}

function appendStrategyInstructions(parts: string[], strategy: PromptStrategy, snapshot: Snapshot | null): void {
  const nextAction = snapshot?.next_action || 'Complete the current work package.';

  switch (strategy) {
    case 'normal':
      parts.push('## Instructions');
      parts.push('Complete the current work package. When done, move on if the scope allows.');
      break;

    case 'focused':
      parts.push('## Instructions (focused retry)');
      parts.push('Previous attempt did not make sufficient progress on this work package.');
      parts.push(`Focus specifically on: ${nextAction}`);
      parts.push('Do NOT re-scan or re-explore what was already done.');
      break;

    case 'surgical':
      parts.push('## Instructions (surgical)');
      parts.push('Multiple attempts have not resolved this work package.');
      parts.push(`Do ONLY this one thing: ${nextAction}`);
      parts.push('Do not explore. Do not scan. Just do the action.');
      break;

    case 'recovery':
      parts.push('## Instructions (recovery mode)');
      parts.push('This work package has failed multiple times. Analyze what went wrong and either:');
      parts.push(`1. Complete the specific action: ${nextAction}`);
      parts.push('2. Report clearly what is blocking you and why you cannot proceed.');
      break;
  }

  parts.push('');
}

function parseJSON(json: string | null): any[] | null {
  if (!json) return null;
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : null;
  } catch { return null; }
}
