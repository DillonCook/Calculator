'use client';

import { useEffect, useMemo, useState } from 'react';
import { Input, PercentInput, Select } from '@/components/dashboard/form-fields';
import type { AmortizationType, DealInputModel, ExpenseStrategyKey, FinancingType } from '@/lib/models/deal';
import { currencyFormatter } from '@/lib/formatters';

interface DealInputPanelProps {
  value: DealInputModel;
  onChange: (next: DealInputModel) => void;
  onKnownOverlayModelChange?: (next: DealInputModel | null) => void;
  onKnownOverlayEntriesChange?: (next: KnownOverlayAppliedEntry[]) => void;
  knownOverlayScopeKey?: string;
  resolveListingDealName?: (url: string) => Promise<string | null>;
  defaultAdvancedOptionsOpen?: boolean;
  collapsible?: boolean;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
  forcedCoreSection?: Exclude<CoreInputSection, 'known'>;
  preferredCoreSection?: Exclude<CoreInputSection, 'known'>;
}

type CoreInputSection = 'purchaseFinancing' | 'expenses' | 'known';
type VariableExpenseInputMode = 'monthly' | 'annual';
type KnownDisplayClassification = 'income' | 'expense';

interface ParsedKnownNumberLine {
  id: string;
  label: string;
  normalizedLabel: string;
  value: number;
  isPercent: boolean;
  sourceRow: number;
  rawLine: string;
}

type KnownClassification = 'income' | 'expense' | 'unmapped';

type KnownTarget =
  | { kind: 'purchaseAnnual'; field: 'propertyTaxAnnualOverride' | 'insuranceAnnualOverride'; targetLabel: string }
  | { kind: 'purchaseMonthly'; field: 'hoaMonthly' | 'pmiMonthly' | 'existingTaxMonthly' | 'existingInsuranceMonthly'; targetLabel: string }
  | { kind: 'longTermMonthly'; field: 'grossRentMonthly' | 'otherIncomeMonthly' | 'ownerExpensesMonthly'; targetLabel: string }
  | { kind: 'variableExpense'; key: string; targetLabel: string };

interface KnownPreviewRow {
  line: ParsedKnownNumberLine;
  classification: KnownClassification;
  mappedTarget: KnownTarget | null;
}

export interface KnownOverlayAppliedEntry {
  label: string;
  targetLabel: string;
  classification: 'income' | 'expense';
  monthlyValue: number;
  annualValue: number;
}

interface KnownAppliedEntry extends KnownOverlayAppliedEntry {
  target: KnownTarget;
}

const strategyLabels: Record<ExpenseStrategyKey, string> = {
  longTerm: 'LT',
  airbnb: 'STR',
  padSplit: 'PS',
  flip: 'Flip'
};

const coreSectionMeta: Record<CoreInputSection, { title: string; summary: string }> = {
  purchaseFinancing: {
    title: 'Purchase & Financing',
    summary: 'Acquisition details, debt structure, and capital terms.'
  },
  expenses: {
    title: 'Expenses',
    summary: 'Taxes, insurance, HOA/PMI, and variable expense matrix.'
  },
  known: {
    title: 'Import T12/P&L',
    summary: 'Paste T12/P&L rows, preview auto-mapping, then apply imported values in analysis.'
  }
};

const variableExpenseAliasByKey: Record<string, string[]> = {
  power: ['power', 'electric', 'electricity', 'utilitieselectric', 'electricbill', 'utilityelectric'],
  water: ['water', 'sewer', 'watersewer', 'stormwater', 'utilitywater'],
  trash: ['trash', 'garbage', 'waste', 'refuse'],
  gas: ['gas', 'naturalgas', 'propane'],
  internet: ['internet', 'wifi', 'broadband', 'cable', 'telecom'],
  pool: ['pool', 'poolservice', 'spa', 'poolmaintenance'],
  lawn: ['lawn', 'landscaping', 'yard', 'grounds', 'groundskeeping'],
  licensing: ['pest', 'pestcontrol', 'licensing', 'license', 'permits', 'taxeslicenses'],
  'padsplit-cleaning': ['padsplitcleaning', 'housecleaning', 'cleaning', 'janitorial', 'turnovercleaning', 'housekeeping'],
  other: ['other', 'misc', 'miscellaneous', 'admin', 'office', 'supplies'],
  'other-2': ['other2', 'misc2', 'otherii', 'contractservices', 'professionalfees']
};

const knownNumberTokenPattern = /\(?-?\$?\d[\d,]*(?:\.\d+)?%?\)?/g;
const numericCellOnlyPattern = /^\(?-?\$?\d[\d,]*(?:\.\d+)?%?\)?$/;

const normalizeKnownLabel = (value: string) => value.toLowerCase().replace(/[^a-z0-9]+/g, '');
const tokenizeLabel = (value: string) =>
  value
    .toLowerCase()
    .split(/[^a-z0-9]+/g)
    .map((token) => token.trim())
    .filter((token) => token.length > 1);

