import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it } from 'vitest';

import HomePage from '../app/page';
import { calculateDeal } from '../lib/engine/deal-engine';
import { calculateCashToClose } from '../lib/engine/finance';
import { defaultDealInput } from '../lib/models/deal';
import { currencyFormatter, percentFormatter } from '../lib/formatters';
import { createScenarioRecord, writeScenarios } from '../lib/scenario-storage';


const getStrategyButton = (label: string) => screen.getAllByRole('button', { name: label })[0];
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
    expect(screen.getByLabelText('Gross rent / mo')).toHaveValue(0);
    expect(screen.getAllByText(/New Deal/i).length).toBeGreaterThan(0);
  });

  it('uses the compact shell on mobile and unlocks results after required inputs', async () => {
    window.localStorage.clear();
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    const resultsButton = screen.getByRole('button', { name: 'Results' });
    const compareButton = screen.getByRole('button', { name: 'Compare' });

    expect(screen.getByRole('button', { name: 'New deal' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Recent deals' })).toBeInTheDocument();
    expect(resultsButton).toBeDisabled();
    expect(compareButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Edit active deal details' })).toBeInTheDocument();

    const purchasePrice = screen.getAllByLabelText('Purchase price')[0];
    await user.clear(purchasePrice);
    await user.type(purchasePrice, '285000');

    const grossRent = screen.getAllByLabelText('Gross rent / mo')[0];
    await user.clear(grossRent);
    await user.type(grossRent, '2600');

    expect(resultsButton).not.toBeDisabled();
    expect(compareButton).not.toBeDisabled();

    await user.click(resultsButton);
    expect(screen.getByRole('button', { name: 'More metrics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
  });

  it('opens recent deals from the compact header', async () => {
    setViewport(390);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recent deals' }));

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

  it('caps compact recent deals to the six most recent entries by default', async () => {
    setViewport(390);
    writeScenarios([
      createSavedDeal('Recent Deal 1', '2026-01-08T12:00:00.000Z'),
      createSavedDeal('Recent Deal 2', '2026-01-07T12:00:00.000Z'),
      createSavedDeal('Recent Deal 3', '2026-01-06T12:00:00.000Z'),
      createSavedDeal('Recent Deal 4', '2026-01-05T12:00:00.000Z'),
      createSavedDeal('Recent Deal 5', '2026-01-04T12:00:00.000Z'),
      createSavedDeal('Recent Deal 6', '2026-01-03T12:00:00.000Z'),
      createSavedDeal('Recent Deal 7', '2026-01-02T12:00:00.000Z'),
      createSavedDeal('Recent Deal 8', '2026-01-01T12:00:00.000Z')
    ]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recent deals' }));

    const dialog = screen.getByRole('dialog', { name: 'Deals' });

    expect(within(dialog).getAllByRole('button', { name: /Duplicate Recent Deal / })).toHaveLength(6);
    expect(within(dialog).getByText('Recent Deal 1')).toBeInTheDocument();
    expect(within(dialog).getByText('Recent Deal 6')).toBeInTheDocument();
    expect(within(dialog).queryByText('Recent Deal 7')).not.toBeInTheDocument();
    expect(within(dialog).queryByText('Recent Deal 8')).not.toBeInTheDocument();
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
      createSavedDeal('Austin BRRRR', '2026-01-02T12:00:00.000Z'),
      createSavedDeal('Miami Flip', '2026-01-01T12:00:00.000Z')
    ]);

    render(<HomePage />);
    window.dispatchEvent(new Event('resize'));

    const user = userEvent.setup();
    await user.click(screen.getByRole('button', { name: 'Recent deals' }));

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
    await user.click(screen.getByRole('button', { name: 'Recent deals' }));

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

    const dialog = screen.getByRole('dialog', { name: 'Deal actions' });

    expect(dialog).toBeInTheDocument();
    expect(within(dialog).getAllByRole('button', { name: 'Send link' }).length).toBeGreaterThan(0);
    expect(within(dialog).getAllByRole('button', { name: 'Print to PDF' }).length).toBeGreaterThan(0);
    expect(within(dialog).queryByText('Deals Vault')).not.toBeInTheDocument();
  });

  it('filters the mobile compare board with multi-select strategies', async () => {
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

    await user.click(screen.getByRole('button', { name: 'Compare' }));

    const selection = screen.getByLabelText('Compare strategy selection');
    const board = screen.getByLabelText('Strategy comparison board');

    expect(within(board).getByText('Compare all exits at a glance')).toBeInTheDocument();
    expect(within(board).getByText('Airbnb / STR')).toBeInTheDocument();

    await user.click(within(selection).getByRole('button', { name: /Airbnb/i }));

    expect(within(board).queryByText('Airbnb / STR')).not.toBeInTheDocument();
    expect(within(board).getByRole('button', { name: 'Equity modeling' })).toBeInTheDocument();
    expect(within(board).getByRole('button', { name: 'Cash flow modeling' })).toBeInTheDocument();
  });

  it('shows a Commercial strategy tab and exposes strip-plaza underwriting inputs', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Commercial'));

    const rentInput = screen.getAllByLabelText('Base rent ($/sq ft/year)', { selector: 'input' })[0];
    await user.clear(rentInput);
    await user.type(rentInput, '30');

    expect(rentInput).toHaveValue(30);
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


  it('equity modeling lightbox opens from strategy board', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getAllByRole('button', { name: 'Equity modeling' })[0]);

    expect(screen.getByRole('dialog', { name: 'Equity Modeling Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('Equity modeling by strategy')).toBeInTheDocument();
  });

  it('strategy work lightbox opens for active strategy and shows key rows', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('PadSplit'));
    await user.click(screen.getAllByRole('button', { name: 'Show work' })[0]);

    expect(screen.getByRole('dialog', { name: 'Strategy Work Lightbox' })).toBeInTheDocument();
    expect(screen.getByText('PadSplit calculations')).toBeInTheDocument();
    expect(screen.getByText('Line item')).toBeInTheDocument();
    expect(screen.getByText('Turnover / cleaning')).toBeInTheDocument();
    expect(screen.getByText('Tenant placement fees')).toBeInTheDocument();
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

    await user.click(screen.getAllByRole('button', { name: 'Duplicate' })[0]);
    const dialogInput = screen.getByPlaceholderText('Deal name');
    await user.clear(dialogInput);
    await user.type(dialogInput, 'Austin BRRRR');
    await user.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);

    expect(screen.getAllByRole('button', { name: /Austin BRRRR/i }).length).toBeGreaterThan(0);
  });


  it('strategy-specific ARV input is available in the strategy workbench', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(getStrategyButton('Long-Term'));
    const strategyArv = screen.getByLabelText('Long-Term ARV');

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

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/');

    expect(screen.getByLabelText('Deal name')).toHaveValue('123 Main St, Tampa');
    await user.click(screen.getByRole('button', { name: 'Edit active deal details' }));

    const dialog = screen.getByRole('dialog', { name: 'Deal identity' });

    expect(within(dialog).getByRole('link', { name: 'View listing link' })).toHaveAttribute(
      'href',
      'https://www.zillow.com/homedetails/123-Main-St-Tampa-FL-33602/12345_zpid/'
    );
  });


  it('does not auto-rename for onehome links', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://portal.onehome.com/en-US/share/2478045G14539');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(screen.getByLabelText('Deal name')).toHaveValue(originalName);
  });

  it('does not auto-rename when listing url lacks an address slug', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    const nameInput = screen.getByLabelText('Deal name');
    const originalName = (nameInput as HTMLInputElement).value;

    const listingInput = screen.getByLabelText('Listing URL (Zillow, Redfin, etc.)');
    await user.clear(listingInput);
    await user.type(listingInput, 'https://www.redfin.com/FL/Tampa/overview');

    await new Promise((resolve) => {
      window.setTimeout(resolve, 700);
    });

    expect(screen.getByLabelText('Deal name')).toHaveValue(originalName);
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

    await user.click(screen.getAllByRole('button', { name: 'Create' })[0]);
    await user.click(screen.getAllByRole('button', { name: 'Confirm' })[0]);

    expect(screen.getByLabelText('Purchase price')).toHaveValue(0);
    expect(screen.getByLabelText('Rehab budget')).toHaveValue(0);
    expect(screen.getByLabelText('Gross rent / mo')).toHaveValue(0);

    await user.click(getStrategyButton('Airbnb'));
    expect(screen.getByLabelText('ADR')).toHaveValue(0);

    await user.click(getStrategyButton('PadSplit'));
    expect(screen.getByLabelText('Weekly rate / room')).toHaveValue(0);

    await user.click(getStrategyButton('Commercial'));
    expect(screen.getAllByLabelText('Base rent ($/sq ft/year)', { selector: 'input' })[0]).toHaveValue(0);

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

    const annualRevenueInput = screen.getByLabelText('Annual revenue (optional)');
    await user.clear(annualRevenueInput);
    await user.type(annualRevenueInput, '72000');
    expect(screen.getByTestId('kpi-priority-metric')).toHaveTextContent(currencyFormatter.format(expectedLongTerm));

    await user.click(getStrategyButton('Airbnb'));
    expect(screen.getByLabelText('Annual revenue (optional)')).toBeInTheDocument();

    await user.click(getStrategyButton('PadSplit'));
    expect(screen.getByLabelText('Annual revenue (optional)')).toBeInTheDocument();
  });

  it('allows renaming and adding variable expenses', async () => {
    render(<HomePage />);
    const user = userEvent.setup();

    await user.click(screen.getByRole('button', { name: 'Expenses' }));

    const beforeCount = screen.getAllByLabelText(/Expense label/i).length;
    const firstLabel = screen.getByLabelText('Expense label 1');
    await user.clear(firstLabel);
    await user.type(firstLabel, 'Utilities Master');
    expect(screen.getByLabelText('Expense label 1')).toHaveValue('Utilities Master');

    await user.click(screen.getByRole('button', { name: 'Add variable expense' }));

    const afterCount = screen.getAllByLabelText(/Expense label/i).length;
    expect(afterCount).toBe(beforeCount + 1);
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
