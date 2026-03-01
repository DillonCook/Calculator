'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { triggerHapticFeedback } from '@/lib/use-haptics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallSurface = 'none' | 'prompt' | 'ios' | 'manual';

const PWA_INSTALL_DISMISS_KEY = 'dealcooker-pwa-install-dismissed-at:v1';
const PWA_INSTALL_DISMISS_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;
export const PWA_OPEN_INSTALL_EVENT = 'dealcooker:pwa-open-install';

const isStandaloneDisplayMode = () => {
  if (typeof window === 'undefined') return false;
  const navigatorWithStandalone = window.navigator as Navigator & { standalone?: boolean };
  return window.matchMedia('(display-mode: standalone)').matches || navigatorWithStandalone.standalone === true;
};

const isIOSDevice = () => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /iphone|ipad|ipod/.test(userAgent);
};

const getDismissedAt = () => {
  if (typeof window === 'undefined') return null;

  const rawValue = window.localStorage.getItem(PWA_INSTALL_DISMISS_KEY);
  if (!rawValue) return null;

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue)) return null;

  return parsedValue;
};

export function PwaInstallBanner() {
  const [installSurface, setInstallSurface] = useState<InstallSurface>('none');
  const [isInstallPromptDismissed, setIsInstallPromptDismissed] = useState(false);
  const [isInstalling, setIsInstalling] = useState(false);
  const [feedback, setFeedback] = useState<string | null>(null);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const dismissedAt = getDismissedAt();
    if (dismissedAt && Date.now() - dismissedAt < PWA_INSTALL_DISMISS_WINDOW_MS) {
      setIsInstallPromptDismissed(true);
    }

    if (isIOSDevice() && !isStandaloneDisplayMode()) {
      setInstallSurface('ios');
    }

    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
        setFeedback('Offline mode is unavailable in this browser session.');
      });
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      setInstallSurface('prompt');
      setFeedback(null);
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setInstallSurface('none');
      setFeedback('DealCooker is now installed on this device.');
    };

    const handleOpenInstallRequest = () => {
      if (isStandaloneDisplayMode()) {
        setInstallSurface('none');
        setIsInstallPromptDismissed(true);
        return;
      }

      setIsInstallPromptDismissed(false);
      setFeedback(null);

      if (deferredPromptRef.current) {
        setInstallSurface('prompt');
        return;
      }

      if (isIOSDevice()) {
        setInstallSurface('ios');
        return;
      }

      setInstallSurface('manual');
      setFeedback('Install prompt is not ready yet. Keep browsing, then try again from Settings.');
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener(PWA_OPEN_INSTALL_EVENT, handleOpenInstallRequest);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(PWA_OPEN_INSTALL_EVENT, handleOpenInstallRequest);
    };
  }, []);

  const shouldRender = useMemo(() => {
    if (isInstallPromptDismissed) return false;
    return installSurface !== 'none';
  }, [installSurface, isInstallPromptDismissed]);

  const dismissPrompt = () => {
    triggerHapticFeedback('light');
    setIsInstallPromptDismissed(true);
    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
  };

  const installApp = async () => {
    const promptEvent = deferredPromptRef.current;
    if (!promptEvent) {
      setFeedback('Install prompt is not ready yet. Keep browsing, then try again.');
      return;
    }

    triggerHapticFeedback('light');
    setIsInstalling(true);
    setFeedback(null);

    try {
      await promptEvent.prompt();
      const { outcome } = await promptEvent.userChoice;
      if (outcome === 'accepted') {
        setFeedback('Installing DealCooker...');
      } else {
        setFeedback('Install canceled. You can install anytime from browser settings.');
      }
    } catch {
      setFeedback('Install is not available right now. Try again from browser settings.');
    } finally {
      deferredPromptRef.current = null;
      setIsInstalling(false);
      setInstallSurface('none');
    }
  };

  if (!shouldRender) return null;

  const title = 'Download the app!';
  const description =
    installSurface === 'ios'
      ? 'In Safari, tap Share and choose Add to Home Screen for the full app experience.'
      : installSurface === 'manual'
        ? 'Install prompt is not available yet in this browser session.'
        : 'Install for fast launch, full-screen mode, and offline access.';
  const installLabel = isInstalling ? 'Installing...' : 'Download the app!';

  return (
    <>
      <section
        role="region"
        aria-label="Install DealCooker"
        className="fixed inset-x-2 z-[170] rounded-2xl border border-accent/45 bg-[linear-gradient(140deg,rgba(20,36,56,0.98),rgba(21,47,74,0.96),rgba(20,35,48,0.98))] p-3 shadow-soft sm:hidden"
        style={{ top: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-accent">Install for free</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-100">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            {feedback ? <p className="mt-2 text-[11px] text-accent">{feedback}</p> : null}
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss install prompt"
            className="tap-feedback inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-white/20 bg-white/[0.03] text-slate-300 hover:border-accent/55 hover:text-accent"
          >
            X
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          {installSurface === 'prompt' ? (
            <button
              type="button"
              onClick={installApp}
              disabled={isInstalling}
              className="btn-primary btn-vault tap-feedback min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-65"
            >
              {installLabel}
            </button>
          ) : null}
          <button
            type="button"
            onClick={dismissPrompt}
            className="tap-feedback min-h-9 rounded-lg border border-white/20 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent/55 hover:text-accent"
          >
            Not now
          </button>
        </div>
      </section>

      <section
        role="region"
        aria-label="Install DealCooker"
        className="hidden rounded-2xl border border-accent/35 bg-[linear-gradient(140deg,rgba(20,36,56,0.92),rgba(21,47,74,0.82),rgba(20,35,48,0.94))] p-3 shadow-soft sm:block sm:p-4"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-[0.16em] text-accent">Premium install mode</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-100 sm:text-base">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">{description}</p>
            {feedback ? <p className="mt-2 text-[11px] text-accent sm:text-xs">{feedback}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {installSurface === 'prompt' ? (
              <button
                type="button"
                onClick={installApp}
                disabled={isInstalling}
                className="btn-primary btn-vault tap-feedback min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold sm:min-h-10 sm:text-sm disabled:opacity-65"
              >
                {installLabel}
              </button>
            ) : null}
            <button
              type="button"
              onClick={dismissPrompt}
              className="tap-feedback min-h-9 rounded-lg border border-white/20 bg-white/[0.03] px-3 py-1.5 text-xs font-medium text-slate-200 hover:border-accent/55 hover:text-accent sm:min-h-10 sm:text-sm"
            >
              Maybe later
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
