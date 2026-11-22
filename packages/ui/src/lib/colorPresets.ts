const HEX_COLOR_PATTERN = /^#[0-9a-fA-F]{6}$/;

export const isHexColor = (value: string): boolean => HEX_COLOR_PATTERN.test(value);

export const COLOR_PRESETS = ['#e5484d', '#f76b15', '#d6a312', '#30a46c', '#12a594', '#3e63dd', '#8e4ec6', '#d6409f'] as const;

export const pickLeastUsedColor = (usedColors: Iterable<string | null | undefined>): string => {
  const colorKeys: string[] = [...COLOR_PRESETS];
  const usageCounts = new Map<string, number>();
  for (const key of colorKeys) {
    usageCounts.set(key, 0);
  }
  for (const color of usedColors) {
    if (color && usageCounts.has(color)) {
      usageCounts.set(color, (usageCounts.get(color) ?? 0) + 1);
    }
  }
  const minUsage = Math.min(...usageCounts.values());
  const candidates = colorKeys.filter((key) => usageCounts.get(key) === minUsage);
  return candidates[Math.floor(Math.random() * candidates.length)] ?? colorKeys[0]!;
};

const hashSeedToIndex = (seed: string, length: number): number => {
  let hash = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    hash ^= seed.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return (hash >>> 0) % length;
};

export const pickDeterministicLeastUsedColor = (seed: string, usedColors: Iterable<string | null | undefined>): string => {
  const colorKeys: string[] = [...COLOR_PRESETS];
  const usageCounts = new Map<string, number>();
  for (const key of colorKeys) {
    usageCounts.set(key, 0);
  }
  for (const color of usedColors) {
    if (color && usageCounts.has(color)) {
      usageCounts.set(color, (usageCounts.get(color) ?? 0) + 1);
    }
  }
  const minUsage = Math.min(...usageCounts.values());
  const candidates = colorKeys.filter((key) => usageCounts.get(key) === minUsage);
  if (candidates.length === 0) return colorKeys[0]!;
  return candidates[hashSeedToIndex(seed, candidates.length)] ?? colorKeys[0]!;
};
