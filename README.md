# Conductor

Supervisor for AI coding CLIs. Takes natural-language tasks, generates prompts, runs the selected engine, monitors progress, and produces structured reports.

```
User
  |
  v
conductor run --engine claude --path ./project --task "fix the login bug"
  |
  v
Task Normalizer --> Prompt Builder --> Engine Adapter --> Process Runner
                                                              |
                                                              v
                                                   Log Stream + Heartbeat
                                                              |
                                                              v
                                                      Report Generator
                                                              |
                                                              v
                                                     SQLite (local)
```

## Prerequisites

- Node.js 22+
- One of the supported AI CLI tools installed:
  - [Claude Code](https://docs.anthropic.com/en/docs/claude-code) (`claude`)
  - [Codex CLI](https://github.com/openai/codex) (`codex`)

## Install

```bash
git clone <repo-url> conductor
cd conductor
npm install
```

## Quick Start

```bash
# Run a task
npm run dev -- run --engine claude --path /path/to/project --task "fix the login bug"

# View past tasks
npm run dev -- tasks

# View logs for a run
npm run dev -- logs <runId>

# View the generated report
npm run dev -- report <runId>

# Resume a failed/incomplete task
npm run dev -- resume <taskId>
```

Short IDs work everywhere -- you only need the first few characters (e.g. `logs a1b2c3`).

## Commands

### `conductor run`

Run a new task against a workspace.

```bash
conductor run --engine <engine> --path <workspace> --task "<description>"
```

| Flag | Required | Description |
|------|----------|-------------|
| `--engine` | Yes | `claude` or `codex` |
| `--path` | Yes | Absolute path to the workspace |
| `--task` | Yes | Natural-language task description |

What happens:
1. Creates a task record in SQLite
2. Classifies the task type (`debug_fix`, `scan_review`, `implement_feature`, `verify_only`)
3. Builds a prompt from the matching template
4. Validates the engine executable exists
5. Spawns the engine CLI process
6. Streams stdout/stderr to terminal and saves every line to DB
7. Monitors heartbeat every 15s, flags if no output for 60s+
8. On completion, generates a structured report
9. Handles Ctrl+C gracefully

### `conductor tasks`

List all tasks with their status.

```bash
conductor tasks
```

```
[a1b2c3d4] completed  claude   fix the login bug
[e5f6g7h8] failed     codex    review all API endpoints
```

### `conductor logs <runId>`

View saved logs for a run.

```bash
conductor logs <runId>
conductor logs <runId> --tail 20        # last 20 lines
conductor logs <runId> --stream stderr  # only stderr
```

### `conductor report <runId>`

View the structured report generated after a run.

```bash
conductor report <runId>
```

Shows: summary, root cause, fix applied, files changed, verification notes, remaining risks.

### `conductor resume <taskId>`

Create a new run for an existing task, injecting context from the previous run (report summary + last 20 log lines) into the prompt.

```bash
conductor resume <taskId>
```

## Task Classification

Tasks are auto-classified based on keywords (Vietnamese and English):

| Type | Triggers |
|------|----------|
| `debug_fix` | fix, bug, error, broken, crash, fail, loi, sua, khong load... |
| `scan_review` | review, scan, audit, check, inspect, analyze, kiem tra... |
| `implement_feature` | add, create, build, implement, feature, them, tao... |
| `verify_only` | verify, validate, confirm, test only, xac nhan... |

Ambiguous input defaults to `debug_fix`.

## Prompt Templates

Templates live in `prompts/<engine>/<task_type>.md` and use `{{variable}}` substitution:

```
prompts/
  claude/
    debug_fix.md
    scan_review.md
    implement_feature.md
    verify_only.md
  codex/
    debug_fix.md
    scan_review.md
    implement_feature.md
    verify_only.md
```

Edit these files to customize what gets sent to each engine.

## Data Storage

All data is stored locally in SQLite at `data/conductor.db`:

- **tasks** -- input, workspace, engine, classification, status
- **runs** -- command, prompt, PID, exit code, timestamps
- **run_logs** -- every stdout/stderr line, sequenced
- **heartbeat_events** -- periodic health checks (alive/idle/stuck)
- **run_reports** -- structured post-run analysis

The database is created automatically on first run.

## Project Structure

```
conductor/
  src/
    cli/                # Commander entry point + commands
      commands/
        run.ts          # Main orchestration flow
        tasks.ts        # List tasks
        logs.ts         # View run logs
        report.ts       # View run reports
        resume.ts       # Resume previous task
    core/
      task/normalizer.ts    # Keyword-based task classification
      prompt/builder.ts     # Template loading + variable substitution
      engine/
        types.ts            # EngineAdapter interface + factory
        claude.ts           # Claude CLI adapter
        codex.ts            # Codex CLI adapter
      runner/process.ts     # child_process.spawn wrapper
      heartbeat/monitor.ts  # Periodic output monitoring
      report/generator.ts   # Post-run report extraction
      storage/
        schema.ts           # SQL DDL
        db.ts               # SQLite init (WAL mode)
        repository.ts       # All CRUD operations
    types/index.ts          # Shared TypeScript types
    utils/
      logger.ts             # Timestamped console logger
      lookup.ts             # Short-ID prefix resolution
  prompts/                  # Prompt templates per engine/task type
  data/                     # SQLite DB + logs (gitignored)
  tests/                    # Vitest test suite
```

## Development

```bash
npm run dev -- <command>     # Run CLI in dev mode (tsx)
npm test                     # Run all tests
npm run test:watch           # Watch mode
npm run build                # Compile TypeScript to dist/
```

## Tech Stack

- **Runtime:** Node.js 22+, TypeScript
- **CLI:** commander
- **Validation:** zod
- **Database:** better-sqlite3
- **Process:** child_process.spawn
- **Tests:** vitest

## License

MIT
