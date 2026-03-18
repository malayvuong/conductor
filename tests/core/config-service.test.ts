import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {
  resolveEngine, resolveConfigKey, listConfigKeys,
  engineNotConfiguredMessage,
} from '../../src/core/config/service.js';

describe('config service', () => {
  const tmpDir = path.join(os.tmpdir(), `conductor-test-${Date.now()}`);
  const configFile = path.join(tmpDir, 'config.json');

  beforeEach(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('returns empty config when file does not exist', () => {
    const nonExistent = path.join(tmpDir, 'nope.json');
    expect(fs.existsSync(nonExistent)).toBe(false);
  });

  it('reads and writes config JSON', () => {
    const config = { defaultPath: '/tmp/test', defaultEngine: 'claude' };
    fs.writeFileSync(configFile, JSON.stringify(config, null, 2), 'utf-8');

    const loaded = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(loaded.defaultPath).toBe('/tmp/test');
    expect(loaded.defaultEngine).toBe('claude');
  });

  it('handles partial config', () => {
    const config = { heartbeatIntervalSec: 30 };
    fs.writeFileSync(configFile, JSON.stringify(config), 'utf-8');

    const loaded = JSON.parse(fs.readFileSync(configFile, 'utf-8'));
    expect(loaded.heartbeatIntervalSec).toBe(30);
    expect(loaded.defaultPath).toBeUndefined();
  });
});

// ---- Engine resolution precedence ----
// Uses configOverride to isolate from real ~/.conductor/config.json

describe('resolveEngine precedence', () => {
  const origEnv = process.env.DEFAULT_ENGINE;
  const NO_CONFIG = {};
  const CONFIG_CLAUDE = { defaultEngine: 'claude' };
  const CONFIG_CODEX = { defaultEngine: 'codex' };

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.DEFAULT_ENGINE;
    } else {
      process.env.DEFAULT_ENGINE = origEnv;
    }
  });

  // Priority 1: explicit --engine flag wins over everything
  it('explicit wins over session + config + env', () => {
    process.env.DEFAULT_ENGINE = 'from-env';
    const result = resolveEngine('explicit-engine', 'session-engine', CONFIG_CODEX);
    expect(result).toEqual({ engine: 'explicit-engine', source: 'explicit' });
  });

  // Priority 2: session engine when no explicit
  it('session wins over config + env', () => {
    process.env.DEFAULT_ENGINE = 'from-env';
    const result = resolveEngine(undefined, 'session-engine', CONFIG_CODEX);
    expect(result).toEqual({ engine: 'session-engine', source: 'session' });
  });

  // Priority 3: config when no explicit or session
  it('config wins over env', () => {
    process.env.DEFAULT_ENGINE = 'from-env';
    const result = resolveEngine(undefined, undefined, CONFIG_CLAUDE);
    expect(result).toEqual({ engine: 'claude', source: 'config' });
  });

  // Priority 4: env var when no explicit, session, or config
  it('env var used when no explicit/session/config', () => {
    process.env.DEFAULT_ENGINE = 'from-env';
    const result = resolveEngine(undefined, undefined, NO_CONFIG);
    expect(result).toEqual({ engine: 'from-env', source: 'env' });
  });

  // Priority 5: null when nothing is set
  it('returns null when nothing is configured', () => {
    delete process.env.DEFAULT_ENGINE;
    const result = resolveEngine(undefined, undefined, NO_CONFIG);
    expect(result).toBeNull();
  });

  // Edge: explicit empty string should NOT count
  it('ignores empty string for explicit', () => {
    const result = resolveEngine('', 'session-engine', NO_CONFIG);
    expect(result).toEqual({ engine: 'session-engine', source: 'session' });
  });

  // Edge: session empty string should NOT count
  it('ignores empty string for session', () => {
    const result = resolveEngine(undefined, '', CONFIG_CLAUDE);
    expect(result).toEqual({ engine: 'claude', source: 'config' });
  });
});

describe('resolveConfigKey', () => {
  it('resolves short aliases', () => {
    expect(resolveConfigKey('engine')).toBe('defaultEngine');
    expect(resolveConfigKey('path')).toBe('defaultPath');
    expect(resolveConfigKey('heartbeat')).toBe('heartbeatIntervalSec');
    expect(resolveConfigKey('stuck-threshold')).toBe('stuckThresholdSec');
  });

  it('resolves raw field names', () => {
    expect(resolveConfigKey('defaultEngine')).toBe('defaultEngine');
    expect(resolveConfigKey('defaultPath')).toBe('defaultPath');
  });

  it('returns null for unknown keys', () => {
    expect(resolveConfigKey('foo')).toBeNull();
    expect(resolveConfigKey('bar')).toBeNull();
  });
});

describe('listConfigKeys', () => {
  it('returns all user-facing keys', () => {
    const keys = listConfigKeys();
    expect(keys).toContain('engine');
    expect(keys).toContain('path');
    expect(keys).toContain('heartbeat');
    expect(keys).toContain('stuck-threshold');
  });
});

describe('engineNotConfiguredMessage', () => {
  it('shows full quick-start flow', () => {
    const msg = engineNotConfiguredMessage();
    expect(msg).toContain('cdx config set engine claude');
    expect(msg).toContain('cdx session start');
    expect(msg).toContain('cdx execute');
  });
});
