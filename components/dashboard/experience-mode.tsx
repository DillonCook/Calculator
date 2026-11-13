'use client';

import { useEffect, useState } from 'react';

const STORAGE_KEY = 'dealcooker-experience:v1';
export type ExperienceMode = 'guided' | 'pro';

export function useExperienceMode() {
  const [mode, setMode] = useState<ExperienceMode>('guided');
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'pro') setMode('pro');
    } catch { /* The current visit still works when browser storage is disabled. */ }
  }, []);
  const selectMode = (next: ExperienceMode) => {
    setMode(next);
    try { window.localStorage.setItem(STORAGE_KEY, next); } catch { /* Visit-only preference. */ }
  };
  return { mode, selectMode, isPro: mode === 'pro' };
}

export function ExperienceSwitch({ mode, onChange }: { mode: ExperienceMode; onChange: (mode: ExperienceMode) => void }) {
  return <div className="experience-switch" role="group" aria-label="Analysis experience">
    {(['guided', 'pro'] as const).map(value => <button key={value} type="button" aria-pressed={mode === value} onClick={() => onChange(value)} className="experience-option">
      {value === 'pro' ? 'Pro Mode' : 'Guided'}
    </button>)}
  </div>;
}
