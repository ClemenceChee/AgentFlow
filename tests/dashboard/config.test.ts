import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as os from 'node:os';
import { loadConfig, getAliases, getSkipFiles, getDiscoveryPaths, getProcessPreference } from '../../packages/dashboard/src/config';

describe('Config', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'agentflow-config-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
    delete process.env.AGENTFLOW_CONFIG;
  });

  describe('loadConfig', () => {
    it('returns empty defaults when no config file exists', () => {
      // Use a nonexistent explicit path — loadConfig tries it first,
      // then env (cleared in afterEach), then CWD (no config), then ~/.config.
      // We need to also prevent the ~/.config fallback.
      const origHome = process.env.HOME;
      process.env.HOME = tmpDir; // tmpDir has no .config/agentflow/config.json
      try {
        const { config, configPath } = loadConfig('/nonexistent/config.json');
        expect(configPath).toBeNull();
        expect(config).toEqual({});
      } finally {
        process.env.HOME = origHome;
      }
    });

    it('loads config from explicit path', () => {
      const cfgPath = path.join(tmpDir, 'test-config.json');
      fs.writeFileSync(cfgPath, JSON.stringify({ aliases: { foo: 'bar' } }));
      const { config, configPath } = loadConfig(cfgPath);
      expect(configPath).toBe(cfgPath);
      expect(config.aliases).toEqual({ foo: 'bar' });
    });

    it('loads config from AGENTFLOW_CONFIG env var', () => {
      const cfgPath = path.join(tmpDir, 'env-config.json');
      fs.writeFileSync(cfgPath, JSON.stringify({ skipFiles: ['test.log'] }));
      process.env.AGENTFLOW_CONFIG = cfgPath;
      const { config, configPath } = loadConfig();
      expect(configPath).toBe(cfgPath);
      expect(config.skipFiles).toEqual(['test.log']);
    });

    it('strips // comment keys from config', () => {
      const cfgPath = path.join(tmpDir, 'commented.json');
      fs.writeFileSync(cfgPath, JSON.stringify({
        '// this is a comment': 'ignored',
        aliases: { a: 'b' },
        '// another comment': true,
      }));
      const { config } = loadConfig(cfgPath);
      expect(config.aliases).toEqual({ a: 'b' });
      expect((config as any)['// this is a comment']).toBeUndefined();
    });

    it('returns empty defaults on invalid JSON', () => {
      const cfgPath = path.join(tmpDir, 'bad.json');
      fs.writeFileSync(cfgPath, 'not json {{{');
      const { config, configPath } = loadConfig(cfgPath);
      expect(configPath).toBeNull();
      expect(config).toEqual({});
    });
  });

  describe('accessors', () => {
    it('getAliases returns empty object for empty config', () => {
      expect(getAliases({})).toEqual({});
    });

    it('getAliases returns aliases from config', () => {
      expect(getAliases({ aliases: { a: 'b' } })).toEqual({ a: 'b' });
    });

    it('getSkipFiles returns empty array for empty config', () => {
      expect(getSkipFiles({})).toEqual([]);
    });

    it('getDiscoveryPaths expands tilde', () => {
      const paths = getDiscoveryPaths({ discoveryPaths: ['~/test'] });
      expect(paths[0]).toBe(path.join(os.homedir(), 'test'));
    });

    it('getProcessPreference returns null for empty config', () => {
      expect(getProcessPreference({})).toBeNull();
    });

    it('getProcessPreference returns preference from config', () => {
      const pref = getProcessPreference({ processPreference: { prefer: 'a', over: 'b' } });
      expect(pref).toEqual({ prefer: 'a', over: 'b' });
    });
  });
});
