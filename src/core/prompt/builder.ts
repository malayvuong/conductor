import fs from 'node:fs';
import path from 'node:path';
import type { TaskType } from '../../types/index.js';

interface BuildPromptInput {
  engine: string;
  task_type: TaskType | string;
  variables: Record<string, string>;
}

function getPromptsDir(): string {
  // Walk up from current file to find prompts/ directory
  // In dev: src/core/prompt/builder.ts → 3 levels up → prompts/
  // In dist: dist/core/prompt/builder.js → 3 levels up → prompts/
  let dir = path.dirname(new URL(import.meta.url).pathname);
  // Go up to project root
  for (let i = 0; i < 3; i++) {
    dir = path.dirname(dir);
  }
  return path.join(dir, 'prompts');
}

export function buildPrompt(input: BuildPromptInput): string {
  const promptsDir = getPromptsDir();
  const templatePath = path.join(promptsDir, input.engine, `${input.task_type}.md`);

  if (!fs.existsSync(templatePath)) {
    throw new Error(`Prompt template not found: ${templatePath}`);
  }

  let template = fs.readFileSync(templatePath, 'utf-8');

  for (const [key, value] of Object.entries(input.variables)) {
    template = template.replaceAll(`{{${key}}}`, value);
  }

  return template;
}
