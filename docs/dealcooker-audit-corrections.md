# Post-release audit corrections

Dillon authorized the focused correction pass after the audit of `50fd4322907e3cf1bc4a4d39bee9cad47d263515`. This is not a redesign, recruitment campaign, or independent third-party certification. The original checkout remains preserved.

## Six correction contracts

1. **Active debt terms:** a shared one-month through 100-year supported range covers purchase, drawn HELOC, existing mortgage, and active BRRRR refinance terms. Fractional years are supported; unused zero-term debt, zero APR and zero down remain valid. Readiness blocks invalid terms, public import rejects invalid active acquisition debt, and the report validates its independently selected strategy. Defensive schedules use one normalization but are never labeled verified when inputs are invalid. Desktop/mobile incomplete states identify the actual financing field rather than asking for already-entered price/rent.
2. **Operating cost sensitivity:** entered owner expenses, flat management, turnover costs, monetary reserves, tax/insurance adjustments, PMI and BRRRR holding costs are covered alongside existing cost rows. Income shocks include ancillary income, commercial recoveries and STR charged cleaning revenue. Fee percentages, occupancy and debt terms stay fixed. Setup costs, non-flip rehab and transaction charges are explicitly excluded from cost stress.
3. **Visible scenario consequences:** each comparison shows its holding period, monthly cash (or flip profit), cash returned/required at sale, and total dated profit. Original deal inputs remain unchanged. BRRRR's shared refinance/exit ARV relationship is disclosed rather than implying its debt amount cannot change.
4. **Pre-stabilization exits:** an ephemeral scenario-only value reaches the timeline's actual early-sale branch and its projection helper. No acquisition price, funded uses or purchase debt are changed. Tests cross purchase/owned mode and holds before, at and after stabilization.
5. **Safe Undo:** shared metadata is range-checked and copied through a two-field whitelist. The actual button revalidates and restores only purchase price and down payment, even for older browser-local records containing extra fields. Invalid snapshots cannot enter through imports; extra fields are stripped rather than trusted.
6. **Interpretable reports:** a common goal-comparison helper supplies numerical actual/goal/status rows to the decision brief and PDF schema. Debt-free and undefined-denominator results are marked not assessed rather than implying a measured return. Malformed report tokens fail visibly instead of silently rendering the default sample.

## Verification discipline

- `test/audit-fixes.test.ts` and `test/audit-fixes-ui.test.tsx` are included in canonical npm commands. The actual desktop result gate also has an integration regression in `test/ui.integration.test.tsx`.
- Regression failures were observed before the relevant fixes: debt readiness/payment parity, missing sensitivity costs, early-exit value, invisible scenario outcomes, unsafe Undo, omitted report targets, invalid report fallback and misleading desktop recovery copy.
- Full Node 22 tests, standalone types, lint, production build, landing generation/audit and built-app browser checks are release gates. Existing warnings are reported separately; passing old tests alone does not close an audit finding.
- Browser checks use fictional isolated local data and blocked analytics/diagnostic/submission endpoints. Desktop and phone-width scenario outcomes, invalid-loan recovery, populated report targets and PDF text/page rendering are exercised.
- The PR/release receipt records actual final counts, exact merged SHA, CI/deployment states and public runtime checks. A local correction is not declared live in advance.

## Still pending

The real participant pilot has not been conducted. No participant results, recruitment completion, testimonials, retention statistics or promotion outcomes are inferred from these software checks. Authenticated cloud persistence and real-device usability are not independently certified by this focused correction pass.
