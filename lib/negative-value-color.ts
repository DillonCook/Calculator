import type { CSSProperties } from 'react';

export type NegativeValueKind = 'currency' | 'percent' | 'ratio' | 'plain';

interface NegativeValueColorOptions {
  kind?: NegativeValueKind;
  baseline?: number;
}

const clamp = (value: number, min = 0, max = 1) => Math.min(Math.max(value, min), max);

const mixChannel = (start: number, end: number, amount: number) => Math.round(start + (end - start) * amount);

const getScaledMagnitude = (value: number, kind: NegativeValueKind): number => {
  const abs = Math.abs(value);
  if (kind === 'percent') return abs * 100;
  if (kind === 'ratio') return abs * 10;
  return abs;
};

const getSeverity = (scaledMagnitude: number, kind: NegativeValueKind): number => {
  const maxScaled = kind === 'currency' ? 1_000_000 : kind === 'percent' ? 80 : kind === 'ratio' ? 25 : 1_000;
  const curve = kind === 'currency' ? 1.35 : kind === 'percent' ? 1.2 : kind === 'ratio' ? 1.15 : 1.28;
  const raw = clamp(Math.log10(1 + scaledMagnitude) / Math.log10(1 + maxScaled));
  return clamp(Math.pow(raw, curve));
};

export const getNegativeValueColor = (value: number, options?: NegativeValueColorOptions): string | undefined => {
  if (!Number.isFinite(value)) return undefined;

  const kind = options?.kind ?? 'plain';
  const baseline = options?.baseline ?? 0;
  const delta = value - baseline;
  if (delta >= 0) return undefined;

  const scaledMagnitude = getScaledMagnitude(delta, kind);
  const severity = getSeverity(scaledMagnitude, kind);
  const intensity = clamp(0.12 + severity * 0.88);

  const softPink = { r: 244, g: 189, b: 214 };
  const deepRed = { r: 242, g: 76, b: 92 };

  return `rgb(${mixChannel(softPink.r, deepRed.r, intensity)} ${mixChannel(softPink.g, deepRed.g, intensity)} ${mixChannel(softPink.b, deepRed.b, intensity)})`;
};

const getPositiveValueGradientStyle = (value: number, options?: NegativeValueColorOptions): CSSProperties | undefined => {
  if (!Number.isFinite(value)) return undefined;

  const kind = options?.kind ?? 'plain';
  const baseline = options?.baseline ?? 0;
  const delta = value - baseline;
  if (delta <= 0) return undefined;

  const scaledMagnitude = getScaledMagnitude(delta, kind);
  const severity = getSeverity(scaledMagnitude, kind);
  const intensity = clamp(0.14 + Math.pow(severity, 0.82) * 0.9);
  const exceptionalBoost = clamp((severity - 0.78) / 0.22);

  const lightStart = { r: 198, g: 250, b: 212 };
  const strongStart = { r: 96, g: 232, b: 138 };
  const lightEnd = { r: 108, g: 232, b: 142 };
  const strongEnd = { r: 16, g: 177, b: 88 };
  const exceptionalEnd = { r: 3, g: 146, b: 68 };

  const start = {
    r: mixChannel(lightStart.r, strongStart.r, intensity),
    g: mixChannel(lightStart.g, strongStart.g, intensity),
    b: mixChannel(lightStart.b, strongStart.b, intensity)
  };
  const end = {
    r: mixChannel(lightEnd.r, strongEnd.r, intensity),
    g: mixChannel(lightEnd.g, strongEnd.g, intensity),
    b: mixChannel(lightEnd.b, strongEnd.b, intensity)
  };
  const boostedEnd = {
    r: mixChannel(end.r, exceptionalEnd.r, exceptionalBoost),
    g: mixChannel(end.g, exceptionalEnd.g, exceptionalBoost),
    b: mixChannel(end.b, exceptionalEnd.b, exceptionalBoost)
  };
  const mid = {
    r: mixChannel(start.r, boostedEnd.r, 0.46),
    g: mixChannel(start.g, boostedEnd.g, 0.46),
    b: mixChannel(start.b, boostedEnd.b, 0.46)
  };

  return {
    color: `rgb(${boostedEnd.r} ${boostedEnd.g} ${boostedEnd.b})`,
    backgroundImage: `linear-gradient(108deg, rgb(${start.r} ${start.g} ${start.b}) 0%, rgb(${mid.r} ${mid.g} ${mid.b}) 52%, rgb(${boostedEnd.r} ${boostedEnd.g} ${boostedEnd.b}) 100%)`,
    WebkitBackgroundClip: 'text',
    backgroundClip: 'text',
    WebkitTextFillColor: 'transparent'
  };
};

export const getNegativeValueStyle = (value: number, options?: NegativeValueColorOptions): CSSProperties | undefined => {
  const baseline = options?.baseline ?? 0;

  if (value > baseline) {
    return getPositiveValueGradientStyle(value, options);
  }

  const color = getNegativeValueColor(value, options);
  return color ? { color } : undefined;
};
