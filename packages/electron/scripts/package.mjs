import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { resolveDesktopVariant } from '../desktop-variant.mjs';
import { canaryBuildConfig } from './canary-build-config.mjs';
import { desktopVariantBuildConfig } from './desktop-variant-build-config.mjs';
import { resolveTargetArchitecture } from './target-architecture.mjs';

const env = { ...process.env };
const builderArgs = process.argv.slice(2);
const packageDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

const writeBuilderConfig = (fileName, config) => {
  const configPath = path.join(packageDir, '.cache', fileName);
  fs.mkdirSync(path.dirname(configPath), { recursive: true });
  fs.writeFileSync(configPath, `${JSON.stringify(config, null, 2)}\n`);
  builderArgs.unshift('--config', configPath);
};

const variant = resolveDesktopVariant(env.OPENCHAMBER_DESKTOP_VARIANT);
if (variant.variant && env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary') {
  throw new Error('OPENCHAMBER_DESKTOP_VARIANT cannot be combined with a Canary channel build.');
}

if (env.OPENCHAMBER_DESKTOP_CHANNEL === 'canary') {
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).build;
  writeBuilderConfig('canary-builder-config.json', canaryBuildConfig(releaseConfig));
  console.log('[electron] building Canary: the release app with the Canary icons');
}

if (variant.variant) {
  const releaseConfig = JSON.parse(fs.readFileSync(path.join(packageDir, 'package.json'), 'utf8')).build;
  writeBuilderConfig(`variant-${variant.variant}-builder-config.json`, desktopVariantBuildConfig(releaseConfig, variant.variant));
  console.log(`[electron] building ${variant.appName}: separate app id, profile and data directory`);
}
const targetArchitecture = resolveTargetArchitecture({ environment: env, builderArgs });

if (process.platform === 'win32' && !env.CSC_LINK && !env.WINDOWS_CSC_LINK) {
  env.CSC_IDENTITY_AUTO_DISCOVERY = 'false';
  console.log('[electron] Windows code signing disabled; building unsigned installer.');
}

const bunBinaryCandidates = [
  process.env.npm_execpath,
  process.env.BUN_INSTALL ? path.join(process.env.BUN_INSTALL, 'bin', process.platform === 'win32' ? 'bun.exe' : 'bun') : null,
  process.platform === 'win32' ? 'bun.exe' : 'bun',
].filter(Boolean);

const bunBinary = bunBinaryCandidates.find((candidate) => {
  if (path.basename(candidate).toLowerCase().startsWith('bun')) {
    return candidate === 'bun' || candidate === 'bun.exe' || fs.existsSync(candidate);
  }
  return false;
}) || (process.platform === 'win32' ? 'bun.exe' : 'bun');

if (process.platform === 'linux' && !builderArgs.some((argument) => (
  argument === '--x64' || argument === '--arm64' || argument === '--arch' || argument.startsWith('--arch=')
))) {
  builderArgs.push(`--${targetArchitecture.electronBuilder}`);
}

const child = spawn(bunBinary, ['x', 'electron-builder', ...builderArgs], {
  env,
  stdio: 'inherit',
});

child.on('exit', (code, signal) => {
  if (signal) {
    process.kill(process.pid, signal);
    return;
  }
  process.exit(code ?? 1);
});

child.on('error', (error) => {
  console.error('[electron] failed to start electron-builder:', error);
  process.exit(1);
});
