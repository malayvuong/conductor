import { Command } from 'commander';
import fs from 'node:fs';
import path from 'node:path';
import {
  loadConfig, saveConfig, getConfigPath,
  resolveConfigKey, listConfigKeys,
} from '../../core/config/service.js';
import { log } from '../../utils/logger.js';

// ---- Helpers ----

const NUM_KEYS = new Set(['heartbeatIntervalSec', 'stuckThresholdSec']);

function coerceValue(key: string, raw: string): string | number {
  if (NUM_KEYS.has(key)) {
    const n = Number(raw);
    if (Number.isNaN(n)) {
      log.error(`Value for "${key}" must be a number, got: ${raw}`);
      process.exit(1);
    }
    return n;
  }
  return raw;
}

function formatValue(v: unknown): string {
  if (v === undefined || v === null) return '(not set)';
  return String(v);
}

// ---- Commands ----

export function registerConfigCommands(program: Command): void {
  const configCmd = program
    .command('config')
    .description('Manage global configuration');

  // cdx config set <key> <value>
  configCmd
    .command('set <key> <value>')
    .description('Set a config value (keys: engine, path, heartbeat, stuck-threshold)')
    .action((key: string, value: string) => {
      const resolved = resolveConfigKey(key);
      if (!resolved) {
        log.error(`Unknown config key: "${key}". Valid keys: ${listConfigKeys().join(', ')}`);
        process.exit(1);
      }

      // Validate path values
      if (resolved === 'defaultPath') {
        const abs = path.resolve(value);
        if (!fs.existsSync(abs)) {
          log.error(`Path does not exist: ${abs}`);
          process.exit(1);
        }
        value = abs;
      }

      const config = loadConfig();
      (config as any)[resolved] = coerceValue(resolved, value);
      saveConfig(config);
      log.info(`${key} = ${value}`);
    });

  // cdx config get <key>
  configCmd
    .command('get <key>')
    .description('Get a config value')
    .action((key: string) => {
      const resolved = resolveConfigKey(key);
      if (!resolved) {
        log.error(`Unknown config key: "${key}". Valid keys: ${listConfigKeys().join(', ')}`);
        process.exit(1);
      }
      const config = loadConfig();
      console.log(formatValue(config[resolved]));
    });

  // cdx config show
  configCmd
    .command('show')
    .description('Show all config values')
    .action(() => {
      const config = loadConfig();
      const keys = listConfigKeys();
      const hasAny = keys.some(k => {
        const resolved = resolveConfigKey(k);
        return resolved && config[resolved] !== undefined;
      });

      if (!hasAny) {
        console.log('No configuration set yet.');
        console.log('');
        console.log('Quick start:');
        console.log('  cdx config set engine claude');
        console.log('  cdx config set path /path/to/project');
        return;
      }

      console.log(`Config: ${getConfigPath()}`);
      console.log('');
      for (const k of keys) {
        const resolved = resolveConfigKey(k);
        if (resolved) {
          console.log(`  ${k.padEnd(18)} ${formatValue(config[resolved])}`);
        }
      }
    });

  // cdx config unset <key>
  configCmd
    .command('unset <key>')
    .description('Remove a config value')
    .action((key: string) => {
      const resolved = resolveConfigKey(key);
      if (!resolved) {
        log.error(`Unknown config key: "${key}". Valid keys: ${listConfigKeys().join(', ')}`);
        process.exit(1);
      }
      const config = loadConfig();
      delete config[resolved];
      saveConfig(config);
      log.info(`${key} cleared.`);
    });

  // ---- Legacy aliases (backwards compat) ----

  program
    .command('set-path <path>')
    .description('Set default workspace path (alias for: cdx config set path <path>)')
    .action((inputPath: string) => {
      const resolved = path.resolve(inputPath);
      if (!fs.existsSync(resolved)) {
        log.error(`Path does not exist: ${resolved}`);
        process.exit(1);
      }
      const config = loadConfig();
      config.defaultPath = resolved;
      saveConfig(config);
      log.info(`Default path set: ${resolved}`);
    });

  program
    .command('get-path')
    .description('Show default workspace path (alias for: cdx config get path)')
    .action(() => {
      const config = loadConfig();
      if (config.defaultPath) {
        console.log(config.defaultPath);
      } else {
        console.log('No default path set. Use: cdx config set path <path>');
      }
    });

  program
    .command('clear-path')
    .description('Clear default workspace path (alias for: cdx config unset path)')
    .action(() => {
      const config = loadConfig();
      delete config.defaultPath;
      saveConfig(config);
      log.info('Default path cleared.');
    });
}
