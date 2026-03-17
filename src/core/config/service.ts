import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';

export interface ConductorConfig {
  defaultPath?: string;
  defaultEngine?: string;
  heartbeatIntervalSec?: number;
  stuckThresholdSec?: number;
}

const CONFIG_DIR = path.join(os.homedir(), '.conductor');
const CONFIG_FILE = path.join(CONFIG_DIR, 'config.json');

function ensureDir(): void {
  if (!fs.existsSync(CONFIG_DIR)) {
    fs.mkdirSync(CONFIG_DIR, { recursive: true });
  }
}

export function loadConfig(): ConductorConfig {
  if (!fs.existsSync(CONFIG_FILE)) return {};
  try {
    return JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
  } catch {
    return {};
  }
}

export function saveConfig(config: ConductorConfig): void {
  ensureDir();
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

// ---- Config key aliases ----
// Allow short names like "engine" → "defaultEngine"
const KEY_ALIASES: Record<string, keyof ConductorConfig> = {
  engine: 'defaultEngine',
  path: 'defaultPath',
  heartbeat: 'heartbeatIntervalSec',
  'stuck-threshold': 'stuckThresholdSec',
};

/** Resolve a user-facing key (e.g. "engine") to the internal config field name. */
export function resolveConfigKey(key: string): keyof ConductorConfig | null {
  if (key in KEY_ALIASES) return KEY_ALIASES[key];
  // Also accept the raw field name directly
  const validKeys: Array<keyof ConductorConfig> = ['defaultPath', 'defaultEngine', 'heartbeatIntervalSec', 'stuckThresholdSec'];
  if (validKeys.includes(key as keyof ConductorConfig)) return key as keyof ConductorConfig;
  return null;
}

/** List all valid user-facing config keys for help text. */
export function listConfigKeys(): string[] {
  return Object.keys(KEY_ALIASES);
}

// ---- Engine Resolution ----

export interface ResolvedEngine {
  engine: string;
  source: 'explicit' | 'session' | 'config' | 'env';
}

/**
 * Resolve engine following priority chain:
 *   1. Explicit override (--engine CLI flag)
 *   2. Session engine (already stored in session)
 *   3. Global config defaultEngine
 *   4. DEFAULT_ENGINE env var
 *   5. null → caller should show onboarding help
 */
export function resolveEngine(explicit?: string, sessionEngine?: string): ResolvedEngine | null {
  if (explicit) {
    return { engine: explicit, source: 'explicit' };
  }
  if (sessionEngine) {
    return { engine: sessionEngine, source: 'session' };
  }
  const config = loadConfig();
  if (config.defaultEngine) {
    return { engine: config.defaultEngine, source: 'config' };
  }
  if (process.env.DEFAULT_ENGINE) {
    return { engine: process.env.DEFAULT_ENGINE, source: 'env' };
  }
  return null;
}

/** Formatted help message when no engine is configured. */
export function engineNotConfiguredMessage(): string {
  return [
    'No engine configured yet.',
    'Run one of the following:',
    '',
    '  cdx config set engine claude',
    '  cdx session start <name> --engine claude',
    '',
    'After that, you can use:',
    '  cdx session start <name>',
  ].join('\n');
}
