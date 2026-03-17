# Conductor Current-State Report

**Date:** 2026-03-17
**Version:** 2026.3.17
**Codebase:** 1,432 lines source / 856 lines tests / 51 test cases

---

## 1. Executive Summary

**What is working:**
- CLI surface fully wired: 6 commands + 3 config subcommands, all callable
- Task intake, classification, and persistence work correctly
- Prompt template system works for all 4 task types x 2 engines (8 templates)
- SQLite persistence for tasks, runs, logs, heartbeats, reports — all functional
- Config service at ~/.conductor/config.json — functional
- Heartbeat tracks state transitions without spam
- Process runner supports cwd propagation and stdin pipe
- Stream parser extracts readable output from Claude's stream-json events
- CI/CD pipelines defined for GitHub Actions
- 51 tests pass including integration tests

**What is partially implemented:**
- Resume command: wired and functional but context extraction is shallow (last run only, last 20 log lines)
- Report generator: produces summaries but structured field extraction (root cause, fix applied, files changed) relies on fragile regex heuristics that may not match Claude's actual stream-json output format
- Log display: `cdx logs` shows raw JSON lines for Claude runs, not parsed human-readable text

**What is not working / risky:**
- `cdx logs` displays raw stream-json lines — not useful for human inspection after the fact
- Report generator regex patterns match plain-text output, but Claude now outputs JSON events — extraction likely returns null for most fields
- No `runs show <runId>` command exists for inspecting run metadata directly
- No way to filter tasks by status (`cdx tasks --status running`)

**Biggest risks right now:**
1. Report generator won't extract meaningful structured data from JSON log lines
2. `cdx logs` output is raw JSON, unreadable for debugging
3. No real-world validation that the full pipeline produces useful end-to-end results yet

---

## 2. Command Surface Status

| Command | Status | Notes |
|---------|--------|-------|
| `cdx run` | Implemented | Full orchestration with config fallbacks, streaming, diagnostics |
| `cdx tasks` | Implemented | Lists all tasks. No status filter. |
| `cdx logs <runId>` | Implemented (degraded) | Works but shows raw JSON for Claude runs. Short ID supported. |
| `cdx report <runId>` | Implemented (degraded) | Works but report content likely empty for structured fields due to JSON logs |
| `cdx resume <taskId>` | Implemented | Supports --task override. Context from last run only. |
| `cdx set-path <path>` | Implemented | Validates path exists, saves to config |
| `cdx get-path` | Implemented | Shows default path or hint |
| `cdx clear-path` | Implemented | Removes default path |
| `cdx runs show <runId>` | Missing | No way to inspect run metadata directly |
| `cdx --version` | Implemented | Shows 2026.3.17 |

---

## 3. Core Pipeline Status

### Task Intake
**Status: Working.** Task is created in SQLite with raw_input, workspace_path, engine. Classification via regex is functional for Vietnamese + English keywords. All 4 task types covered.

### Prompt Generation
**Status: Working.** Templates exist for all 4 types x 2 engines. Variable substitution works. Resume prompt building appends previous context to base prompt.

### Engine Execution
**Status: Working (with caveat).** Claude adapter uses `--print --output-format stream-json --verbose --dangerously-skip-permissions` with prompt piped via stdin. Process runner passes cwd correctly. The command and flags are correct for non-interactive streaming execution.

**Caveat:** Real-world execution has not been verified end-to-end in this audit. The flags are correct per Claude Code CLI documentation, but success depends on the Claude CLI version installed and whether `--dangerously-skip-permissions` has been accepted previously.

### Log Streaming
**Status: Working for terminal display, degraded for persistence retrieval.** During execution, stream-parser extracts human-readable text from JSON events and displays it. Raw JSON is persisted to DB. However, `cdx logs` displays the raw JSON — not the parsed version.

### Heartbeat
**Status: Working.** State-tracked transitions: alive → idle → suspected_stuck → recovered. Only emits on transitions (no spam). Configurable interval and threshold via config.

### Persistence
**Status: Working.** All 5 tables populated correctly. Foreign keys enforced. WAL mode enabled. System logs, stdout, stderr all captured with stream type separation.

### Reporting
**Status: Degraded.** Report generator runs but its regex extraction patterns expect plain-text log lines. With Claude's stream-json output, the raw JSON lines won't match patterns for root_cause, fix_applied, files_changed, or verification_notes. The summary field (which uses last N lines) will contain raw JSON.

