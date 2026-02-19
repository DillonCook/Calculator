import type { DealInputModel, ScenarioRecord } from '@/lib/models/deal';
import { createScenarioRecord, deleteScenario, readScenarios, upsertScenario } from '@/lib/scenario-storage';

export const readDealsFromVault = (): ScenarioRecord[] => readScenarios();

export const saveDealToVault = (record: ScenarioRecord): ScenarioRecord[] => upsertScenario(record);

export const createDealInVault = (payload: DealInputModel, dealName: string): ScenarioRecord => {
  const nextPayload: DealInputModel = {
    ...payload,
    purchase: {
      ...payload.purchase,
      dealName
    }
  };

  return createScenarioRecord(nextPayload, {
    dealName,
    payload: nextPayload,
    tags: []
  });
};

export const removeDealFromVault = (dealId: string): ScenarioRecord[] => deleteScenario(dealId);