const knownAliases = {
  propertyTaxAnnual: [
    'propertytax',
    'propertytaxannual',
    'realestatetax',
    'realestatetaxes',
    'taxrealestate',
    'annualpropertytax',
    'proptax'
  ],
  insuranceAnnual: [
    'insurance',
    'insuranceannual',
    'hazardinsurance',
    'propertyinsurance',
    'annualinsurance',
    'liabilityinsurance',
    'insurancepremium'
  ],
  hoaMonthly: ['hoa', 'homeownersassociation', 'associationdues', 'hoamonthly', 'condodues', 'associationfees'],
  pmiMonthly: ['pmi', 'mortgageinsurance', 'pmimonthly', 'mortgageins'],
  existingTaxMonthly: ['existingtax', 'existingtaxmonthly'],
  existingInsuranceMonthly: ['existinginsurance', 'existinginsurancemonthly'],
  grossRentMonthly: [
    'grossrent',
    'scheduledrent',
    'rentincome',
    'rentalincome',
    'baserent',
    'marketrent',
    'effectiverentalincome',
    'effectivegrossincome',
    'grosspotentialrent',
    'gpr'
  ],
  otherIncomeMonthly: [
    'otherincome',
    'miscincome',
    'ancillaryincome',
    'laundryincome',
    'parkingincome',
    'applicationfees',
    'latefees',
    'petfees',
    'storageincome',
    'vendingincome',
    'feesincome',
    'applicationfeeincome',
    'utilityreimbursement',
    'rubs',
    'camrecovery',
    'interestincome'
  ],
  ownerExpensesMonthly: [
    'ownerexpenses',
    'ownerpaidexpenses',
    'operatingexpenses',
    'opex',
    'managementfee',
    'repairs',
    'maintenance',
    'supplies',
    'adminexpense',
    'legalexpense',
    'accountingexpense',
    'miscexpense',
    'payroll',
    'advertising',
    'janitorial',
    'security',
    'bankcharges',
    'professionalfees',
    'contractservices',
    'turnoverexpense',
    'managementfees'
  ]
} as const;

const genericIncomeHints = [
  'income',
  'revenue',
  'rent',
  'fees',
  'collections',
  'gross',
  'credit',
  'recovery',
  'reimbursement'
];
const genericExpenseHints = [
  'expense',
  'cost',
  'tax',
  'insurance',
  'utility',
  'repair',
  'maintenance',
  'fee',
  'clean',
  'lawn',
  'hoa',
  'pmi',
  'payroll',
  'advertising',
  'janitorial',
  'security',
  'turnover'
];

const parseNumericToken = (rawToken: string) => {
  const token = rawToken.trim();
  if (!token) return null;
  const isPercent = token.includes('%');
  const wrappedNegative = token.startsWith('(') && token.endsWith(')');
  const numericText = token.replace(/[$,%()]/g, '').replace(/,/g, '').trim();
  const parsedValue = Number(numericText);
  if (!Number.isFinite(parsedValue)) return null;
  return {
    value: wrappedNegative ? -Math.abs(parsedValue) : parsedValue,
    isPercent,
    token
  };
};

const extractNumericTokens = (text: string) => {
  const matches = Array.from(text.matchAll(knownNumberTokenPattern));
  return matches
    .map((match) => {
      const parsed = parseNumericToken(match[0]);
      if (!parsed) return null;
      return {
        ...parsed,
        index: match.index ?? -1
      };
    })
    .filter((entry): entry is NonNullable<typeof entry> => Boolean(entry));
};

const parseKnownNumberLines = (raw: string): ParsedKnownNumberLine[] => {
  const parsed: ParsedKnownNumberLine[] = [];
  const lines = raw.split(/\r?\n/);
  let pendingLabel = '';

  for (let rowIndex = 0; rowIndex < lines.length; rowIndex += 1) {
    const rawLine = lines[rowIndex] ?? '';
    const line = rawLine.trim();
    if (!line) continue;

    const cells = rawLine.split('\t');
    const textCells: Array<{ index: number; value: string }> = [];
    const numericCells: Array<{ index: number; value: number; isPercent: boolean; token: string }> = [];

    cells.forEach((cellRaw, index) => {
      const cell = cellRaw.trim();
      if (!cell) return;
      if (/[a-zA-Z]/.test(cell)) textCells.push({ index, value: cell });
      if (!numericCellOnlyPattern.test(cell)) return;
      const parsedCell = parseNumericToken(cell);
      if (!parsedCell) return;
      numericCells.push({ index, value: parsedCell.value, isPercent: parsedCell.isPercent, token: parsedCell.token });
    });

    const inlineTokens = extractNumericTokens(rawLine);
    const chosenNumericFromCell = numericCells[numericCells.length - 1];
    const chosenInlineNumeric = inlineTokens[inlineTokens.length - 1];
    const chosenNumeric =
      chosenNumericFromCell
        ? { value: chosenNumericFromCell.value, isPercent: chosenNumericFromCell.isPercent, token: chosenNumericFromCell.token, inlineIndex: -1, cellIndex: chosenNumericFromCell.index }
        : chosenInlineNumeric
          ? { value: chosenInlineNumeric.value, isPercent: chosenInlineNumeric.isPercent, token: chosenInlineNumeric.token, inlineIndex: chosenInlineNumeric.index, cellIndex: -1 }
          : null;

    if (!chosenNumeric) {
      if (textCells.length) {
        pendingLabel = textCells[textCells.length - 1].value;
      }
      continue;
    }

    let label = '';
    if (chosenNumeric.cellIndex >= 0) {
      const nearestLeftText = [...textCells].reverse().find((cell) => cell.index < chosenNumeric.cellIndex);
      label = (nearestLeftText?.value ?? textCells[textCells.length - 1]?.value ?? '').trim();
    } else if (textCells.length) {
      label = textCells[textCells.length - 1].value.trim();
    }

    if (!label && chosenNumeric.inlineIndex >= 0) {
      label = rawLine
        .slice(0, chosenNumeric.inlineIndex)
        .replace(/[:=\-|]+$/g, '')
        .trim();
    }

    if (!label && pendingLabel) {
      label = pendingLabel;
    }

    if (!label) continue;
    pendingLabel = '';

    parsed.push({
      id: `known-${rowIndex}-${parsed.length}`,
      label,
      normalizedLabel: normalizeKnownLabel(label),
      value: chosenNumeric.value,
      isPercent: chosenNumeric.isPercent,
      sourceRow: rowIndex + 1,
      rawLine
    });
  }

  return parsed;
};

function matchesKnownLabel(label: string, aliases: readonly string[]) {
  return aliases.some((alias) => label === alias || label.startsWith(alias) || label.endsWith(alias));
}

const toMonthlyFromAnnual = (line: ParsedKnownNumberLine) => line.value / 12;
const toAnnualFromAnnual = (line: ParsedKnownNumberLine) => line.value;