### Resume
**Status: Functional but shallow.** Finds previous task, extracts last run's report summary + last 20 log lines, appends to new prompt. Works mechanically but the context quality depends on report quality (which is currently degraded).

---

## 4. Findings by Area

### 4.1 CLI

**Current implementation:** Commander-based CLI with 9 registered commands. Entry point at src/cli/index.ts. Binary name: cdx.

**What works:** All commands callable, short ID prefix lookup works for runId and taskId, config commands functional.

**What is missing:**
- `runs show <runId>` — no way to inspect run metadata (pid, started_at, finished_at, exit code, engine, cwd) without querying the DB directly
- `tasks` has no filter options (--status, --engine)

**Risks:** Ambiguous prefix lookup calls `process.exit(1)` — cannot be handled gracefully if used programmatically.

### 4.2 Task Normalization

**Current implementation:** Rule-based regex classification in priority order: debug_fix > scan_review > implement_feature > verify_only. Supports Vietnamese and English keywords. Default: debug_fix.

**What works:** Classification is accurate for common keywords. Persisted as task_type + normalized_json.

**What is missing:** Nothing critical. Could add more patterns over time.

**Risks:** Low. Simple and predictable.

### 4.3 Prompt Builder

**Current implementation:** Reads markdown templates from prompts/{engine}/{task_type}.md. Replaces {{variable}} placeholders with provided values.

**What works:** All 8 templates exist and work. Claude templates are detailed (15-20 lines), Codex templates are terse (5 lines).

**What is missing:** No prompt preview in logs (only debug-level). No prompt versioning.

**Risks:** Naive replaceAll — if variable values contain `{{`, substitution could break. Low practical risk.

### 4.4 Engine Adapters

**Claude adapter:**
- Executable: `claude`
- Args: `--print --output-format stream-json --verbose --dangerously-skip-permissions`
- Prompt: via stdin pipe
- streaming: true
- Validation: `which claude`
- **Assessment: Correct for non-interactive streaming execution.** The `--print` flag disables interactive mode. `--output-format stream-json` enables real-time event streaming. `--verbose` is required by stream-json mode. `--dangerously-skip-permissions` avoids permission prompts.

**Codex adapter:**
- Executable: `codex`
- Args: `--quiet --auto-edit`
- Prompt: via stdin pipe
- streaming: false
- Validation: `which codex`
- **Assessment: Untested.** Flags appear reasonable but Codex CLI behavior unverified.

**Risks:** No fallback if executable exists but fails to launch. No version detection.

### 4.5 Process Runner

**Current implementation:** `child_process.spawn` with readline for line-buffered I/O.

**What works:**
- stdin: 'pipe' when command.stdin provided, 'ignore' otherwise
- stdout/stderr: always 'pipe' with readline
- cwd: passed to spawn options
- Environment: merged process.env + command.env
- Timeout: SIGTERM → wait 5s → SIGKILL
- PID callback: called if child.pid exists
- Cancellation: SIGINT/SIGTERM handlers in run.ts clean up child process

**What is missing:** Nothing critical.

**Risks:** If spawn fails silently (e.g., executable found but crashes immediately), the 'close' event fires with a non-zero exit code but no output is captured. This is handled correctly — run is marked as failed.

### 4.6 Logging

**During execution:**
- System log written before spawn: engine, cwd, prompt_len
- stdout lines: parsed via stream-parser for display, raw JSON persisted
- stderr lines: displayed with [ERR] prefix, persisted
- Heartbeat events: persisted to heartbeat_events table
- PID, start time, finish time, exit code: persisted on run record

**After execution:**
- `cdx logs <runId>`: Shows raw persisted lines with seq numbers. Supports --tail and --stream filters.

**Gap:** `cdx logs` shows raw JSON for Claude runs. A user inspecting logs after a run sees unreadable JSON instead of the parsed text that was displayed during execution. This is the most significant observability gap.

**Spawn metadata logged:** engine (yes), args (yes, in command line), cwd (yes), pid (yes), prompt preview (debug-level only).

### 4.7 Heartbeat

**Current implementation:** HeartbeatMonitor class with state tracking.

**States:** alive, idle (> threshold/2), suspected_stuck (> threshold), recovered (was stuck, now has output)

**Thresholds:** Configurable via config.json. Defaults: 15s interval, 60s stuck threshold.

**Behavior:** Only emits on state transitions. No repeated spam. Stops cleanly when stop() called.

