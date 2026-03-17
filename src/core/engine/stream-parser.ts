/**
 * Parses stream-json events from Claude CLI into human-readable log lines.
 * Returns null if the event should be silently stored but not displayed.
 */
export function parseClaudeStreamEvent(jsonLine: string): { display: string | null; raw: string } {
  try {
    const event = JSON.parse(jsonLine);

    switch (event.type) {
      case 'system': {
        if (event.subtype === 'init') {
          return { display: `[system] Session started (model: ${event.model || 'unknown'})`, raw: jsonLine };
        }
        if (event.subtype === 'hook_started') {
          return { display: null, raw: jsonLine }; // silent
        }
        if (event.subtype === 'hook_response') {
          return { display: null, raw: jsonLine }; // silent
        }
        return { display: `[system] ${event.subtype || 'event'}`, raw: jsonLine };
      }

      case 'assistant': {
        const msg = event.message;
        if (!msg?.content) return { display: null, raw: jsonLine };

        const parts: string[] = [];
        for (const block of msg.content) {
          if (block.type === 'text' && block.text) {
            parts.push(block.text);
          } else if (block.type === 'tool_use') {
            parts.push(`[tool: ${block.name}]`);
          }
        }
        const text = parts.join(' ');
        return { display: text || null, raw: jsonLine };
      }

      case 'tool_result': {
        // Tool execution result — show a brief summary
        if (event.content) {
          const preview = typeof event.content === 'string'
            ? event.content.slice(0, 200)
            : JSON.stringify(event.content).slice(0, 200);
          return { display: `[result] ${preview}`, raw: jsonLine };
        }
        return { display: null, raw: jsonLine };
      }

      case 'rate_limit_event': {
        return { display: null, raw: jsonLine }; // silent
      }

      case 'result': {
        const status = event.subtype || 'done';
        const cost = event.total_cost_usd ? ` ($${event.total_cost_usd.toFixed(4)})` : '';
        const duration = event.duration_ms ? ` ${Math.round(event.duration_ms / 1000)}s` : '';
        return { display: `[done] ${status}${duration}${cost}`, raw: jsonLine };
      }

      default:
        return { display: null, raw: jsonLine };
    }
  } catch {
    // Not JSON — return as plain text
    return { display: jsonLine, raw: jsonLine };
  }
}
