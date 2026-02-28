import { compressToEncodedURIComponent, decompressFromEncodedURIComponent } from 'lz-string';
import { defaultDealInput, type DealInputModel, type ExpenseStrategyKey, type ScenarioRecord } from '@/lib/models/deal';

const MAX_SHARE_PARAM_LENGTH = 8000;
const MAX_SHARE_JSON_LENGTH = 25000;

type DealRecordOrPayload = DealInputModel | Pick<ScenarioRecord, 'payload'>;

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === 'object' && value !== null;

const normalizeVariableExpenses = (value: unknown): DealInputModel['variableExpenses'] => {
  if (!Array.isArray(value) || value.length === 0) {
    return defaultDealInput.variableExpenses;
  }

  return value
    .filter((entry): entry is Record<string, unknown> => isRecord(entry))
    .map((entry) => {
      const defaultApplies: Record<ExpenseStrategyKey, boolean> = {
        longTerm: true,
        airbnb: true,
        padSplit: true,
        flip: true
      };
      const entryAppliesTo = isRecord(entry.appliesTo) ? (entry.appliesTo as Record<string, unknown>) : null;
      const appliesTo = entryAppliesTo
        ? Object.keys(defaultApplies).reduce<Record<ExpenseStrategyKey, boolean>>((acc, key) => {
            const typedKey = key as ExpenseStrategyKey;
            acc[typedKey] = Boolean(entryAppliesTo[typedKey]);
            return acc;
          }, { ...defaultApplies })
        : { ...defaultApplies };

      return {
        key: typeof entry.key === 'string' ? entry.key : '',
        label: typeof entry.label === 'string' ? entry.label : 'Custom Expense',
        monthlyAmount: typeof entry.monthlyAmount === 'number' ? entry.monthlyAmount : 0,
        appliesTo
      };
    });
};

export const normalizeDealInput = (value: unknown): DealInputModel | null => {
  if (!isRecord(value)) return null;

  const purchase = isRecord(value.purchase) ? value.purchase : {};
  const commercial = isRecord(value.commercial) ? value.commercial : {};
  const longTerm = isRecord(value.longTerm) ? value.longTerm : {};
  const longTermTurnaround = isRecord(longTerm.turnaround) ? longTerm.turnaround : {};
  const airbnb = isRecord(value.airbnb) ? value.airbnb : {};
  const padSplit = isRecord(value.padSplit) ? value.padSplit : {};
  const brrrr = isRecord(value.brrrr) ? value.brrrr : {};
  const flip = isRecord(value.flip) ? value.flip : {};
  const assumptions = isRecord(value.assumptions) ? value.assumptions : {};

  return {
    ...defaultDealInput,
    ...value,
    purchase: {
      ...defaultDealInput.purchase,
      ...purchase,
      financingType: purchase.financingType === 'cash' ? 'cash' : 'loan',
      amortizationType: purchase.amortizationType === 'IO' ? 'IO' : 'PI',
      helocAmortizationType: purchase.helocAmortizationType === 'IO' ? 'IO' : 'PI'
    },
    commercial: { ...defaultDealInput.commercial, ...commercial },
    longTerm: {
      ...defaultDealInput.longTerm,
      ...longTerm,
      turnaround: {
        ...defaultDealInput.longTerm.turnaround,
        ...longTermTurnaround
      }
    },
    airbnb: { ...defaultDealInput.airbnb, ...airbnb },
    padSplit: { ...defaultDealInput.padSplit, ...padSplit },
    brrrr: { ...defaultDealInput.brrrr, ...brrrr },
    flip: { ...defaultDealInput.flip, ...flip },
    assumptions: { ...defaultDealInput.assumptions, ...assumptions },
    variableExpenses: normalizeVariableExpenses(value.variableExpenses)
  };
};

const getPayload = (dealRecordOrPayload: DealRecordOrPayload): DealInputModel => {
  if ('payload' in dealRecordOrPayload) {
    return dealRecordOrPayload.payload;
  }

  return dealRecordOrPayload;
};

const isPlainObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const areValuesEqual = (left: unknown, right: unknown): boolean => {
  if (left === right) return true;

  if (Array.isArray(left) && Array.isArray(right)) {
    if (left.length !== right.length) return false;
    return left.every((item, index) => areValuesEqual(item, right[index]));
  }

  if (isPlainObject(left) && isPlainObject(right)) {
    const leftKeys = Object.keys(left);
    const rightKeys = Object.keys(right);
    if (leftKeys.length !== rightKeys.length) return false;

    return leftKeys.every((key) => areValuesEqual(left[key], right[key]));
  }

  return false;
};

const stripDefaults = (value: unknown, defaults: unknown): unknown => {
  if (areValuesEqual(value, defaults)) {
    return undefined;
  }

  if (Array.isArray(value)) {
    return value;
  }

  if (!isPlainObject(value) || !isPlainObject(defaults)) {
    return value;
  }

  const compacted = Object.entries(value).reduce<Record<string, unknown>>((acc, [key, entry]) => {
    const next = stripDefaults(entry, defaults[key]);
    if (next !== undefined) {
      acc[key] = next;
    }
    return acc;
  }, {});

  return Object.keys(compacted).length > 0 ? compacted : undefined;
};

export const encodeDealToShareParam = (dealRecordOrPayload: DealRecordOrPayload): string => {
  try {
    const payload = normalizeDealInput(getPayload(dealRecordOrPayload));
    if (!payload) return '';

    const compactPayload = stripDefaults(payload, defaultDealInput) ?? {};
    const serialized = JSON.stringify(compactPayload);
    if (serialized.length > MAX_SHARE_JSON_LENGTH) return '';

    const encoded = compressToEncodedURIComponent(serialized);
    if (!encoded || encoded.length > MAX_SHARE_PARAM_LENGTH) return '';

    return encoded;
  } catch {
    return '';
  }
};

export const decodeDealFromShareParam = (s: string): DealInputModel | null => {
  if (!s || s.length > MAX_SHARE_PARAM_LENGTH) return null;

  try {
    const raw = decompressFromEncodedURIComponent(s);
    if (!raw || raw.length > MAX_SHARE_JSON_LENGTH) return null;

    const parsed = JSON.parse(raw) as unknown;
    return normalizeDealInput(parsed);
  } catch {
    return null;
  }
};
