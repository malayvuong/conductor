# Operational UX Phase — Implementation Plan

> **For agentic workers:** REQUIRED: Use superpowers:subagent-driven-development (if subagents available) or superpowers:executing-plans to implement this plan. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make Conductor comfortable for daily use with live progress output, inspect drill-down, and session management commands.

**Architecture:** Two waves. Wave 1 adds user-facing UX (progress reporter, inspect flags, session commands). Wave 2 adds hygiene guardrails and enhanced compaction. Each task is self-contained with tests.

**Tech Stack:** TypeScript, vitest, better-sqlite3, commander

**Spec:** `docs/superpowers/specs/2026-03-17-operational-ux-design.md`

---

## Chunk 1: Wave 1 — User-Facing UX

### Task 1: Progress Reporter — Pure Functions

**Files:**
- Create: `src/core/supervisor/progress-reporter.ts`
- Create: `tests/core/progress-reporter.test.ts`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/core/progress-reporter.test.ts
import { describe, it, expect } from 'vitest';
import { formatProgressEvent, type ProgressEvent } from '../../src/core/supervisor/progress-reporter.js';

describe('formatProgressEvent', () => {
  it('formats goal_start as header', () => {
    const event: ProgressEvent = { type: 'goal_start', session: 'cms-project', goal: 'Implement CMS' };
    expect(formatProgressEvent(event)).toBe('── session: cms-project | goal: Implement CMS ──');
  });

  it('formats wp_start', () => {
    const event: ProgressEvent = { type: 'wp_start', wpIndex: 1, wpTotal: 3, title: 'Scan structure', attempt: 1, strategy: 'normal' };
    expect(formatProgressEvent(event)).toBe('[WP 1/3] Scan structure — attempt 1 (normal)');
  });

  it('formats wp_progress', () => {
    const event: ProgressEvent = { type: 'wp_progress', wpIndex: 1, wpTotal: 3, detail: '3 files inspected' };
    expect(formatProgressEvent(event)).toBe('[WP 1/3] ✓ progress — 3 files inspected');
  });

  it('formats wp_completed', () => {
    const event: ProgressEvent = { type: 'wp_completed', wpIndex: 2, wpTotal: 3 };
    expect(formatProgressEvent(event)).toBe('[WP 2/3] ✓ completed');
  });

  it('formats wp_failed', () => {
    const event: ProgressEvent = { type: 'wp_failed', wpIndex: 3, wpTotal: 3, reason: 'retries exhausted' };
    expect(formatProgressEvent(event)).toBe('[WP 3/3] ✗ failed (retries exhausted)');
  });

  it('formats hard_blocker', () => {
    const event: ProgressEvent = { type: 'hard_blocker', wpIndex: 2, wpTotal: 3, detail: 'missing test framework' };
    expect(formatProgressEvent(event)).toBe('[WP 2/3] ⚠ hard blocker: missing test framework');
  });

  it('formats goal_end as footer', () => {
    const event: ProgressEvent = { type: 'goal_end', completed: 2, total: 3, attempts: 3, cost: 0.1842 };
    expect(formatProgressEvent(event)).toBe('── result: 2/3 completed | 3 attempts | $0.1842 ──');
  });

  it('formats goal_end with zero cost', () => {
    const event: ProgressEvent = { type: 'goal_end', completed: 1, total: 1, attempts: 1, cost: 0 };
    expect(formatProgressEvent(event)).toBe('── result: 1/1 completed | 1 attempts | $0.0000 ──');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/progress-reporter.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement progress-reporter.ts**

```typescript
// src/core/supervisor/progress-reporter.ts
/**
 * Progress Reporter — formats execution events as compact single-line output.
 *
 * Pure functions only. Does not call console.log — caller decides output.
 */

export type ProgressEvent =
  | { type: 'goal_start'; session: string; goal: string }
  | { type: 'wp_start'; wpIndex: number; wpTotal: number; title: string; attempt: number; strategy: string }
  | { type: 'wp_progress'; wpIndex: number; wpTotal: number; detail: string }
  | { type: 'wp_completed'; wpIndex: number; wpTotal: number }
  | { type: 'wp_failed'; wpIndex: number; wpTotal: number; reason: string }
  | { type: 'hard_blocker'; wpIndex: number; wpTotal: number; detail: string }
  | { type: 'goal_end'; completed: number; total: number; attempts: number; cost: number };

/**
 * Format a progress event into a single display line.
 */
export function formatProgressEvent(event: ProgressEvent): string {
  switch (event.type) {
    case 'goal_start':
      return `── session: ${event.session} | goal: ${event.goal} ──`;

    case 'wp_start':
      return `[WP ${event.wpIndex}/${event.wpTotal}] ${event.title} — attempt ${event.attempt} (${event.strategy})`;

    case 'wp_progress':
      return `[WP ${event.wpIndex}/${event.wpTotal}] ✓ progress — ${event.detail}`;

    case 'wp_completed':
      return `[WP ${event.wpIndex}/${event.wpTotal}] ✓ completed`;

    case 'wp_failed':
      return `[WP ${event.wpIndex}/${event.wpTotal}] ✗ failed (${event.reason})`;

    case 'hard_blocker':
      return `[WP ${event.wpIndex}/${event.wpTotal}] ⚠ hard blocker: ${event.detail}`;

    case 'goal_end':
      return `── result: ${event.completed}/${event.total} completed | ${event.attempts} attempts | $${event.cost.toFixed(4)} ──`;
  }
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/progress-reporter.test.ts`
Expected: 8 tests PASS

- [ ] **Step 5: Commit**

```bash
git add src/core/supervisor/progress-reporter.ts tests/core/progress-reporter.test.ts
git commit -m "feat: add progress reporter pure functions"
```

---

### Task 2: Integrate Progress Reporter into Loop

**Files:**
- Modify: `src/core/supervisor/loop.ts`

**Context:** Replace scattered `log.info()` calls and `process.stdout.write('.')` with progress reporter events. The loop currently outputs via `log.info()` at lines 70-72, 132-136, 197-210, 234. The streaming dots are at line 333.

- [ ] **Step 1: Add import and emit helper to loop.ts**

At the top of `src/core/supervisor/loop.ts`, add:

```typescript
import { formatProgressEvent, type ProgressEvent } from './progress-reporter.js';
```

Add a helper function before `executeGoal`:

```typescript
function emit(event: ProgressEvent): void {
  console.log(formatProgressEvent(event));
}
```

- [ ] **Step 2: Replace goal start output (lines 70-72)**

Replace:
```typescript
  log.info(`Executing goal: ${goal.title}`);
  log.info(`Engine: ${session.engine} | Path: ${session.project_path}`);
  console.log('');
```

With:
```typescript
  emit({ type: 'goal_start', session: session.name, goal: goal.title });
  console.log('');
```

- [ ] **Step 3: Replace attempt/WP start output (lines 131-136)**

Replace:
```typescript
      totalAttempts++;
      log.info(`--- Attempt ${totalAttempts} ---`);
      log.info(`WP: ${wp.title} (${wp.status}, retry ${wp.retry_count}/${wp.retry_budget})`);
      log.info(`Strategy: ${strategy}`);
      log.info(`Prompt: ${prompt.length} chars`);
      console.log('');
```

With:
```typescript
      totalAttempts++;
      // Find WP index (1-based seq position) — used throughout this iteration
      let wpIndex = wps.findIndex(w => w.id === wp.id) + 1;
      emit({ type: 'wp_start', wpIndex, wpTotal: wps.length, title: wp.title, attempt: wp.retry_count + 1, strategy });
```

- [ ] **Step 4: Replace WP result output (lines 194-211)**

Replace the block from `if (isWPCompleted(report, isAdHoc))` through the no-progress else. Note: `wpIndex` was already declared with `let` in Step 3, so reuse it here without redeclaring:

```typescript
      const isAdHoc = goal.source_type === 'inline_task' || goal.goal_type === 'ad_hoc';

      if (isWPCompleted(report, isAdHoc)) {
        updateWPStatus(db, wp.id, 'completed');
        updateWPProgress(db, wp.id);
        emit({ type: 'wp_completed', wpIndex, wpTotal: wps.length });
      } else if (progress.hasProgress) {
        updateWPProgress(db, wp.id);
        emit({ type: 'wp_progress', wpIndex, wpTotal: wps.length, detail: progress.indicators.join(', ') });
      } else {
        // No progress — increment retry
        incrementWPRetry(db, wp.id);
        const updatedWP = getWPById(db, wp.id)!;
        if (updatedWP.retry_count >= updatedWP.retry_budget) {
          updateWPStatus(db, wp.id, 'failed');
          updateWPBlocker(db, wp.id, 'soft', 'Retry budget exhausted without progress');
          emit({ type: 'wp_failed', wpIndex, wpTotal: wps.length, reason: 'retries exhausted' });
        } else {
          emit({ type: 'wp_failed', wpIndex, wpTotal: wps.length, reason: `no progress, retry ${updatedWP.retry_count}/${updatedWP.retry_budget}` });
        }
      }
```

- [ ] **Step 5: Replace hard blocker output (around line 172)**

After detecting hard blocker, before returning, add:

```typescript
        emit({ type: 'hard_blocker', wpIndex: wps.findIndex(w => w.id === wp.id) + 1, wpTotal: wps.length, detail: hardBlocker.detail });
```

- [ ] **Step 6: Suppress streaming dots (line 333)**

In the `onLine` callback inside `executeEngineRun`, replace:
```typescript
          if (parsed.display) {
            process.stdout.write('.');
          }
```
With:
```typescript
          // Streaming output suppressed — progress reporter handles state updates
```

Also remove the `process.stdout.write('\n');` after `heartbeat.stop()` (line 351).

- [ ] **Step 7: Remove standalone console.log('') calls**

Remove the `console.log('');` at line 234 (end of while loop body). The progress reporter handles spacing.

- [ ] **Step 8: Add goal_end emit in execute.ts**

In `src/cli/commands/execute.ts`, replace the final output block (lines 104-114):

```typescript
      // Final output
      console.log('');
      console.log('═══════════════════════════════════');
      console.log(`Result:     ${result.status}`);
      console.log(`Attempts:   ${result.totalAttempts}`);
      console.log(`Total cost: $${result.totalCost.toFixed(4)}`);
      console.log(`Message:    ${result.message}`);
      console.log('═══════════════════════════════════');
```

First, add static imports at the top of `src/cli/commands/execute.ts`:

```typescript
import { formatProgressEvent } from '../../core/supervisor/progress-reporter.js';
import { getWPsByGoal } from '../../core/storage/supervisor-repository.js';
import { countWPsByStatus } from '../../core/supervisor/scheduler.js';
```

Then replace the final output block with:
```typescript
      // Final output
      console.log('');
      const wps = getWPsByGoal(db, goal.id);
      const counts = countWPsByStatus(wps);
      console.log(formatProgressEvent({
        type: 'goal_end',
        completed: counts.completed || 0,
        total: wps.length,
        attempts: result.totalAttempts,
        cost: result.totalCost,
      }));
```

- [ ] **Step 9: Run all tests**

Run: `npx vitest run`
Expected: All existing tests PASS (no behavioral change in test-visible code)

- [ ] **Step 10: Commit**

```bash
git add src/core/supervisor/loop.ts src/cli/commands/execute.ts
git commit -m "feat: integrate progress reporter into supervisor loop"
```

---

### Task 3: Session Helper Functions — Extract Shared Primitives

**Files:**
- Modify: `src/cli/commands/session.ts`
- Modify: `src/core/storage/supervisor-repository.ts`
- Create: `tests/core/session-commands.test.ts`

**Context:** Extract `pauseCurrentSession()` and `activateSession()` as shared primitives. Also add `getGoalBySeq()` to repository.

- [ ] **Step 1: Write failing tests for shared functions**

```typescript
// tests/core/session-commands.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/core/storage/db.js';
import {
  createSession, createGoal, createWorkPackage,
  getSessionById, getGoalById, getGoalsBySession, getGoalBySeq,
  updateSessionStatus, updateGoalStatus, updateSessionGoal,
} from '../../src/core/storage/supervisor-repository.js';
import { pauseCurrentSession, activateSession } from '../../src/cli/commands/session.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getGoalBySeq', () => {
  it('returns goal by 1-based sequence number', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    createGoal(db, { session_id: s.id, title: 'G1', description: 'd1' });
    createGoal(db, { session_id: s.id, title: 'G2', description: 'd2' });
    createGoal(db, { session_id: s.id, title: 'G3', description: 'd3' });

    expect(getGoalBySeq(db, s.id, 1)!.title).toBe('G1');
    expect(getGoalBySeq(db, s.id, 2)!.title).toBe('G2');
    expect(getGoalBySeq(db, s.id, 3)!.title).toBe('G3');
  });

  it('returns undefined for out of range seq', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    createGoal(db, { session_id: s.id, title: 'G1', description: 'd1' });

    expect(getGoalBySeq(db, s.id, 0)).toBeUndefined();
    expect(getGoalBySeq(db, s.id, 2)).toBeUndefined();
  });
});

describe('pauseCurrentSession', () => {
  it('pauses session and active goal', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');
    const g = createGoal(db, { session_id: s.id, title: 'G', description: 'd' });
    updateGoalStatus(db, g.id, 'active');
    updateSessionGoal(db, s.id, g.id);

    const updated = getSessionById(db, s.id)!;
    pauseCurrentSession(db, updated);

    expect(getSessionById(db, s.id)!.status).toBe('paused');
    expect(getGoalById(db, g.id)!.status).toBe('paused');
  });

  it('does nothing if no active goal', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');

    const updated = getSessionById(db, s.id)!;
    pauseCurrentSession(db, updated);

    expect(getSessionById(db, s.id)!.status).toBe('paused');
  });

  it('skips completed goals when pausing', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');
    const g = createGoal(db, { session_id: s.id, title: 'G', description: 'd' });
    updateGoalStatus(db, g.id, 'completed');
    updateSessionGoal(db, s.id, g.id);

    const updated = getSessionById(db, s.id)!;
    pauseCurrentSession(db, updated);

    expect(getGoalById(db, g.id)!.status).toBe('completed');
    expect(getSessionById(db, s.id)!.status).toBe('paused');
  });
});

describe('activateSession', () => {
  it('sets session to active', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'paused');

    activateSession(db, s.id);

    expect(getSessionById(db, s.id)!.status).toBe('active');
  });

  it('sets most recent paused goal as active_goal_id', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g1 = createGoal(db, { session_id: s.id, title: 'G1', description: 'd1' });
    updateGoalStatus(db, g1.id, 'completed');
    const g2 = createGoal(db, { session_id: s.id, title: 'G2', description: 'd2' });
    updateGoalStatus(db, g2.id, 'paused');

    activateSession(db, s.id);

    expect(getSessionById(db, s.id)!.active_goal_id).toBe(g2.id);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/session-commands.test.ts`
Expected: FAIL — functions not exported

- [ ] **Step 3: Add getGoalBySeq to supervisor-repository.ts**

Add to `src/core/storage/supervisor-repository.ts` in the Goals section:

```typescript
export function getGoalBySeq(db: Database.Database, sessionId: string, seq: number): Goal | undefined {
  if (seq < 1) return undefined;
  const goals = db.prepare(
    'SELECT * FROM goals WHERE session_id = ? ORDER BY created_at ASC, rowid ASC'
  ).all(sessionId) as Goal[];
  return goals[seq - 1];
}
```

- [ ] **Step 4: Add pauseCurrentSession and activateSession to session.ts**

Add these exported functions in `src/cli/commands/session.ts` after the `resolveSession` function:

```typescript
/**
 * Pause a session and its active goal (if unfinished).
 * Shared primitive used by: switch, pause commands.
 */
export function pauseCurrentSession(db: import('better-sqlite3').Database, session: Session): void {
  // Pause active goal if unfinished
  if (session.active_goal_id) {
    const goal = getGoalById(db, session.active_goal_id);
    if (goal && isUnfinished(goal.status)) {
      updateGoalStatus(db, goal.id, 'paused');
    }
  }
  updateSessionStatus(db, session.id, 'paused');
}

/**
 * Activate a session and set its most recent paused/created goal as active.
 * Shared primitive used by: switch, resume commands.
 */
export function activateSession(db: import('better-sqlite3').Database, sessionId: string): void {
  updateSessionStatus(db, sessionId, 'active');
  // Find most recent paused/created goal (by updated_at DESC — most recently worked on)
  const resumable = db.prepare(
    `SELECT * FROM goals WHERE session_id = ? AND status IN ('paused', 'created') ORDER BY updated_at DESC LIMIT 1`
  ).get(sessionId) as import('../../types/supervisor.js').Goal | undefined;
  if (resumable) {
    updateSessionGoal(db, sessionId, resumable.id);
  }
}

function isUnfinished(status: string): boolean {
  return status === 'created' || status === 'active' || status === 'paused';
}
```

Add the needed imports at the top of `session.ts` — `getGoalById`, `updateGoalStatus`, `updateSessionGoal` should already be imported. Verify and add any missing ones.

- [ ] **Step 5: Run tests to verify they pass**

Run: `npx vitest run tests/core/session-commands.test.ts`
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/storage/supervisor-repository.ts src/cli/commands/session.ts tests/core/session-commands.test.ts
git commit -m "feat: add session shared primitives and getGoalBySeq"
```

---

### Task 4: Session Commands — current, pause, resume

**Files:**
- Modify: `src/cli/commands/session.ts`
- Modify: `tests/core/session-commands.test.ts`

**Context:** Add 3 new subcommands to the existing `sessionCmd` in `registerSessionCommand()`. These are the simpler commands without cross-session interaction.

- [ ] **Step 1: Write tests for current, pause, resume behavior**

Append to `tests/core/session-commands.test.ts`:

```typescript
describe('session current', () => {
  it('resolves active session', () => {
    const s = createSession(db, { name: 'my-project', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');

    const current = resolveSession(db);
    expect(current).toBeDefined();
    expect(current!.name).toBe('my-project');
  });
});

describe('session resume with name', () => {
  it('resumes specific session by name', () => {
    const s1 = createSession(db, { name: 's1', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'paused');
    const s2 = createSession(db, { name: 's2', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'paused');

    activateSession(db, s1.id);
    expect(getSessionById(db, s1.id)!.status).toBe('active');
    expect(getSessionById(db, s2.id)!.status).toBe('paused');
  });
});
```

Also add import for `resolveSession` at the top:

```typescript
import { pauseCurrentSession, activateSession, resolveSession } from '../../src/cli/commands/session.js';
```

- [ ] **Step 2: Add current command to session.ts**

Inside `registerSessionCommand`, after the existing `history` command, add:

```typescript
  // cdx session current
  sessionCmd
    .command('current')
    .description('Show which session is active')
    .action(async () => {
      const db = getDb();
      const session = resolveSession(db);
      if (!session) {
        console.log('No active session.');
        return;
      }
      console.log(`  ${session.name} (${session.status})`);
    });
```

- [ ] **Step 3: Add pause command**

```typescript
  // cdx session pause
  sessionCmd
    .command('pause')
    .description('Pause current session and active goal')
    .action(async () => {
      const db = getDb();
      const session = resolveSession(db);
      if (!session) {
        console.log('No active session to pause.');
        return;
      }
      if (session.status === 'paused') {
        console.log(`Session "${session.name}" is already paused.`);
        return;
      }

      const goals = getGoalsBySession(db, session.id);
      const activeGoal = goals.find(g => g.id === session.active_goal_id && isUnfinished(g.status));

      pauseCurrentSession(db, session);

      console.log(`⏸ Paused: ${session.name}`);
      if (activeGoal) {
        const wps = getWPsByGoal(db, activeGoal.id);
        const counts = countWPsByStatus(wps);
        console.log(`  Goal "${activeGoal.title}" paused (${counts.completed || 0}/${wps.length} WPs done)`);
      }
    });
```

- [ ] **Step 4: Add resume command**

```typescript
  // cdx session resume [name]
  sessionCmd
    .command('resume [name]')
    .description('Resume a paused session')
    .action(async (name?: string) => {
      const db = getDb();

      let session;
      if (name) {
        session = getSessionByName(db, name);
        if (!session) {
          log.error(`Session "${name}" not found.`);
          process.exit(1);
        }
      } else {
        // Pick most recent paused session
        session = db.prepare(
          `SELECT * FROM sessions WHERE status = 'paused' ORDER BY updated_at DESC LIMIT 1`
        ).get() as Session | undefined;
        if (!session) {
          console.log('No paused session to resume.');
          return;
        }
      }

      if (session.status !== 'paused' && session.status !== 'created') {
        console.log(`Session "${session.name}" is ${session.status}. Cannot resume.`);
        return;
      }

      activateSession(db, session.id);

      const goals = getGoalsBySession(db, session.id);
      const activeGoal = goals.find(g => g.status === 'active' || g.status === 'paused' || g.status === 'created');

      console.log(`▶ Resumed: ${session.name}`);
      if (activeGoal) {
        const wps = getWPsByGoal(db, activeGoal.id);
        const counts = countWPsByStatus(wps);
        console.log(`  Continuing goal: ${activeGoal.title} (${counts.completed || 0}/${wps.length} WPs done)`);
      }
    });
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/session.ts tests/core/session-commands.test.ts
git commit -m "feat: add session current, pause, resume commands"
```

---

### Task 5: Session Commands — switch, close

**Files:**
- Modify: `src/cli/commands/session.ts`
- Modify: `tests/core/session-commands.test.ts`

- [ ] **Step 1: Write failing tests for switch and close**

Append to `tests/core/session-commands.test.ts`:

```typescript
describe('session switch', () => {
  it('pauses current and activates target', () => {
    const s1 = createSession(db, { name: 'proj-a', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'active');
    const g1 = createGoal(db, { session_id: s1.id, title: 'G1', description: 'd' });
    updateGoalStatus(db, g1.id, 'active');
    updateSessionGoal(db, s1.id, g1.id);

    const s2 = createSession(db, { name: 'proj-b', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'paused');

    // Simulate switch: pause current, activate target
    const current = getSessionById(db, s1.id)!;
    pauseCurrentSession(db, current);
    activateSession(db, s2.id);

    expect(getSessionById(db, s1.id)!.status).toBe('paused');
    expect(getGoalById(db, g1.id)!.status).toBe('paused');
    expect(getSessionById(db, s2.id)!.status).toBe('active');
  });
});

describe('session close', () => {
  it('marks session completed if all goals done', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g = createGoal(db, { session_id: s.id, title: 'G', description: 'd' });
    updateGoalStatus(db, g.id, 'completed');

    // All goals completed → session completed
    const goals = getGoalsBySession(db, s.id);
    const allDone = goals.every(g => g.status === 'completed');
    const finalStatus = allDone ? 'completed' : 'abandoned';
    updateSessionStatus(db, s.id, finalStatus);

    expect(getSessionById(db, s.id)!.status).toBe('completed');
  });

  it('marks session abandoned if unfinished goals exist', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g1 = createGoal(db, { session_id: s.id, title: 'G1', description: 'd' });
    updateGoalStatus(db, g1.id, 'completed');
    const g2 = createGoal(db, { session_id: s.id, title: 'G2', description: 'd' });
    updateGoalStatus(db, g2.id, 'paused');

    const goals = getGoalsBySession(db, s.id);
    for (const g of goals) {
      if (isUnfinished(g.status)) {
        updateGoalStatus(db, g.id, 'abandoned');
      }
    }
    const updatedGoals = getGoalsBySession(db, s.id);
    const allDone = updatedGoals.every(g => g.status === 'completed');
    updateSessionStatus(db, s.id, allDone ? 'completed' : 'abandoned');

    expect(getSessionById(db, s.id)!.status).toBe('abandoned');
    expect(getGoalById(db, g2.id)!.status).toBe('abandoned');
  });
});
```

Add `isUnfinished` helper to the test file (or import from session.ts if it's exported):

```typescript
function isUnfinished(status: string): boolean {
  return status === 'created' || status === 'active' || status === 'paused';
}
```

- [ ] **Step 2: Run tests to verify current behavior**

Run: `npx vitest run tests/core/session-commands.test.ts`
Expected: New tests PASS (they use primitive functions already implemented)

- [ ] **Step 3: Add switch command to session.ts**

```typescript
  // cdx session switch <name>
  sessionCmd
    .command('switch <name>')
    .description('Switch to another session')
    .action(async (name: string) => {
      const db = getDb();

      const target = getSessionByName(db, name);
      if (!target) {
        log.error(`Session "${name}" not found.`);
        process.exit(1);
      }

      if (target.status === 'completed' || target.status === 'abandoned') {
        log.error(`Session "${name}" is ${target.status}. Use "cdx session start ${name}" to reactivate.`);
        process.exit(1);
      }

      // Pause current session if different
      const current = resolveSession(db);
      if (current && current.id !== target.id) {
        pauseCurrentSession(db, current);
        console.log(`⏸ Paused session: ${current.name}`);
      }

      const prevStatus = target.status;
      activateSession(db, target.id);
      console.log(`▶ Switched to: ${target.name} (${prevStatus} → active)`);
    });
```

- [ ] **Step 4: Add close command to session.ts**

First, add static imports at the top of `session.ts` (some may already be imported — add only missing ones):

```typescript
import { buildCloseoutSummary } from '../../core/supervisor/closeout.js';
import { getAttemptsByGoal, updateGoalCloseout } from '../../core/storage/supervisor-repository.js';
```

```typescript
  // cdx session close
  sessionCmd
    .command('close')
    .description('Close current session')
    .action(async () => {
      const db = getDb();
      const session = resolveSession(db);
      if (!session) {
        console.log('No active session to close.');
        return;
      }

      const goals = getGoalsBySession(db, session.id);
      let abandonedCount = 0;
      let completedCount = 0;

      // Check completion BEFORE mutating goals
      for (const goal of goals) {
        if (goal.status === 'completed') {
          completedCount++;
        }
      }
      const allDone = goals.length > 0 && completedCount === goals.length;

      // Now abandon unfinished goals
      for (const goal of goals) {
        if (isUnfinished(goal.status)) {
          updateGoalStatus(db, goal.id, 'abandoned');
          // Generate closeout for abandoned goals (imports already at top of file)
          try {
            const updatedGoal = getGoalById(db, goal.id)!;
            const goalWPs = getWPsByGoal(db, goal.id);
            const goalAttempts = getAttemptsByGoal(db, goal.id);
            const goalSnapshots = getSnapshotsByGoal(db, goal.id);
            const closeout = buildCloseoutSummary({ goal: updatedGoal, wps: goalWPs, attempts: goalAttempts, snapshots: goalSnapshots, totalCost: 0 });
            updateGoalCloseout(db, goal.id, JSON.stringify(closeout));
          } catch { /* best effort */ }
          abandonedCount++;
        }
      }

      const finalStatus = allDone ? 'completed' : 'abandoned';
      updateSessionStatus(db, session.id, finalStatus as any);

      console.log(`Session "${session.name}" closed.`);
      if (completedCount > 0 || abandonedCount > 0) {
        const parts: string[] = [];
        if (completedCount > 0) parts.push(`${completedCount} completed`);
        if (abandonedCount > 0) parts.push(`${abandonedCount} paused (→ abandoned)`);
        console.log(`  Goals: ${parts.join(', ')}`);
      }
    });
```

- [ ] **Step 5: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/cli/commands/session.ts tests/core/session-commands.test.ts
git commit -m "feat: add session switch and close commands"
```

---

### Task 6: Inspect Drill-Down + History Update

**Files:**
- Modify: `src/cli/commands/session.ts`
- Create: `tests/core/inspect-drilldown.test.ts`

**Context:** Add `--goal`, `--attempts`, `--snapshots`, `--insights` flags to inspect command. Update history to show seq numbers.

- [ ] **Step 1: Write tests for inspect drill-down display functions**

```typescript
// tests/core/inspect-drilldown.test.ts
import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/core/storage/db.js';
import {
  createSession, createGoal, createWorkPackage, createSnapshot,
  createAttempt, updateAttemptFinished, updateGoalStatus,
  getGoalBySeq, getGoalsBySession, getWPsByGoal, getSnapshotsByGoal, getAttemptsByGoal,
} from '../../src/core/storage/supervisor-repository.js';
import type Database from 'better-sqlite3';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

describe('getGoalBySeq for inspect', () => {
  it('returns correct goal by seq in multi-goal session', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g1 = createGoal(db, { session_id: s.id, title: 'First Goal', description: 'd1' });
    const g2 = createGoal(db, { session_id: s.id, title: 'Second Goal', description: 'd2' });

    expect(getGoalBySeq(db, s.id, 1)!.id).toBe(g1.id);
    expect(getGoalBySeq(db, s.id, 2)!.id).toBe(g2.id);
  });
});

describe('inspect goal data retrieval', () => {
  it('retrieves WPs, snapshots, and attempts for a goal', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g = createGoal(db, { session_id: s.id, title: 'G', description: 'd' });
    const wp = createWorkPackage(db, { goal_id: g.id, seq: 1, title: 'WP1' });
    createSnapshot(db, {
      session_id: s.id, goal_id: g.id, trigger: 'run_completed',
      summary: '1/1 done', next_action: 'verify',
      decisions: JSON.stringify([{ decision: 'Use TypeScript' }]),
    });
    const a = createAttempt(db, { session_id: s.id, goal_id: g.id, wp_id: wp.id, attempt_no: 1 });
    updateAttemptFinished(db, a.id, 'completed', true, 2, 1, '2 files changed');

    const wps = getWPsByGoal(db, g.id);
    const snapshots = getSnapshotsByGoal(db, g.id);
    const attempts = getAttemptsByGoal(db, g.id);

    expect(wps).toHaveLength(1);
    expect(snapshots).toHaveLength(1);
    expect(attempts).toHaveLength(1);
    expect(attempts[0].files_changed_count).toBe(2);
  });

  it('extracts decisions from snapshots', () => {
    const s = createSession(db, { name: 's', project_path: '/tmp', engine: 'claude' });
    const g = createGoal(db, { session_id: s.id, title: 'G', description: 'd' });
    createSnapshot(db, {
      session_id: s.id, goal_id: g.id, trigger: 'run_completed',
      summary: 's1', next_action: 'a',
      decisions: JSON.stringify([{ decision: 'Use PostgreSQL' }]),
    });
    createSnapshot(db, {
      session_id: s.id, goal_id: g.id, trigger: 'run_completed',
      summary: 's2', next_action: 'b',
      decisions: JSON.stringify([{ decision: 'Use PostgreSQL' }, { decision: 'Switch to GraphQL' }]),
    });

    const snapshots = getSnapshotsByGoal(db, g.id);
    expect(snapshots).toHaveLength(2);

    // Parse decisions from last snapshot
    const lastDecisions = JSON.parse(snapshots[1].decisions!);
    expect(lastDecisions).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they pass**

Run: `npx vitest run tests/core/inspect-drilldown.test.ts`
Expected: PASS (tests use existing repository functions)

- [ ] **Step 3: Add display functions for drill-down views**

Add these new display functions to `src/cli/commands/session.ts`:

```typescript
function showGoalDetail(goal: Goal, db: import('better-sqlite3').Database): void {
  const wps = getWPsByGoal(db, goal.id);
  const counts = countWPsByStatus(wps);
  const snapshots = getSnapshotsByGoal(db, goal.id);
  const attempts = getAttemptsByGoal(db, goal.id);

  console.log(`Goal: ${goal.title} [${goal.status}]`);
  console.log(`  Type:       ${goal.goal_type || 'custom'}`);
  console.log(`  Source:     ${formatGoalSource(goal)}`);
  console.log(`  Progress:   ${counts.completed || 0}/${wps.length} WPs`);
  console.log(`  Attempts:   ${attempts.length}`);
  console.log('');

  // WPs
  for (const wp of wps) {
    const icon = wp.status === 'completed' ? 'x' : wp.status === 'active' ? '>' : wp.status === 'failed' || wp.status === 'blocked' ? '!' : ' ';
    const retry = wp.retry_count > 0 ? ` [retries: ${wp.retry_count}/${wp.retry_budget}]` : '';
    const blocker = wp.blocker_detail ? ` — ${wp.blocker_detail}` : '';
    console.log(`  [${icon}] ${wp.seq}. ${wp.title}${retry}${blocker}`);
  }
  console.log('');

  // Latest snapshot
  if (snapshots.length > 0) {
    const latest = snapshots[snapshots.length - 1];
    console.log(`  Latest Snapshot:`);
    console.log(`    ${latest.trigger} — ${latest.summary.slice(0, 100)}`);
    console.log(`    Next: ${latest.next_action.slice(0, 100)}`);
    console.log('');
  }

  // Closeout
  if (goal.closeout_summary) {
    try {
      const closeout = JSON.parse(goal.closeout_summary);
      console.log('  Closeout:');
      console.log(`    Status:   ${closeout.final_status}`);
      console.log(`    WPs:      ${closeout.wps_completed}/${closeout.wps_total} completed`);
      if (closeout.total_cost_usd) console.log(`    Cost:     $${closeout.total_cost_usd.toFixed(4)}`);
      console.log('');
    } catch { /* malformed */ }
  }
}

function showGoalAttempts(goal: Goal, db: import('better-sqlite3').Database): void {
  const attempts = getAttemptsByGoal(db, goal.id);
  console.log(`Goal: ${goal.title}`);

  if (attempts.length === 0) {
    console.log('  No attempts yet.');
    return;
  }

  for (const a of attempts) {
    const progress = a.progress_detected ? 'progress' : 'no progress';
    const files = a.files_changed_count > 0 ? `, ${a.files_changed_count} files changed` : '';
    console.log(`  Attempt ${a.attempt_no} [${a.status}] ${a.prompt_strategy || 'normal'} — ${progress}${files}`);
    if (a.notes) console.log(`    ${a.notes}`);
    if (a.blocker_detail) console.log(`    Blocker: ${a.blocker_detail}`);
  }
}

function showGoalSnapshots(goal: Goal, db: import('better-sqlite3').Database): void {
  const snapshots = getSnapshotsByGoal(db, goal.id);
  console.log(`Goal: ${goal.title}`);

  if (snapshots.length === 0) {
    console.log('  No snapshots yet.');
    return;
  }

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    console.log(`  Snap ${i + 1} (${snap.trigger}) — ${snap.summary.slice(0, 80)}`);
    console.log(`    Next: ${snap.next_action.slice(0, 80)}`);

    const files = snap.related_files ? safeParseArray(snap.related_files) : [];
    if (files.length > 0) console.log(`    Files: ${files.length} total`);

    const decisions = snap.decisions ? safeParseArray(snap.decisions) : [];
    if (decisions.length > 0) console.log(`    Decisions: ${decisions.length}`);
  }
}

function showGoalInsights(goal: Goal, db: import('better-sqlite3').Database): void {
  const snapshots = getSnapshotsByGoal(db, goal.id);
  console.log(`Goal: ${goal.title}`);
  console.log('');

  // Collect decisions across all snapshots
  const seenDecisions = new Set<string>();
  let hasAny = false;

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const decisions = snap.decisions ? safeParseArray(snap.decisions) : [];
    for (const d of decisions) {
      const text = typeof d === 'string' ? d : d.decision || JSON.stringify(d);
      if (!seenDecisions.has(text)) {
        if (!hasAny) { console.log('  Decisions:'); hasAny = true; }
        console.log(`    [Snap ${i + 1}] ${text}`);
        seenDecisions.add(text);
      }
    }
  }

  if (!hasAny) {
    console.log('  No insights recorded yet.');
  }
}

function safeParseArray(json: string | null | undefined): any[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json);
    return Array.isArray(parsed) ? parsed : [];
  } catch { return []; }
}
```

- [ ] **Step 4: Update inspect command to support flags**

Replace the existing inspect command registration in `registerSessionCommand` and `registerInspectCommand` with:

```typescript
  // cdx session inspect
  sessionCmd
    .command('inspect')
    .description('Detailed inspection of current session')
    .option('--goal <n>', 'Show specific goal by sequence number', parseInt)
    .option('--attempts', 'Show attempt timeline for goal')
    .option('--snapshots', 'Show snapshot chain for goal')
    .option('--insights', 'Show decisions and insights for goal')
    .action(async (opts: { goal?: number; attempts?: boolean; snapshots?: boolean; insights?: boolean }) => {
      const db = getDb();
      const session = resolveSession(db);
      if (!session) {
        console.log('No active session. Run: cdx session start <name> --path <path>');
        return;
      }

      if (opts.goal) {
        const goal = getGoalBySeq(db, session.id, opts.goal);
        if (!goal) {
          log.error(`Goal #${opts.goal} not found in session "${session.name}".`);
          return;
        }

        if (opts.attempts) {
          showGoalAttempts(goal, db);
        } else if (opts.snapshots) {
          showGoalSnapshots(goal, db);
        } else if (opts.insights) {
          showGoalInsights(goal, db);
        } else {
          showGoalDetail(goal, db);
        }
        return;
      }

      // Default: full dump
      const goals = getGoalsBySession(db, session.id);
      showSessionInspect(session, goals, db);
    });
```

Add the import for `getGoalBySeq` at the top of session.ts.

Update `registerInspectCommand` similarly with the same options.

- [ ] **Step 5: Update history to show seq numbers and compact format**

Replace `showSessionHistory` function:

```typescript
function showSessionHistory(session: Session, goals: Goal[], db: import('better-sqlite3').Database, verbose = false): void {
  console.log(`Session: ${session.name} [${formatStatus(session.status)}]`);
  console.log('');

  if (goals.length === 0) {
    console.log('No goals in this session.');
    return;
  }

  for (let i = 0; i < goals.length; i++) {
    const goal = goals[i];
    const isActive = goal.id === session.active_goal_id;
    const wps = getWPsByGoal(db, goal.id);
    const counts = countWPsByStatus(wps);
    const attempts = getAttemptsByGoal(db, goal.id);

    const marker = isActive ? ' [ACTIVE]' : '';
    const status = formatStatus(goal.status);

    if (verbose) {
      const snapshots = getSnapshotsByGoal(db, goal.id);
      console.log(`  ${i + 1}. ${goal.title} [${status}]${marker}`);
      console.log(`     Progress:  ${counts.completed || 0}/${wps.length} WPs, ${attempts.length} attempts`);
      console.log(`     Source:    ${formatGoalSource(goal)}`);
      console.log(`     Created:   ${goal.created_at}`);
      console.log(`     Updated:   ${goal.updated_at}`);
      if (snapshots.length > 0) {
        const latest = snapshots[snapshots.length - 1];
        console.log(`     Summary:   ${latest.summary.slice(0, 80)}`);
      }
      console.log('');
    } else {
      console.log(`  ${i + 1}. ${goal.title} [${status}]${marker} — ${counts.completed || 0}/${wps.length} WPs, ${attempts.length} attempts`);
    }
  }
}
```

Update the history command registration to pass `--verbose`:

```typescript
  sessionCmd
    .command('history')
    .description('View session goal history as reference')
    .option('--verbose', 'Show detailed information')
    .action(async (opts: { verbose?: boolean }) => {
      const db = getDb();
      const session = resolveSession(db);
      if (!session) {
        console.log('No active session. Run: cdx session start <name> --path <path>');
        return;
      }
      const goals = getGoalsBySession(db, session.id);
      showSessionHistory(session, goals, db, opts.verbose);
    });
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/cli/commands/session.ts tests/core/inspect-drilldown.test.ts
git commit -m "feat: add inspect drill-down flags and compact history"
```

---

---

**Note on execute.ts:** The existing auto-pause logic in execute.ts (lines 52-58) only pauses the goal, not the session — which is correct for the execute flow. The shared `pauseCurrentSession` pauses both session + goal and is intended for session management commands (switch, pause). No changes to execute.ts's pause logic are needed. Both execute.ts and session.ts have their own `isUnfinished` helper — keep both to avoid circular dependency risk.

---

## Chunk 2: Wave 2 — Hygiene + Compaction

### Task 8: Session Hygiene Guardrails

**Files:**
- Create: `src/core/supervisor/hygiene.ts`
- Create: `tests/core/hygiene.test.ts`
- Modify: `src/cli/commands/session.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/hygiene.test.ts
import { describe, it, expect } from 'vitest';
import { checkStaleSession, checkPausedGoals, getSessionWarnings, type Warning } from '../../src/core/supervisor/hygiene.js';
import type { Session, Goal } from '../../src/types/supervisor.js';

function makeSession(overrides: Partial<Session> = {}): Session {
  return {
    id: 'sid', name: 'test', title: 'test', project_path: '/tmp', engine: 'claude',
    status: 'active', active_goal_id: null, working_summary: null,
    decisions: null, constraints: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

function makeGoal(overrides: Partial<Goal> = {}): Goal {
  return {
    id: 'gid', session_id: 'sid', title: 'G', description: 'd',
    goal_type: null, source_type: null, status: 'created',
    completion_rules: null, source_file: null, closeout_summary: null,
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...overrides,
  };
}

describe('checkStaleSession', () => {
  it('returns null for recent session', () => {
    const session = makeSession({ updated_at: new Date().toISOString() });
    expect(checkStaleSession(session)).toBeNull();
  });

  it('returns warning for session idle > 7 days', () => {
    const old = new Date(Date.now() - 8 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: old });
    const warning = checkStaleSession(session);
    expect(warning).not.toBeNull();
    expect(warning!.level).toBe('warn');
    expect(warning!.message).toContain('8');
  });

  it('returns null for exactly 7 days', () => {
    const exact = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: exact });
    expect(checkStaleSession(session)).toBeNull();
  });
});

describe('checkPausedGoals', () => {
  it('returns null for fewer than 3 paused goals', () => {
    const goals = [
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'paused' }),
    ];
    expect(checkPausedGoals(goals)).toBeNull();
  });

  it('returns warning for 3+ paused goals', () => {
    const goals = [
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'paused' }),
    ];
    const warning = checkPausedGoals(goals);
    expect(warning).not.toBeNull();
    expect(warning!.level).toBe('warn');
    expect(warning!.message).toContain('3');
  });

  it('only counts paused goals', () => {
    const goals = [
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'completed' }),
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'active' }),
    ];
    expect(checkPausedGoals(goals)).toBeNull();
  });
});

