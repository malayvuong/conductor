import type { Task, Run, RunLog, StreamType } from '../../types/index.js';
import { interpretLogLine, type ParsedRunEvent } from '../engine/log-interpreter.js';

interface ReportData {
  summary: string;
  root_cause: string | null;
  fix_applied: string | null;
  files_changed_json: string | null;
  verification_notes: string | null;
  remaining_risks: string | null;
}

export function generateReport(task: Task, run: Run, logs: RunLog[]): ReportData {
  const duration = run.started_at && run.finished_at
    ? formatDuration(new Date(run.finished_at).getTime() - new Date(run.started_at).getTime())
    : 'unknown';

  const isFailed = run.status === 'failed' || (run.exit_code !== null && run.exit_code !== 0);

  // Interpret all log lines into structured events
  const events = logs.map(l => interpretLogLine(l.stream_type as StreamType, l.line));

  // Separate by type
  const textEvents = events.filter(e => e.type === 'text' && e.displayText);
  const toolEvents = events.filter(e => e.type === 'tool_use');
  const errorEvents = events.filter(e => e.type === 'error' && e.displayText);
  const resultEvents = events.filter(e => e.type === 'result');

  // Extract files from tool_use events
  const filesChanged = extractFilesFromTools(toolEvents);

  // Build summary
  const summary = buildSummary(task, run, duration, isFailed, textEvents, errorEvents, resultEvents);

  // Extract structured fields from text content
  const allText = textEvents.map(e => e.displayText!);
  const rootCause = extractFromText(allText, /(?:root\s*cause|found|issue|problem)[:\s]+(.*)/i);
  const fixApplied = extractFromText(allText, /(?:fix(?:ed)?|changed|updated|added)[:\s]+(.*)/i);
  const verification = extractFromText(allText, /(?:test(?:s)?|verif(?:y|ied)|pass(?:es|ing)?)[:\s]+(.*)/i);

  return {
    summary,
    root_cause: rootCause,
    fix_applied: fixApplied,
    files_changed_json: filesChanged.length > 0 ? JSON.stringify(filesChanged) : null,
    verification_notes: verification,
    remaining_risks: null,
  };
}

function buildSummary(
  task: Task, run: Run, duration: string, isFailed: boolean,
  textEvents: ParsedRunEvent[], errorEvents: ParsedRunEvent[], resultEvents: ParsedRunEvent[],
): string {
  const header = isFailed
    ? `Run failed (exit code: ${run.exit_code}, duration: ${duration}).`
    : `Run completed successfully (exit code: 0, duration: ${duration}).`;

  const parts = [header, `\nTask: ${task.raw_input}`];

  if (isFailed && errorEvents.length > 0) {
    const lastErrors = errorEvents.slice(-5).map(e => e.displayText).join('\n');
    parts.push(`\nLast errors:\n${lastErrors}`);
  }

  // Show last meaningful text output
  const lastText = textEvents.slice(-5).map(e => e.displayText).join('\n');
  if (lastText) {
    parts.push(`\nFinal output:\n${lastText}`);
  } else if (!isFailed) {
    parts.push('\n(no readable text output)');
  }

  // Include result event info if available
  const result = resultEvents[resultEvents.length - 1];
  if (result?.displayText) {
    parts.push(`\nResult: ${result.displayText}`);
  }

  return parts.join('\n');
}

function extractFilesFromTools(toolEvents: ParsedRunEvent[]): string[] {
  const files = new Set<string>();
  for (const event of toolEvents) {
    if (event.filePath) {
      files.add(event.filePath);
    }
    // Also try to extract from raw JSON for tools that modify files
    if (event.toolName && ['Edit', 'Write', 'NotebookEdit'].includes(event.toolName)) {
      try {
        const raw = JSON.parse(event.raw);
        const input = raw.message?.content?.find((b: any) => b.type === 'tool_use')?.input;
        if (input?.file_path) files.add(input.file_path);
        if (input?.path) files.add(input.path);
      } catch { /* ignore parse errors */ }
    }
  }
  return Array.from(files);
}

function extractFromText(lines: string[], pattern: RegExp): string | null {
  for (const line of lines) {
    const match = pattern.exec(line);
    if (match) return match[1].trim();
  }
  return null;
}

function formatDuration(ms: number): string {
  const seconds = Math.floor(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const remaining = seconds % 60;
  return `${minutes}m ${remaining}s`;
}
