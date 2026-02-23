import { getSupabaseClient } from '@/lib/supabaseClient';
import type { ScenarioRecord } from '@/lib/models/deal';
import { writeScenarios } from '@/lib/scenario-storage';

const SCENARIOS_TABLE = 'scenarios';

interface ScenarioRow {
  id: string;
  user_id: string;
  name: string;
  payload: ScenarioRecord['payload'];
  updated_at: string;
  created_at?: string;
}

const toScenarioRecord = (row: ScenarioRow): ScenarioRecord => {
  const createdAt = row.created_at ?? row.updated_at;

  return {
    schemaVersion: '1.0.0',
    scenarioId: row.id,
    appVersion: '0.2.0',
    dealName: row.name,
    createdAt,
    updatedAt: row.updated_at,
    tags: [],
    payload: row.payload
  };
};

export const fetchSupabaseScenarios = async (userId: string): Promise<{ scenarios: ScenarioRecord[]; error: unknown | null }> => {
  const supabase = getSupabaseClient();
  if (!supabase) return { scenarios: [], error: null };

  const { data, error } = await supabase
    .from(SCENARIOS_TABLE)
    .select('*')
    .eq('user_id', userId)
    .order('updated_at', { ascending: false });

  if (error || !data) {
    return { scenarios: [], error: error ?? new Error('Failed to fetch scenarios.') };
  }

  const scenarios = (data as ScenarioRow[]).map(toScenarioRecord);
  writeScenarios(scenarios);
  return { scenarios, error: null };
};

export const upsertSupabaseScenario = async (userId: string, scenario: ScenarioRecord): Promise<unknown | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { error } = await supabase.from(SCENARIOS_TABLE).upsert(
    {
      id: scenario.scenarioId,
      user_id: userId,
      name: scenario.dealName,
      payload: scenario.payload,
      updated_at: new Date().toISOString()
    },
    { onConflict: 'id' }
  );

  return error ?? null;
};

export const deleteSupabaseScenario = async (userId: string, scenarioId: string): Promise<unknown | null> => {
  const supabase = getSupabaseClient();
  if (!supabase) return null;

  const { error } = await supabase.from(SCENARIOS_TABLE).delete().eq('id', scenarioId).eq('user_id', userId);

  return error ?? null;
};
