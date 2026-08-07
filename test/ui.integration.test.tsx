import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const authMockState = vi.hoisted(() => ({
  isConfigured: true,
  user: null as
    | null
    | {
        id: string;
        email?: string;
        phone?: string;
        user_metadata?: {
          avatar_url?: string;
          picture?: string;
          full_name?: string;
          phone?: string;
        };
      },
  emailSignInCalls: [] as Array<{ email: string; password: string }>,
  emailSignUpCalls: [] as Array<{ email: string; password: string }>,
  passwordResetCalls: [] as Array<{ email: string; redirectTo?: string }>,
  passwordUpdateCalls: [] as Array<{ password: string }>,
  cloudUpsertCalls: [] as Array<{ userId: string; scenarioId: string; dealName: string; updatedAt: string }>,
  cloudDeleteCalls: [] as Array<{ userId: string; scenarioId: string }>,
  shareInsertCalls: [] as Array<Record<string, unknown>>
}));

vi.mock('../lib/supabaseClient', () => ({
  get isSupabaseConfigured() {
    return authMockState.isConfigured;
  },
  getSupabaseClient: () => authMockState.isConfigured ? ({
    auth: {
      getSession: async () => ({
        data: {
          session: authMockState.user ? { user: authMockState.user, access_token: 'test-access-token' } : null
        }
      }),
      onAuthStateChange: () => ({
        data: {
          subscription: {
            unsubscribe: () => undefined
          }
        }
      }),
      signInWithOAuth: async () => ({ error: null }),
      signInWithPassword: async ({ email, password }: { email: string; password: string }) => {
        authMockState.emailSignInCalls.push({ email, password });
        const user = {
          id: 'email-user-1',
          email
        };
        authMockState.user = user;

        return {
          data: {
            user,
            session: { user }
          },
          error: null
        };
      },
      signUp: async ({ email, password }: { email: string; password: string }) => {
        authMockState.emailSignUpCalls.push({ email, password });

        return {
          data: {
            user: {
              id: 'email-user-1',
              email
            },
            session: null
          },
          error: null
        };
      },
      resetPasswordForEmail: async (email: string, options?: { redirectTo?: string }) => {
        authMockState.passwordResetCalls.push({ email, redirectTo: options?.redirectTo });
        return { data: {}, error: null };
      },
      updateUser: async ({ password }: { password: string }) => {
        authMockState.passwordUpdateCalls.push({ password });
        return {
          data: {
            user: authMockState.user
          },
          error: null
        };
      },
      signOut: async () => ({ error: null })
    },
    from: (table: string) => ({
      insert: async (payload: Record<string, unknown>) => {
        if (table === 'shares') {
          authMockState.shareInsertCalls.push(payload);
        }

        return { error: null };
      }
    })
  }) : null
}));

vi.mock('../lib/cloud-scenarios-sync', () => ({
  fetchSupabaseScenarios: async () => ({ scenarios: [], error: null }),
  upsertSupabaseScenario: async (userId: string, scenario: { scenarioId: string; dealName: string; updatedAt: string }) => {
    authMockState.cloudUpsertCalls.push({ userId, scenarioId: scenario.scenarioId, dealName: scenario.dealName, updatedAt: scenario.updatedAt });
    return null;
  },
  deleteSupabaseScenario: async (userId: string, scenarioId: string) => {
    authMockState.cloudDeleteCalls.push({ userId, scenarioId });
    return null;
  }
}));

import HomePage from '../app/page';
import AdminAnalyticsPage from '../app/admin/analytics/page';
import { PrintActions } from '../components/print/print-actions';
import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateCashToClose } from '../lib/engine/finance';
import { defaultDealInput } from '../lib/models/deal';
import { currencyFormatter, percentFormatter } from '../lib/formatters';
import { getTotalCashInvested } from '../lib/projection-metrics';
import { createScenarioRecord, encodeScenario, setScenarioStorageOwner, writeScenarios } from '../lib/scenario-storage';
import { decodeDealFromShareParam, encodeDealToShareParam } from '../lib/share-link';

const getStrategyButton = (label: string) =>
  within(screen.getByLabelText('Desktop strategy selector')).getByRole('button', { name: label });
const getStrategyInputsWorkspace = () => {
  const existingWorkspace = screen.queryByLabelText('Strategy workspace');
  if (existingWorkspace) return existingWorkspace;

  const desktopInputs = screen.getByLabelText('Deal input sections');
  fireEvent.click(within(desktopInputs).getByRole('button', { name: /Strategy/ }));
  return screen.getByLabelText('Strategy workspace');
};
const selectDesktopWorkspace = (name: 'Build' | 'Projection' | 'Compare') => {
  fireEvent.click(within(screen.getByLabelText('Desktop workspace sections')).getByRole('button', { name }));
};
const loadSampleDealFromSettings = () => {
  fireEvent.click(screen.getByRole('button', { name: 'Open settings' }));
  fireEvent.click(screen.getByRole('button', { name: 'Load sample deal' }));
};
const setViewport = (width: number) => {
  Object.defineProperty(window, 'innerWidth', {
    configurable: true,
    writable: true,
    value: width
  });

  Object.defineProperty(window, 'matchMedia', {
    configurable: true,
    writable: true,
    value: (query: string) => ({
      matches: query.includes('max-width') ? width <= 1199 : false,
      media: query,
      onchange: null,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
      addListener: () => undefined,
      removeListener: () => undefined,
      dispatchEvent: () => false
    })
  });
};
const createSavedDeal = (dealName: string, updatedAt: string) =>
  createScenarioRecord(
    {
      ...defaultDealInput,
      purchase: { ...defaultDealInput.purchase, dealName }
    },
    { createdAt: updatedAt, updatedAt }
  );
const createSavedDealList = (count: number, prefix = 'Saved Deal') =>
  Array.from({ length: count }, (_, index) =>
    createSavedDeal(`${prefix} ${index + 1}`, `2026-01-${String(index + 1).padStart(2, '0')}T12:00:00.000Z`)
  );
const DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY = 'dealcooker-default-projection-strategies:v2';
const WORKSPACE_VIEW_MODE_STORAGE_KEY = 'dealcooker-workspace-view:v1';
const ONBOARDING_STORAGE_KEY = 'dealcooker-onboarding-seen:v1';
const FEEDBACK_OPEN_COUNT_DESKTOP_KEY = 'dealcooker-feedback-open-count:v1:desktop';
const FEEDBACK_OPEN_COUNT_MOBILE_KEY = 'dealcooker-feedback-open-count:v1:mobile';
const FEEDBACK_LAST_SENT_DESKTOP_KEY = 'dealcooker-feedback-last-sent-open-count:v1:desktop';
const FEEDBACK_SENT_KEY = 'dealcooker-feedback-sent:v1';
const FEEDBACK_PROMPT_DELAY_MS = 3000;

const flushAuthEffects = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

const advanceFeedbackPromptDelay = async () => {
  await act(async () => {
    vi.advanceTimersByTime(FEEDBACK_PROMPT_DELAY_MS + 100);
    await Promise.resolve();
  });
};

