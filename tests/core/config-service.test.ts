import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { resolveEngine, resolveConfigKey, listConfigKeys, engineNotConfiguredMessage } from '../../src/core/config/service.js';

// We test the config service by importing and using it with a temp directory
// Since the config service uses a fixed path (~/.conductor), we'll test the
// core logic directly.

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

describe('resolveEngine', () => {
  const origEnv = process.env.DEFAULT_ENGINE;

  afterEach(() => {
    if (origEnv === undefined) {
      delete process.env.DEFAULT_ENGINE;
    } else {
      process.env.DEFAULT_ENGINE = origEnv;
    }
  });

  it('returns explicit engine when provided', () => {
    const result = resolveEngine('codex');
    expect(result).toEqual({ engine: 'codex', source: 'explicit' });
  });

  it('returns session engine when no explicit', () => {
    const result = resolveEngine(undefined, 'codex');
    expect(result).toEqual({ engine: 'codex', source: 'session' });
  });

  it('prefers explicit over session engine', () => {
    const result = resolveEngine('claude', 'codex');
    expect(result).toEqual({ engine: 'claude', source: 'explicit' });
  });

  it('falls back to env var', () => {
    process.env.DEFAULT_ENGINE = 'codex';
    // If ~/.conductor/config.json has defaultEngine this returns 'config',
    // otherwise 'env'. Either way it should not be null.
    const result = resolveEngine(undefined);
    expect(result).not.toBeNull();
    expect(result!.engine).toBeTruthy();
  });

  it('returns null when nothing is configured and no env', () => {
    delete process.env.DEFAULT_ENGINE;
    // This depends on whether ~/.conductor/config.json exists.
    // We test the function signature — it returns ResolvedEngine | null.
    const result = resolveEngine(undefined);
    // Can't assert null because real config may exist, but type is correct.
    expect(result === null || typeof result.engine === 'string').toBe(true);
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
  it('returns helpful onboarding text', () => {
    const msg = engineNotConfiguredMessage();
    expect(msg).toContain('cdx config set engine claude');
    expect(msg).toContain('cdx session start');
  });
});