const applyImportedValue = (currentValue: number, nextValue: number) => currentValue + nextValue;
const applyImportedIncomeToOwnerExpenses = (currentValue: number, incomeValue: number) => currentValue - incomeValue;

const formatVariableExpenseInput = (monthlyAmount: number, inputMode: VariableExpenseInputMode) => {
  const displayValue = inputMode === 'annual' ? monthlyAmount * 12 : monthlyAmount;
  return Number(displayValue.toFixed(2));
};

const buildKnownOverlayModel = (baseModel: DealInputModel, entries: KnownAppliedEntry[]): DealInputModel => {
  const nextPurchase = { ...baseModel.purchase };
  const nextLongTerm = { ...baseModel.longTerm };
  const nextPadSplit = { ...baseModel.padSplit };
  const nextAirbnb = { ...baseModel.airbnb };
  const nextVariableExpenses = baseModel.variableExpenses.map((expense) => ({ ...expense, appliesTo: { ...expense.appliesTo } }));

  let purchaseTouched = false;
  let longTermTouched = false;
  let padSplitTouched = false;
  let airbnbTouched = false;
  let variableTouched = false;

  for (const entry of entries) {
    const mapping = entry.target;

    if (mapping.kind === 'purchaseAnnual') {
      const autoTaxAnnual = nextPurchase.purchasePrice * 0.017;
      const autoInsuranceAnnual = nextPurchase.purchasePrice * 0.01;
      if (mapping.field === 'propertyTaxAnnualOverride') {
        const baselineAnnual = nextPurchase.propertyTaxAnnualOverride ?? autoTaxAnnual;
        nextPurchase.propertyTaxAnnualOverride = applyImportedValue(baselineAnnual, entry.annualValue);
      } else {
        const baselineAnnual = nextPurchase.insuranceAnnualOverride ?? autoInsuranceAnnual;
        nextPurchase.insuranceAnnualOverride = applyImportedValue(baselineAnnual, entry.annualValue);
      }
      purchaseTouched = true;
      continue;
    }

    if (mapping.kind === 'purchaseMonthly') {
      nextPurchase[mapping.field] = applyImportedValue(nextPurchase[mapping.field], entry.monthlyValue);
      purchaseTouched = true;
      continue;
    }

    if (mapping.kind === 'longTermMonthly') {
      if (mapping.field === 'grossRentMonthly') {
        nextLongTerm.grossRentMonthly = applyImportedValue(nextLongTerm.grossRentMonthly, entry.monthlyValue);
        nextPadSplit.otherIncomeMonthly = applyImportedValue(nextPadSplit.otherIncomeMonthly, entry.monthlyValue);
        nextAirbnb.ownerExpensesMonthly = applyImportedIncomeToOwnerExpenses(nextAirbnb.ownerExpensesMonthly, entry.monthlyValue);
        longTermTouched = true;
        padSplitTouched = true;
        airbnbTouched = true;
        continue;
      }

      if (mapping.field === 'otherIncomeMonthly') {
        nextLongTerm.otherIncomeMonthly = applyImportedValue(nextLongTerm.otherIncomeMonthly, entry.monthlyValue);
        nextPadSplit.otherIncomeMonthly = applyImportedValue(nextPadSplit.otherIncomeMonthly, entry.monthlyValue);
        nextAirbnb.ownerExpensesMonthly = applyImportedIncomeToOwnerExpenses(nextAirbnb.ownerExpensesMonthly, entry.monthlyValue);
        longTermTouched = true;
        padSplitTouched = true;
        airbnbTouched = true;
        continue;
      }

      nextLongTerm.ownerExpensesMonthly = applyImportedValue(nextLongTerm.ownerExpensesMonthly, entry.monthlyValue);
      nextPadSplit.ownerExpensesMonthly = applyImportedValue(nextPadSplit.ownerExpensesMonthly, entry.monthlyValue);
      nextAirbnb.ownerExpensesMonthly = applyImportedValue(nextAirbnb.ownerExpensesMonthly, entry.monthlyValue);
      longTermTouched = true;
      padSplitTouched = true;
      airbnbTouched = true;
      continue;
    }

    const expenseIndex = nextVariableExpenses.findIndex((expense) => expense.key === mapping.key);
    if (expenseIndex < 0) continue;
    nextVariableExpenses[expenseIndex] = {
      ...nextVariableExpenses[expenseIndex],
      monthlyAmount: applyImportedValue(nextVariableExpenses[expenseIndex].monthlyAmount, entry.monthlyValue)
    };
    variableTouched = true;
  }

  return {
    ...baseModel,
    purchase: purchaseTouched ? nextPurchase : baseModel.purchase,
    longTerm: longTermTouched ? nextLongTerm : baseModel.longTerm,
    padSplit: padSplitTouched ? nextPadSplit : baseModel.padSplit,
    airbnb: airbnbTouched ? nextAirbnb : baseModel.airbnb,
    variableExpenses: variableTouched ? nextVariableExpenses : baseModel.variableExpenses
  };
};

const getVariableExpenseKeyFromLabel = (label: string, expenses: DealInputModel['variableExpenses']) => {
  const direct = expenses.find((expense) =>
    matchesKnownLabel(label, [normalizeKnownLabel(expense.label), normalizeKnownLabel(expense.key)])
  );
  if (direct) return direct.key;

  for (const [key, aliases] of Object.entries(variableExpenseAliasByKey)) {
    if (matchesKnownLabel(label, aliases)) return key;
  }

  const labelTokens = tokenizeLabel(label);
  if (!labelTokens.length) return null;

  let bestMatch: { key: string; score: number } | null = null;

  for (const expense of expenses) {
    const candidateTokens = new Set([...tokenizeLabel(expense.label), ...tokenizeLabel(expense.key)]);
    const score = labelTokens.reduce((count, token) => (candidateTokens.has(token) ? count + 1 : count), 0);
    if (score <= 0) continue;
    if (!bestMatch || score > bestMatch.score) {
      bestMatch = { key: expense.key, score };
    }
  }

  if (bestMatch && (bestMatch.score >= 2 || labelTokens.length <= 2)) {
    return bestMatch.key;
  }

  return null;
};

