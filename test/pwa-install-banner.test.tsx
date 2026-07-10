import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';

import { PWA_QUALIFY_INSTALL_EVENT, PwaInstallBanner } from '../components/dashboard/pwa-install-banner';

const VISIT_COUNT_STORAGE_KEY = 'dealcooker-pwa-visit-count:v1';

describe('PwaInstallBanner', () => {
  beforeEach(() => {
    window.localStorage.clear();
    Object.defineProperty(window, 'matchMedia', {
      configurable: true,
      value: () => ({
        matches: false,
        media: '',
        onchange: null,
        addEventListener: () => undefined,
        removeEventListener: () => undefined,
        addListener: () => undefined,
        removeListener: () => undefined,
        dispatchEvent: () => false
      })
    });
    Object.defineProperty(window.navigator, 'userAgent', {
      configurable: true,
      value: 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 Mobile/15E148 Safari/604.1'
    });
    Object.defineProperty(window.navigator, 'standalone', {
      configurable: true,
      value: false
    });
  });

  it('waits for a meaningful deal action instead of prompting on a repeat visit', async () => {
    window.localStorage.setItem(VISIT_COUNT_STORAGE_KEY, '1');
    render(<PwaInstallBanner />);

    await waitFor(() => {
      expect(screen.queryByRole('region', { name: 'Install DealCooker' })).not.toBeInTheDocument();
    });

    fireEvent(window, new Event(PWA_QUALIFY_INSTALL_EVENT));

    expect((await screen.findAllByRole('region', { name: 'Install DealCooker' })).length).toBeGreaterThan(0);
  });
});
