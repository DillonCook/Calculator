import { describe, expect, it } from 'vitest';

import { defaultDealInput } from '../lib/models/deal';
import { createScenarioRecord, decodeScenario, encodeScenario } from '../lib/scenario-storage';

describe('share link encoding', () => {
  it('roundtrips encoded scenarios and restores normalized payload', () => {
    const payload = {
      ...defaultDealInput,
      purchase: {
        ...defaultDealInput.purchase,
        dealName: 'Café Duplex ✅',
        purchasePrice: 412345,
        financingType: 'heloc' as unknown as 'cash' | 'loan'
      },
      longTerm: {
        ...defaultDealInput.longTerm,
        monthlyRent: 2950
      },
      variableExpenses: []
    };

    const scenario = createScenarioRecord(payload, {
      scenarioId: 'scenario-share-link-roundtrip',
      dealName: payload.purchase.dealName,
      createdAt: '2026-01-01T00:00:00.000Z',
      updatedAt: '2026-01-01T00:00:00.000Z'
    });

    const token = encodeScenario(scenario);
    const decoded = decodeScenario(token);

    expect(decoded).not.toBeNull();
    expect(decoded).toMatchObject({
      scenarioId: 'scenario-share-link-roundtrip',
      dealName: payload.purchase.dealName
    });
    expect(decoded?.payload).toEqual({
      ...defaultDealInput,
      ...payload,
      purchase: {
        ...defaultDealInput.purchase,
        ...payload.purchase,
        financingType: 'loan'
      },
      longTerm: { ...defaultDealInput.longTerm, ...payload.longTerm },
      airbnb: { ...defaultDealInput.airbnb, ...payload.airbnb },
      padSplit: { ...defaultDealInput.padSplit, ...payload.padSplit },
      brrrr: { ...defaultDealInput.brrrr, ...payload.brrrr },
      flip: { ...defaultDealInput.flip, ...payload.flip },
      assumptions: { ...defaultDealInput.assumptions, ...payload.assumptions },
      variableExpenses: defaultDealInput.variableExpenses
    });
  });

  it('returns null for malformed shared token payloads', () => {
    expect(decodeScenario('not-a-valid-token')).toBeNull();
  });

  it('produces URL-safe token output', () => {
    const scenario = createScenarioRecord(defaultDealInput, {
      scenarioId: 'scenario-share-link-url-safe'
    });

    const token = encodeScenario(scenario);

    expect(token).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(token).not.toContain(' ');
    expect(token).not.toContain('+');
    expect(token).not.toContain('/');
    expect(token).not.toContain('=');
  });
});
