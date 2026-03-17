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

const HARD_FALLBACK_ENGINE = 'claude';

/**
 * Resolve engine with graceful fallback chain:
 *   1. Explicit override (CLI flag, session field)
 *   2. Config defaultEngine
 *   3. DEFAULT_ENGINE env var
 *   4. Hard fallback: "claude"
 *
 * Returns { engine, source } so callers can log provenance.
 */
export function resolveEngine(explicit?: string): { engine: string; source: string } {
  if (explicit) {
    return { engine: explicit, source: 'explicit' };
  }
  const config = loadConfig();
  if (config.defaultEngine) {
    return { engine: config.defaultEngine, source: 'config' };
  }
  if (process.env.DEFAULT_ENGINE) {
    return { engine: process.env.DEFAULT_ENGINE, source: 'env' };
  }
  return { engine: HARD_FALLBACK_ENGINE, source: 'default fallback' };
}