describe('dashboard integration', () => {
  beforeEach(() => {
    authMockState.isConfigured = true;
    authMockState.user = null;
    authMockState.emailSignInCalls = [];
    authMockState.emailSignUpCalls = [];
    authMockState.passwordResetCalls = [];
    authMockState.passwordUpdateCalls = [];
    authMockState.cloudUpsertCalls = [];
    authMockState.cloudDeleteCalls = [];
    authMockState.shareInsertCalls = [];
    setScenarioStorageOwner(null);
    window.localStorage.clear();
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    window.history.pushState({}, '', '/');
    setViewport(1280);
    writeScenarios([
      createScenarioRecord({
        ...defaultDealInput,
        purchase: { ...defaultDealInput.purchase, dealName: 'Test Seed Deal' }
      })
    ]);
  });

  it('renders Dillon\'s provided logo in desktop and compact headers', () => {
    const expectProvidedLogo = () => {
      const brandLogo = document.querySelector('.brand-lockup img');

      expect(brandLogo).not.toBeNull();
      expect(brandLogo?.getAttribute('src')).toContain('url=%2Ficon.png');
      expect(brandLogo).toHaveAttribute('width', '543');
      expect(brandLogo).toHaveAttribute('height', '628');
      expect(brandLogo).toHaveAttribute('sizes', '36px');
    };

    const desktop = render(<HomePage />);
    expectProvidedLogo();
    desktop.unmount();

    setViewport(390);
    render(<HomePage />);
    expectProvidedLogo();
  });

  it('starts blank when no scenarios are saved', () => {
    window.localStorage.clear();
    render(<HomePage />);

    expect(screen.getByRole('button', { name: 'New deal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Send link' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Request deal review' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Print to PDF' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View listing' })).toBeDisabled();
    expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);
    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);

    const desktopEmptyState = screen.getByRole('heading', { name: 'Add the deal basics to unlock the verdict' }).closest('.decision-empty-state');
    expect(desktopEmptyState).toHaveClass('decision-empty-state-centered');
    expect(within(desktopEmptyState as HTMLElement).queryByText('Incomplete inputs')).not.toBeInTheDocument();
    expect(within(desktopEmptyState as HTMLElement).queryByText(/^Still needed:/)).not.toBeInTheDocument();
    expect(within(desktopEmptyState as HTMLElement).queryByRole('button', { name: 'Complete inputs' })).not.toBeInTheDocument();
  });

  it('keeps desktop onboarding targets mounted as the tour advances', async () => {
    setViewport(1440);
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
      configurable: true,
      value: vi.fn()
    });
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    render(<HomePage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Load sample deal' }));
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Replay quick tutorial' }));
    const dialog = await screen.findByRole('dialog', { name: 'Quick app tutorial' });
    const next = () => user.click(within(dialog).getByRole('button', { name: 'Next' }));
    const inputSections = screen.getByRole('navigation', { name: 'Deal input sections' });
    const workspaces = screen.getByRole('navigation', { name: 'Desktop workspace sections' });

    await next(); // Strategy
    await next(); // Core
    await next(); // Expenses
    await waitFor(() => expect(within(inputSections).getByRole('button', { name: /Expenses/ })).toHaveAttribute('aria-pressed', 'true'));

    await next(); // Strategy inputs
    await waitFor(() => expect(within(inputSections).getByRole('button', { name: /Strategy/ })).toHaveAttribute('aria-pressed', 'true'));

    await next(); // IRR
    await waitFor(() => expect(within(inputSections).getByRole('button', { name: /Advanced/ })).toHaveAttribute('aria-pressed', 'true'));

    await next(); // Results
    await next(); // Compare
    await waitFor(() => expect(within(workspaces).getByRole('button', { name: 'Compare' })).toHaveAttribute('aria-pressed', 'true'));
    expect(await screen.findByRole('heading', { name: 'Strategy comparison' })).toBeInTheDocument();
  });

  it('keeps the compact workspace through small-laptop widths', async () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setViewport(1100);

    render(<HomePage />);

    expect(await screen.findByRole('button', { name: 'Open settings' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Desktop strategy selector')).not.toBeInTheDocument();
  });

  it('shows an incomplete-deal state instead of misleading zero results', async () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setViewport(390);

    render(<HomePage />);
    fireEvent.click(await screen.findByRole('button', { name: 'Results' }));

    expect(await screen.findByText(/Add purchase price and expected income/i)).toBeInTheDocument();
    expect(screen.queryByText(/Auto-adjust/i)).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Projections' }));
    expect(await screen.findByRole('heading', { name: 'Add the deal basics first' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Projections strategy selection')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Strategy comparison board')).not.toBeInTheDocument();
  });

  it('holds back desktop projection and comparison outputs for an incomplete deal', async () => {
    window.localStorage.clear();
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setViewport(1440);
    render(<HomePage />);
    const user = userEvent.setup();
    const workspaces = screen.getByRole('navigation', { name: 'Desktop workspace sections' });

    await user.click(within(workspaces).getByRole('button', { name: 'Projection' }));
    expect(await screen.findByRole('heading', { name: 'Add the deal basics first' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Strategy comparison board')).not.toBeInTheDocument();
    expect(screen.queryByText(/DSCR\s+0\.00/)).not.toBeInTheDocument();

    await user.click(within(workspaces).getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('heading', { name: 'Add the deal basics first' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Strategy comparison board')).not.toBeInTheDocument();
  });

  it('defaults projections to the active strategy only', async () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setViewport(390);

    render(<HomePage />);
    loadSampleDealFromSettings();
    fireEvent.click(await screen.findByRole('button', { name: 'Projections' }));

    expect(await screen.findByText('1 selected')).toBeInTheDocument();
  });

  it('separates desktop building, projection, and comparison workspaces', async () => {
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
    setViewport(1440);

    render(<HomePage />);
    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Load sample deal' }));
    const workspace = screen.getByRole('navigation', { name: 'Desktop workspace sections' });

    expect(within(workspace).getByRole('button', { name: 'Build' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: /Deal basics/i })).toBeInTheDocument();

    await user.click(within(workspace).getByRole('button', { name: 'Projection' }));
    expect(await screen.findByRole('heading', { name: 'Active-strategy projection' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Deal basics/i })).not.toBeInTheDocument();

    await user.click(within(workspace).getByRole('button', { name: 'Compare' }));
    expect(await screen.findByRole('heading', { name: 'Strategy comparison' })).toBeInTheDocument();

    let selection = screen.getByLabelText('Projections board strategy selection');
    await user.click(within(selection).getByRole('button', { name: /Airbnb/ }));
    expect(within(selection).getByRole('button', { name: /Airbnb/ })).toHaveAttribute('aria-pressed', 'true');

    await user.click(within(workspace).getByRole('button', { name: 'Projection' }));
    await user.click(within(workspace).getByRole('button', { name: 'Compare' }));

    selection = screen.getByLabelText('Projections board strategy selection');
    expect(within(selection).getByRole('button', { name: /Airbnb/ })).toHaveAttribute('aria-pressed', 'true');
  });

  it('merges desktop current deal info into the deal vault launcher and opens a blank new deal from the header', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const vaultButton = screen.getByRole('button', { name: 'Open deal vault' });
    expect(within(vaultButton).getByText('Test Seed Deal')).toBeInTheDocument();
    expect(within(vaultButton).getByText('1 saved deal')).toBeInTheDocument();

    const purchasePrice = screen.getByLabelText('Purchase price');
    const rehabBudget = screen.getByLabelText('Rehab budget');

    await user.clear(purchasePrice);
    await user.type(purchasePrice, '415000');
    await user.clear(rehabBudget);
    await user.type(rehabBudget, '95000');

    await user.click(screen.getByRole('button', { name: 'New deal' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Deal name')).toHaveValue('');
    expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);
  });

  it('discards an untouched blank new deal when the identity modal is closed', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const vaultButton = screen.getByRole('button', { name: 'Open deal vault' });
    expect(vaultButton).toHaveTextContent('Test Seed Deal');
    expect(vaultButton).toHaveTextContent('1 saved deal');

    await user.click(screen.getByRole('button', { name: 'New deal' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });
    await user.click(within(dialog).getByRole('button', { name: 'Close' }));

    await waitFor(() => {
      expect(screen.queryByRole('dialog', { name: 'Deal identity' })).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('Test Seed Deal');
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('1 saved deal');
  });

  it('progressively discloses desktop inputs and keeps Advanced Options collapsed by default', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const inputSections = screen.getByLabelText('Deal input sections');
    const activeInputShell = inputSections.nextElementSibling;

    expect(activeInputShell).toHaveClass('w-full');
    expect(screen.getByRole('heading', { name: 'Deal basics' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Strategy workspace')).not.toBeInTheDocument();

    const coreAdvancedButton = screen.getByRole('button', { name: /^Advanced Options/ });
    expect(coreAdvancedButton).toHaveAttribute('aria-expanded', 'false');

    await user.click(within(inputSections).getByRole('button', { name: /Strategy/ }));
    expect(screen.getByLabelText('Strategy workspace')).toBeInTheDocument();

    await user.click(within(inputSections).getByRole('button', { name: /Expenses/ }));
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeInTheDocument();
  });

  it('exposes editable automatic tax and insurance rates in expenses', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    await user.click(
      within(screen.getByLabelText('Deal input sections')).getByRole('button', { name: /Expenses/ })
    );

    const taxRate = screen.getByLabelText(/Auto Tax %/i, { selector: 'input' });
    const insuranceRate = screen.getByLabelText(/Auto Ins\. %/i, { selector: 'input' });
    const taxOverride = screen.getByLabelText(/Tax Override/i, { selector: 'input' });
    const insuranceOverride = screen.getByLabelText(/Ins\. Override/i, { selector: 'input' });
    const expectedTaxPlaceholder = currencyFormatter.format(
      defaultDealInput.purchase.purchasePrice * defaultDealInput.purchase.propertyTaxRatePercent
    );
    const expectedInsurancePlaceholder = currencyFormatter.format(
      defaultDealInput.purchase.purchasePrice * defaultDealInput.purchase.insuranceRatePercent
    );

    expect(taxRate).toHaveValue(1.7);
    expect(insuranceRate).toHaveValue(1);
    expect(taxOverride).toHaveAttribute('placeholder', expectedTaxPlaceholder);
    expect(insuranceOverride).toHaveAttribute('placeholder', expectedInsurancePlaceholder);

    await user.clear(taxRate);
    await user.type(taxRate, '2.25');

    expect(taxRate).toHaveValue(2.25);
    const expectedUpdatedTaxPlaceholder = currencyFormatter.format(defaultDealInput.purchase.purchasePrice * 0.0225);

    await user.type(taxOverride, '2400');
    expect(taxOverride).toHaveValue(2400);

    await user.clear(taxOverride);
    await user.tab();

    expect(taxOverride).toHaveValue(null);
    expect(taxOverride).toHaveAttribute('placeholder', expectedUpdatedTaxPlaceholder);

    await user.type(insuranceOverride, '1200');
    expect(insuranceOverride).toHaveValue(1200);

    await user.clear(insuranceOverride);
    await user.tab();

    expect(insuranceOverride).toHaveValue(null);
    expect(insuranceOverride).toHaveAttribute('placeholder', expectedInsurancePlaceholder);
  });

  it('uses the compact shell on mobile and allows results before required inputs are complete', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const mobileViewSwitcher = await screen.findByRole('navigation', { name: 'Mobile view switcher' });
    const resultsButton = screen.getByRole('button', { name: 'Results' });
    const projectionsButton = screen.getByRole('button', { name: 'Projections' });

    expect(mobileViewSwitcher).toHaveClass('mobile-bottom-nav');
    expect(mobileViewSwitcher.parentElement).toBe(document.body);
    expect(screen.getByText(/For educational and informational purposes only/i).closest('footer')).toHaveClass('app-footer');
    expect(screen.getByRole('button', { name: 'New deal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deal Vault' })).toHaveTextContent('1 saved deal');
    expect(screen.queryByText('Current Deal')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open settings' })).toBeInTheDocument();
    expect(resultsButton).not.toBeDisabled();
    expect(projectionsButton).not.toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit active deal details' })).toBeInTheDocument();

    await user.click(resultsButton);
    expect(screen.getByText('Incomplete inputs')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Complete inputs' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'More metrics' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Inputs' }));

    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    expect(resultsButton).not.toBeDisabled();
    expect(projectionsButton).not.toBeDisabled();
  });

  it('switches between core, expenses, strategy, and IRR sections from the mobile input switcher', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const tablist = screen.getByRole('tablist', { name: 'Input section selection' });
    const coreTab = within(tablist).getByRole('tab', { name: /Core/i });
    const expensesTab = within(tablist).getByRole('tab', { name: /Expenses/i });
    const strategyTab = within(tablist).getByRole('tab', { name: /Strategy/i });
    const irrTab = within(tablist).getByRole('tab', { name: /IRR/i });

    expect(coreTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Purchase & Financing' })).toBeInTheDocument();

    await user.click(expensesTab);

    expect(expensesTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Expenses' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Purchase & Financing' })).not.toBeInTheDocument();

    await user.click(strategyTab);

    expect(strategyTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'Strategy' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Expenses' })).not.toBeInTheDocument();

    await user.click(irrTab);

    expect(irrTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'IRR and timeline inputs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Strategy' })).not.toBeInTheDocument();
  });

  it('opens recent deals from the compact header', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));

    const dialog = screen.getByRole('dialog', { name: 'Deals' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByText('Test Seed Deal').length).toBeGreaterThan(0);
    expect(within(dialog).getByRole('button', { name: 'Duplicate Test Seed Deal' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Delete Test Seed Deal' })).toBeInTheDocument();
    expect(within(dialog).queryByRole('button', { name: 'New deal' })).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Deals Vault')).not.toBeInTheDocument();
  });

  it('opens the deal identity editor from the compact header', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Listing URL (Zillow, Redfin, etc.)')).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('Test Seed Deal')).toBeInTheDocument();
  });

  it('applies light mode to portal sheets for deal identity and vault dialogs', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    expect(document.body).toHaveClass('theme-light');

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Close' }));
    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));
    const identityDialog = screen.getByRole('dialog', { name: 'Deal identity' });
    expect(identityDialog).toBeInTheDocument();
    await user.click(within(identityDialog).getByRole('button', { name: 'Close' }));

    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));
    expect(screen.getByRole('dialog', { name: 'Deals' })).toBeInTheDocument();
  });

  it('opens the deal identity editor after creating a new deal from mobile header', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New deal' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Deal name')).toHaveValue('');
  });

  it('shows the signed-in profile icon next to mobile settings without cloud-status copy', async () => {
    setViewport(390);
    authMockState.user = {
      id: 'user-1',
      email: 'agent@example.com',
      user_metadata: {
        avatar_url: 'https://example.com/avatar.png'
      }
    };

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      const actions = screen.getByRole('button', { name: 'Open settings' }).parentElement;
      expect(actions).not.toBeNull();
      if (actions) {
        expect(within(actions).getByLabelText('Signed in as agent@example.com')).toBeInTheDocument();
      }
    });

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByText('Signed in as agent@example.com')).toBeInTheDocument();
    expect(screen.queryByText('Cloud sync is active on this device.')).not.toBeInTheDocument();
  });

  it('hides auth provider environment variable names from the mobile menu', async () => {
    setViewport(390);
    authMockState.isConfigured = false;

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByText('Account sign-in is unavailable right now.')).toBeInTheDocument();
    expect(screen.queryByText(/NEXT_PUBLIC_SUPABASE_URL/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/NEXT_PUBLIC_SUPABASE_ANON_KEY/i)).not.toBeInTheDocument();
  });

  it('shows the admin dashboard link only for the owner account', async () => {
    authMockState.user = {
      id: 'regular-user',
      email: 'agent@example.com'
    };

    const user = userEvent.setup();
    const { unmount } = render(<HomePage />);

    await flushAuthEffects();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.queryByRole('link', { name: 'Admin dashboard' })).not.toBeInTheDocument();

    unmount();
    window.localStorage.clear();
    authMockState.user = {
      id: 'owner-user',
      email: 'dillon@theinvestoragent.io'
    };

    render(<HomePage />);
    await flushAuthEffects();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const adminLink = screen.getByRole('link', { name: 'Admin dashboard' });
    expect(adminLink).toHaveAttribute('href', '/admin/analytics');
    expect(adminLink).toHaveClass('inline-flex', 'w-auto', 'min-w-[10rem]');
    expect(adminLink).not.toHaveClass('w-full');
  });

  it('switches between dashboard and spreadsheet workspace views from settings', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    expect(screen.queryByLabelText('Spreadsheet deal workspace')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Spreadsheet' }));

    expect(window.localStorage.getItem(WORKSPACE_VIEW_MODE_STORAGE_KEY)).toBe('sheet');
    const spreadsheetWorkspace = screen.getByLabelText('Spreadsheet deal workspace');
    expect(within(spreadsheetWorkspace).getByText('Deal worksheet')).toBeInTheDocument();
    expect(within(spreadsheetWorkspace).getByLabelText('Strategy workspace')).toBeInTheDocument();
    expect(within(spreadsheetWorkspace).getAllByText('Projections').length).toBeGreaterThan(0);
    expect(screen.getByTestId('kpi-priority-metric')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Dashboard' }));

    expect(window.localStorage.getItem(WORKSPACE_VIEW_MODE_STORAGE_KEY)).toBe('studio');
    expect(screen.queryByLabelText('Spreadsheet deal workspace')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Deal input sections')).toBeInTheDocument();
    expect(screen.queryByText('Deal builder')).not.toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Inputs' })).not.toBeInTheDocument();
  });

  it('places the mobile admin dashboard link directly below owner account info', async () => {
    setViewport(390);
    authMockState.user = {
      id: 'owner-user',
      email: 'dillon@theinvestoragent.io'
    };

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));
    await flushAuthEffects();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const accountText = within(dialog).getByText('Signed in as dillon@theinvestoragent.io');
    const adminLink = within(dialog).getByRole('link', { name: 'Admin dashboard' });
    const signOutButton = within(dialog).getByRole('button', { name: 'Sign out' });

    expect(adminLink).toHaveAttribute('href', '/admin/analytics');
    expect(adminLink).toHaveClass('btn-primary', 'btn-auth', 'w-full', 'text-center');
    expect(accountText.compareDocumentPosition(adminLink) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(adminLink.compareDocumentPosition(signOutButton) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('loads owner admin stats with actionable recent error details', async () => {
    authMockState.user = {
      id: 'owner-user',
      email: 'dillon@theinvestoragent.io'
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          ownerEmail: 'dillon@theinvestoragent.io',
          generatedAt: '2026-05-05T16:00:00.000Z',
          analyticsReady: true,
          warnings: [],
          metrics: {
            totalUserAccounts: 12,
            newAccountCount7d: 2,
            totalScenarios: 30,
            totalShareLinks: 5,
            activeToday: 3,
            active7d: 7,
            active30d: 9,
            activeAccountsToday: 2,
            activeAccounts7d: 4,
            activeAccounts30d: 6,
            activeVisitorsToday: 3,
            activeVisitors7d: 7,
            activeVisitors30d: 9,
            anonymousVisitorsToday: 1,
            anonymousVisitors7d: 3,
            anonymousVisitors30d: 3,
            signedInEvents30d: 80,
            anonymousEvents30d: 40,
            totalEvents30d: 120,
            pwaPromptShown30d: 8,
            pwaPromptAccepted30d: 4,
            pwaInstalls30d: 3,
            scenarioCreated30d: 11,
            shareLinksCreated30d: 4,
            shareLinksOpened30d: 6,
            printOpens30d: 2,
            dealReviewRequests30d: 1,
            feedbackSent30d: 1,
            clientErrors7d: 5
          },
          charts: {
            dailyEvents: [{ day: '2026-05-05', count: 4 }],
            dailyActive: [{ day: '2026-05-05', count: 2 }],
            dailyActiveAccounts: [{ day: '2026-05-05', count: 2 }],
            dailyActiveVisitors: [{ day: '2026-05-05', count: 3 }],
            topEvents: [{ label: 'app_opened', count: 12 }],
            topRoutes: [{ label: '/', count: 12 }],
            displayModeCounts: [{ label: 'browser', count: 10 }],
            severityCounts: [{ label: 'error', count: 5 }],
            errorPatterns: [{ label: 'window: Cannot read properties of undefined (/)', count: 5 }]
          },
          recentEvents: [
            {
              eventName: 'app_opened',
              createdAt: '2026-05-05T15:59:00.000Z',
              route: '/',
              release: 'abc123',
              signedIn: true
            }
          ],
          recentFeedback: [
            {
              created_at: '2026-05-05T15:57:00.000Z',
              status: 'email_accepted',
              resend_email_id: 'email_test_123',
              resend_status: 200,
              resend_error: null,
              contact_name: 'Feedback Tester',
              contact_email: 'feedback@example.com',
              source: 'settings',
              viewport: 'desktop',
              route: '/',
              app_release: 'abc123',
              message: 'The app said sent and this is stored for admin review.'
            }
          ],
          recentErrors: [
            {
              created_at: '2026-05-05T15:58:00.000Z',
              severity: 'error',
              source: 'window',
              operation: 'unhandledrejection',
              message: 'Cannot read properties of undefined',
              stack: 'at Dashboard (/app/page.js:12:3)',
              route: '/',
              release: 'abc123',
              metadata: { component: 'dashboard', category: 'hydration' }
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    render(<AdminAnalyticsPage />);

    expect(await screen.findByText('DealCooker Admin')).toBeInTheDocument();
    expect(screen.getAllByText('5').length).toBeGreaterThan(0);
    expect(screen.getByText('Account Activity vs Visitor Activity')).toBeInTheDocument();
    expect(screen.getByText('Daily Active Accounts')).toBeInTheDocument();
    expect(screen.getByText('Daily Visitor Identities')).toBeInTheDocument();
    expect(screen.getByText('Recent Feedback')).toBeInTheDocument();
    expect(screen.getByText('The app said sent and this is stored for admin review.')).toBeInTheDocument();
    expect(screen.getByText('Resend email_test_123')).toBeInTheDocument();
    expect(screen.getByText('Cannot read properties of undefined')).toBeInTheDocument();
    expect(screen.getByText('unhandledrejection')).toBeInTheDocument();
    expect(screen.getAllByText('/').length).toBeGreaterThan(0);
    expect(screen.getByText(/at Dashboard/)).toBeInTheDocument();
    expect(screen.getByText(/hydration/)).toBeInTheDocument();
    expect(screen.getByText('Error Patterns')).toBeInTheDocument();
    expect(fetchSpy).toHaveBeenCalledWith('/api/admin/analytics', expect.objectContaining({
      headers: { Authorization: 'Bearer test-access-token' },
      cache: 'no-store'
    }));

    fetchSpy.mockRestore();
  });

  it('sends in-app feedback with available contact details', async () => {
    setViewport(390);
    authMockState.user = {
      id: 'feedback-user-1',
      email: 'feedback@example.com',
      user_metadata: {
        full_name: 'Feedback Tester',
        phone: '555-1212'
      }
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    expect(screen.getByRole('dialog', { name: 'Settings' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    const dialog = screen.getByRole('dialog', { name: 'Send DealCooker feedback' });
    expect(screen.queryByRole('dialog', { name: 'Settings' })).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Email')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Name')).not.toBeInTheDocument();
    expect(within(dialog).queryByLabelText('Phone')).not.toBeInTheDocument();

    const feedbackInput = within(dialog).getByLabelText('Feedback');
    const feedbackMessage = 'This is clear feedback from inside the app.';
    await user.type(feedbackInput, feedbackMessage);
    await user.click(within(dialog).getByRole('button', { name: 'Send feedback' }));

    await waitFor(() => {
      expect(fetchSpy).toHaveBeenCalledWith(
        '/api/feedback',
        expect.objectContaining({
          method: 'POST'
        })
      );
    });

    const requestBody = JSON.parse((fetchSpy.mock.calls[0]?.[1] as RequestInit).body as string);
    expect(requestBody.message).toBe(feedbackMessage);
    expect(requestBody.contact).toMatchObject({
      email: 'feedback@example.com',
      name: 'Feedback Tester',
      phone: '555-1212'
    });
    expect(requestBody.context).toMatchObject({
      source: 'settings',
      viewport: 'mobile',
      appRelease: expect.any(String),
      activeStrategy: expect.any(String),
      savedDealCount: expect.any(Number),
      signedIn: true,
      userId: 'feedback-user-1'
    });
    expect(window.localStorage.getItem(FEEDBACK_SENT_KEY)).toBe('1');
    expect(within(dialog).getByText('Feedback sent. Thank you.')).toBeInTheDocument();
    expect(feedbackInput).toBeDisabled();
    expect(feedbackInput).toHaveValue(feedbackMessage);
    expect(within(dialog).getByRole('button', { name: 'Sent' })).toBeDisabled();
    await user.click(within(dialog).getByRole('button', { name: 'Sent' }));
    expect(fetchSpy).toHaveBeenCalledTimes(1);
    fetchSpy.mockRestore();
  });

  it('previews the paid deal review flow while submissions are disabled', async () => {
    authMockState.user = {
      id: 'review-user-1',
      email: 'reviewer@example.com',
      user_metadata: {
        full_name: 'Review Requester',
        phone: '555-2222'
      }
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: true }), {
        status: 202,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    render(<HomePage />);
    await flushAuthEffects();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Request deal review' }));

    const dialog = screen.getByRole('dialog', { name: 'Request a second opinion' });
    expect(within(dialog).getByText('Coming soon: paid broker review')).toBeInTheDocument();
    expect(within(dialog).getByText(/licensed real estate broker may review/i)).toBeInTheDocument();
    expect(within(dialog).getByText(/paid feature for deal-level feedback/i)).toBeInTheDocument();
    expect(within(dialog).getByLabelText('Email')).toHaveValue('reviewer@example.com');
    expect(within(dialog).getByLabelText('Name')).toHaveValue('Review Requester');
    expect(within(dialog).getByLabelText('Phone')).toHaveValue('555-2222');
    expect(within(dialog).getByPlaceholderText('What decision are you trying to make?')).toBeInTheDocument();

    await user.type(within(dialog).getByLabelText('Market / location'), 'Tampa, FL');
    await user.selectOptions(within(dialog).getByLabelText('What should be reviewed?'), 'Offer price');
    await user.type(within(dialog).getByLabelText('Notes'), 'Should I write this offer as-is or ask for a concession?');
    await user.click(within(dialog).getByRole('checkbox'));

    const submitButton = within(dialog).getByRole('button', { name: 'Send for review' });
    expect(submitButton).toBeDisabled();
    await user.click(submitButton);
    expect(fetchSpy).not.toHaveBeenCalledWith('/api/deal-review', expect.anything());
    fetchSpy.mockRestore();
  });

  it('shows feedback API configuration errors from the server', async () => {
    setViewport(390);
    authMockState.user = {
      id: 'feedback-user-2',
      email: 'feedback-config@example.com',
      user_metadata: {
        full_name: 'Feedback Config Tester'
      }
    };
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ ok: false, error: 'Feedback email is not configured yet.' }), {
        status: 503,
        headers: { 'Content-Type': 'application/json' }
      })
    );

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Send feedback' }));

    const dialog = screen.getByRole('dialog', { name: 'Send DealCooker feedback' });
    await user.type(within(dialog).getByLabelText('Feedback'), 'This should show the API configuration error.');
    await user.click(within(dialog).getByRole('button', { name: 'Send feedback' }));

    expect(await within(dialog).findByText('Feedback email is not configured yet.')).toBeInTheDocument();
    fetchSpy.mockRestore();
  });

  it('only offers app download from mobile and tablet settings', async () => {
    const desktopRender = render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByRole('link', { name: 'Help & methodology' })).toHaveAttribute('href', '/help');
    expect(screen.getByRole('button', { name: 'Load sample deal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replay quick tutorial' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset settings and order' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset output ordering' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Reset settings defaults' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Download the app!' })).not.toBeInTheDocument();

    desktopRender.unmount();
    setViewport(390);
    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    expect(screen.getByRole('button', { name: 'Download the app!' })).toBeInTheDocument();
  });

  it('imports a Deal Vault backup from settings', async () => {
    const importedPayload = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Imported Backup Deal',
        purchasePrice: 412000
      }
    };
    const importedDeal = createScenarioRecord(importedPayload, {
      scenarioId: 'backup-deal-1',
      dealName: importedPayload.purchase.dealName,
      payload: importedPayload,
      createdAt: '2026-04-20T12:00:00.000Z',
      updatedAt: '2026-04-29T12:00:00.000Z'
    });
    const backupFile = new File(
      [JSON.stringify({ app: 'DealCooker', schemaVersion: '1.0.0', deals: [importedDeal] })],
      'dealcooker-vault-backup.json',
      { type: 'application/json' }
    );
    const { container } = render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Import backup' }));

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInstanceOf(HTMLInputElement);
    await user.upload(fileInput as HTMLInputElement, backupFile);

    await waitFor(() => {
      expect(screen.getAllByText('Imported Backup Deal').length).toBeGreaterThan(0);
    });
    expect(screen.getByText('Imported 1 saved deal into this vault.')).toBeInTheDocument();
  });

  it('does not auto-open feedback before sign-in or before the tutorial is complete', async () => {
    vi.useFakeTimers();
    try {
      window.localStorage.removeItem(ONBOARDING_STORAGE_KEY);
      window.localStorage.setItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY, '1');

      const signedOutRender = render(<HomePage />);
      await flushAuthEffects();
      await advanceFeedbackPromptDelay();

      expect(window.localStorage.getItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY)).toBe('1');
      expect(screen.queryByRole('dialog', { name: 'Send DealCooker feedback' })).not.toBeInTheDocument();

      signedOutRender.unmount();
      authMockState.user = {
        id: 'feedback-reminder-user',
        email: 'feedback-reminder@example.com'
      };

      render(<HomePage />);
      await flushAuthEffects();
      await advanceFeedbackPromptDelay();

      expect(window.localStorage.getItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY)).toBe('1');
      expect(screen.queryByRole('dialog', { name: 'Send DealCooker feedback' })).not.toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('reminds for feedback every second desktop open after sign-in and tutorial completion', async () => {
    vi.useFakeTimers();
    try {
      authMockState.user = {
        id: 'feedback-reminder-user',
        email: 'feedback-reminder@example.com'
      };
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');

      const firstRender = render(<HomePage />);
      await flushAuthEffects();

      expect(window.localStorage.getItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY)).toBe('1');
      await advanceFeedbackPromptDelay();
      expect(screen.queryByRole('dialog', { name: 'Send DealCooker feedback' })).not.toBeInTheDocument();

      firstRender.unmount();
      render(<HomePage />);
      await flushAuthEffects();

      expect(window.localStorage.getItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY)).toBe('2');
      expect(screen.queryByRole('dialog', { name: 'Send DealCooker feedback' })).not.toBeInTheDocument();

      await advanceFeedbackPromptDelay();

      expect(screen.getByRole('dialog', { name: 'Send DealCooker feedback' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('anchors the mobile feedback reminder at the top of the screen', async () => {
    vi.useFakeTimers();
    try {
      setViewport(390);
      authMockState.user = {
        id: 'feedback-reminder-user',
        email: 'feedback-reminder@example.com'
      };
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
      window.localStorage.setItem(FEEDBACK_OPEN_COUNT_MOBILE_KEY, '1');

      render(<HomePage />);
      window.dispatchEvent(new Event('resize'));
      await flushAuthEffects();
      await advanceFeedbackPromptDelay();

      const dialog = screen.getByRole('dialog', { name: 'Send DealCooker feedback' });
      const backdrop = dialog.closest('.feedback-reminder-backdrop');

      expect(backdrop).toHaveClass('items-start');
      expect(backdrop).not.toHaveClass('items-end');
    } finally {
      vi.useRealTimers();
    }
  });

  it('reminds every seventh desktop open after feedback is sent and the tutorial is complete', async () => {
    vi.useFakeTimers();
    try {
      authMockState.user = {
        id: 'feedback-reminder-user',
        email: 'feedback-reminder@example.com'
      };
      window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');
      window.localStorage.setItem(FEEDBACK_SENT_KEY, '1');
      window.localStorage.setItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY, '8');
      window.localStorage.setItem(FEEDBACK_LAST_SENT_DESKTOP_KEY, '2');

      render(<HomePage />);
      await flushAuthEffects();

      expect(window.localStorage.getItem(FEEDBACK_OPEN_COUNT_DESKTOP_KEY)).toBe('9');
      expect(screen.queryByRole('dialog', { name: 'Send DealCooker feedback' })).not.toBeInTheDocument();

      await advanceFeedbackPromptDelay();

      expect(screen.getByRole('dialog', { name: 'Send DealCooker feedback' })).toBeInTheDocument();
    } finally {
      vi.useRealTimers();
    }
  });

  it('signs in with a regular email from the mobile account menu', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const emailForm = within(dialog).getByRole('form', { name: 'Email sign in' });
    expect(within(emailForm).getByRole('button', { name: 'Sign in' })).toHaveAttribute('aria-pressed', 'true');

    fireEvent.change(within(emailForm).getByLabelText('Email address'), { target: { value: 'investor@example.com' } });
    fireEvent.change(within(emailForm).getByLabelText('Password'), { target: { value: 'rentalpass' } });
    await user.click(within(emailForm).getByRole('button', { name: 'Sign in with email' }));

    await waitFor(() => {
      expect(authMockState.emailSignInCalls).toEqual([{ email: 'investor@example.com', password: 'rentalpass' }]);
    }, { timeout: 5000 });
    expect(screen.getByText('Signed in as investor@example.com')).toBeInTheDocument();
  });

  it('sends a password reset email from the regular email sign-in path', async () => {
    setViewport(390);
    window.localStorage.setItem(ONBOARDING_STORAGE_KEY, '1');

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const emailForm = within(dialog).getByRole('form', { name: 'Email sign in' });
    const resetEmailInput = within(emailForm).getByLabelText('Email address');
    fireEvent.change(resetEmailInput, { target: { value: 'reset@example.com' } });
    expect(resetEmailInput).toHaveValue('reset@example.com');
    await user.click(within(emailForm).getByRole('button', { name: 'Forgot password?' }));

    await waitFor(() => {
      expect(authMockState.passwordResetCalls).toEqual([
        expect.objectContaining({
          email: 'reset@example.com',
          redirectTo: 'https://www.dealcooker.app/auth/callback?next=password-reset'
        })
      ]);
    }, { timeout: 5000 });
    expect(screen.getByText('Password reset email sent. Check your inbox, then return here.')).toBeInTheDocument();
  });

  it('updates a recovered password from the compact callback mode at small-laptop width', async () => {
    setViewport(1100);
    authMockState.user = {
      id: 'email-user-1',
      email: 'reset@example.com'
    };
    window.history.pushState({}, '', '/?authMode=password-reset');

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const dialog = await screen.findByRole('dialog', { name: 'Settings' });
    const passwordForm = within(dialog).getByRole('form', { name: 'Password reset' });

    await user.type(within(passwordForm).getByLabelText('New password'), 'newpass1');
    await user.type(within(passwordForm).getByLabelText('Confirm new password'), 'newpass1');
    await user.click(within(passwordForm).getByRole('button', { name: 'Update password' }));

    await waitFor(() => {
      expect(authMockState.passwordUpdateCalls).toEqual([{ password: 'newpass1' }]);
    });
    expect(screen.getByText('Password updated. You can keep working securely.')).toBeInTheDocument();
    window.history.pushState({}, '', '/');
  });

  it('keeps previous local vault deals out of a newly signed-in email account', async () => {
    setViewport(390);
    const oldAccountDeal = createSavedDeal('Old Account Deal', '2026-02-01T12:00:00.000Z');
    writeScenarios([oldAccountDeal]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    expect(screen.getByText('Old Account Deal')).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    const emailForm = within(dialog).getByRole('form', { name: 'Email sign in' });
    const secondEmailInput = within(emailForm).getByLabelText('Email address');
    const secondPasswordInput = within(emailForm).getByLabelText('Password');
    fireEvent.change(secondEmailInput, { target: { value: 'second@example.com' } });
    fireEvent.change(secondPasswordInput, { target: { value: 'rentalpass' } });
    expect(secondEmailInput).toHaveValue('second@example.com');
    expect(secondPasswordInput).toHaveValue('rentalpass');
    await user.click(within(emailForm).getByRole('button', { name: 'Sign in with email' }));

    await waitFor(() => {
      expect(screen.getByText('Signed in as second@example.com')).toBeInTheDocument();
      expect(screen.queryByText('Old Account Deal')).not.toBeInTheDocument();
    }, { timeout: 5000 });
    await waitFor(() => {
      expect(authMockState.cloudUpsertCalls.length).toBeGreaterThan(0);
    });
    expect(authMockState.cloudUpsertCalls.some((call) => call.scenarioId === oldAccountDeal.scenarioId)).toBe(false);
    expect(authMockState.cloudUpsertCalls).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ userId: 'email-user-1', dealName: 'New Deal' })
      ])
    );
  });

  it('keeps account creation available from the regular email path', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });
    await user.click(within(dialog).getByRole('button', { name: 'Create account' }));

    const emailForm = within(dialog).getByRole('form', { name: 'Email account creation' });
    expect(within(emailForm).getByRole('button', { name: 'Create account' })).toHaveAttribute('aria-pressed', 'true');

    await user.type(within(emailForm).getByLabelText('Email address'), 'newuser@example.com');
    await user.type(within(emailForm).getByLabelText('Password'), 'newpass1');
    await user.click(within(emailForm).getByRole('button', { name: 'Create account with email' }));

    await waitFor(() => {
      expect(authMockState.emailSignUpCalls).toEqual([{ email: 'newuser@example.com', password: 'newpass1' }]);
    });
    expect(within(dialog).getByRole('form', { name: 'Email sign in' })).toBeInTheDocument();
    expect(screen.getByText('Account created. Check your email, then sign in here.')).toBeInTheDocument();
  });

  it('copies a share link from the compact settings actions', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(within(screen.getByRole('dialog', { name: 'Settings' })).getByRole('button', { name: 'Send link' }));

    await waitFor(() => {
      expect(screen.getByText('Link copied.')).toBeInTheDocument();
    });
  });

  it('caps compact recent deals to the ten most recent entries by default', async () => {
    setViewport(390);
    writeScenarios([
      createSavedDeal('Recent Deal 1', '2026-01-08T12:00:00.000Z'),
      createSavedDeal('Recent Deal 2', '2026-01-07T12:00:00.000Z'),
      createSavedDeal('Recent Deal 3', '2026-01-06T12:00:00.000Z'),
      createSavedDeal('Recent Deal 4', '2026-01-05T12:00:00.000Z'),
      createSavedDeal('Recent Deal 5', '2026-01-04T12:00:00.000Z'),
      createSavedDeal('Recent Deal 6', '2026-01-03T12:00:00.000Z'),
      createSavedDeal('Recent Deal 7', '2026-01-02T12:00:00.000Z'),
      createSavedDeal('Recent Deal 8', '2026-01-01T12:00:00.000Z'),
      createSavedDeal('Recent Deal 9', '2025-12-31T12:00:00.000Z'),
      createSavedDeal('Recent Deal 10', '2025-12-30T12:00:00.000Z'),
      createSavedDeal('Recent Deal 11', '2025-12-29T12:00:00.000Z'),
      createSavedDeal('Recent Deal 12', '2025-12-28T12:00:00.000Z')
    ]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));

    const dialog = screen.getByRole('dialog', { name: 'Deals' });

    expect(within(dialog).getAllByRole('button', { name: /Duplicate Recent Deal / })).toHaveLength(10);
    expect(within(dialog).getByText('Recent Deal 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Recent Deal 10')).toBeInTheDocument();
    expect(within(dialog).queryByText('Recent Deal 11')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Recent Deal 12')).not.toBeInTheDocument();
  });

  it('searches older deals from compact recent deals by name', async () => {
    setViewport(390);
    writeScenarios([
      createSavedDeal('Recent Deal 1', '2026-01-08T12:00:00.000Z'),
      createSavedDeal('Recent Deal 2', '2026-01-07T12:00:00.000Z'),
      createSavedDeal('Recent Deal 3', '2026-01-06T12:00:00.000Z'),
      createSavedDeal('Recent Deal 4', '2026-01-05T12:00:00.000Z'),
      createSavedDeal('Recent Deal 5', '2026-01-04T12:00:00.000Z'),
      createSavedDeal('Recent Deal 6', '2026-01-03T12:00:00.000Z'),
      createSavedDeal('Recent Deal 7', '2026-01-02T12:00:00.000Z'),
      createSavedDeal('Recent Deal 8', '2026-01-01T12:00:00.000Z'),
      createSavedDeal('Recent Deal 9', '2025-12-31T12:00:00.000Z'),
      createSavedDeal('Recent Deal 10', '2025-12-30T12:00:00.000Z'),
      createSavedDeal('Austin BRRRR', '2025-12-29T12:00:00.000Z'),
      createSavedDeal('Miami Flip', '2025-12-28T12:00:00.000Z')
    ]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));

    const dialog = screen.getByRole('dialog', { name: 'Deals' });
    const search = within(dialog).getByPlaceholderText('Search deal name');

    expect(within(dialog).queryByText('Austin BRRRR')).not.toBeInTheDocument();

    fireEvent.change(search, { target: { value: 'Austin' } });
    expect(search).toHaveValue('Austin');

    await waitFor(() => {
      expect(within(dialog).getByText('Austin BRRRR')).toBeInTheDocument();
      expect(within(dialog).queryByText('Miami Flip')).not.toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('duplicates and deletes saved deals from compact recent deals', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));

    const dialog = screen.getByRole('dialog', { name: 'Deals' });
    await user.click(within(dialog).getByRole('button', { name: 'Duplicate Test Seed Deal' }));

    expect(within(dialog).getAllByText('Test Seed Deal Copy').length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: 'Delete Test Seed Deal Copy' }));
    expect(within(dialog).queryByText('Test Seed Deal Copy')).not.toBeInTheDocument();
  });

  it('opens compact deal actions from the overflow sheet', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Open settings' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send link' })).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Print to PDF' })).toBeInTheDocument();
    expect(within(dialog).getByText('Actions')).toBeInTheDocument();
    expect(within(dialog).getByRole('button', { name: 'Send feedback' })).toBeInTheDocument();
    expect((dialog.textContent ?? '').indexOf('Actions')).toBeLessThan((dialog.textContent ?? '').indexOf('Account'));
    expect(within(dialog).queryByText('Deals Vault')).not.toBeInTheDocument();
  });

  it('allows selecting one to many projection strategies on mobile', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    await user.click(screen.getByRole('button', { name: 'Projections' }));

    const selection = screen.getByLabelText('Projections strategy selection');
    const board = screen.getByLabelText('Strategy comparison board');

    expect(within(board).getAllByText('Long-Term Rental').length).toBeGreaterThan(0);
    expect(within(board).queryByText('Airbnb / STR')).not.toBeInTheDocument();
    expect(within(board).getAllByText('Cash to Close').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Modeled Exit').length).toBeGreaterThan(0);
    expect(within(board).queryByText('Modeled total return')).not.toBeInTheDocument();
    expect(within(board).queryByText('Payback')).not.toBeInTheDocument();
    expect(within(board).queryByText('Operating CF')).not.toBeInTheDocument();

    await user.click(within(selection).getByRole('button', { name: /Airbnb/i }));
    expect(within(board).getAllByText('Airbnb / STR').length).toBeGreaterThan(0);

    await user.click(within(selection).getByRole('button', { name: 'Commercial' }));
    await user.click(within(selection).getByRole('button', { name: 'PadSplit' }));
    await user.click(within(selection).getByRole('button', { name: 'BRRRR' }));
    await user.click(within(selection).getByRole('button', { name: 'Flip' }));

    expect(within(board).getAllByText('Commercial').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('PadSplit').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('BRRRR').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Flip').length).toBeGreaterThan(0);
    const flipCard = within(board).getByLabelText('Flip projection card');
    expect(within(flipCard).getByText('Negative carry')).toBeInTheDocument();
    expect(within(board).getAllByText('Long-Term Rental').length).toBeGreaterThan(0);

    await user.click(within(selection).getByRole('button', { name: 'Long-Term' }));

    expect(within(board).queryByText('Long-Term Rental')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equity modeling' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cash flow modeling' })).not.toBeInTheDocument();
    expect(screen.queryByText('Equity modeling by strategy')).not.toBeInTheDocument();
    expect(screen.queryByText('Cash flow modeling by strategy')).not.toBeInTheDocument();
    expect(within(board).getAllByText('Cash flow trend').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Cash-flow strength').length).toBeGreaterThan(0);
  });

  it('uses default projections strategies for each new mobile deal', async () => {
    window.localStorage.clear();
    window.localStorage.setItem(DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY, JSON.stringify(['airbnb', 'flip']));
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    await user.click(screen.getByRole('button', { name: 'Projections' }));

    let selection = screen.getByLabelText('Projections strategy selection');
    let board = screen.getByLabelText('Strategy comparison board');
    expect(within(selection).getByRole('button', { name: 'Airbnb' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Commercial' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(board).getAllByText('Airbnb / STR').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Flip').length).toBeGreaterThan(0);
    expect(within(board).queryByText('Commercial')).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'New deal' }));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const newDealPurchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(newDealPurchasePrice);
    await user.type(newDealPurchasePrice, '300000');

    const newDealGrossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(newDealGrossRent);
    await user.type(newDealGrossRent, '2400');

    await user.click(screen.getByRole('button', { name: 'Projections' }));

    selection = screen.getByLabelText('Projections strategy selection');
    board = screen.getByLabelText('Strategy comparison board');
    expect(within(selection).getByRole('button', { name: 'Airbnb' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Commercial' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(board).getAllByText('Airbnb / STR').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Flip').length).toBeGreaterThan(0);
    expect(within(board).queryByText('Commercial')).not.toBeInTheDocument();
  });

  it('restores per-deal projection selections on mobile', async () => {
    setViewport(390);
    writeScenarios([
      createScenarioRecord(
        {
          ...defaultDealInput,
          purchase: { ...defaultDealInput.purchase, dealName: 'Projection Deal A' },
          airbnb: { ...defaultDealInput.airbnb, adr: 180 },
          uiState: {
            activeStrategy: 'airbnb',
            projectionStrategies: ['airbnb', 'flip']
          }
        },
        { createdAt: '2026-01-08T12:00:00.000Z', updatedAt: '2026-01-08T12:00:00.000Z' }
      ),
      createScenarioRecord(
        {
          ...defaultDealInput,
          purchase: { ...defaultDealInput.purchase, dealName: 'Projection Deal B' },
          longTerm: { ...defaultDealInput.longTerm, grossRentMonthly: 2600 },
          uiState: {
            activeStrategy: 'longTerm',
            projectionStrategies: ['purchase', 'longTerm']
          }
        },
        { createdAt: '2026-01-07T12:00:00.000Z', updatedAt: '2026-01-07T12:00:00.000Z' }
      )
    ]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Projections' }));

    let selection = screen.getByLabelText('Projections strategy selection');
    expect(within(selection).getByRole('button', { name: 'Airbnb' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Long-Term' })).toHaveAttribute('aria-pressed', 'false');

    await user.click(screen.getByRole('button', { name: 'Deal Vault' }));
    const dialog = screen.getByRole('dialog', { name: 'Deals' });
    await user.click(within(dialog).getAllByText('Projection Deal B')[0]);

    await user.click(screen.getByRole('button', { name: 'Projections' }));

    selection = screen.getByLabelText('Projections strategy selection');
    expect(within(selection).getByRole('button', { name: 'Commercial' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Long-Term' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(selection).getByRole('button', { name: 'Airbnb' })).toHaveAttribute('aria-pressed', 'false');
    expect(within(selection).getByRole('button', { name: 'Flip' })).toHaveAttribute('aria-pressed', 'false');
  });

  it('restores the shared active strategy on mobile import links', async () => {
    window.localStorage.clear();
    setViewport(390);

    const encoded = encodeDealToShareParam({
      ...defaultDealInput,
      purchase: { ...defaultDealInput.purchase, dealName: 'Shared Airbnb Deal' },
      uiState: {
        activeStrategy: 'airbnb',
        projectionStrategies: ['airbnb', 'flip']
      }
    });

    window.history.replaceState({}, '', `/?s=${encoded}`);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    await waitFor(() => {
      const strategyButton = screen.getByRole('button', { name: 'Choose strategy' });
      expect(within(strategyButton).getByText('Airbnb')).toBeInTheDocument();
    });
  });

  it('shows timeline as a compact read-only reference on mobile', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    await user.click(screen.getByRole('button', { name: 'Results' }));
    await user.click(screen.getByRole('button', { name: 'Timeline' }));

    const dialog = screen.getByRole('dialog', { name: 'Timeline' });

    expect(within(dialog).getByRole('button', { name: 'IRR stream explanation' })).toBeInTheDocument();
    expect(within(dialog).getByText('Internal rate of return assumptions')).toBeInTheDocument();
    expect(within(dialog).queryByText(/Years 0 - \d+/)).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Hold years')).not.toBeInTheDocument();
  });

  it('shows a Commercial strategy tab and exposes strip-plaza underwriting inputs', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Commercial'));
    const workspace = getStrategyInputsWorkspace();

    const rentInput = within(workspace).getByLabelText('Base rent ($/sq ft/year)', { selector: 'input' });
    await user.clear(rentInput);
    await user.type(rentInput, '30');

    expect(rentInput).toHaveValue(30);
    const commercialOutputs = screen.getByText('Commercial outputs').closest('section');
    expect(commercialOutputs).not.toBeNull();
    expect(commercialOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(commercialOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-revealed');
    expect(within(commercialOutputs as HTMLElement).getByText('Commercial underwriting digest')).toBeInTheDocument();
    expect(within(commercialOutputs as HTMLElement).getByText('Live from inputs')).toBeInTheDocument();
    expect(within(commercialOutputs as HTMLElement).getAllByText('Annual NOI').length).toBeGreaterThan(0);
    expect(screen.queryByRole('dialog', { name: 'Strategy inputs' })).not.toBeInTheDocument();
  });

  it('edits desktop IRR assumptions directly from the timeline card', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));
    expect(within(getStrategyInputsWorkspace()).getByLabelText('Flip hold months')).toBeInTheDocument();
    selectDesktopWorkspace('Projection');
    expect(screen.getByText('Projected annual cash flow')).toBeInTheDocument();

    const holdYears = screen.getByLabelText('Hold years', { selector: 'input' });
    await user.clear(holdYears);
    await user.type(holdYears, '7');

    expect(holdYears).toHaveValue(7);
    expect(screen.getByRole('button', { name: 'IRR stream explanation' })).toBeInTheDocument();
    expect(screen.queryByText(/Years 0 - \d+/)).not.toBeInTheDocument();
  });

  it('editing purchase price updates master cash-to-close KPI', async () => {
    render(<HomePage />);

    const input = screen.getByLabelText('Purchase price');
    const user = userEvent.setup();
    await user.clear(input);
    await user.type(input, '300000');

    const updatedModel = {
      ...defaultDealInput,
      purchase: { ...defaultDealInput.purchase, purchasePrice: 300000 }
    };
    const expected = currencyFormatter.format(
      calculateCashToClose(
        updatedModel.purchase.purchasePrice,
        0,
        updatedModel.purchase.downPaymentPercent,
        updatedModel.purchase.closingCostPercent,
        updatedModel.purchase.pointsPercent,
        updatedModel.purchase.financingType,
        updatedModel.purchase.helocAmount,
        updatedModel.purchase.helocClosingCosts
      )
    );

    expect(screen.getByTestId('kpi-cash-to-close')).toHaveTextContent(expected);
    await waitFor(() => expect(screen.getByTestId('kpi-priority-metric')).toHaveClass('priority-kpi-value-motion'));
  });

  it('top KPI cards follow the active strategy tab', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(airbnbResult.monthlyCashFlow));
    expect(screen.getByTestId('kpi-priority-metric')).not.toHaveClass('priority-kpi-value-motion');
    expect(screen.getByTestId('kpi-cash-on-cash')).toHaveTextContent(
      percentFormatter.format(airbnbResult.cashOnCashReturn)
    );
    expect(screen.getByTestId('kpi-cap-rate')).toHaveTextContent(
      percentFormatter.format(airbnbResult.capRate)
    );

    expect(screen.getByTestId('kpi-total-cash-invested')).toHaveTextContent(currencyFormatter.format(getTotalCashInvested(airbnbResult)));
    expect(screen.getByLabelText('Cash to Close strategy context')).toHaveTextContent('Airbnb');
    expect(screen.getByRole('button', { name: 'Cash to Close definitions' })).toBeInTheDocument();

    await user.click(getStrategyButton('BRRRR'));
    const brrrrResult = calculateDeal(defaultDealInput).brrrr;
    expect(screen.getByTestId('kpi-total-cash-invested')).toHaveTextContent(currencyFormatter.format(getTotalCashInvested(brrrrResult)));
    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Spreadsheet' }));
    const summary = within(screen.getByLabelText('Spreadsheet deal workspace')).getByLabelText('Deal summary');
    const investedCell = within(summary).getByText('Total invested').parentElement;
    expect(investedCell).toHaveTextContent(currencyFormatter.format(getTotalCashInvested(brrrrResult)));
  });

  it('priority monthly cash flow toggle switches reserve mode for hold strategies', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;
    const includeValue = currencyFormatter.format(airbnbResult.monthlyCashFlow);
    const excludeValue = currencyFormatter.format(airbnbResult.monthlyCashFlowExcludingReserves ?? airbnbResult.monthlyCashFlow);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(includeValue);
    expect(screen.getByText('Monthly cash flow')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Exclude reserves' })[0]);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(excludeValue);
  });

  it('keeps the hero KPI focused by omitting verdict labels and explanatory notes', () => {
    render(<HomePage />);
    loadSampleDealFromSettings();

    expect(screen.getByTestId('kpi-priority-metric')).toBeInTheDocument();
    expect(document.querySelector('.decision-verdict-row')).toBeNull();
    expect(screen.queryByText('Strong')).not.toBeInTheDocument();
    expect(screen.queryByText(/produces positive monthly cash flow/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/DSCR at or above 1\.20/i)).not.toBeInTheDocument();
  });

  it('flip priority metric switches to net profit', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));

    const flipResult = calculateDeal(defaultDealInput).flip;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(
      currencyFormatter.format(flipResult.calculationBreakdown?.flipMeta?.netProfit ?? 0)
    );
    expect(screen.getByText('Net profit')).toBeInTheDocument();
    expect(screen.getAllByText('Max Offer').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Rehab Buffer').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: 'Include reserves' })).not.toBeInTheDocument();
  });


  it('desktop projections board keeps equity and cash flow modeling in one view', () => {
    render(<HomePage />);
    loadSampleDealFromSettings();
    selectDesktopWorkspace('Compare');
    const board = screen.getByLabelText('Strategy comparison board');

    expect(screen.getByText('Projections board')).toBeInTheDocument();
    expect(screen.queryByText('Saved locally for this deal only.')).not.toBeInTheDocument();
    expect(screen.queryByText(/^\d+ shown$/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equity modeling' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cash flow modeling' })).not.toBeInTheDocument();
    expect(within(board).getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Modeled Exit').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Cash flow trend').length).toBeGreaterThan(0);
  });

  it('opens expanded cash flow trend details from a desktop projection card', async () => {
    render(<HomePage />);
    loadSampleDealFromSettings();
    const user = userEvent.setup();
    selectDesktopWorkspace('Compare');
    const board = screen.getByLabelText('Strategy comparison board');

    await user.click(within(board).getAllByRole('button', { name: /Open .* cash flow trend details/i })[0]);

    const dialog = screen.getByRole('dialog', { name: /cash flow trend details/i });
    expect(within(dialog).getByText('Total cash flow')).toBeInTheDocument();
    expect(within(dialog).getByText('Average / year')).toBeInTheDocument();
    expect(within(dialog).getAllByText(/Year \d+/).length).toBeGreaterThan(0);

    await user.click(within(dialog).getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('dialog', { name: /cash flow trend details/i })).not.toBeInTheDocument();
  });

  it('filters the desktop projections board per deal from local board controls', async () => {
    render(<HomePage />);
    loadSampleDealFromSettings();
    const user = userEvent.setup();
    selectDesktopWorkspace('Compare');
    const board = screen.getByLabelText('Strategy comparison board');

    expect(within(board).queryByLabelText('Commercial projection card')).not.toBeInTheDocument();

    const selection = screen.getByLabelText('Projections board strategy selection');
    const commercial = within(selection).getByRole('button', { name: 'Commercial' });
    await user.click(commercial);
    expect(within(board).getByLabelText('Commercial projection card')).toBeInTheDocument();

    await user.click(commercial);
    expect(within(board).queryByLabelText('Commercial projection card')).not.toBeInTheDocument();
  });

  it('limits desktop deal vault quick switching to ten recent deals and searches older ones', async () => {
    writeScenarios([
      createSavedDeal('Recent Deal 1', '2026-01-08T12:00:00.000Z'),
      createSavedDeal('Recent Deal 2', '2026-01-07T12:00:00.000Z'),
      createSavedDeal('Recent Deal 3', '2026-01-06T12:00:00.000Z'),
      createSavedDeal('Recent Deal 4', '2026-01-05T12:00:00.000Z'),
      createSavedDeal('Recent Deal 5', '2026-01-04T12:00:00.000Z'),
      createSavedDeal('Recent Deal 6', '2026-01-03T12:00:00.000Z'),
      createSavedDeal('Recent Deal 7', '2026-01-02T12:00:00.000Z'),
      createSavedDeal('Recent Deal 8', '2026-01-01T12:00:00.000Z'),
      createSavedDeal('Recent Deal 9', '2025-12-31T12:00:00.000Z'),
      createSavedDeal('Recent Deal 10', '2025-12-30T12:00:00.000Z'),
      createSavedDeal('Austin BRRRR', '2025-12-29T12:00:00.000Z'),
      createSavedDeal('Miami Flip', '2025-12-28T12:00:00.000Z')
    ]);

    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open deal vault' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal Vault' });

    expect(within(dialog).getByText('Recent Deal 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Recent Deal 10')).toBeInTheDocument();
    expect(within(dialog).queryByText('Austin BRRRR')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Miami Flip')).not.toBeInTheDocument();

    const search = within(dialog).getByPlaceholderText('Search deal name');
    fireEvent.change(search, { target: { value: 'Austin' } });

    await waitFor(() => {
      expect(within(dialog).getByText('Austin BRRRR')).toBeInTheDocument();
      expect(within(dialog).queryByText('Miami Flip')).not.toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('blocks anonymous users from creating a sixth saved deal', async () => {
    writeScenarios(createSavedDealList(5, 'Anonymous Limit Deal'));

    render(<HomePage />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('5 saved deals');

    await user.click(screen.getByRole('button', { name: 'New deal' }));

    expect(screen.queryByRole('dialog', { name: 'Deal identity' })).not.toBeInTheDocument();
    expect(screen.getByText('Sign in to save more than 5 deals. You can still open, edit, export, or delete existing saved deals.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('5 saved deals');
  });

  it('prevents backup import from bypassing the anonymous deal limit', async () => {
    writeScenarios(createSavedDealList(5, 'Anonymous Backup Deal'));
    const importedPayload = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Blocked Backup Deal'
      }
    };
    const importedDeal = createScenarioRecord(importedPayload, {
      scenarioId: 'blocked-backup-deal',
      dealName: importedPayload.purchase.dealName,
      payload: importedPayload,
      createdAt: '2026-04-20T12:00:00.000Z',
      updatedAt: '2026-04-29T12:00:00.000Z'
    });
    const backupFile = new File(
      [JSON.stringify({ app: 'DealCooker', schemaVersion: '1.0.0', deals: [importedDeal] })],
      'dealcooker-vault-backup.json',
      { type: 'application/json' }
    );
    const { container } = render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open settings' }));
    await user.click(screen.getByRole('button', { name: 'Import backup' }));

    const fileInput = container.querySelector('input[type="file"]');
    expect(fileInput).toBeInstanceOf(HTMLInputElement);
    await user.upload(fileInput as HTMLInputElement, backupFile);

    await waitFor(() => {
      expect(screen.getByText('Sign in to save more than 5 deals. You can still open, edit, export, or delete existing saved deals.')).toBeInTheDocument();
    });
    expect(screen.queryByText('Blocked Backup Deal')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('5 saved deals');
  });

  it('allows signed-in users to save more than five deals', async () => {
    authMockState.user = {
      id: 'limit-user',
      email: 'limit@example.com'
    };
    setScenarioStorageOwner('limit-user');
    writeScenarios(createSavedDealList(5, 'Signed In Limit Deal'));
    setScenarioStorageOwner(null);

    render(<HomePage />);
    const user = userEvent.setup();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('5 saved deals');
    });

    await user.click(screen.getByRole('button', { name: 'New deal' }));

    expect(screen.getByRole('dialog', { name: 'Deal identity' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('6 saved deals');
  });

  it('refreshes updatedAt before autosaving a signed-in deal to the cloud', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-07-10T16:00:00.000Z'));
    try {
      authMockState.user = { id: 'autosave-user', email: 'autosave@example.com' };
      const savedDeal = createSavedDeal('Timestamp Deal', '2026-01-01T12:00:00.000Z');
      setScenarioStorageOwner('autosave-user');
      writeScenarios([savedDeal]);
      setScenarioStorageOwner(null);

      render(<HomePage />);
      await flushAuthEffects();

      fireEvent.change(screen.getByLabelText('Purchase price'), { target: { value: '315000' } });
      await act(async () => {
        vi.advanceTimersByTime(2_000);
        await Promise.resolve();
      });

      const latestUpsert = authMockState.cloudUpsertCalls.at(-1);
      expect(latestUpsert).toMatchObject({
        userId: 'autosave-user',
        scenarioId: savedDeal.scenarioId,
        dealName: 'Timestamp Deal'
      });
      expect(Date.parse(latestUpsert?.updatedAt ?? '')).toBeGreaterThan(Date.parse(savedDeal.updatedAt));
    } finally {
      vi.useRealTimers();
    }
  });

  it('deletes a signed-in cloud scenario exactly once', async () => {
    authMockState.user = { id: 'delete-user', email: 'delete@example.com' };
    const currentDeal = createSavedDeal('Current Deal', '2026-01-08T12:00:00.000Z');
    const deletedDeal = createSavedDeal('Austin BRRRR', '2026-01-07T12:00:00.000Z');
    setScenarioStorageOwner('delete-user');
    writeScenarios([currentDeal, deletedDeal]);
    setScenarioStorageOwner(null);

    render(<HomePage />);
    await flushAuthEffects();
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open deal vault' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal Vault' });
    await user.click(within(dialog).getByRole('button', { name: 'Delete Austin BRRRR' }));

    await waitFor(() => {
      expect(authMockState.cloudDeleteCalls.filter((call) => call.scenarioId === deletedDeal.scenarioId)).toHaveLength(1);
    });
  });

  it('deletes a deal directly from its desktop vault row without opening it first', async () => {
    writeScenarios([
      createSavedDeal('Current Deal', '2026-01-08T12:00:00.000Z'),
      createSavedDeal('Austin BRRRR', '2026-01-07T12:00:00.000Z'),
      createSavedDeal('Miami Flip', '2026-01-06T12:00:00.000Z')
    ]);

    render(<HomePage />);
    const user = userEvent.setup();

    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('Current Deal');

    await user.click(screen.getByRole('button', { name: 'Open deal vault' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal Vault' });

    await user.click(within(dialog).getByRole('button', { name: 'Delete Austin BRRRR' }));

    await waitFor(() => {
      expect(within(dialog).queryByText('Austin BRRRR')).not.toBeInTheDocument();
    });
    expect(screen.getByRole('button', { name: 'Open deal vault' })).toHaveTextContent('Current Deal');
  });

  it('strategy work lightbox opens for active strategy and shows key rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('PadSplit'));
    const workspace = getStrategyInputsWorkspace();
    await user.clear(within(workspace).getByLabelText('Rentable rooms'));
    await user.type(within(workspace).getByLabelText('Rentable rooms'), '5');
    await user.clear(within(workspace).getByLabelText('Weekly rate / room'));
    await user.type(within(workspace).getByLabelText('Weekly rate / room'), '200');
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    const dialog = screen.getByRole('dialog', { name: 'Strategy Work Lightbox' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('PadSplit calculations')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Income').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Expenses').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Debt service').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Property tax').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Insurance').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Tenant placement fees')).toBeInTheDocument();
    expect(within(dialog).getByText('Monthly cost mix')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: /Monthly cost mix chart totaling/i })).toBeInTheDocument();

    const costMixSection = within(dialog).getByText('Monthly cost mix').closest('section');
    expect(costMixSection).not.toBeNull();
    expect(within(costMixSection as HTMLElement).getByText('Debt service')).toBeInTheDocument();
    expect(within(costMixSection as HTMLElement).queryByText('Tenant placement fees')).not.toBeInTheDocument();
    expect(within(costMixSection as HTMLElement).queryByText('Other')).not.toBeInTheDocument();

    await user.hover(within(costMixSection as HTMLElement).getByLabelText(/^Debt service slice:/i));
    expect(within(costMixSection as HTMLElement).getByRole('status')).toHaveTextContent('Debt service');
  });

  it('BRRRR show work exposes capital-in and refi math sections', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('BRRRR'));
    const workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByRole('spinbutton', { name: /Refi amortization \(years\)/i })).toHaveValue(30);
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    expect(screen.getByRole('dialog', { name: 'Strategy Work Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('BRRRR calculations')).toBeInTheDocument();
    expect(screen.getByText('Cash invested before refi')).toBeInTheDocument();
    expect(screen.getAllByText('Cash back at refi').length).toBeGreaterThan(0);
    expect(screen.getByText('Cash left in deal')).toBeInTheDocument();
    expect(screen.getByText('Refi math')).toBeInTheDocument();
    expect(screen.getByRole('img', { name: 'Refi waterfall' })).toBeInTheDocument();
  });

  it('flip show work exposes expense visuals and sale waterfall', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    const dialog = screen.getByRole('dialog', { name: 'Strategy Work Lightbox' });
    expect(within(dialog).getByText('Flip calculations')).toBeInTheDocument();
    expect(within(dialog).getByText('Flip cost mix')).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: /Flip cost mix chart totaling/i })).toBeInTheDocument();
    expect(within(dialog).getByRole('img', { name: 'Sale waterfall' })).toBeInTheDocument();
  });

  it('save as flow persists a deal in the vault list', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Open deal vault' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal Vault' });

    await user.click(within(dialog).getByRole('button', { name: 'Duplicate active deal' }));
    const dialogInput = within(dialog).getByPlaceholderText('Deal name');
    await user.clear(dialogInput);
    await user.type(dialogInput, 'Austin BRRRR');
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(within(dialog).getAllByRole('button', { name: /Austin BRRRR/i }).length).toBeGreaterThan(0);
  });


  it('strategy-specific ARV input is available in the strategy workbench', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Long-Term'));
    const workspace = getStrategyInputsWorkspace();
    const strategyArv = within(workspace).getByRole('spinbutton', { name: /Long Term ARV/i });
    const inputLabels = within(workspace)
      .getAllByRole('spinbutton')
      .map((input) => input.getAttribute('aria-label'));

    await user.clear(strategyArv);
    await user.type(strategyArv, '365000');

    expect(strategyArv).toHaveValue(365000);
    expect(inputLabels.slice(-2)).toEqual(['Long Term ARV', 'Annual revenue (optional)']);

    await user.click(getStrategyButton('BRRRR'));
    expect(within(getStrategyInputsWorkspace()).getByRole('spinbutton', { name: 'BRRRR ARV' })).toBeInTheDocument();

    await user.click(getStrategyButton('Flip'));
    expect(within(getStrategyInputsWorkspace()).getByRole('spinbutton', { name: 'Flip ARV' })).toBeInTheDocument();
  });

  it('uses the split Long-Term strategy button to toggle turnaround mode', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const selector = screen.getByLabelText('Desktop strategy selector');

    await user.click(within(selector).getByRole('button', { name: 'Long-Term turnaround' }));

    expect(within(selector).getByRole('button', { name: 'Long-Term turnaround' })).toHaveAttribute('aria-pressed', 'true');
    expect(within(getStrategyInputsWorkspace()).getByText('Stabilize scenario (12-month underwrite)')).toBeInTheDocument();
    expect(within(getStrategyInputsWorkspace()).getByRole('spinbutton', { name: 'Stabilized ARV' })).toBeInTheDocument();

    await user.click(within(selector).getByRole('button', { name: 'Long-Term' }));

    expect(within(selector).getByRole('button', { name: 'Long-Term turnaround' })).toHaveAttribute('aria-pressed', 'false');
    expect(screen.queryByText('Stabilize scenario (12-month underwrite)')).not.toBeInTheDocument();
  });

  it('keeps commercial and turnaround output panels visible while switching strategies repeatedly', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const selector = screen.getByLabelText('Desktop strategy selector');

    await user.click(within(selector).getByRole('button', { name: 'Long-Term turnaround' }));
    let turnaroundOutputs = screen.getByText('Long-term turnaround outputs').closest('section');
    expect(turnaroundOutputs).not.toBeNull();
    expect(turnaroundOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(within(turnaroundOutputs as HTMLElement).getAllByText('Cash Flow (Pre-Tax)').length).toBeGreaterThan(0);

    await user.click(within(selector).getByRole('button', { name: 'Airbnb' }));
    expect(turnaroundOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-exiting');

    await user.click(within(selector).getByRole('button', { name: 'Long-Term turnaround' }));
    turnaroundOutputs = screen.getByText('Long-term turnaround outputs').closest('section');
    expect(turnaroundOutputs).not.toBeNull();
    expect(turnaroundOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(within(turnaroundOutputs as HTMLElement).getAllByText('Cash Flow (Pre-Tax)').length).toBeGreaterThan(0);

    await user.click(within(selector).getByRole('button', { name: 'Commercial' }));
    let commercialOutputs = screen.getByText('Commercial outputs').closest('section');
    expect(commercialOutputs).not.toBeNull();
    expect(commercialOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(within(commercialOutputs as HTMLElement).getAllByText('Annual NOI').length).toBeGreaterThan(0);

    await user.click(within(selector).getByRole('button', { name: 'Airbnb' }));
    expect(commercialOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-exiting');

    await user.click(within(selector).getByRole('button', { name: 'Commercial' }));
    commercialOutputs = screen.getByText('Commercial outputs').closest('section');
    expect(commercialOutputs).not.toBeNull();
    expect(commercialOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(within(commercialOutputs as HTMLElement).getAllByText('Annual NOI').length).toBeGreaterThan(0);

    await user.click(within(selector).getByRole('button', { name: 'Long-Term turnaround' }));
    turnaroundOutputs = screen.getByText('Long-term turnaround outputs').closest('section');
    expect(turnaroundOutputs).not.toBeNull();
    expect(turnaroundOutputs?.closest('.scenario-digest-collapse')).toHaveClass('scenario-digest-collapse-open');
    expect(within(turnaroundOutputs as HTMLElement).getAllByText('Cash Flow (Pre-Tax)').length).toBeGreaterThan(0);
  });

  it('keeps top long-term KPIs on purchase numbers while turnaround outputs show stabilized numbers', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const selector = screen.getByLabelText('Desktop strategy selector');

    await user.click(within(selector).getByRole('button', { name: 'Long-Term turnaround' }));

    const stabilizedRent = within(getStrategyInputsWorkspace()).getByRole('spinbutton', {
      name: 'Stabilized gross monthly rent'
    });
    fireEvent.change(stabilizedRent, { target: { value: '8000' } });

    const baselineLongTerm = calculateDeal(defaultDealInput).longTerm;
    const stabilizedModel = {
      ...defaultDealInput,
      longTerm: {
        ...defaultDealInput.longTerm,
        turnaround: {
          ...defaultDealInput.longTerm.turnaround,
          enabled: true,
          stabilizedGrossRentMonthly: 8000
        }
      }
    };
    const stabilizedSummary = calculateDeal(stabilizedModel).longTerm.longTermTurnaroundSummary;

    expect(screen.getByTestId('kpi-cash-on-cash')).toHaveTextContent(
      percentFormatter.format(baselineLongTerm.cashOnCashReturn)
    );
    expect(screen.getByTestId('kpi-cap-rate')).toHaveTextContent(
      percentFormatter.format(baselineLongTerm.capRate)
    );
    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(
      currencyFormatter.format(baselineLongTerm.monthlyCashFlow)
    );
    expect(screen.getByLabelText('Cash on Cash strategy context')).toHaveTextContent('Long-Term');

    const turnaroundOutputs = screen.getByText('Long-term turnaround outputs').closest('section');
    expect(turnaroundOutputs).not.toBeNull();
    const turnaroundQueries = within(turnaroundOutputs as HTMLElement);
    const stabilizedCashFlow = currencyFormatter.format(stabilizedSummary?.cashFlowPreTaxMonthly ?? 0);

    expect(turnaroundQueries.getByText('Stabilized run-rate digest')).toBeInTheDocument();
    expect(turnaroundQueries.getByText('Live from inputs')).toBeInTheDocument();
    expect(turnaroundQueries.getAllByText('Cash Flow (Pre-Tax)').length).toBeGreaterThan(0);
    expect(turnaroundQueries.getAllByText(stabilizedCashFlow).length).toBeGreaterThan(0);
    expect(screen.getByTestId('kpi-priority-metric')).not.toHaveTextContent(stabilizedCashFlow);
    expect(turnaroundQueries.getAllByText('Cash-on-Cash (Stabilized)').length).toBeGreaterThan(0);
    expect(turnaroundQueries.getAllByText(percentFormatter.format(stabilizedSummary?.cashOnCashReturn ?? 0)).length).toBeGreaterThan(0);
    expect(turnaroundQueries.getAllByText('Cap Rate (Stabilized)').length).toBeGreaterThan(0);
    expect(turnaroundQueries.getAllByText(percentFormatter.format(stabilizedSummary?.capRate ?? 0)).length).toBeGreaterThan(0);
  }, 30000);

  it('allows decimal precision for percent and numeric text fields without rounding', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const downPayment = screen.getByLabelText('Down payment %');
    await user.clear(downPayment);
    await user.type(downPayment, '5.55');
    expect(downPayment).toHaveValue(5.55);

    const purchasePrice = screen.getByLabelText('Purchase price');
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '300000.37');
    expect(purchasePrice).toHaveValue(300000.37);
  });



  it('auto-fills deal name from listing link and renders a clickable source URL', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });
    const listingInput = within(dialog).getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    fireEvent.change(listingInput, {
      target: { value: 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/' }
    });

    await waitFor(() => {
      expect(within(dialog).getByLabelText('Deal name')).toHaveValue('123 Main St, Tampa');
    }, { timeout: 5000 });

    expect(within(dialog).getByRole('link', { name: 'View listing link' })).toHaveAttribute(
      'href',
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    );
    expect(screen.getByRole('link', { name: 'View listing' })).toHaveAttribute(
      'href',
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    );
  }, 20000);


  it('does not auto-rename for onehome links', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    const nameInput = within(dialog).getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = within(dialog).getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://portal.onehome.com/en-US/share/2478045G14539');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(within(dialog).getByLabelText('Deal name')).toHaveValue(originalName);
  }, 20000);

  it('does not auto-rename when listing url lacks an address slug', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));
    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    const nameInput = within(dialog).getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = within(dialog).getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.redfin.com/FL/Tampa/overview');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(within(dialog).getByLabelText('Deal name')).toHaveValue(originalName);
  });

  it('new deal action resets common underwriting fields to defaults', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const purchasePrice = screen.getByLabelText('Purchase price');
    const rehabBudget = screen.getByLabelText('Rehab budget');

    await user.clear(purchasePrice);
    await user.type(purchasePrice, '415000');
    await user.clear(rehabBudget);
    await user.type(rehabBudget, '95000');

    await user.click(screen.getByRole('button', { name: 'Open deal vault' }));
    const vaultDialog = screen.getByRole('dialog', { name: 'Deal Vault' });
    await user.click(within(vaultDialog).getByRole('button', { name: 'Create new deal' }));

    const identityDialog = screen.getByRole('dialog', { name: 'Deal identity' });
    expect(identityDialog).toBeInTheDocument();
    expect(within(identityDialog).getByLabelText('Deal name')).toHaveValue('');
    const dealName = within(identityDialog).getByLabelText('Deal name');
    await user.clear(dealName);
    fireEvent.change(dealName, { target: { value: 'Austin BRRRR' } });
    const activeIdentityDialog = screen.queryByRole('dialog', { name: 'Deal identity' });
    if (activeIdentityDialog) {
      fireEvent.keyDown(document, { key: 'Escape' });
    }

    await waitFor(() => {
      expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
      expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);
    }, { timeout: 15000 });

    await user.click(getStrategyButton('Airbnb'));
    let workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('ADR')).toHaveValue(0);

    await user.click(getStrategyButton('PadSplit'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Weekly rate / room')).toHaveValue(0);
    expect(within(workspace).getByLabelText('PM flat fee / mo', { selector: 'input' })).toBeInTheDocument();

    await user.click(getStrategyButton('Commercial'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Base rent ($/sq ft/year)', { selector: 'input' })).toHaveValue(0);

    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);
  }, 20000);

  it('share link feedback auto-dismisses after a few seconds', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: {
        writeText: async () => undefined
      }
    });

    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Send link' })[0]);

    expect(screen.getByText('Link copied.')).toBeInTheDocument();

    await new Promise((resolve) => {
      window.setTimeout(resolve, 3400);
    });

    expect(screen.queryByText('Link copied.')).not.toBeInTheDocument();
  });

  it('removes the T12 import section from core inputs', async () => {
    render(<HomePage />);
    expect(screen.queryByRole('button', { name: 'Import T12/P&L' })).not.toBeInTheDocument();
  });

  it('annual revenue override is available and updates long-term results', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const longTermOverrideModel = {
      ...defaultDealInput,
      longTerm: {
        ...defaultDealInput.longTerm,
        annualRevenueOverride: 72000
      }
    };
    const expectedLongTerm = calculateDeal(longTermOverrideModel).longTerm.monthlyCashFlow;

    await user.click(getStrategyButton('Long-Term'));
    let workspace = getStrategyInputsWorkspace();
    const annualRevenueInput = within(workspace).getByLabelText('Annual revenue (optional)');
    fireEvent.change(annualRevenueInput, { target: { value: '72000' } });
    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(expectedLongTerm));

    await user.click(getStrategyButton('Airbnb'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Annual revenue (optional)')).toBeInTheDocument();
    expect(
      within(workspace)
        .getAllByRole('spinbutton')
        .map((input) => input.getAttribute('aria-label'))
        .slice(-2)
    ).toEqual(['STR ARV', 'Annual revenue (optional)']);

    await user.click(getStrategyButton('PadSplit'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Annual revenue (optional)')).toBeInTheDocument();
    expect(within(workspace).getByLabelText('PM flat fee / mo', { selector: 'input' })).toBeInTheDocument();
    expect(
      within(workspace)
        .getAllByRole('spinbutton')
        .map((input) => input.getAttribute('aria-label'))
        .slice(-2)
    ).toEqual(['PadSplit ARV', 'Annual revenue (optional)']);
  }, 30000);

  it('removes the desktop tab tagline bars from every input page', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const inputSections = within(screen.getByLabelText('Deal input sections'));

    expect(screen.queryByText('Purchase basis and financing')).not.toBeInTheDocument();
    expect(document.querySelector('.desktop-lane-anchor')).toBeNull();

    await user.click(inputSections.getByRole('button', { name: /Expenses/ }));
    expect(screen.queryByText('Operating burden and reserves')).not.toBeInTheDocument();
    expect(document.querySelector('.desktop-builder-lane-expenses')).toBeNull();

    await user.click(inputSections.getByRole('button', { name: /Strategy/ }));
    expect(screen.queryByText('Income and strategy assumptions')).not.toBeInTheDocument();

    await user.click(inputSections.getByRole('button', { name: /Advanced/ }));
    expect(screen.queryByText('Hold, exit, and IRR assumptions')).not.toBeInTheDocument();
  });

  it('keeps the desktop variable expense editor compact while allowing inline edits', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    await user.click(within(screen.getByLabelText('Deal input sections')).getByRole('button', { name: /Expenses/ }));

    const header = document.querySelector('.variable-expense-header');
    expect(header).not.toBeNull();
    if (header) {
      expect(within(header as HTMLElement).getByText('Expense')).toBeInTheDocument();
      expect(within(header as HTMLElement).getByText('Unit')).toBeInTheDocument();
      expect(within(header as HTMLElement).getByText('Amount')).toBeInTheDocument();
      expect(within(header as HTMLElement).getByText('Applies to')).toBeInTheDocument();
    }

    const variableExpenseEditor = screen.getByLabelText('Variable expense editor');
    expect(screen.queryByRole('button', { name: 'Select strategies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done selecting' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Power applies to Commercial' })).toBeInTheDocument();

    const beforeCount = screen.getAllByLabelText(/Expense label/i).length;
    const firstLabel = screen.getByLabelText('Expense label 1');
    await user.clear(firstLabel);
    await user.type(firstLabel, 'Utilities Master');
    expect(screen.getByLabelText('Expense label 1')).toHaveValue('Utilities Master');

    const annualCadence = screen.getByRole('button', { name: 'Utilities Master annual input cadence' });
    await user.click(annualCadence);
    expect(annualCadence).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByRole('button', { name: 'Utilities Master monthly input cadence' })).toHaveAttribute('aria-pressed', 'false');

    const commercialToggle = screen.getByRole('button', { name: 'Utilities Master applies to Commercial' });
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(commercialToggle);
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(commercialToggle);
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Utilities Master annual input cadence' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Utilities Master amount')).toBeInTheDocument();
    expect(within(variableExpenseEditor).getByLabelText('Utilities Master strategies')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add variable expense' }));

    const afterCount = screen.getAllByLabelText(/Expense label/i).length;
    expect(afterCount).toBe(beforeCount + 1);

    const deleteButtons = screen.getAllByRole('button', { name: /Delete expense/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);

    expect(screen.getAllByLabelText(/Expense label/i).length).toBe(beforeCount);
  });

  it('keeps the mobile variable expense editor directly usable from the expenses tab', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('tab', { name: /Expenses/i }));

    expect(screen.getByRole('button', { name: 'Add variable expense' })).toBeInTheDocument();
    const variableExpenseEditor = screen.getByLabelText('Variable expense editor');
    expect(variableExpenseEditor.parentElement).toHaveClass('expenses-variable-flat');
    expect(variableExpenseEditor.parentElement).not.toHaveClass('section-inner');

    const beforeCount = screen.getAllByLabelText(/Expense label/i).length;
    const firstLabel = screen.getByLabelText('Expense label 1');
    await user.clear(firstLabel);
    await user.type(firstLabel, 'Mobile Utilities');
    expect(screen.getByLabelText('Expense label 1')).toHaveValue('Mobile Utilities');

    const annualCadence = screen.getByRole('button', { name: 'Mobile Utilities annual input cadence' });
    await user.click(annualCadence);
    expect(annualCadence).toHaveAttribute('aria-pressed', 'true');

    expect(screen.queryByRole('button', { name: 'Select strategies' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Done selecting' })).not.toBeInTheDocument();
    const commercialToggle = screen.getByRole('button', { name: 'Mobile Utilities applies to Commercial' });
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(commercialToggle);
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'true');
    await user.click(commercialToggle);
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'false');
    expect(screen.getByRole('button', { name: 'Mobile Utilities annual input cadence' })).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getByLabelText('Mobile Utilities amount')).toBeInTheDocument();
    expect(within(variableExpenseEditor).getByLabelText('Mobile Utilities strategies')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Add variable expense' }));
    expect(screen.getAllByLabelText(/Expense label/i).length).toBe(beforeCount + 1);

    const deleteButtons = screen.getAllByRole('button', { name: /Delete expense/i });
    await user.click(deleteButtons[deleteButtons.length - 1]);

    expect(screen.getAllByLabelText(/Expense label/i).length).toBe(beforeCount);
  });

  it('print view link includes encoded scenario payload and selected strategy', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const printLink = screen.getByRole('link', { name: 'Print to PDF' });
    const href = printLink.getAttribute('href') ?? '';

    expect(href.startsWith('/print?scenario=')).toBe(true);
    expect(href).toContain('&strategy=airbnb');
  });

  it('copies the full print report URL for anonymous users and exposes a real editable import link', async () => {
    const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    window.history.pushState({}, '', '/print?scenario=encoded-report&strategy=airbnb');
    const reportScenario = createScenarioRecord({
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Report Deal',
        purchasePrice: 315000
      }
    });
    const scenarioToken = encodeScenario(reportScenario);

    render(<PrintActions documentTitle="Test Report" scenarioToken={scenarioToken} strategy="airbnb" />);

    const editableDealLink = screen.getByRole('link', { name: 'Open Editable Deal' });
    const editableDealUrl = new URL(editableDealLink.getAttribute('href') ?? '');
    const editableDeal = decodeDealFromShareParam(editableDealUrl.searchParams.get('s') ?? '');
    expect(editableDealUrl.pathname).toBe('/');
    expect(editableDeal?.purchase.dealName).toBe('Report Deal');

    fireEvent.click(screen.getByRole('button', { name: 'Copy Shareable Link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/print?scenario=encoded-report&strategy=airbnb`);
    });
    expect(screen.getByText('Full report link copied. Sign in for short links.')).toBeInTheDocument();
  });

  it('copies a short print report URL for signed-in users', async () => {
    authMockState.user = {
      id: 'report-user-1',
      email: 'report@example.com'
    };
    const writeText = vi.fn<(value: string) => Promise<void>>(async () => undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText }
    });
    window.history.pushState({}, '', '/print?scenario=encoded-report&strategy=airbnb');
    const reportScenario = createScenarioRecord({
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Short Report Deal',
        purchasePrice: 425000
      }
    });

    render(<PrintActions documentTitle="Test Report" scenarioToken={encodeScenario(reportScenario)} strategy="airbnb" />);

    fireEvent.click(screen.getByRole('button', { name: 'Copy Shareable Link' }));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledTimes(1);
    });
    const copiedUrl = new URL(writeText.mock.calls[0][0]);
    expect(copiedUrl.origin).toBe(window.location.origin);
    expect(copiedUrl.pathname).toMatch(/^\/r\/[A-Za-z0-9_-]{8}$/);
    expect(copiedUrl.searchParams.get('strategy')).toBe('airbnb');
    expect(authMockState.shareInsertCalls).toHaveLength(1);
    expect((authMockState.shareInsertCalls[0].payload_snapshot as typeof defaultDealInput).purchase.dealName).toBe('Short Report Deal');
    expect(screen.getByText('Short report link copied.')).toBeInTheDocument();
  });
});
