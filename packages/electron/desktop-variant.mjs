import fs from 'node:fs';

export const RELEASE_VARIANT = Object.freeze({
  variant: '',
  appName: 'OpenChamber',
  appId: 'dev.openchamber.desktop',
  dataDirName: 'openchamber',
  executableName: 'openchamber',
});

const VARIANT_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_VARIANT_LENGTH = 32;

export const normalizeDesktopVariant = (value) => {
  const variant = String(value ?? '').trim().toLowerCase();
  if (!variant) return '';
  if (variant.length > MAX_VARIANT_LENGTH || !VARIANT_PATTERN.test(variant)) {
    throw new Error(`OPENCHAMBER_DESKTOP_VARIANT must be lowercase letters, digits and single dashes (at most ${MAX_VARIANT_LENGTH} characters), got "${String(value)}"`);
  }
  return variant;
};

const titleCase = (value) => value
  .split('-')
  .map((part) => `${part.charAt(0).toUpperCase()}${part.slice(1)}`)
  .join(' ');

export const resolveDesktopVariant = (value) => {
  const variant = normalizeDesktopVariant(value);
  if (!variant) return RELEASE_VARIANT;
  return {
    variant,
    appName: `OpenChamber ${titleCase(variant)}`,
    appId: `dev.openchamber.desktop.${variant}`,
    dataDirName: `openchamber-${variant}`,
    executableName: `openchamber-${variant}`,
  };
};

export const readPackagedDesktopVariant = (packageJsonPath) => {
  try {
    const meta = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
    return typeof meta.openchamberDesktopVariant === 'string'
      ? normalizeDesktopVariant(meta.openchamberDesktopVariant)
      : '';
  } catch {
    return '';
  }
};