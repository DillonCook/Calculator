import type { DealInputModel, ScenarioRecord } from '@/lib/models/deal';

const STORAGE_KEY = 'investor-command-center.scenarios.v1';
const APP_VERSION = '0.2.0';


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
    return Array.isArray(parsed) ? parsed : [];
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
  const index = records.findIndex((entry) => entry.scenarioId === record.scenarioId);

  if (index >= 0) {
    records[index] = { ...record, updatedAt: new Date().toISOString() };
  } else {
    records.unshift(record);
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
    return JSON.parse(raw) as ScenarioRecord;
  } catch {
    return null;
  }
};
