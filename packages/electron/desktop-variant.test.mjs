import { expect, test } from 'bun:test';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

import { RELEASE_VARIANT, normalizeDesktopVariant, readPackagedDesktopVariant, resolveDesktopVariant } from './desktop-variant.mjs';

test('without a variant the released identity is kept', () => {
  expect(resolveDesktopVariant('')).toEqual({
    variant: '',
    appName: 'OpenChamber',
    appId: 'dev.openchamber.desktop',
    dataDirName: 'openchamber',
    executableName: 'openchamber',
  });
  expect(resolveDesktopVariant(undefined)).toBe(RELEASE_VARIANT);
  expect(resolveDesktopVariant('   ')).toBe(RELEASE_VARIANT);
  expect(Object.isFrozen(RELEASE_VARIANT)).toBe(true);
});

test('a variant names its own app, id, data directory and executable', () => {
  expect(resolveDesktopVariant('test')).toEqual({
    variant: 'test',
    appName: 'OpenChamber Test',
    appId: 'dev.openchamber.desktop.test',
    dataDirName: 'openchamber-test',
    executableName: 'openchamber-test',
  });
  expect(resolveDesktopVariant('beta-two').appName).toBe('OpenChamber Beta Two');
  expect(resolveDesktopVariant('Beta-Two').appId).toBe('dev.openchamber.desktop.beta-two');
});

test('normalization trims and lowercases, and empty values mean the release', () => {
  expect(normalizeDesktopVariant('  TEST  ')).toBe('test');
  expect(normalizeDesktopVariant('Beta-Two')).toBe('beta-two');
  expect(normalizeDesktopVariant(null)).toBe('');
  expect(normalizeDesktopVariant(undefined)).toBe('');
  expect(normalizeDesktopVariant('x'.repeat(32))).toBe('x'.repeat(32));
});

test('a variant that cannot name an app id or a directory is refused', () => {
  for (const value of ['Test Build', 'test_build', 'a--b', '-x', 'test-', 'x'.repeat(33)]) {
    expect(() => normalizeDesktopVariant(value)).toThrow(/OPENCHAMBER_DESKTOP_VARIANT must be/);
    expect(() => resolveDesktopVariant(value)).toThrow(/OPENCHAMBER_DESKTOP_VARIANT must be/);
  }
});

test('the packaged build carries its variant, and anything unreadable is the release', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'oc-variant-'));
  try {
    const write = (name, value) => {
      const file = path.join(directory, name);
      fs.writeFileSync(file, JSON.stringify(value));
      return file;
    };
    expect(readPackagedDesktopVariant(write('variant.json', { openchamberDesktopVariant: 'test' }))).toBe('test');
    expect(readPackagedDesktopVariant(write('release.json', { name: '@openchamber/electron' }))).toBe('');
    expect(readPackagedDesktopVariant(write('invalid.json', { openchamberDesktopVariant: 'Test Build' }))).toBe('');
    expect(readPackagedDesktopVariant(path.join(directory, 'missing.json'))).toBe('');
  } finally {
    fs.rmSync(directory, { recursive: true, force: true });
  }
});