import { render, screen, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import HomePage from '../app/page';
import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateCashToClose } from '../lib/engine/finance';
import { defaultDealInput } from '../lib/models/deal';
import { currencyFormatter, percentFormatter } from '../lib/formatters';
import { createScenarioRecord, writeScenarios } from '../lib/scenario-storage';
import { encodeDealToShareParam } from '../lib/share-link';

const getStrategyButton = (label: string) => screen.getAllByRole('button', { name: label })[0];
const getStrategyInputsWorkspace = () => screen.getByLabelText('Strategy inputs workspace');
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
      matches: query.includes('max-width') ? width <= 1023 : false,
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
const DEFAULT_PROJECTION_STRATEGIES_STORAGE_KEY = 'dealcooker-default-projection-strategies:v1';

describe('dashboard integration', () => {
  beforeEach(() => {
    window.localStorage.clear();
    setViewport(1280);
    writeScenarios([
      createScenarioRecord({
        ...defaultDealInput,
        purchase: { ...defaultDealInput.purchase, dealName: 'Test Seed Deal' }
      })
    ]);
  });

  it('starts blank when no scenarios are saved', () => {
    window.localStorage.clear();
    render(<HomePage />);

    expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);
    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);
  });

  it('uses the compact shell on mobile and unlocks results after required inputs', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const resultsButton = screen.getByRole('button', { name: 'Results' });
    const projectionsButton = screen.getByRole('button', { name: 'Projections' });

    expect(screen.getByRole('button', { name: 'New deal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Deal Vault' })).toBeInTheDocument();
    expect(resultsButton).toBeDisabled();
    expect(projectionsButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit active deal details' })).toBeInTheDocument();

    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    expect(resultsButton).not.toBeDisabled();
    expect(projectionsButton).not.toBeDisabled();

    await user.click(resultsButton);
    expect(screen.getByRole('button', { name: 'More metrics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: 'Strategy Inputs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Expenses' })).not.toBeInTheDocument();

    await user.click(irrTab);

    expect(irrTab).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('heading', { name: 'IRR and timeline inputs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Strategy Inputs' })).not.toBeInTheDocument();
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

  it('opens the deal identity editor after creating a new deal from mobile header', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'New deal' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByDisplayValue('New Deal')).toBeInTheDocument();
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

    await user.type(search, 'Austin');

    expect(within(dialog).getByText('Austin BRRRR')).toBeInTheDocument();
    expect(within(dialog).queryByText('Miami Flip')).not.toBeInTheDocument();
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
    await user.click(screen.getByRole('button', { name: 'Open deal actions' }));

    const dialog = screen.getByRole('dialog', { name: 'Settings' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Send link' }).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole('button', { name: 'Print to PDF' }).length).toBeGreaterThan(0);
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
    expect(within(board).getAllByText('Airbnb / STR').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Cash to Close').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Modeled Exit').length).toBeGreaterThan(0);
    expect(within(board).queryByText('Modeled total return')).not.toBeInTheDocument();
    expect(within(board).queryByText('Payback')).not.toBeInTheDocument();
    expect(within(board).queryByText('Operating CF')).not.toBeInTheDocument();

    await user.click(within(selection).getByRole('button', { name: /Airbnb/i }));
    expect(within(board).queryByText('Airbnb / STR')).not.toBeInTheDocument();

    await user.click(within(selection).getByRole('button', { name: 'Commercial' }));
    await user.click(within(selection).getByRole('button', { name: 'PadSplit' }));
    await user.click(within(selection).getByRole('button', { name: 'BRRRR' }));
    await user.click(within(selection).getByRole('button', { name: 'Flip' }));

    expect(within(board).queryByText('Commercial')).not.toBeInTheDocument();
    expect(within(board).queryByText('PadSplit')).not.toBeInTheDocument();
    expect(within(board).queryByText('BRRRR')).not.toBeInTheDocument();
    expect(within(board).queryByText('Flip')).not.toBeInTheDocument();
    expect(within(board).getAllByText('Long-Term Rental').length).toBeGreaterThan(0);

    await user.click(within(selection).getByRole('button', { name: 'Long-Term' }));

    expect(within(board).getAllByText('Long-Term Rental').length).toBeGreaterThan(0);
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

    expect(within(dialog).getByText('Years 0 - 10')).toBeInTheDocument();
    expect(within(dialog).getByText('Internal Rate of Return Assumptions')).toBeInTheDocument();
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
    expect(screen.queryByRole('dialog', { name: 'Strategy inputs' })).not.toBeInTheDocument();
  });

  it('edits desktop IRR assumptions directly from the timeline card', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));
    expect(within(getStrategyInputsWorkspace()).getByLabelText('Flip hold months')).toBeInTheDocument();

    const holdYears = screen.getByLabelText('Hold years', { selector: 'input' });
    await user.clear(holdYears);
    await user.type(holdYears, '7');

    expect(holdYears).toHaveValue(7);
    expect(screen.getByText('Years 0 - 7')).toBeInTheDocument();
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
  });

  it('top KPI cards follow the active strategy tab', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(airbnbResult.monthlyCashFlow));
    expect(screen.getByTestId('kpi-cash-on-cash')).toHaveTextContent(
      percentFormatter.format(airbnbResult.cashOnCashReturn)
    );
    expect(screen.getByTestId('kpi-cap-rate')).toHaveTextContent(
      percentFormatter.format(airbnbResult.capRate)
    );

    expect(screen.getByTestId('kpi-total-cash-invested')).toHaveTextContent(currencyFormatter.format(airbnbResult.totalCashNeeded));
    expect(screen.getByLabelText('Cash to Close strategy context')).toHaveTextContent('Airbnb');
    expect(screen.getByRole('button', { name: 'Cash to Close definitions' })).toBeInTheDocument();
  });



  it('priority monthly cash flow toggle switches reserve mode for hold strategies', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Airbnb'));

    const airbnbResult = calculateDeal(defaultDealInput).airbnb;
    const includeValue = currencyFormatter.format(airbnbResult.monthlyCashFlow);
    const excludeValue = currencyFormatter.format(airbnbResult.monthlyCashFlowExcludingReserves ?? airbnbResult.monthlyCashFlow);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(includeValue);
    expect(screen.getByText('Monthly Cash Flow')).toBeInTheDocument();

    await user.click(screen.getAllByRole('button', { name: 'Exclude reserves' })[0]);

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(excludeValue);
  });

  it('flip priority metric switches to net profit', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Flip'));

    const flipResult = calculateDeal(defaultDealInput).flip;

    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(flipResult.saleProceeds ?? 0));
    expect(screen.queryByRole('button', { name: 'Include reserves' })).not.toBeInTheDocument();
  });


  it('desktop projections board keeps equity and cash flow modeling in one view', () => {
    render(<HomePage />);
    const board = screen.getByLabelText('Strategy comparison board');

    expect(screen.getByText('Projections board')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Equity modeling' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Cash flow modeling' })).not.toBeInTheDocument();
    expect(within(board).getAllByText('Total Invested').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Modeled Exit').length).toBeGreaterThan(0);
    expect(within(board).getAllByText('Cash flow trend').length).toBeGreaterThan(0);
  });

  it('filters the desktop projections board per deal from local board controls', async () => {
    render(<HomePage />);
    const user = userEvent.setup();
    const board = screen.getByLabelText('Strategy comparison board');

    expect(within(board).getByLabelText('Commercial projection card')).toBeInTheDocument();

    const selection = screen.getByLabelText('Projections board strategy selection');
    await user.click(within(selection).getByRole('button', { name: 'Commercial' }));

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
    await user.type(search, 'Austin');

    await waitFor(() => {
      expect(within(dialog).getByText('Austin BRRRR')).toBeInTheDocument();
      expect(within(dialog).queryByText('Miami Flip')).not.toBeInTheDocument();
    });
  });

  it('strategy work lightbox opens for active strategy and shows key rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('PadSplit'));
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    const dialog = screen.getByRole('dialog', { name: 'Strategy Work Lightbox' });
    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getByText('PadSplit calculations')).toBeInTheDocument();
    expect(within(dialog).getAllByText('Income').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Expenses').length).toBeGreaterThan(0);
    expect(within(dialog).getAllByText('Debt service').length).toBeGreaterThan(0);
    expect(within(dialog).getByText('Property tax')).toBeInTheDocument();
    expect(within(dialog).getByText('Insurance')).toBeInTheDocument();
  });

  it('BRRRR show work exposes capital-in and refi math sections', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('BRRRR'));
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    expect(screen.getByRole('dialog', { name: 'Strategy Work Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('BRRRR calculations')).toBeInTheDocument();
    expect(screen.getByText('Cash invested before refi')).toBeInTheDocument();
    expect(screen.getAllByText('Cash back at refi').length).toBeGreaterThan(0);
    expect(screen.getByText('Cash left in deal')).toBeInTheDocument();
    expect(screen.getByText('Refi math')).toBeInTheDocument();
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
    const strategyArv = within(getStrategyInputsWorkspace()).getByLabelText('Long-Term ARV');

    await user.clear(strategyArv);
    await user.type(strategyArv, '365000');

    expect(strategyArv).toHaveValue(365000);
  });

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
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/');

    expect(within(dialog).getByLabelText('Deal name')).toHaveValue('123 Main St, Tampa');

    expect(within(dialog).getByRole('link', { name: 'View listing link' })).toHaveAttribute(
      'href',
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    );
  });


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
  });

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
    const dialog = screen.getByRole('dialog', { name: 'Deal Vault' });
    await user.click(within(dialog).getByRole('button', { name: 'Create new deal' }));
    await user.click(within(dialog).getByRole('button', { name: 'Confirm' }));

    expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);

    await user.click(getStrategyButton('Airbnb'));
    let workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('ADR')).toHaveValue(0);

    await user.click(getStrategyButton('PadSplit'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Weekly rate / room')).toHaveValue(0);

    await user.click(getStrategyButton('Commercial'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Base rent ($/sq ft/year)', { selector: 'input' })).toHaveValue(0);

    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);
  });

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

    expect(screen.getByText('Share link copied to clipboard.')).toBeInTheDocument();

    await new Promise((resolve) => {
      window.setTimeout(resolve, 3400);
    });

    expect(screen.queryByText('Share link copied to clipboard.')).not.toBeInTheDocument();
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
    await user.clear(annualRevenueInput);
    await user.type(annualRevenueInput, '72000');
    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(expectedLongTerm));

    await user.click(getStrategyButton('Airbnb'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Annual revenue (optional)')).toBeInTheDocument();

    await user.click(getStrategyButton('PadSplit'));
    workspace = getStrategyInputsWorkspace();
    expect(within(workspace).getByLabelText('Annual revenue (optional)')).toBeInTheDocument();
  });

  it('allows renaming, filtering commercial expenses, and deleting variable expense rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('tab', { name: 'Expenses' }));

    const beforeCount = screen.getAllByLabelText(/Expense label/i).length;
    const firstLabel = screen.getByLabelText('Expense label 1');
    await user.clear(firstLabel);
    await user.type(firstLabel, 'Utilities Master');
    expect(screen.getByLabelText('Expense label 1')).toHaveValue('Utilities Master');

    const commercialToggle = screen.getByRole('button', { name: 'Utilities Master applies to Commercial' });
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'false');
    await user.click(commercialToggle);
    expect(commercialToggle).toHaveAttribute('aria-pressed', 'true');

    await user.click(screen.getByRole('button', { name: 'Add variable expense' }));

    const afterCount = screen.getAllByLabelText(/Expense label/i).length;
    expect(afterCount).toBe(beforeCount + 1);

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
});
