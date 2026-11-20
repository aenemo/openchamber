import { expect, test } from 'bun:test';
import path from 'node:path';
import { configureOpenChamberDataDir } from './desktop-data-dir.mjs';

test('a development or variant build defaults to its own data and records the injected value', () => {
  const env = {};
  configureOpenChamberDataDir(env, 'openchamber-dev', '/home/test');
  expect(env.OPENCHAMBER_DATA_DIR).toBe(path.join('/home/test', '.config', 'openchamber-dev'));
  expect(env.OPENCHAMBER_INJECTED_ENV).toBe('OPENCHAMBER_DATA_DIR');

  const variant = {};
  configureOpenChamberDataDir(variant, 'openchamber-test', '/home/test');
  expect(variant.OPENCHAMBER_DATA_DIR).toBe(path.join('/home/test', '.config', 'openchamber-test'));
});

test('an explicit data directory is kept', () => {
  const explicit = { OPENCHAMBER_DATA_DIR: '/custom' };
  configureOpenChamberDataDir(explicit, 'openchamber-test', '/home/test');
  expect(explicit).toEqual({ OPENCHAMBER_DATA_DIR: '/custom' });
});