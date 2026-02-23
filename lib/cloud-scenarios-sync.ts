import { getSupabaseClient } from '@/lib/supabaseClient';
import type { ScenarioRecord } from '@/lib/models/deal';
import { writeScenarios } from '@/lib/scenario-storage';

interface CloudScenarioRow {
  user_id: string;
  scenario_id: string;
  schema_version: string;
  app_version: string;
  deal_name: string;
  created_at: string;
  updated_at: string;
  tags: string[];
  notes: string | null;
  payload: ScenarioRecord['payload'];
}

const CLOUD_SCENARIOS_TABLE = 'user_scenarios';

const toCloudRow = (userId: string, scenario: ScenarioRecord): CloudScenarioRow => ({
  user_id: userId,
  scenario_id: scenario.scenarioId,
  schema_version: scenario.schemaVersion,
  app_version: scenario.appVersion,
  deal_name: scenario.dealName,
  created_at: scenario.createdAt,
  updated_at: scenario.updatedAt,
  tags: scenario.tags,
  notes: scenario.notes ?? null,
  payload: scenario.payload
});

const toScenarioRecord = (row: CloudScenarioRow): ScenarioRecord => ({
  schemaVersion: '1.0.0',
  scenarioId: row.scenario_id,
  appVersion: row.app_version,
  dealName: row.deal_name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
  tags: Array.isArray(row.tags) ? row.tags : [],
  notes: row.notes ?? undefined,
  payload: row.payload
});

const mergeScenarios = (localDeals: ScenarioRecord[], cloudDeals: ScenarioRecord[]): ScenarioRecord[] => {
  const merged = new Map<string, ScenarioRecord>();

  [...localDeals, ...cloudDeals].forEach((record) => {
    const existing = merged.get(record.scenarioId);
    if (!existing) {
      merged.set(record.scenarioId, record);
      return;
    }

    merged.set(
      record.scenarioId,
      new Date(record.updatedAt).getTime() > new Date(existing.updatedAt).getTime() ? record : existing
    );
  });

  return Array.from(merged.values()).sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
};

const fetchCloudScenarios = async (userId: string): Promise<ScenarioRecord[] | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { data, error } = await supabase
    .from(CLOUD_SCENARIOS_TABLE)
    .select('user_id, scenario_id, schema_version, app_version, deal_name, created_at, updated_at, tags, notes, payload')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return null;
  }

  return (data as CloudScenarioRow[]).map(toScenarioRecord);
};

const replaceCloudScenarios = async (userId: string, scenarios: ScenarioRecord[]) => {
  const supabase = getSupabaseClient();
  if (!supabase) return;

  const rows = scenarios.map((scenario) => toCloudRow(userId, scenario));

  if (rows.length > 0) {
    await supabase.from(CLOUD_SCENARIOS_TABLE).upsert(rows, { onConflict: 'user_id,scenario_id' });
  }

  const { data: existingRows } = await supabase
    .from(CLOUD_SCENARIOS_TABLE)
    .select('scenario_id')
    .eq('user_id', userId);

  const existingIds = new Set((existingRows ?? []).map((row) => String((row as { scenario_id: string }).scenario_id)));
  const nextIds = new Set(scenarios.map((scenario) => scenario.scenarioId));
  const idsToDelete = Array.from(existingIds).filter((id) => !nextIds.has(id));

  if (idsToDelete.length > 0) {
    await supabase.from(CLOUD_SCENARIOS_TABLE).delete().eq('user_id', userId).in('scenario_id', idsToDelete);
  }
};

export const hydrateDealsFromCloud = async (userId: string, localDeals: ScenarioRecord[]): Promise<ScenarioRecord[]> => {
  const cloudDeals = await fetchCloudScenarios(userId);

  if (!cloudDeals) {
    return localDeals;
  }

  const mergedDeals = mergeScenarios(localDeals, cloudDeals);
  writeScenarios(mergedDeals);
  await replaceCloudScenarios(userId, mergedDeals);
  return mergedDeals;
};

export const syncDealsToCloud = async (userId: string, localDeals: ScenarioRecord[]) => {
  await replaceCloudScenarios(userId, localDeals);
};

export const pullLatestDealsFromCloud = async (userId: string, currentLocalDeals: ScenarioRecord[]): Promise<ScenarioRecord[] | null> => {
  const cloudDeals = await fetchCloudScenarios(userId);
  if (!cloudDeals) return null;

  const mergedDeals = mergeScenarios(currentLocalDeals, cloudDeals);
  writeScenarios(mergedDeals);
  return mergedDeals;
};
