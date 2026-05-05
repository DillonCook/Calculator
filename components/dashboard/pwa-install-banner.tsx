'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { trackAnalyticsEvent } from '@/lib/analytics';
import { triggerHapticFeedback } from '@/lib/use-haptics';

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed'; platform: string }>;
}

type InstallSurface = 'none' | 'prompt' | 'ios' | 'manual';

const PWA_INSTALL_DISMISS_KEY = 'dealcooker-pwa-install-dismissed-at:v1';
const PWA_INSTALL_VISIT_COUNT_KEY = 'dealcooker-pwa-install-visit-count:v1';
const PWA_INSTALL_QUALIFIED_KEY = 'dealcooker-pwa-install-qualified:v1';
const PWA_INSTALL_COMPLETED_KEY = 'dealcooker-pwa-install-completed:v1';
const PWA_INSTALL_DISMISS_WINDOW_MS = 1000 * 60 * 60 * 24 * 14;
export const PWA_OPEN_INSTALL_EVENT = 'dealcooker:pwa-open-install';
export const PWA_QUALIFY_INSTALL_EVENT = 'dealcooker:pwa-qualify-install';

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

const isSafariBrowser = () => {
  if (typeof window === 'undefined') return false;
  const userAgent = window.navigator.userAgent.toLowerCase();
  return /safari/.test(userAgent) && !/crios|fxios|edgios|opios|mercury/.test(userAgent);
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
  const [isQualified, setIsQualified] = useState(false);
  const [isInstalled, setIsInstalled] = useState(false);
  const deferredPromptRef = useRef<BeforeInstallPromptEvent | null>(null);
  const shownSurfaceRef = useRef<InstallSurface>('none');

  useEffect(() => {
    if (typeof window === 'undefined') return;

    const dismissedAt = getDismissedAt();
    const completedInstall = window.localStorage.getItem(PWA_INSTALL_COMPLETED_KEY) === '1';
    const standaloneMode = isStandaloneDisplayMode();
    if (completedInstall || standaloneMode) {
      setIsInstalled(true);
      setIsInstallPromptDismissed(true);
      return;
    }

    if (dismissedAt && Date.now() - dismissedAt < PWA_INSTALL_DISMISS_WINDOW_MS) {
      setIsInstallPromptDismissed(true);
    }

    const storedQualified = window.localStorage.getItem(PWA_INSTALL_QUALIFIED_KEY) === '1';
    const rawVisitCount = window.localStorage.getItem(PWA_INSTALL_VISIT_COUNT_KEY);
    const parsedVisitCount = Number.parseInt(rawVisitCount ?? '0', 10);
    const nextVisitCount = Number.isFinite(parsedVisitCount) ? parsedVisitCount + 1 : 1;
    const nextQualified = storedQualified || nextVisitCount >= 2;
    window.localStorage.setItem(PWA_INSTALL_VISIT_COUNT_KEY, String(nextVisitCount));
    if (nextQualified) {
      window.localStorage.setItem(PWA_INSTALL_QUALIFIED_KEY, '1');
      setIsQualified(true);
    }

    if (isIOSDevice() && !isStandaloneDisplayMode()) {
      setInstallSurface('ios');
    }

    if ('serviceWorker' in navigator) {
      if (process.env.NODE_ENV === 'production') {
        navigator.serviceWorker.register('/sw.js', { scope: '/' }).catch(() => {
          setFeedback('Offline mode is unavailable in this browser session.');
        });
      } else {
        // Prevent stale chunk/runtime mismatches during local development.
        navigator.serviceWorker.getRegistrations().then((registrations) => {
          registrations.forEach((registration) => {
            registration.unregister().catch(() => {
              // Ignore cleanup failures in dev.
            });
          });
        });
      }
    }

    const handleBeforeInstallPrompt = (event: Event) => {
      event.preventDefault();
      const promptEvent = event as BeforeInstallPromptEvent;
      deferredPromptRef.current = promptEvent;
      setInstallSurface('prompt');
      setFeedback(null);
      void trackAnalyticsEvent('pwa_install_prompt_available', { surface: 'browser_prompt' });
    };

    const handleAppInstalled = () => {
      deferredPromptRef.current = null;
      setInstallSurface('none');
      setIsInstalled(true);
      try {
        window.localStorage.setItem(PWA_INSTALL_COMPLETED_KEY, '1');
      } catch {
        // Ignore storage failures (private mode / blocked storage).
      }
      setFeedback('DealCooker is now installed on this device.');
      void trackAnalyticsEvent('pwa_installed');
    };

    const handleOpenInstallRequest = () => {
      void trackAnalyticsEvent('pwa_install_prompt_requested', { source: 'pwa_banner' });
      try {
        window.localStorage.setItem(PWA_INSTALL_QUALIFIED_KEY, '1');
      } catch {
        // Ignore storage failures (private mode / blocked storage).
      }
      setIsQualified(true);

      if (isStandaloneDisplayMode()) {
        setInstallSurface('none');
        setIsInstalled(true);
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

    const handleQualifiedInstallRequest = () => {
      try {
        window.localStorage.setItem(PWA_INSTALL_QUALIFIED_KEY, '1');
      } catch {
        // Ignore storage failures (private mode / blocked storage).
      }
      setIsQualified(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
    window.addEventListener('appinstalled', handleAppInstalled);
    window.addEventListener(PWA_OPEN_INSTALL_EVENT, handleOpenInstallRequest);
    window.addEventListener(PWA_QUALIFY_INSTALL_EVENT, handleQualifiedInstallRequest);

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstallPrompt);
      window.removeEventListener('appinstalled', handleAppInstalled);
      window.removeEventListener(PWA_OPEN_INSTALL_EVENT, handleOpenInstallRequest);
      window.removeEventListener(PWA_QUALIFY_INSTALL_EVENT, handleQualifiedInstallRequest);
    };
  }, []);

  const shouldRender = useMemo(() => {
    if (isInstalled) return false;
    if (!isQualified) return false;
    if (isInstallPromptDismissed) return false;
    return installSurface !== 'none';
  }, [installSurface, isInstallPromptDismissed, isInstalled, isQualified]);

  useEffect(() => {
    if (!shouldRender) {
      shownSurfaceRef.current = 'none';
      return;
    }

    if (shownSurfaceRef.current === installSurface) return;
    shownSurfaceRef.current = installSurface;
    void trackAnalyticsEvent('pwa_install_prompt_shown', { surface: installSurface });
  }, [installSurface, shouldRender]);

  const dismissPrompt = () => {
    triggerHapticFeedback('light');
    setIsInstallPromptDismissed(true);
    try {
      window.localStorage.setItem(PWA_INSTALL_DISMISS_KEY, String(Date.now()));
    } catch {
      // Ignore storage failures (private mode / blocked storage).
    }
    void trackAnalyticsEvent('pwa_install_prompt_dismissed', { surface: installSurface });
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
        void trackAnalyticsEvent('pwa_install_prompt_accepted', { surface: 'browser_prompt' });
      } else {
        setFeedback('Install canceled. You can install anytime from browser settings.');
        void trackAnalyticsEvent('pwa_install_prompt_dismissed', { surface: 'browser_prompt' });
      }
    } catch {
      setFeedback('Install is not available right now. Try again from browser settings.');
    } finally {
      deferredPromptRef.current = null;
      setIsInstalling(false);
      setInstallSurface('none');
    }
  };

  const showIosInstructions = () => {
    triggerHapticFeedback('light');
    setFeedback(
      isSafariBrowser()
        ? 'Tap Share in Safari, then Add to Home Screen.'
        : 'Open dealcooker.app in Safari, then tap Share → Add to Home Screen.',
    );
  };

  if (!shouldRender) return null;

  const title = 'Download the app!';
  const description =
    installSurface === 'ios'
      ? 'iPhone install works through Safari. Use Share → Add to Home Screen for full app mode.'
      : installSurface === 'manual'
        ? 'Install prompt is not available yet in this browser session.'
        : 'Install for fast launch, full-screen mode, and offline access.';
  const installLabel =
    installSurface === 'ios' ? 'How to install' : isInstalling ? 'Installing...' : 'Download the app!';

  return (
    <>
      <section
        role="region"
        aria-label="Install DealCooker"
        className="section-shell section-shell-utility fixed inset-x-2 z-[170] rounded-2xl p-3 shadow-soft sm:hidden"
        style={{ top: 'max(env(safe-area-inset-top), 0.5rem)' }}
      >
        <div className="flex items-start justify-between gap-2">
          <div className="min-w-0">
            <p className="section-eyebrow-utility text-[10px] uppercase tracking-[0.16em]">Install for free</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-100">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted">{description}</p>
            {feedback ? <p className="mt-2 text-[11px] text-accent">{feedback}</p> : null}
          </div>
          <button
            type="button"
            onClick={dismissPrompt}
            aria-label="Dismiss install prompt"
            className="tap-feedback section-action section-action-utility inline-flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-slate-300"
          >
            X
          </button>
        </div>
        <div className="mt-3 flex items-center gap-2">
          <button
            type="button"
            onClick={installSurface === 'prompt' ? installApp : installSurface === 'ios' ? showIosInstructions : undefined}
            disabled={installSurface === 'manual' || isInstalling}
            className="btn-primary btn-vault tap-feedback min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold disabled:opacity-65"
          >
            {installLabel}
          </button>
          <button
            type="button"
            onClick={dismissPrompt}
            className="tap-feedback section-action section-action-utility min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-200"
          >
            Not now
          </button>
        </div>
      </section>

      <section
        role="region"
        aria-label="Install DealCooker"
        className="section-shell section-shell-utility hidden rounded-2xl p-3 shadow-soft sm:block sm:p-4 lg:hidden"
      >
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="min-w-0">
            <p className="section-eyebrow-utility text-[10px] uppercase tracking-[0.16em]">Premium install mode</p>
            <h2 className="mt-1 text-sm font-semibold text-slate-100 sm:text-base">{title}</h2>
            <p className="mt-1 text-xs leading-relaxed text-muted sm:text-sm">{description}</p>
            {feedback ? <p className="mt-2 text-[11px] text-accent sm:text-xs">{feedback}</p> : null}
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <button
              type="button"
              onClick={installSurface === 'prompt' ? installApp : installSurface === 'ios' ? showIosInstructions : undefined}
              disabled={installSurface === 'manual' || isInstalling}
              className="btn-primary btn-vault tap-feedback min-h-9 rounded-lg px-3 py-1.5 text-xs font-semibold sm:min-h-10 sm:text-sm disabled:opacity-65"
            >
              {installLabel}
            </button>
            <button
              type="button"
              onClick={dismissPrompt}
              className="tap-feedback section-action section-action-utility min-h-9 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-200 sm:min-h-10 sm:text-sm"
            >
              Maybe later
            </button>
          </div>
        </div>
      </section>
    </>
  );
}