const inferUnmappedClassification = (normalizedLabel: string): KnownClassification => {
  if (genericIncomeHints.some((hint) => normalizedLabel.includes(hint))) return 'income';
  if (genericExpenseHints.some((hint) => normalizedLabel.includes(hint))) return 'expense';
  return 'unmapped';
};

const mapKnownLine = (line: ParsedKnownNumberLine, expenses: DealInputModel['variableExpenses']): KnownPreviewRow => {
  const label = line.normalizedLabel;

  if (matchesKnownLabel(label, knownAliases.propertyTaxAnnual)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseAnnual', field: 'propertyTaxAnnualOverride', targetLabel: 'Property Tax (Annual)' } };
  }

  if (matchesKnownLabel(label, knownAliases.insuranceAnnual)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseAnnual', field: 'insuranceAnnualOverride', targetLabel: 'Insurance (Annual)' } };
  }

  if (matchesKnownLabel(label, knownAliases.hoaMonthly)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseMonthly', field: 'hoaMonthly', targetLabel: 'HOA (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.pmiMonthly)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseMonthly', field: 'pmiMonthly', targetLabel: 'PMI (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.existingTaxMonthly)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseMonthly', field: 'existingTaxMonthly', targetLabel: 'Existing Tax (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.existingInsuranceMonthly)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'purchaseMonthly', field: 'existingInsuranceMonthly', targetLabel: 'Existing Insurance (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.grossRentMonthly)) {
    return { line, classification: 'income', mappedTarget: { kind: 'longTermMonthly', field: 'grossRentMonthly', targetLabel: 'Long-Term Gross Rent (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.otherIncomeMonthly)) {
    return { line, classification: 'income', mappedTarget: { kind: 'longTermMonthly', field: 'otherIncomeMonthly', targetLabel: 'Long-Term Other Income (Monthly)' } };
  }

  if (matchesKnownLabel(label, knownAliases.ownerExpensesMonthly)) {
    return { line, classification: 'expense', mappedTarget: { kind: 'longTermMonthly', field: 'ownerExpensesMonthly', targetLabel: 'Long-Term Owner Expenses (Monthly)' } };
  }

  const variableKey = getVariableExpenseKeyFromLabel(label, expenses);
  if (variableKey) {
    const variableLabel = expenses.find((expense) => expense.key === variableKey)?.label ?? variableKey;
    return {
      line,
      classification: 'expense',
      mappedTarget: { kind: 'variableExpense', key: variableKey, targetLabel: `${variableLabel} (Variable Expense)` }
    };
  }

  return {
    line,
    classification: inferUnmappedClassification(label),
    mappedTarget: null
  };
};

export function DealInputPanel({
  value,
  onChange,
  onKnownOverlayModelChange,
  onKnownOverlayEntriesChange,
  knownOverlayScopeKey,
  defaultAdvancedOptionsOpen = true,
  collapsible = false,
  collapsed = false,
  onToggleCollapsed,
  forcedCoreSection,
  preferredCoreSection
}: DealInputPanelProps) {
  const [activeCoreSection, setActiveCoreSection] = useState<CoreInputSection>('purchaseFinancing');
  const [expenseCadenceByKey, setExpenseCadenceByKey] = useState<Record<string, VariableExpenseInputMode>>({});
  const [knownDraft, setKnownDraft] = useState('');
  const [knownFeedback, setKnownFeedback] = useState<string | null>(null);
  const [knownClassificationOverrides, setKnownClassificationOverrides] = useState<Record<string, KnownDisplayClassification>>({});
  const [knownAppliedEntries, setKnownAppliedEntries] = useState<KnownAppliedEntry[]>([]);

  const update = <T extends keyof DealInputModel, K extends keyof DealInputModel[T]>(section: T, field: K, nextValue: DealInputModel[T][K]) => {
    if (section === 'purchase' && field === 'purchasePrice') {
      const nextPurchasePrice = Number(nextValue) || 0;
      const shouldSyncArv = value.purchase.arv === value.purchase.purchasePrice;
      onChange({
        ...value,
        purchase: {
          ...value.purchase,
          purchasePrice: nextPurchasePrice,
          arv: shouldSyncArv ? nextPurchasePrice : value.purchase.arv
        }
      });
      return;
    }

    onChange({ ...value, [section]: { ...value[section], [field]: nextValue } });
  };

  const updateVariableExpense = (index: number, updates: Partial<DealInputModel['variableExpenses'][number]>) => {
    const nextExpenses = value.variableExpenses.map((entry, currentIndex) =>
      currentIndex === index ? { ...entry, ...updates } : entry
    );

    onChange({ ...value, variableExpenses: nextExpenses });
  };

  const addVariableExpense = () => {
    const existingKeys = new Set(value.variableExpenses.map((expense) => expense.key));
    let counter = value.variableExpenses.length + 1;
    let nextKey = `custom-${counter}`;
    while (existingKeys.has(nextKey)) {
      counter += 1;
      nextKey = `custom-${counter}`;
    }

    const nextExpense: DealInputModel['variableExpenses'][number] = {
      key: nextKey,
      label: `Custom Expense ${counter}`,
      monthlyAmount: 0,
      appliesTo: { longTerm: false, airbnb: false, padSplit: false, flip: false }
    };

    onChange({ ...value, variableExpenses: [...value.variableExpenses, nextExpense] });
  };

  const getExpenseCadence = (expenseKey: string): VariableExpenseInputMode => expenseCadenceByKey[expenseKey] ?? 'monthly';

  const setExpenseCadence = (expenseKey: string, cadence: VariableExpenseInputMode) => {
    setExpenseCadenceByKey((prev) => ({ ...prev, [expenseKey]: cadence }));
  };

  const knownParsedLines = useMemo(() => parseKnownNumberLines(knownDraft), [knownDraft]);
  const knownPreviewRows = useMemo(() => knownParsedLines.map((line) => mapKnownLine(line, value.variableExpenses)), [knownParsedLines, value.variableExpenses]);
  const mappedKnownRows = knownPreviewRows.filter((row) => Boolean(row.mappedTarget));
  const unmappedKnownRows = knownPreviewRows.filter((row) => !row.mappedTarget);
  const getKnownRowClassification = (row: KnownPreviewRow): KnownDisplayClassification => {
    const override = knownClassificationOverrides[row.line.id];
    if (override) return override;
    return row.classification === 'income' ? 'income' : 'expense';
  };

  const knownOverlayModel = useMemo(() => {
    if (!knownAppliedEntries.length) return null;
    return buildKnownOverlayModel(value, knownAppliedEntries);
  }, [knownAppliedEntries, value]);

  useEffect(() => {
    if (!onKnownOverlayModelChange) return;
    onKnownOverlayModelChange(knownOverlayModel);
  }, [knownOverlayModel, onKnownOverlayModelChange]);

  useEffect(() => {
    if (!onKnownOverlayEntriesChange) return;
    const mappedEntries: KnownOverlayAppliedEntry[] = knownAppliedEntries.map((entry) => ({
      label: entry.label,
      targetLabel: entry.targetLabel,
      classification: entry.classification,
      monthlyValue: entry.monthlyValue,
      annualValue: entry.annualValue
    }));
    onKnownOverlayEntriesChange(mappedEntries);
  }, [knownAppliedEntries, onKnownOverlayEntriesChange]);

  useEffect(() => {
    setKnownAppliedEntries([]);
    setKnownFeedback(null);
  }, [knownOverlayScopeKey]);

  const applyKnownExpensesAndIncome = () => {
    if (!knownPreviewRows.length) {
      setKnownFeedback('No parseable rows found. Use one line per metric in "Label: value" format.');
      return;
    }

    if (!mappedKnownRows.length) {
      setKnownFeedback('No mapped categories found. Review unmapped rows and adjust labels before applying.');
      return;
    }

    let appliedCount = 0;
    const nextAppliedEntries: KnownAppliedEntry[] = [];

    for (const row of mappedKnownRows) {
      const mapping = row.mappedTarget;
      if (!mapping) continue;
      const line = row.line;
      const classification = getKnownRowClassification(row);

      nextAppliedEntries.push({
        target: mapping,
        label: line.label,
        targetLabel: mapping.targetLabel,
        classification,
        monthlyValue: toMonthlyFromAnnual(line),
        annualValue: toAnnualFromAnnual(line)
      });
      appliedCount += 1;
    }

    if (!nextAppliedEntries.length) {
      setKnownAppliedEntries([]);
      setKnownFeedback('No mapped rows selected for import.');
      return;
    }

    setKnownAppliedEntries(nextAppliedEntries);

    setKnownFeedback(
      `Applied ${appliedCount} mapped value${appliedCount === 1 ? '' : 's'} to analysis. Input fields were not changed.` +
        (unmappedKnownRows.length ? ` ${unmappedKnownRows.length} row${unmappedKnownRows.length === 1 ? '' : 's'} remain unmapped.` : '')
    );
  };

  const autoTaxAnnual = value.purchase.purchasePrice * 0.017;
  const autoInsuranceAnnual = value.purchase.purchasePrice * 0.01;
  const isOwnedMode = value.purchase.ownershipMode === 'owned';
  const isPanelCollapsed = collapsible && collapsed;
  const resolvedCoreSection = forcedCoreSection ?? preferredCoreSection ?? activeCoreSection;
  const panelTitle = forcedCoreSection ? coreSectionMeta[forcedCoreSection].title : 'Core Purchase, Financing, & Expenses';
  const showOwnershipModeToggle = forcedCoreSection !== 'expenses';
  const showCoreSectionTabs = !forcedCoreSection;

  return (
    <section className="rounded-2xl panel-surface p-3.5 shadow-soft sm:p-5">
      {collapsible ? (
        <button
          type="button"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          className="tap-feedback mb-2.5 flex w-full items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-3 py-2 text-left"
        >
          <h2 className="text-base font-semibold sm:text-lg">{panelTitle}</h2>
          <span className="inline-flex h-7 min-w-7 items-center justify-center rounded-full border border-white/15 bg-black/20 px-2 text-sm font-semibold text-slate-200 transition-transform duration-200">
            {collapsed ? '+' : '-'}
          </span>
        </button>
      ) : (
        <div className="mb-3 sm:mb-4">
          <h2 className="text-base font-semibold sm:text-lg">{panelTitle}</h2>
        </div>
      )}

      <div className="panel-collapse" data-open={!isPanelCollapsed}>
        <div className="panel-collapse-inner">
          {showOwnershipModeToggle ? (
            <button
              type="button"
              aria-pressed={isOwnedMode}
              onClick={() => update('purchase', 'ownershipMode', isOwnedMode ? 'purchase' : 'owned')}
              className={`tap-feedback mb-2.5 w-full rounded-lg border px-3 py-2 text-sm font-medium transition sm:mb-3 ${
                isOwnedMode ? 'border-accent/70 bg-accent/20 text-accent' : 'border-white/15 bg-white/[0.03] text-white hover:bg-white/[0.06]'
              }`}
            >
              {isOwnedMode ? 'Switch to Purchase Mode' : 'I Already Own This Property'}
            </button>
          ) : null}

          {showCoreSectionTabs ? (
            <div className="mb-2.5 sm:mb-3">
              <div className="grid grid-cols-2 gap-1.5">
                {(['purchaseFinancing', 'expenses'] as CoreInputSection[]).map((section) => {
                  const active = resolvedCoreSection === section;
                  return (
                    <button
                      key={section}
                      type="button"
                      onClick={() => setActiveCoreSection(section)}
                      aria-pressed={active}
                      className={`tap-feedback min-h-9 rounded-lg px-2 py-1.5 text-[11px] font-semibold transition sm:text-xs ${
                        active ? 'btn-primary' : 'border border-white/15 bg-white/[0.02] text-slate-200 hover:bg-white/[0.05]'
                      }`}
                    >
                      {coreSectionMeta[section].title}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : null}

          <div className="space-y-2.5 sm:space-y-3">
            {resolvedCoreSection === 'purchaseFinancing' ? (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                  {!isOwnedMode ? (
                    <>
                      <Select
                        label="Financing"
                        value={value.purchase.financingType}
                        onChange={(v) => update('purchase', 'financingType', v as FinancingType)}
                        options={[
                          { label: 'Loan', value: 'loan' },
                          { label: 'Cash', value: 'cash' }
                        ]}
                      />
                      {value.purchase.financingType === 'loan' ? (
                        <Select
                          label="Amortization"
                          value={value.purchase.amortizationType}
                          onChange={(v) => update('purchase', 'amortizationType', v as AmortizationType)}
                          options={[
                            { label: 'Principal & Interest (PI)', value: 'PI' },
                            { label: 'Interest-Only (IO)', value: 'IO' }
                          ]}
                        />
                      ) : (
                        <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-muted">
                          Cash mode selected. Debt service from purchase loan is excluded.
                        </div>
                      )}
                      <Input label="Purchase price" type="number" value={value.purchase.purchasePrice} onChange={(v) => update('purchase', 'purchasePrice', Number(v))} />
                      <Input label="Rehab budget" type="number" value={value.purchase.rehabBudget} onChange={(v) => update('purchase', 'rehabBudget', Number(v))} />
                      <PercentInput label="Down payment %" value={value.purchase.downPaymentPercent} onChange={(v) => update('purchase', 'downPaymentPercent', v)} />
                      <PercentInput label="Closing costs %" value={value.purchase.closingCostPercent} onChange={(v) => update('purchase', 'closingCostPercent', v)} />
                      <PercentInput label="Interest rate %" value={value.purchase.interestRate} onChange={(v) => update('purchase', 'interestRate', v)} />
                      <PercentInput label="Points on loan %" value={value.purchase.pointsPercent} onChange={(v) => update('purchase', 'pointsPercent', v)} />
                      <Input label="Loan term (years)" type="number" value={value.purchase.loanTermYears} onChange={(v) => update('purchase', 'loanTermYears', Number(v))} />
                    </>
                  ) : (
                    <>
                      <Input
                        label="Mortgage payment / month"
                        type="number"
                        value={value.purchase.existingMortgageMonthly}
                        onChange={(v) => update('purchase', 'existingMortgageMonthly', Number(v))}
                      />
                      <div className="rounded-lg border border-white/10 bg-black/20 px-2.5 py-2 text-xs text-muted sm:col-span-2">
                        Monthly cash flow uses your payment above. Balance, rate, and term are only used to model payoff, equity, and projected sale proceeds.
                      </div>
                      <Input
                        label="Mortgage balance for projections"
                        type="number"
                        value={value.purchase.existingMortgageBalance}
                        onChange={(v) => update('purchase', 'existingMortgageBalance', Number(v))}
                      />
                      <PercentInput
                        label="Mortgage rate % for projections"
                        value={value.purchase.existingMortgageRate}
                        onChange={(v) => update('purchase', 'existingMortgageRate', v)}
                      />
                      <Input
                        label="Mortgage term left (years) for projections"
                        type="number"
                        value={value.purchase.existingMortgageRemainingYears}
                        onChange={(v) => update('purchase', 'existingMortgageRemainingYears', Number(v))}
                      />
                    </>
                  )}
                </div>

                <div className="mt-2.5 sm:mt-3">
                  <Section title="Advanced Options" defaultOpen={defaultAdvancedOptionsOpen}>
                    <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                      <Input
                        label="HELOC amount"
                        type="number"
                        value={value.purchase.helocAmount}
                        onChange={(v) => update('purchase', 'helocAmount', Number(v))}
                      />
                      <PercentInput label="HELOC rate %" value={value.purchase.helocRate} onChange={(v) => update('purchase', 'helocRate', v)} />
                      <Input label="HELOC term (years)" type="number" value={value.purchase.helocTermYears} onChange={(v) => update('purchase', 'helocTermYears', Number(v))} />
                      <Select
                        label="HELOC amortization"
                        value={value.purchase.helocAmortizationType}
                        onChange={(v) => update('purchase', 'helocAmortizationType', v as AmortizationType)}
                        options={[
                          { label: 'Principal & Interest (PI)', value: 'PI' },
                          { label: 'Interest-Only (IO)', value: 'IO' }
                        ]}
                      />
                      <Input
                        label="HELOC closing costs"
                        type="number"
                        value={value.purchase.helocClosingCosts}
                        onChange={(v) => update('purchase', 'helocClosingCosts', Number(v))}
                      />
                    </div>
                  </Section>
                </div>
              </section>
            ) : null}

            {resolvedCoreSection === 'expenses' ? (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
                <div className="grid gap-2 sm:grid-cols-2 sm:gap-3">
                  <Input label="HOA monthly" type="number" value={value.purchase.hoaMonthly} onChange={(v) => update('purchase', 'hoaMonthly', Number(v))} />
                  <Input label="PMI monthly" type="number" value={value.purchase.pmiMonthly} onChange={(v) => update('purchase', 'pmiMonthly', Number(v))} />
                </div>

                {!isOwnedMode ? (
                  <div className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3">
                    <Input
                      label={`Property tax override (auto ${currencyFormatter.format(autoTaxAnnual)})`}
                      type="number"
                      value={value.purchase.propertyTaxAnnualOverride ?? ''}
                      onChange={(v) => update('purchase', 'propertyTaxAnnualOverride', v === '' ? null : Number(v))}
                    />
                    <Input
                      label={`Insurance override (auto ${currencyFormatter.format(autoInsuranceAnnual)})`}
                      type="number"
                      value={value.purchase.insuranceAnnualOverride ?? ''}
                      onChange={(v) => update('purchase', 'insuranceAnnualOverride', v === '' ? null : Number(v))}
                    />
                  </div>
                ) : (
                  <div className="mt-2.5 grid gap-2 sm:mt-3 sm:grid-cols-2 sm:gap-3">
                    <Input
                      label="Property tax / month"
                      type="number"
                      value={value.purchase.existingTaxMonthly}
                      onChange={(v) => update('purchase', 'existingTaxMonthly', Number(v))}
                    />
                    <Input
                      label="Insurance / month"
                      type="number"
                      value={value.purchase.existingInsuranceMonthly}
                      onChange={(v) => update('purchase', 'existingInsuranceMonthly', Number(v))}
                    />
                  </div>
                )}

                <div className="mt-2.5 rounded-lg border border-white/10 bg-black/20 p-2 sm:mt-3 sm:p-2.5">
                  <div className="mb-2 hidden grid-cols-[minmax(0,0.95fr)_max-content_90px_minmax(0,1.35fr)] gap-2 px-1 text-[11px] uppercase tracking-wider text-muted sm:grid">
                    <span>Expense label</span>
                    <span>Cadence</span>
                    <span>Amount</span>
                    <span>Applies to strategies</span>
                  </div>

                  <div className="space-y-1.5 sm:space-y-2">
                    {value.variableExpenses.map((expense, index) => {
                      const cadence = getExpenseCadence(expense.key);
                      const expenseLabel = expense.label.trim() || `Expense ${index + 1}`;
                      return (
                        <div key={expense.key} className="rounded-md border border-white/10 bg-white/[0.03] p-2">
                          <div className="grid gap-1.5 sm:grid-cols-[minmax(0,0.95fr)_max-content_90px_minmax(0,1.35fr)] sm:items-center sm:gap-2">
                            <input
                              aria-label={`Expense label ${index + 1}`}
                              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] sm:text-xs"
                              type="text"
                              value={expense.label}
                              onChange={(event) => updateVariableExpense(index, { label: event.target.value })}
                              placeholder={`Expense ${index + 1}`}
                            />

                            <div className="inline-flex w-fit justify-self-start overflow-hidden rounded-md border border-white/15 bg-white/[0.02] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.03)]">
                              {(['monthly', 'annual'] as VariableExpenseInputMode[]).map((mode) => {
                                const active = cadence === mode;
                                return (
                                  <button
                                    key={mode}
                                    type="button"
                                    onClick={() => setExpenseCadence(expense.key, mode)}
                                    aria-pressed={active}
                                    aria-label={`${expenseLabel} ${mode} input cadence`}
                                    title={mode === 'monthly' ? 'Monthly input' : 'Annual input'}
                                    className={`tap-feedback px-1.5 py-0.5 text-[9px] font-semibold uppercase tracking-wide transition ${
                                      active ? 'bg-accent/25 text-accent' : 'text-slate-300 hover:bg-white/[0.08]'
                                    } ${mode === 'annual' ? 'border-l border-white/15' : ''}`}
                                  >
                                    {mode === 'monthly' ? 'Mo' : 'Annual'}
                                  </button>
                                );
                              })}
                            </div>

                            <input
                              aria-label={`${expenseLabel} amount`}
                              className="rounded-md border border-white/10 bg-white/5 px-1.5 py-1 text-[11px] sm:text-xs"
                              type="number"
                              value={formatVariableExpenseInput(expense.monthlyAmount, cadence)}
                              onChange={(event) => {
                                const rawValue = Number(event.target.value);
                                const parsedValue = Number.isFinite(rawValue) ? rawValue : 0;
                                updateVariableExpense(index, {
                                  monthlyAmount: cadence === 'annual' ? parsedValue / 12 : parsedValue
                                });
                              }}
                            />

                            <div className="grid grid-cols-4 gap-2 sm:gap-2.5">
                              {(Object.keys(strategyLabels) as ExpenseStrategyKey[]).map((strategy) => {
                                const active = expense.appliesTo[strategy];
                                return (
                                  <button
                                    key={strategy}
                                    type="button"
                                    aria-pressed={active}
                                    onClick={() =>
                                      updateVariableExpense(index, {
                                        appliesTo: { ...expense.appliesTo, [strategy]: !active }
                                      })
                                    }
                                    className={`flex min-h-7 items-center justify-center rounded-md border px-2 py-1 text-[11px] transition sm:min-h-0 sm:px-2.5 sm:py-1.5 sm:text-xs ${
                                      active
                                        ? 'border-accent/70 bg-accent/20 text-accent'
                                        : 'border-white/10 bg-white/[0.02] text-muted'
                                    }`}
                                  >
                                    {strategyLabels[strategy]}
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      );
                    })}
                  </div>

                  <button
                    type="button"
                    onClick={addVariableExpense}
                    className="tap-feedback mt-2 rounded-md border border-white/20 bg-white/[0.04] px-2.5 py-1.5 text-xs font-semibold text-slate-100 transition hover:bg-white/[0.09]"
                  >
                    Add variable expense
                  </button>
                </div>
              </section>
            ) : null}

            {resolvedCoreSection === 'known' ? (
              <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
                <div className="flex flex-col gap-2">
                  <div>
                    <p className="text-[11px] uppercase tracking-wider text-accent">Import</p>
                    <h3 className="text-sm font-semibold text-slate-100 sm:text-base">Import T12/P&L</h3>
                    <p className="text-[11px] text-muted">
                      Paste T12/P&L rows, preview auto-mapping, then apply imported values in analysis.
                    </p>
                  </div>
                </div>

                <textarea
                  aria-label="Import T12/P&L text"
                  value={knownDraft}
                  onChange={(event) => {
                    setKnownDraft(event.target.value);
                    setKnownFeedback(null);
                    setKnownClassificationOverrides({});
                  }}
                  rows={8}
                  className="mt-2 w-full rounded-md border border-white/10 bg-white/5 px-2.5 py-2 text-xs text-white outline-none placeholder:text-muted focus-visible:border-accent/75 focus-visible:shadow-[inset_0_0_0_1px_rgba(255,176,92,0.58)] sm:text-sm"
                  placeholder={`Property Tax\t\t9800\nInsurance\t\t3100\nPower\t\t3600\nGross Rent\t\t64800\nOther Income\t\t3000`}
                />
                <p className="mt-1 text-[11px] text-muted">All pasted P&L values are treated as annual totals.</p>

                <div className="mt-2 rounded-lg border border-white/10 bg-black/20 p-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                    <p>Parsed Rows: {knownPreviewRows.length}</p>
                    <p>Mapped: {mappedKnownRows.length}</p>
                    <p className={unmappedKnownRows.length ? 'text-amber-200' : ''}>Unmapped: {unmappedKnownRows.length}</p>
                    {knownAppliedEntries.length ? <p className="text-accent">Overlay Active: {knownAppliedEntries.length} rows</p> : null}
                    <button
                      type="button"
                      onClick={() => {
                        if (knownAppliedEntries.length) {
                          setKnownAppliedEntries([]);
                          setKnownFeedback('Imported overlay disabled. Calculation now uses only visible input fields.');
                          return;
                        }
                        applyKnownExpensesAndIncome();
                      }}
                      className="tap-feedback rounded-md border border-accent/60 bg-accent/20 px-2.5 py-1 text-[11px] font-semibold text-accent transition hover:bg-accent/30"
                    >
                      {knownAppliedEntries.length ? 'Disable Imported Overlay' : 'Apply P&L to Analysis'}
                    </button>
                  </div>
                  {knownPreviewRows.length ? (
                    <div className="mt-2 space-y-1">
                      {knownPreviewRows.map((row) => {
                        const classification = getKnownRowClassification(row);
                        const isMapped = Boolean(row.mappedTarget);
                        const isIncome = classification === 'income';
                        const rowClass = isIncome
                          ? 'border-emerald-400/35 bg-emerald-500/10'
                          : 'border-rose-300/70 bg-rose-500/25';
                        const valueText = row.line.isPercent ? `${row.line.value.toFixed(2)}%` : currencyFormatter.format(row.line.value);

                        return (
                          <div key={row.line.id} className={`rounded-md border px-2 py-1 ${rowClass}`}>
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <div className="flex items-center gap-1.5">
                                {!isMapped ? (
                                  <span className="rounded border border-amber-300/40 bg-amber-500/20 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-amber-100">
                                    Unmapped
                                  </span>
                                ) : null}
                                <p className={`text-xs font-semibold ${isIncome ? 'text-emerald-100' : 'text-rose-50'}`}>{row.line.label}</p>
                              </div>
                              <span className="text-[11px] font-medium text-slate-100">{valueText}</span>
                            </div>
                            <div className="mt-0.5 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                              <p className={isMapped ? 'text-slate-100/90' : 'text-amber-100'}>
                                {row.mappedTarget ? row.mappedTarget.targetLabel : 'Unmapped category: review label before applying'}
                              </p>
                              <div className="inline-flex items-center gap-1">
                                <div className="inline-flex rounded border border-white/15 bg-white/[0.02] p-0.5">
                                  {(['income', 'expense'] as KnownDisplayClassification[]).map((option) => {
                                    const active = classification === option;
                                    const optionClasses =
                                      option === 'income'
                                        ? 'border-emerald-300/40 bg-emerald-500/20 text-emerald-100'
                                        : option === 'expense'
                                          ? 'border-rose-300/65 bg-rose-500/35 text-rose-50'
                                          : 'border-amber-300/40 bg-amber-500/20 text-amber-100';
                                    return (
                                      <button
                                        key={option}
                                        type="button"
                                        aria-pressed={active}
                                        onClick={() =>
                                          setKnownClassificationOverrides((prev) => ({
                                            ...prev,
                                            [row.line.id]: option
                                          }))
                                        }
                                        className={`tap-feedback rounded px-1.5 py-0.5 uppercase tracking-wide transition ${
                                          active ? `border ${optionClasses}` : 'border border-transparent text-muted hover:bg-white/[0.08]'
                                        }`}
                                      >
                                        {option}
                                      </button>
                                    );
                                  })}
                                </div>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <p className="mt-2 text-[11px] text-muted">Paste your T12/P&L rows to preview mapping and highlight income/expense lines.</p>
                  )}
                </div>
                {knownFeedback ? <p className="mt-2 text-[11px] text-accent">{knownFeedback}</p> : null}
              </section>
            ) : null}
          </div>
        </div>
      </div>
    </section>
  );
}

function Section({ title, children, defaultOpen = true }: { title: string; children: React.ReactNode; defaultOpen?: boolean }) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  useEffect(() => {
    setIsOpen(defaultOpen);
  }, [defaultOpen]);

  return (
    <section className="rounded-xl border border-white/10 bg-white/[0.03] p-2.5 sm:p-3">
      <button
        type="button"
        onClick={() => setIsOpen((prev) => !prev)}
        aria-expanded={isOpen}
        className="tap-feedback flex w-full items-center justify-between gap-2 rounded-lg border border-white/10 bg-white/[0.02] px-2.5 py-1.5 text-left text-xs font-medium text-white sm:text-sm"
      >
        <span>{title}</span>
        <span className="inline-flex h-6 min-w-6 items-center justify-center rounded-full border border-white/15 bg-black/20 px-1.5 text-xs font-semibold text-slate-200 transition-transform duration-200">
          {isOpen ? '-' : '+'}
        </span>
      </button>
      <div className="panel-collapse mt-2 sm:mt-3" data-open={isOpen}>
        <div className="panel-collapse-inner">{children}</div>
      </div>
    </section>
  );
}
