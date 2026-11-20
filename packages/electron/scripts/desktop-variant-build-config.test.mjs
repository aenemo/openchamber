import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { desktopVariantBuildConfig } from './desktop-variant-build-config.mjs';

const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const releaseConfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).build;

test('a variant build changes the install identity and nothing else', () => {
  const original = structuredClone(releaseConfig);
  const config = desktopVariantBuildConfig(releaseConfig, 'test');
  assert.equal(config.appId, 'dev.openchamber.desktop.test');
  assert.equal(config.productName, 'OpenChamber Test');
  assert.deepEqual(config.extraMetadata, { ...releaseConfig.extraMetadata, openchamberDesktopVariant: 'test' });

  const { appId, productName, extraMetadata, linux, ...rest } = config;
  const { appId: releaseId, productName: releaseName, extraMetadata: releaseExtra, linux: releaseLinux, ...releaseRest } = releaseConfig;
  assert.deepEqual(rest, releaseRest);
  assert.deepEqual(
    { ...linux, executableName: releaseLinux.executableName, desktop: releaseLinux.desktop },
    releaseLinux,
  );
  assert.equal(linux.executableName, 'openchamber-test');
  assert.deepEqual(linux.desktop.entry, {
    ...releaseLinux.desktop.entry,
    Name: 'OpenChamber Test',
    Icon: 'openchamber-test',
    StartupWMClass: 'openchamber-test',
  });
  // The release configuration is left as it was.
  assert.deepEqual(releaseConfig, original);
});

test('a variant build keeps the release update feed, which the app refuses at check time', () => {
  const config = desktopVariantBuildConfig(releaseConfig, 'test');
  assert.deepEqual(config.publish, releaseConfig.publish);
  assert.equal(config.artifactName, releaseConfig.artifactName);
});

test('the variant is normalized, and a value that cannot name an app is refused', () => {
  const config = desktopVariantBuildConfig(releaseConfig, '  TEST  ');
  assert.equal(config.appId, 'dev.openchamber.desktop.test');
  assert.equal(config.productName, 'OpenChamber Test');
  assert.equal(config.extraMetadata.openchamberDesktopVariant, 'test');
  assert.throws(() => desktopVariantBuildConfig(releaseConfig, 'Test Build'), /OPENCHAMBER_DESKTOP_VARIANT/);
});