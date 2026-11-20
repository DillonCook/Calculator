import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { AnchorHTMLAttributes } from 'react';

// Observe the Next navigation boundary, not a simulated browser prefetch engine.
// Actual production-mode network coverage lives in qa-marketing-journey.mjs.
vi.mock('next/link', () => ({
  default: ({ href, prefetch, ...props }: AnchorHTMLAttributes<HTMLAnchorElement> & { href: string; prefetch?: boolean | null }) =>
    <a {...props} href={href} data-next-prefetch={String(prefetch)} />
}));
vi.mock('../lib/supabaseClient', () => ({ isSupabaseConfigured: false, getSupabaseClient: () => null }));

import HomePage from '../app/page';
import { defaultDealInput } from '../lib/models/deal';
import { createScenarioRecord, decodeScenario, setScenarioStorageOwner, writeScenarios } from '../lib/scenario-storage';

beforeEach(() => {
  setScenarioStorageOwner(null);
  localStorage.clear();
  localStorage.setItem('dealcooker-onboarding-seen:v1', '1');
  window.history.replaceState({}, '', '/');
  Object.defineProperty(window, 'innerWidth', { configurable: true, value: 1440 });
  Object.defineProperty(window, 'matchMedia', { configurable: true, value: (query: string) => ({
    matches: false, media: query, onchange: null, addEventListener() {}, removeEventListener() {},
    addListener() {}, removeListener() {}, dispatchEvent() { return false; }
  }) });
  const model = structuredClone(defaultDealInput);
  model.purchase.dealName = 'Synthetic report prefetch QA';
  model.purchase.purchasePrice = 321234.56;
  model.longTerm.grossRentMonthly = 3000;
  writeScenarios([createScenarioRecord(model)]);
});

describe('intentional report navigation', () => {
  it.each(['Guided', 'Pro Mode'])('opts both report-link surfaces out of speculative prefetch in %s', async mode => {
    const user = userEvent.setup();
    render(<HomePage />);
    if (mode === 'Pro Mode') await user.click(screen.getByRole('button', { name: mode }));
    await user.click(within(screen.getByLabelText('Desktop strategy selector')).getByRole('button', { name: 'Airbnb' }));
    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));
    const links = screen.getAllByRole('link', { name: 'Print to PDF' });
    expect(links).toHaveLength(2);
    for (const link of links) {
      expect(link).toHaveAttribute('data-next-prefetch', 'false');
      expect(link).toHaveAttribute('target', '_blank');
      const url = new URL(link.getAttribute('href')!, window.location.origin);
      expect(url.pathname).toBe('/print');
      expect(url.searchParams.get('strategy')).toBe('airbnb');
      const scenario = decodeScenario(url.searchParams.get('scenario')!);
      expect(scenario?.payload.purchase.purchasePrice).toBe(321234.56);
      expect(scenario?.payload.purchase.dealName).toBe('Synthetic report prefetch QA');
    }
  });
});
