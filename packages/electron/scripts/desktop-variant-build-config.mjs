import { resolveDesktopVariant } from '../desktop-variant.mjs';

export const desktopVariantBuildConfig = (releaseConfig, variant) => {
  const resolved = resolveDesktopVariant(variant);
  const config = structuredClone(releaseConfig);
  config.appId = resolved.appId;
  config.productName = resolved.appName;
  config.extraMetadata = { ...config.extraMetadata, openchamberDesktopVariant: resolved.variant };
  config.linux = {
    ...config.linux,
    executableName: resolved.executableName,
    desktop: {
      ...config.linux.desktop,
      entry: {
        ...config.linux.desktop.entry,
        Name: resolved.appName,
        Icon: resolved.executableName,
        StartupWMClass: resolved.executableName,
      },
    },
  };
  return config;
};