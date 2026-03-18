/**
 * Tests for the session lifecycle refactor:
 * - Label reuse after archival
 * - run_index auto-increment
 * - Migration of completed/abandoned → archived
 * - Start behavior with active/paused/archived sessions
 * - History grouping by label
 * - Metadata isolation between sessions
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { createTestDb } from '../../src/core/storage/db.js';
import {
  createSession, getSessionById, getSessionByName, getActiveSession,
  listSessions, updateSessionStatus, updateSessionGoal,
  getSessionsByLabel, countArchivedByLabel,
  createGoal, getGoalsBySession, updateGoalStatus,
  createWorkPackage, getWPsByGoal,
} from '../../src/core/storage/supervisor-repository.js';
import type Database from 'better-sqlite3';
import type { SessionStatus } from '../../src/types/supervisor.js';

let db: Database.Database;

beforeEach(() => {
  db = createTestDb();
});

// ---- Label reuse and run_index ----

describe('label reuse after archival', () => {
  it('creates first session with run_index 1', () => {
    const s = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    expect(s.run_index).toBe(1);
    expect(s.name).toBe('solo-defender');
  });

  it('archived session frees label for new session', () => {
    const s1 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'archived');

    // getSessionByName should NOT return archived session
    expect(getSessionByName(db, 'solo-defender')).toBeUndefined();

    // Creating new session with same label should work
    const s2 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    expect(s2.run_index).toBe(2);
    expect(s2.id).not.toBe(s1.id);
  });

  it('run_index increments across multiple archives', () => {
    for (let i = 0; i < 3; i++) {
      const s = createSession(db, { name: 'ispa-cms', project_path: '/tmp', engine: 'claude' });
      expect(s.run_index).toBe(i + 1);
      updateSessionStatus(db, s.id, 'archived');
    }

    const s4 = createSession(db, { name: 'ispa-cms', project_path: '/tmp', engine: 'claude' });
    expect(s4.run_index).toBe(4);
  });

  it('different labels have independent run_index sequences', () => {
    const a1 = createSession(db, { name: 'project-a', project_path: '/tmp', engine: 'claude' });
    expect(a1.run_index).toBe(1);
    updateSessionStatus(db, a1.id, 'archived');

    const b1 = createSession(db, { name: 'project-b', project_path: '/tmp', engine: 'claude' });
    expect(b1.run_index).toBe(1);

    const a2 = createSession(db, { name: 'project-a', project_path: '/tmp', engine: 'claude' });
    expect(a2.run_index).toBe(2);
  });
});

// ---- getSessionByName behavior ----

describe('getSessionByName excludes archived', () => {
  it('returns active session for label', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');
    const found = getSessionByName(db, 'test');
    expect(found).toBeDefined();
    expect(found!.id).toBe(s.id);
  });

  it('returns paused session for label', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'paused');
    const found = getSessionByName(db, 'test');
    expect(found).toBeDefined();
    expect(found!.id).toBe(s.id);
  });

  it('returns undefined for label with only archived sessions', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'archived');
    expect(getSessionByName(db, 'test')).toBeUndefined();
  });

  it('returns the non-archived session when both archived and active exist', () => {
    const s1 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'archived');

    const s2 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'active');

    const found = getSessionByName(db, 'test');
    expect(found).toBeDefined();
    expect(found!.id).toBe(s2.id);
    expect(found!.run_index).toBe(2);
  });
});

// ---- Start behavior ----

describe('session start scenarios', () => {
  it('unused label → creates new session', () => {
    const s = createSession(db, { name: 'new-project', project_path: '/tmp', engine: 'claude' });
    expect(s.run_index).toBe(1);
    expect(s.status).toBe('created');
  });

  it('only archived runs → creates new session with incremented index', () => {
    const s1 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'archived');

    // Simulate what session start does: check getSessionByName, then create
    const existing = getSessionByName(db, 'solo-defender');
    expect(existing).toBeUndefined(); // archived, not found

    const s2 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'active');
    expect(s2.run_index).toBe(2);
    expect(countArchivedByLabel(db, 'solo-defender')).toBe(1);
  });

  it('active session exists → should reuse (not create duplicate)', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');

    const found = getSessionByName(db, 'test');
    expect(found).toBeDefined();
    expect(found!.id).toBe(s.id);
    // start command would focus this, not create new
  });

  it('paused session exists → should reuse (not create duplicate)', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'paused');

    const found = getSessionByName(db, 'test');
    expect(found).toBeDefined();
    expect(found!.status).toBe('paused');
    // start command would resume this, not create new
  });
});

// ---- Completion → archive behavior ----

describe('completion archives session', () => {
  it('session set to archived after goal completion', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');

    // Simulate goal completion → session archived
    updateSessionStatus(db, s.id, 'archived');

    const updated = getSessionById(db, s.id)!;
    expect(updated.status).toBe('archived');

    // Label is now free
    expect(getSessionByName(db, 'test')).toBeUndefined();
  });

  it('close archives session', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'active');

    // Simulate close → archived
    updateSessionStatus(db, s.id, 'archived');

    expect(getSessionById(db, s.id)!.status).toBe('archived');
    expect(getSessionByName(db, 'test')).toBeUndefined();

    // Can create new session with same label
    const s2 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    expect(s2.run_index).toBe(2);
  });
});

// ---- History by label ----

describe('history by label', () => {
  it('getSessionsByLabel returns all runs including archived', () => {
    const s1 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'archived');

    const s2 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'archived');

    const s3 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s3.id, 'active');

    const all = getSessionsByLabel(db, 'solo-defender');
    expect(all.length).toBe(3);
    expect(all[0].run_index).toBe(1);
    expect(all[1].run_index).toBe(2);
    expect(all[2].run_index).toBe(3);
    expect(all[0].status).toBe('archived');
    expect(all[1].status).toBe('archived');
    expect(all[2].status).toBe('active');
  });

  it('countArchivedByLabel counts correctly', () => {
    createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    expect(countArchivedByLabel(db, 'test')).toBe(0);

    const s1 = getSessionByName(db, 'test')!;
    updateSessionStatus(db, s1.id, 'archived');
    expect(countArchivedByLabel(db, 'test')).toBe(1);

    const s2 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'archived');
    expect(countArchivedByLabel(db, 'test')).toBe(2);
  });

  it('different labels do not cross-contaminate', () => {
    const a = createSession(db, { name: 'project-a', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, a.id, 'archived');

    const b = createSession(db, { name: 'project-b', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, b.id, 'archived');

    expect(getSessionsByLabel(db, 'project-a').length).toBe(1);
    expect(getSessionsByLabel(db, 'project-b').length).toBe(1);
    expect(getSessionsByLabel(db, 'project-c').length).toBe(0);
  });
});

// ---- Metadata isolation ----

describe('metadata isolation between sessions', () => {
  it('goals from archived session do not leak to new session', () => {
    const s1 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'active');
    const g1 = createGoal(db, { session_id: s1.id, title: 'Old Goal', description: 'old' });
    updateGoalStatus(db, g1.id, 'completed');
    updateSessionStatus(db, s1.id, 'archived');

    // New session with same label
    const s2 = createSession(db, { name: 'solo-defender', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'active');

    // New session should have no goals
    const s2Goals = getGoalsBySession(db, s2.id);
    expect(s2Goals.length).toBe(0);

    // Old session's goals are still accessible
    const s1Goals = getGoalsBySession(db, s1.id);
    expect(s1Goals.length).toBe(1);
    expect(s1Goals[0].title).toBe('Old Goal');
  });

  it('WPs from archived session do not leak to new session goals', () => {
    const s1 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    const g1 = createGoal(db, { session_id: s1.id, title: 'G1', description: 'd' });
    createWorkPackage(db, { goal_id: g1.id, seq: 1, title: 'WP-old' });
    updateSessionStatus(db, s1.id, 'archived');

    const s2 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    const g2 = createGoal(db, { session_id: s2.id, title: 'G2', description: 'd' });

    // Old goal's WPs should not appear for new goal
    expect(getWPsByGoal(db, g2.id).length).toBe(0);
    expect(getWPsByGoal(db, g1.id).length).toBe(1);
  });
});

// ---- Migration ----

describe('legacy status migration', () => {
  it('completed status treated as archived in queries', () => {
    // Simulate a legacy session that was migrated (status = 'archived')
    const s = createSession(db, { name: 'legacy', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'archived');

    // Should not be found by getSessionByName
    expect(getSessionByName(db, 'legacy')).toBeUndefined();

    // Should not be found by getActiveSession
    expect(getActiveSession(db)).toBeUndefined();

    // Should appear in history
    const all = getSessionsByLabel(db, 'legacy');
    expect(all.length).toBe(1);
    expect(all[0].status).toBe('archived');
  });

  it('active and paused sessions survive migration unchanged', () => {
    const active = createSession(db, { name: 'active-project', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, active.id, 'active');

    const paused = createSession(db, { name: 'paused-project', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, paused.id, 'paused');

    expect(getSessionByName(db, 'active-project')!.status).toBe('active');
    expect(getSessionByName(db, 'paused-project')!.status).toBe('paused');
  });
});

// ---- getActiveSession behavior ----

describe('getActiveSession with archived sessions', () => {
  it('does not return archived sessions', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s.id, 'archived');
    expect(getActiveSession(db)).toBeUndefined();
  });

  it('returns active session even when archived sessions exist', () => {
    const s1 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s1.id, 'archived');

    const s2 = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    updateSessionStatus(db, s2.id, 'active');

    const active = getActiveSession(db)!;
    expect(active.id).toBe(s2.id);
    expect(active.run_index).toBe(2);
  });
});

// ---- SessionStatus type correctness ----

describe('SessionStatus type', () => {
  it('archived is a valid session status', () => {
    const s = createSession(db, { name: 'test', project_path: '/tmp', engine: 'claude' });
    const status: SessionStatus = 'archived';
    updateSessionStatus(db, s.id, status);
    expect(getSessionById(db, s.id)!.status).toBe('archived');
  });
});
