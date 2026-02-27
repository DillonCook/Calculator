import localforage from 'localforage';
import { defaultDealInput, type DealInputModel } from '@/lib/models/deal';

export interface DealRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  tags: string[];
  payload: DealInputModel;
  lastOpenedAt?: string;
}

const VAULT_KEY = 'investor-command-center.deals.v1';

const normalizePayload = (payload: DealInputModel): DealInputModel => ({
  ...defaultDealInput,
  ...payload,
  purchase: {
    ...defaultDealInput.purchase,
    ...payload.purchase,
    financingType:
      (payload.purchase as { financingType?: string } | undefined)?.financingType === 'heloc'
        ? 'loan'
        : (payload.purchase?.financingType ?? defaultDealInput.purchase.financingType)
  },
  commercial: { ...defaultDealInput.commercial, ...payload.commercial },
  longTerm: { ...defaultDealInput.longTerm, ...payload.longTerm },
  airbnb: { ...defaultDealInput.airbnb, ...payload.airbnb },
  padSplit: { ...defaultDealInput.padSplit, ...payload.padSplit },
  brrrr: { ...defaultDealInput.brrrr, ...payload.brrrr },
  flip: { ...defaultDealInput.flip, ...payload.flip },
  assumptions: { ...defaultDealInput.assumptions, ...payload.assumptions },
  variableExpenses:
    Array.isArray(payload.variableExpenses) && payload.variableExpenses.length > 0 ? payload.variableExpenses : defaultDealInput.variableExpenses
});

const createId = () => {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }

  return `deal-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
};

const buildRecord = (payload: DealInputModel, name?: string, tags: string[] = []): DealRecord => {
  const now = new Date().toISOString();

  return {
    id: createId(),
    name: name?.trim() || payload.purchase.dealName || 'Untitled Deal',
    createdAt: now,
    updatedAt: now,
    tags,
    payload: normalizePayload(payload)
  };
};

const normalizeRecord = (record: DealRecord): DealRecord => ({
  ...record,
  name: record.name?.trim() || record.payload?.purchase?.dealName || 'Untitled Deal',
  tags: Array.isArray(record.tags) ? record.tags : [],
  payload: normalizePayload(record.payload),
  updatedAt: record.updatedAt ?? record.createdAt ?? new Date().toISOString(),
  createdAt: record.createdAt ?? record.updatedAt ?? new Date().toISOString()
});

const assertClient = () => {
  if (typeof window === 'undefined') {
    throw new Error('deals-vault can only run in the browser');
  }
};

const vault = localforage.createInstance({
  name: 'investor-command-center',
  storeName: 'deals_vault',
  driver: [localforage.INDEXEDDB, localforage.LOCALSTORAGE]
});

const readAll = async (): Promise<DealRecord[]> => {
  assertClient();
  const raw = await vault.getItem<DealRecord[]>(VAULT_KEY);

  if (!Array.isArray(raw) || raw.length === 0) {
    const seeded = [buildRecord(defaultDealInput, 'Untitled Deal')];
    await vault.setItem(VAULT_KEY, seeded);
    return seeded;
  }

  return raw.map((record) => normalizeRecord(record));
};

const writeAll = async (records: DealRecord[]): Promise<DealRecord[]> => {
  assertClient();
  const sorted = [...records].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  await vault.setItem(VAULT_KEY, sorted);
  return sorted;
};

export const listDeals = async (): Promise<DealRecord[]> => {
  return readAll();
};

export const createDeal = async (initialPayload: DealInputModel, name?: string): Promise<DealRecord> => {
  const deals = await readAll();
  const record = buildRecord(initialPayload, name);
  await writeAll([record, ...deals]);
  return record;
};

export const saveDeal = async (id: string, payload: DealInputModel): Promise<DealRecord | null> => {
  const deals = await readAll();
  const index = deals.findIndex((deal) => deal.id === id);

  if (index < 0) return null;

  const now = new Date().toISOString();
  const next = {
    ...deals[index],
    updatedAt: now,
    payload: normalizePayload(payload),
    name: payload.purchase.dealName?.trim() || deals[index].name
  };

  deals[index] = next;
  await writeAll(deals);
  return next;
};

export const saveDealAs = async (payload: DealInputModel, name: string, tags: string[] = []): Promise<DealRecord> => {
  const deals = await readAll();
  const record = buildRecord(payload, name, tags);
  await writeAll([record, ...deals]);
  return record;
};

export const renameDeal = async (id: string, nextName: string): Promise<DealRecord | null> => {
  const deals = await readAll();
  const target = deals.find((deal) => deal.id === id);
  if (!target) return null;

  const cleaned = nextName.trim();
  if (!cleaned) return target;

  target.name = cleaned;
  target.updatedAt = new Date().toISOString();
  await writeAll(deals);
  return target;
};

export const duplicateDeal = async (id: string, nextName?: string): Promise<DealRecord | null> => {
  const deals = await readAll();
  const source = deals.find((deal) => deal.id === id);
  if (!source) return null;

  const record = buildRecord(source.payload, nextName ?? `${source.name} Copy`, source.tags);
  await writeAll([record, ...deals]);
  return record;
};

export const deleteDeal = async (id: string): Promise<DealRecord[]> => {
  const deals = await readAll();
  const filtered = deals.filter((deal) => deal.id !== id);
  return writeAll(filtered);
};

export const searchDeals = async (query: string, tags: string[] = []): Promise<DealRecord[]> => {
  const deals = await readAll();
  const normalizedQuery = query.trim().toLowerCase();
  const normalizedTags = tags.map((tag) => tag.toLowerCase());

  return deals.filter((deal) => {
    const matchesQuery =
      normalizedQuery.length === 0 ||
      deal.name.toLowerCase().includes(normalizedQuery) ||
      deal.payload.purchase.dealName.toLowerCase().includes(normalizedQuery);

    const matchesTags =
      normalizedTags.length === 0 || normalizedTags.every((tag) => deal.tags.some((dealTag) => dealTag.toLowerCase() === tag));

    return matchesQuery && matchesTags;
  });
};

export const markDealOpened = async (id: string): Promise<DealRecord | null> => {
  const deals = await readAll();
  const target = deals.find((deal) => deal.id === id);
  if (!target) return null;

  target.lastOpenedAt = new Date().toISOString();
  await writeAll(deals);
  return target;
};
