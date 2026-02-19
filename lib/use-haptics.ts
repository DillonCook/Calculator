'use client';

const supportsVibrate = () => typeof navigator !== 'undefined' && typeof navigator.vibrate === 'function';

export type HapticTone = 'light' | 'medium' | 'success';

const vibrationByTone: Record<HapticTone, number | number[]> = {
  light: 8,
  medium: 14,
  success: [10, 24, 12]
};

export const triggerHapticFeedback = (tone: HapticTone = 'light') => {
  if (!supportsVibrate()) return;

  navigator.vibrate(vibrationByTone[tone]);
};
