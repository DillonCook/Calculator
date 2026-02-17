import type { DealInputModel, ScenarioRecord } from '@/lib/models/deal';
import { defaultDealInput } from '@/lib/models/deal';

const STORAGE_KEY = 'investor-command-center.scenarios.v1';
const APP_VERSION = '0.2.0';


const normalizeDealInput = (payload: DealInputModel): DealInputModel => {
  return {
    ...defaultDealInput,
    ...payload,
    purchase: { ...defaultDealInput.purchase, ...payload.purchase },
    longTerm: { ...defaultDealInput.longTerm, ...payload.longTerm },
    airbnb: { ...defaultDealInput.airbnb, ...payload.airbnb },
    padSplit: { ...defaultDealInput.padSplit, ...payload.padSplit },
    brrrr: { ...defaultDealInput.brrrr, ...payload.brrrr },
    flip: { ...defaultDealInput.flip, ...payload.flip },
    assumptions: { ...defaultDealInput.assumptions, ...payload.assumptions },
    variableExpenses: Array.isArray(payload.variableExpenses) && payload.variableExpenses.length > 0 ? payload.variableExpenses : defaultDealInput.variableExpenses
  };
};

const normalizeScenario = (record: ScenarioRecord): ScenarioRecord => ({
  ...record,
  payload: normalizeDealInput(record.payload)
});


const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `scenario-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const encodeBase64Url = (value: string): string => {
  if (typeof window === 'undefined') {
    return Buffer.from(value, 'utf-8').toString('base64url');
  }

  const base64 = window.btoa(encodeURIComponent(value));
  return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
};

const decodeBase64Url = (value: string): string => {
  if (typeof window === 'undefined') {
    return Buffer.from(value, 'base64url').toString('utf-8');
  }

  const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
  const padded = base64 + '==='.slice((base64.length + 3) % 4);
  return decodeURIComponent(window.atob(padded));
};

export const createScenarioRecord = (payload: DealInputModel, overrides?: Partial<ScenarioRecord>): ScenarioRecord => {
  const now = new Date().toISOString();

  return {
    schemaVersion: '1.0.0',
    scenarioId: createId(),
    appVersion: APP_VERSION,
    dealName: payload.purchase.dealName,
    createdAt: now,
    updatedAt: now,
    tags: [],
    payload,
    ...overrides
  };
};

export const readScenarios = (): ScenarioRecord[] => {
  if (typeof window === 'undefined') return [];

  const raw = window.localStorage.getItem(STORAGE_KEY);
  if (!raw) return [];

  try {
    const parsed = JSON.parse(raw) as ScenarioRecord[];
    return Array.isArray(parsed) ? parsed.map((record) => normalizeScenario(record)) : [];
  } catch {
    return [];
  }
};

export const writeScenarios = (records: ScenarioRecord[]) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
};

export const upsertScenario = (record: ScenarioRecord) => {
  const records = readScenarios();
  const normalizedRecord = normalizeScenario(record);
  const index = records.findIndex((entry) => entry.scenarioId === normalizedRecord.scenarioId);

  if (index >= 0) {
    records[index] = { ...normalizedRecord, updatedAt: new Date().toISOString() };
  } else {
    records.unshift(normalizedRecord);
  }

  writeScenarios(records);
  return records;
};

export const deleteScenario = (scenarioId: string) => {
  const records = readScenarios().filter((entry) => entry.scenarioId !== scenarioId);
  writeScenarios(records);
  return records;
};

export const encodeScenario = (record: ScenarioRecord): string => {
  return encodeBase64Url(JSON.stringify(record));
};

export const decodeScenario = (value: string): ScenarioRecord | null => {
  try {
    const raw = decodeBase64Url(value);
    return normalizeScenario(JSON.parse(raw) as ScenarioRecord);
  } catch {
    return null;
  }
};