**Assessment: Working correctly.** Previous spam issue (every tick) has been fixed.

### 4.8 Storage

**Implementation:** SQLite with better-sqlite3, WAL mode, foreign keys.

**Entities persisted correctly:**
- tasks: yes (id, raw_input, workspace_path, engine, task_type, normalized_json, status, timestamps)
- runs: yes (id, task_id, engine, command, args_json, prompt_final, status, pid, timestamps, exit_code)
- run_logs: yes (run_id, seq, timestamp, stream_type, line)
- heartbeat_events: yes (run_id, timestamp, status, summary, no_output_seconds)
- run_reports: yes (run_id, summary, root_cause, fix_applied, files_changed_json, verification_notes, remaining_risks)

**Gaps:**
- No database migration system — future schema changes will require manual handling
- No transaction wrapping on multi-step operations (create task + create run + update status)
- DB path is process.cwd()/data/conductor.db — ties DB location to where command is run from

### 4.9 Reporting

**Current implementation:** generateReport() builds a summary from task/run/log data, then extracts structured fields via regex.

**Fields produced:**
- summary: Always populated (task description + last output or errors + duration)
- root_cause: Regex extraction — pattern: "root cause: X" or "found: X"
- fix_applied: Regex extraction — pattern: "fixed: X" or "changed: X"
- files_changed_json: Regex extraction — pattern: "modified file.ts"
- verification_notes: Regex extraction — pattern: "tests: X" or "verified: X"
- remaining_risks: Always null

**Problem:** These regex patterns were designed for plain-text engine output. With Claude now outputting stream-json, the persisted log lines are raw JSON objects. The regex patterns will not match JSON strings. Result: root_cause, fix_applied, files_changed, verification will all be null.

**Assessment: Degraded.** Summary will contain raw JSON snippets. Structured fields will be empty.

### 4.10 Resume

**Current implementation:**
- CLI command: yes, with --task override option
- Previous task lookup: yes, via findTaskByPrefix
- Previous run lookup: yes, gets most recent run via getRunsByTaskId
- Report extraction: yes, gets report summary from last run
- Log tail: yes, last 20 lines from last run
- Prompt building: yes, appends previous context to base prompt
- New run creation: yes, full execution flow

**Assessment: Functional.** The mechanics work. However, the injected context quality depends on report quality (currently degraded due to JSON logs) and log tail (which will be raw JSON lines).

### 4.11 Configuration

**Config system:** ~/.conductor/config.json
**Default path:** yes, via set-path/get-path/clear-path
**Default engine:** yes, stored as defaultEngine in config
**Heartbeat thresholds:** yes, heartbeatIntervalSec and stuckThresholdSec
**Executable paths:** no, hardcoded to bare command names

---

## 5. Most Likely Root Causes of Current Execution Problems

Analyzing the symptom: process starts, PID exists, no engine output appears, heartbeat repeatedly reports no output.

**This was from the OLD code.** The issues have been addressed in the current codebase. For the record:

| Priority | Root Cause | Status |
|----------|-----------|--------|
| 1 | `claude --print` buffers entire output until completion — zero lines emitted during work | **Fixed.** Now uses `--output-format stream-json --verbose` which streams events in real-time |
| 2 | Prompt passed as CLI argument — risk of OS ARG_MAX for long prompts causing silent failure | **Fixed.** Now piped via stdin |
| 3 | cwd not passed to child process — engine ran in conductor's own directory | **Fixed.** cwd now passed to spawn |
| 4 | Heartbeat spammed "suspected stuck" every 15s tick without deduplication | **Fixed.** Now only emits on state transitions |
| 5 | Zero execution diagnostics — impossible to debug what command was actually spawned | **Fixed.** Engine, command, cwd, prompt size logged before spawn |

**Remaining risk:** If the user's Claude CLI has not previously accepted `--dangerously-skip-permissions`, it may prompt interactively even with `--print`. This would cause the process to hang waiting for input that never comes (stdin is closed after writing the prompt).

---

## 6. Readiness Assessment

