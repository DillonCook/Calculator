# Step 1: Airbnb platform-fee correction

## Implemented locally

Host platform fees now use room revenue plus charged cleaning revenue. Management, maintenance and CapEx retain their existing separate bases. Annual-total revenue overrides remain totals: cleaning charges are not added twice. Existing saved fee percentages and defaults remain unchanged.

Added field explanations for host-only versus split-fee host rates and for annual revenue totals/cleaner-cost assumptions. Added five engine tests and two component UI tests; corrected older tests that explicitly encoded the incorrect platform-fee base. The UI test command includes the new tests.

## Proof

Before the fix the independent regression failed: actual platform fee -465, expected -697.50.
After the fix the $3,000 room / $1,500 cleaning / $1,500 cleaner / 15.5% host-fee fixture produces fee $697.50, monthly cash flow $2,302.50, annual cash flow $27,630, one-year ROI 27.63% with no other income/costs/appreciation. The production-built local app displays the corrected result.

- Engine: 118 passed, 0 failed.
- Unit: 16 passed.
- Final UI run: 105 passed, 0 failed. Initial local UI run included a lightbox timeout; isolated replay and final full run passed without changing the timeout. Existing flakiness is not considered remediated by this step.
- Build: Next production build completed successfully on Node 22.23.2.
- Standalone types: only the three pre-existing test typing errors; retained for Step 5.
- Lint: 0 errors, 7 existing warnings.
- Diff whitespace check: passed.
- Local desktop/mobile visual checks: new fee explanation visible and inside 1440x1000 and 390x844 viewports; corrected desktop cash flow observed.
- Source consumer trace: app/API/print calculate through the shared engine; no separate frontend platform-fee formula found. Numeric downstream tests verify BRRRR, projection, PDF and scenario reload.

An existing REI fixture IRR expectation was independently recomputed with a separate Python monthly amortization/cash-flow and bisection oracle: -0.05296962398748922. The corrected engine agrees within the existing 1e-9 tolerance.

## Scope and unresolved gates

No model schema, default fee rate, other-strategy formula, financing behavior or visual design was changed. No production writes, deployment, feedback/review submission or public sharing occurred. All browser fixtures were fictional and local.

Fresh npm audit reported 12 advisories, including a critical Next.js advisory; no automatic dependency upgrade was performed. This and pre-existing standalone test typing errors remain explicit release blockers. Engine-backed marketing examples must be regenerated/checked against any later released engine.

Source worktree: isolated `dealcooker-mainstream` worktree.
Branch: `fix/mainstream-step-01-airbnb-fees`, based on `59240cd7d9de0982f69ebd3ea0fdbc8df7a3d8ef`.
Raw local evidence is retained outside Git (engine/unit/ui/types/lint/build logs, fixture and screenshots).
Status: implemented and verified locally; not committed/pushed/deployed.
Next: Step 2, flip combined target feasibility. Stop until Dillon continues.