describe('getSessionWarnings', () => {
  it('returns empty for healthy session', () => {
    const session = makeSession();
    const goals = [makeGoal({ status: 'active' })];
    expect(getSessionWarnings(session, goals)).toHaveLength(0);
  });

  it('returns multiple warnings', () => {
    const old = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000).toISOString();
    const session = makeSession({ updated_at: old });
    const goals = [
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'paused' }),
      makeGoal({ status: 'paused' }),
    ];
    const warnings = getSessionWarnings(session, goals);
    expect(warnings).toHaveLength(2);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/hygiene.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement hygiene.ts**

```typescript
// src/core/supervisor/hygiene.ts
/**
 * Session hygiene checks — passive warnings for session health.
 * Pure functions, no side effects.
 */

import type { Session, Goal } from '../../types/supervisor.js';

const STALE_DAYS = 7;
const MAX_PAUSED_GOALS = 3;

export interface Warning {
  level: 'info' | 'warn';
  message: string;
  suggestion: string;
}

export function checkStaleSession(session: Session): Warning | null {
  const updatedAt = new Date(session.updated_at).getTime();
  const now = Date.now();
  const daysSince = Math.floor((now - updatedAt) / (24 * 60 * 60 * 1000));

  if (daysSince > STALE_DAYS) {
    return {
      level: 'warn',
      message: `Idle for ${daysSince} days.`,
      suggestion: 'Consider: cdx session pause or cdx session close',
    };
  }
  return null;
}

export function checkPausedGoals(goals: Goal[]): Warning | null {
  const pausedCount = goals.filter(g => g.status === 'paused').length;

  if (pausedCount >= MAX_PAUSED_GOALS) {
    return {
      level: 'warn',
      message: `${pausedCount} paused goals in session.`,
      suggestion: 'Review: cdx inspect',
    };
  }
  return null;
}

export function getSessionWarnings(session: Session, goals: Goal[]): Warning[] {
  const warnings: Warning[] = [];

  const stale = checkStaleSession(session);
  if (stale) warnings.push(stale);

  const paused = checkPausedGoals(goals);
  if (paused) warnings.push(paused);

  return warnings;
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/hygiene.test.ts`
Expected: All PASS

- [ ] **Step 5: Inject warnings into session display functions**

In `src/cli/commands/session.ts`, add this helper:

```typescript
function displayWarnings(warnings: import('../../core/supervisor/hygiene.js').Warning[]): void {
  for (const w of warnings) {
    console.log(`⚠ ${w.message} ${w.suggestion}`);
  }
}
```

Add the import at the top of session.ts:

```typescript
import { getSessionWarnings } from '../../core/supervisor/hygiene.js';
```

Then in `showSessionStatus`, after `console.log(`Updated: ${session.updated_at}`);`, add:

```typescript
  const warnings = getSessionWarnings(session, goals);
  if (warnings.length > 0) {
    console.log('');
    displayWarnings(warnings);
  }
```

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/core/supervisor/hygiene.ts tests/core/hygiene.test.ts src/cli/commands/session.ts
git commit -m "feat: add session hygiene guardrails with passive warnings"
```

---

### Task 9: Enhanced Compaction — Schema + Types

**Files:**
- Modify: `src/types/supervisor.ts`
- Modify: `src/core/storage/schema.ts`
- Modify: `src/core/storage/supervisor-repository.ts`

**Context:** Add 3 new columns to snapshots table and update types.

- [ ] **Step 1: Update Snapshot type**

In `src/types/supervisor.ts`, add 3 fields to the Snapshot interface after `blockers_encountered`:

```typescript
  assumptions: string | null;           // JSON: string[]
  unresolved_questions: string | null;  // JSON: string[]
  follow_ups: string | null;            // JSON: string[]
```

- [ ] **Step 2: Add migration for new columns**

In `src/core/storage/schema.ts`, add at the end of `migrateSchema()`:

```typescript
  // Add enhanced compaction columns to snapshots
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN assumptions TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN unresolved_questions TEXT`); } catch { /* already exists */ }
  try { db.exec(`ALTER TABLE snapshots ADD COLUMN follow_ups TEXT`); } catch { /* already exists */ }
```

- [ ] **Step 3: Update SCHEMA_SQL for new snapshot columns**

In the `CREATE TABLE IF NOT EXISTS snapshots` block, add before the closing `)`:

```sql
  assumptions TEXT,
  unresolved_questions TEXT,
  follow_ups TEXT,
```

Place after `next_action TEXT NOT NULL,` and before `run_id TEXT,`.

- [ ] **Step 4: Update CreateSnapshotInput in supervisor-repository.ts**

In the `CreateSnapshotInput` interface, add:

```typescript
  assumptions?: string | null;
  unresolved_questions?: string | null;
  follow_ups?: string | null;
```

Update the `createSnapshot` SQL to include the new columns:

```typescript
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
```

- [ ] **Step 5: Update SnapshotData in compactor.ts**

In `src/core/supervisor/compactor.ts`, add to the `SnapshotData` interface:

```typescript
  assumptions: string;
  unresolved_questions: string;
  follow_ups: string;
```

Update `buildSnapshotData` return to include:

```typescript
    assumptions: JSON.stringify([]),
    unresolved_questions: JSON.stringify([]),
    follow_ups: JSON.stringify([]),
```

(Populated with real data in the next task.)

- [ ] **Step 6: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 7: Commit**

```bash
git add src/types/supervisor.ts src/core/storage/schema.ts src/core/storage/supervisor-repository.ts src/core/supervisor/compactor.ts
git commit -m "feat: add schema and types for enhanced compaction"
```

---

### Task 10: Enhanced Compaction — Extraction Logic

**Files:**
- Modify: `src/core/supervisor/compactor.ts`
- Create: `tests/core/enhanced-compaction.test.ts`

- [ ] **Step 1: Write failing tests**

```typescript
// tests/core/enhanced-compaction.test.ts
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
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run tests/core/enhanced-compaction.test.ts`
Expected: FAIL — `extractInsightsFromReport` not exported

- [ ] **Step 3: Implement extractInsightsFromReport**

In `src/core/supervisor/compactor.ts`, add `extractInsightsFromReport` alongside the existing `extractDecisionsFromReport`. Keep the old function as a thin wrapper for backward compatibility (used by `tests/core/scenario-validation.test.ts`):

```typescript
/** @deprecated Use extractInsightsFromReport instead */
export function extractDecisionsFromReport(report: RunReport | null): Array<{ decision: string; reason?: string }> {
  return extractInsightsFromReport(report).decisions;
}
```

Then add the new function:

```typescript
export interface ExtractedInsights {
  decisions: Array<{ decision: string; reason?: string }>;
  assumptions: string[];
  unresolved_questions: string[];
  follow_ups: string[];
  constraints: string[];
}

/**
 * Extract insights from report content.
 * 1. Structured sections (high confidence)
 * 2. Pattern fallback on summary/final_output/what_implemented (lower confidence)
 */
export function extractInsightsFromReport(report: RunReport | null): ExtractedInsights {
  if (!report) return { decisions: [], assumptions: [], unresolved_questions: [], follow_ups: [], constraints: [] };

  const decisions: Array<{ decision: string; reason?: string }> = [];
  const assumptions: string[] = [];
  const unresolvedQuestions: string[] = [];
  const followUps: string[] = [];
  const constraints: string[] = [];

  // Text fields to search (restricted to report fields, not raw code)
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
    // Assumptions: "assuming that..."
    const assumptionPattern = /assuming that (.{10,150}?)(?:\.|$)/gi;
    let match;
    while ((match = assumptionPattern.exec(text)) !== null) {
      const item = match[1].trim();
      if (!assumptions.includes(item)) assumptions.push(item);
    }

    // Follow-ups: "TODO:..."
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
```

Update `buildSnapshotData` to use the new function:

Replace the line:
```typescript
  const extractedDecisions = extractDecisionsFromReport(report);
```
With:
```typescript
  const insights = extractInsightsFromReport(report);
  const extractedDecisions = insights.decisions;
```

And update the return object to include the new fields:

```typescript
    assumptions: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.assumptions), insights.assumptions)),
    unresolved_questions: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.unresolved_questions), insights.unresolved_questions)),
    follow_ups: JSON.stringify(mergeStringArrays(safeParseArray(previousSnapshot?.follow_ups), insights.follow_ups)),
```

Add the string array merge helper:

```typescript
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
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run tests/core/enhanced-compaction.test.ts`
Expected: All PASS

- [ ] **Step 5: Run all tests to verify nothing broke**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 6: Commit**

```bash
git add src/core/supervisor/compactor.ts tests/core/enhanced-compaction.test.ts
git commit -m "feat: add enhanced compaction with insight extraction"
```

---

### Task 11: Enhanced Compaction — Prompt Instructions + Insights Display

**Files:**
- Modify: `src/core/supervisor/prompt-builder.ts`
- Modify: `src/cli/commands/session.ts`

- [ ] **Step 1: Add insight section instructions to prompt-builder**

In `src/core/supervisor/prompt-builder.ts`, after the "When you finish" section (before `return parts.join('\n')`), add:

```typescript
  parts.push('');
  parts.push('If applicable, also include:');
  parts.push('- ## Assumptions Made — list any assumptions you made during this work');
  parts.push('- ## Open Questions — anything unclear that needs human input');
  parts.push('- ## Follow-up Items — work outside current scope that should be done next');
  parts.push('- ## Constraints Discovered — any technical/business constraints you encountered');
```

- [ ] **Step 2: Update showGoalInsights to display all insight types**

In `src/cli/commands/session.ts`, update the `showGoalInsights` function to also display assumptions, questions, follow-ups, and constraints from snapshots:

```typescript
function showGoalInsights(goal: Goal, db: import('better-sqlite3').Database): void {
  const snapshots = getSnapshotsByGoal(db, goal.id);
  console.log(`Goal: ${goal.title}`);
  console.log('');

  const seenDecisions = new Set<string>();
  const seenAssumptions = new Set<string>();
  const seenQuestions = new Set<string>();
  const seenFollowUps = new Set<string>();
  const seenConstraints = new Set<string>();

  const sections: { label: string; items: Array<{ snap: number; text: string }> }[] = [
    { label: 'Decisions', items: [] },
    { label: 'Assumptions', items: [] },
    { label: 'Open Questions', items: [] },
    { label: 'Follow-ups', items: [] },
    { label: 'Constraints', items: [] },
  ];

  for (let i = 0; i < snapshots.length; i++) {
    const snap = snapshots[i];
    const snapNum = i + 1;

    collectInsights(snap.decisions, seenDecisions, sections[0].items, snapNum,
      d => typeof d === 'string' ? d : d.decision || JSON.stringify(d));
    collectInsights(snap.assumptions, seenAssumptions, sections[1].items, snapNum);
    collectInsights(snap.unresolved_questions, seenQuestions, sections[2].items, snapNum);
    collectInsights(snap.follow_ups, seenFollowUps, sections[3].items, snapNum);
    collectInsights(snap.constraints, seenConstraints, sections[4].items, snapNum);
  }

  let hasAny = false;
  for (const section of sections) {
    if (section.items.length > 0) {
      hasAny = true;
      console.log(`  ${section.label}:`);
      for (const item of section.items) {
        console.log(`    [Snap ${item.snap}] ${item.text}`);
      }
      console.log('');
    }
  }

  if (!hasAny) {
    console.log('  No insights recorded yet.');
  }
}

function collectInsights(
  json: string | null | undefined,
  seen: Set<string>,
  items: Array<{ snap: number; text: string }>,
  snapNum: number,
  transform?: (item: any) => string,
): void {
  const parsed = safeParseArray(json);
  for (const item of parsed) {
    const text = transform ? transform(item) : (typeof item === 'string' ? item : JSON.stringify(item));
    if (!seen.has(text)) {
      seen.add(text);
      items.push({ snap: snapNum, text });
    }
  }
}
```

- [ ] **Step 3: Run all tests**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add src/core/supervisor/prompt-builder.ts src/cli/commands/session.ts
git commit -m "feat: add insight instructions to prompt and insights display"
```

---

### Task 12: Register New Commands in CLI Index

**Files:**
- Modify: `src/cli/index.ts`

**Context:** Ensure all new session subcommands are properly registered. Since they are part of the `session` parent command in `registerSessionCommand`, they should already be wired. Verify and add any missing top-level aliases.

- [ ] **Step 1: Read current index.ts**

Read `src/cli/index.ts` and verify that `registerSessionCommand`, `registerStatusCommand`, `registerInspectCommand` are all imported and called.

- [ ] **Step 2: Verify no additional registration needed**

The new commands (`current`, `switch`, `pause`, `resume`, `close`) are all subcommands of `session`, registered inside `registerSessionCommand`. No changes to index.ts should be needed. If they are, add them.

- [ ] **Step 3: Run full test suite**

Run: `npx vitest run`
Expected: All PASS

- [ ] **Step 4: Run build to verify TypeScript compiles**

Run: `npm run build`
Expected: No type errors

- [ ] **Step 5: Commit (if any changes)**

```bash
git add src/cli/index.ts
git commit -m "chore: verify CLI registration for new session commands"
```

---

### Task 13: Final Verification

- [ ] **Step 1: Run full test suite**

Run: `npx vitest run`
Expected: All tests PASS

- [ ] **Step 2: Run build**

Run: `npm run build`
Expected: Clean build

- [ ] **Step 3: Manual smoke test (if possible)**

```bash
cdx session start test-project --engine claude --path /tmp/test
cdx session current
cdx session pause
cdx session resume
cdx session list
cdx status
cdx inspect
cdx session history
cdx session history --verbose
cdx session close
```

- [ ] **Step 4: Final commit with updated docs**

Update test count in README.md if it changed, commit.