| Area | Status | Detail |
|------|--------|--------|
| Run command | Ready | Full pipeline wired with diagnostics, streaming, config fallbacks |
| Engine execution | Ready (Claude) / Untested (Codex) | Claude adapter flags are correct. Codex adapter unverified. |
| Log streaming (terminal) | Ready | Stream-parser extracts readable content during execution |
| Log retrieval (after run) | Not ready | `cdx logs` shows raw JSON, not human-readable parsed text |
| Reporting | Not ready | Regex extraction won't match JSON log lines. Structured fields will be null. |
| Resume | Partially ready | Mechanics work but injected context quality is poor due to reporting gap |
| Heartbeat | Ready | State-tracked, configurable, no spam |
| Persistence | Ready | All entities persisted correctly |
| Configuration | Ready | Default path, engine, heartbeat settings all functional |

---

## 7. Recommended Development Order

Based on actual code state, near-term priorities:

### P0 — Fix broken functionality

1. **Fix `cdx logs` to display parsed output for JSON log lines**
   The same stream-parser used during execution should be applied when displaying logs. Currently logs shows raw JSON which is useless for debugging.

2. **Fix report generator to handle stream-json log format**
   The regex patterns need to parse JSON log lines and extract text content before matching. Or replace heuristic extraction with structured extraction from the JSON events themselves (which contain tool calls, results, etc.).

### P1 — Add missing observability

3. **Add `cdx runs show <runId>` command**
   Display run metadata: engine, command, args, cwd, pid, status, started_at, finished_at, exit_code, prompt length. Essential for debugging.

4. **Add `cdx tasks --status <status>` filter**
   Practical for managing multiple tasks.

### P2 — Improve resume quality

5. **Improve resume context extraction**
   Parse structured data from JSON log events (tool calls, file edits, errors) instead of raw log tail. This makes resume prompts much more useful.

### P3 — Robustness

6. **Add `--dangerously-skip-permissions` acceptance check**
   Before launching Claude, verify that the permission mode has been accepted. Fail with a clear message if not.

7. **Wrap multi-step DB operations in transactions**
   Create task + create run + update status should be atomic.

---

## 8. Files / Modules Reviewed

| File | Lines | Role |
|------|-------|------|
| src/cli/index.ts | 24 | CLI entry point |
| src/cli/commands/run.ts | 216 | Main orchestration |
| src/cli/commands/resume.ts | 169 | Resume with context |
| src/cli/commands/tasks.ts | 21 | List tasks |
| src/cli/commands/logs.ts | 45 | View run logs |
| src/cli/commands/report.ts | 56 | View run report |
| src/cli/commands/config.ts | 44 | Config commands |
| src/core/config/service.ts | 37 | Config read/write |
| src/core/engine/types.ts | 34 | Adapter interface + factory |
| src/core/engine/claude.ts | 30 | Claude adapter |
| src/core/engine/codex.ts | 28 | Codex adapter |
| src/core/engine/stream-parser.ts | 68 | JSON event parser |
| src/core/runner/process.ts | 73 | spawn wrapper |
| src/core/heartbeat/monitor.ts | 71 | Heartbeat with state tracking |
| src/core/task/normalizer.ts | 62 | Task classification |
| src/core/prompt/builder.ts | 38 | Template loading + substitution |
| src/core/report/generator.ts | 76 | Post-run report extraction |
| src/core/storage/schema.ts | 61 | SQL DDL |
| src/core/storage/db.ts | 40 | SQLite singleton |
| src/core/storage/repository.ts | 142 | All CRUD operations |
| src/types/index.ts | 60 | Shared types |
| src/utils/logger.ts | 9 | Timestamped logger |
| src/utils/lookup.ts | 28 | Short ID prefix resolver |
| tests/ (11 files) | 856 | 51 test cases |
| prompts/ (8 files) | ~90 | Prompt templates |
| .github/workflows/ (2 files) | 59 | CI + Release pipelines |

---

## Blunt Conclusion

**Can Conductor currently be used reliably for real task execution?**

The execution pipeline is mechanically sound. Claude adapter flags are correct, cwd is propagated, prompt is piped via stdin, logs stream in real-time to the terminal, heartbeat doesn't spam. A user running `cdx run` will see Claude working in their terminal.

**However, the after-the-fact experience is broken.** Once the run ends:
- `cdx logs` shows unreadable JSON
- `cdx report` produces a summary full of raw JSON and empty structured fields
- `cdx resume` injects poor context because it reads from the broken report and raw JSON logs

**What must be fixed before adding features:**
1. Make `cdx logs` parse and display readable text from JSON events
2. Make the report generator extract structured data from JSON events instead of regex-matching raw text

These two fixes are small in scope but critical for the tool to be useful beyond watching the terminal during a single run.
