export type NegativeValueKind = 'currency' | 'percent' | 'ratio' | 'plain';

interface NegativeValueColorOptions {
  kind?: NegativeValueKind;
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
  if (!Number.isFinite(value) || value >= 0) return undefined;

  const kind = options?.kind ?? 'plain';
  const scaledMagnitude = getScaledMagnitude(value, kind);
  const severity = getSeverity(scaledMagnitude, kind);
  const intensity = clamp(0.12 + severity * 0.88);

  const softPink = { r: 244, g: 189, b: 214 };
  const deepRed = { r: 242, g: 76, b: 92 };

  return `rgb(${mixChannel(softPink.r, deepRed.r, intensity)} ${mixChannel(softPink.g, deepRed.g, intensity)} ${mixChannel(softPink.b, deepRed.b, intensity)})`;
};

export const getNegativeValueStyle = (value: number, options?: NegativeValueColorOptions): { color: string } | undefined => {
  const color = getNegativeValueColor(value, options);
  return color ? { color } : undefined;
};

