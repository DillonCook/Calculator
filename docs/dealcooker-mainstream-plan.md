# DealCooker mainstream implementation plan

## Authority and working agreement

Dillon now authorizes executing the remaining plan continuously, exercising judgment for safety and release decisions without repeated approvals. This is the canonical execution checklist; the preserved audit is [dealcooker-review-baseline.md](dealcooker-review-baseline.md). Baseline source: `59240cd7d9de0982f69ebd3ea0fdbc8df7a3d8ef`.

Working checkout: isolated `dealcooker-mainstream` worktree; the original checkout is preserved.
Current branch: `feat/mainstream-readiness`.
Current step: **Steps 1–27 implemented and verified locally; exact-SHA publication follows.**
This is a pre-release snapshot. Publication is recorded in the GitHub PR/deployment receipt rather than pre-checked here.
Next: **Release the verified candidate, then conduct the real-user pilot before broader promotion.**

- Work directly; no delegated agents.
- Execute coherent steps continuously; verify each and preserve checkpoints. Do not fabricate participant testing or growth outcomes.
- Keep detailed status/evidence here. Distinguish implemented, tested, committed, pushed and verified live.
- Implementation and judged-safe project releases are authorized. Avoid paid acquisition, unsolicited broad outreach, destructive data changes and invented financial assumptions. Real-user validation depends on real participants.
- Before changing ambiguous financial meaning or choosing a materially different visual direction, resolve the specific contract/design. Broad approval does not justify invented financial assumptions.
- Every financial change needs an independently derived regression that fails before the fix, plus downstream parity and appropriate full gates.
- Known pre-existing blockers remain recorded rather than silently included in another step. New dependency audit findings belong to Step 5; no automatic audit-fix/major upgrade.

## Ordered checklist

### 1. Airbnb platform-fee correction
- [x] Implemented
- [x] Verified (scoped local checks; repository-wide release blockers below remain)
- Release: not pushed / not deployed
- Acceptance: Fee applies to booking subtotal including charged cleaning; preserve separate management/reserve bases and editable rates. Test normal/override paths, downstream calculations and explanation.

### 2. Flip combined target feasibility
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Every enabled target must be feasible; final rounded offer must meet all targets.

### 3. Flip zero-cost search boundaries
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Valid positive-price cash deals must not fail because ROI at zero investment is undefined.

### 4. Listing-preview security and public endpoint abuse review
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Restrict destinations and redirects; bound protocols, DNS/IP access, time, bytes, and requests. Review feedback/diagnostic limits without exploiting production.

### 5. Supported-runtime and release-test reliability
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Pin supported Node; fix existing test typing, reproduce/stabilize UI failures, review fresh dependency audit findings; achieve engine/UI/type/lint/build gates without blind dependency upgrades.

### 6. Shared input readiness and override validation
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Annual income alternatives unlock results; legitimate zero-down/zero-rate structures and imported/shared inputs follow the same contract.

### 7. Tenant placement cost contract
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Model dated placement cost when applicable or explicitly disclose exclusion; decide recurrence without silently changing all strategies.

### 8. HELOC draw/proceeds reconciliation
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Distinguish actual funded draw from credit limit; account for or reject overfunding across acquisition, debt service, refinance and sale.

### 9. BRRRR valuation and missing-input parity
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Use one valuation/missing-input contract in engine, payback, comparison, export and share reload.

### 10. Turnaround stabilization timing
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Validate unsupported holds or consistently model sale before stabilization, including imported/API inputs.

### 11. Metric definitions, periods and consumer parity
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Unify cap-rate denominator, dated annualized IRR, CoC basis, total-return period, break-even-if-sold and reserve labels across all consumers.

### 12. User goals and honest result verdicts
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Replace blanket works claims with assumption-sensitive outcomes against user targets; expose thin margins and downside sensitivity.

### 13. Recommendation performance
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Use relevant-strategy objective functions, avoid nested irrelevant IRR/flip work, memoize/defer/cancel stale calculations; benchmark weak deals and typing.

### 14. Incremental code-boundary refactoring
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Separate state/sync, validation, first-use and result presentation; consolidate shared valuation/events without a rewrite and protect persistence/auth interactions.

### 15. Guided first-deal flow
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Plain-language goal -> minimal property/financing/income/expense inputs -> useful provisional result -> optional detail; retain advanced workbench.

### 16. Prominent sample and useful onboarding
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Make sample entry obvious, replace interface-first tutorial with first-result help; avoid presenting untouched placeholder as meaningful saved work.

### 17. Assumption provenance and defaults
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Clearly distinguish estimated/default and user-confirmed values; make missing costs visible; never claim complete listing import from name extraction.

### 18. Compact mobile result and navigation
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Reduce header/control space, fix clipped cash label, collapse projection selectors; preserve bottom navigation and visible next action at tested widths.

### 19. Visual hierarchy cleanup
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Preserve warm identity and orange actions while reducing nested panels, shadows, duplicate labels and competing controls; validate desktop/mobile themes/accessibility.

### 20. Monthly money waterfall
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Explain income, vacancy, operating expenses/reserves, debt service and remaining cash using actual engine values.

### 21. Capital timing visualization
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Separate upfront cash, future contributions and post-refinance residual; reconcile to dated ledger and exports.

### 22. Conservative/base/optimistic scenarios
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Use explicit editable assumptions, not invented probability; show reversible scenario comparisons.

### 23. Return driver visualization
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Separate operating cash, principal paydown and appreciation; reconcile growth/exit values and avoid implying paper appreciation is spendable income.

### 24. Strategy-specific headline results
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Rental monthly margin/cash required; flip profit/offer/hold exposure; BRRRR upfront funding/refi/capital left, with common definitions.

### 25. Reversible workout before-and-after
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Preserve original deal, explain price/equity/rent/financing tradeoffs supported by the model and allow undo/duplicate.

### 26. Clear shareable deal summary
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Readable assumptions/results/risk/period story across share, print and PDF; no premature recipient account wall, preserve privacy.

### 27. Activation and retention analytics
- [x] Implemented
- [x] Verified
- Release: not pushed / not deployed
- Acceptance: Track first valid analysis, assumption review, workout use and meaningful later returns; exclude financial values, private URLs and sample-only activity.

### 28. Observed first-user validation
- [ ] Implemented
- [ ] Verified
- Release: not pushed / not deployed
- Acceptance: Prepare and conduct 20 real-property sessions without coaching; measure comprehension/stalls/time-to-first-value; requires real participants and scheduling; execution is authorized but participation is not fabricated.

### 29. Focused mainstream distribution
- [ ] Implemented
- [ ] Verified
- Release: not pushed / not deployed
- Acceptance: Start rental buyers/small landlords/investor-friendly agents; use share summaries/partners, preserve free/no-signup entry; no broad paid acquisition or new strategies before evidence. Warm pilot preparation is authorized. No cold blasts or paid acquisition are part of this release; participant recruitment and observed usage remain external dependencies.

## Step 1 execution ledger (historical snapshot; superseded by the continuation ledger below)

- Scope: Airbnb platform fee base and explanation only, required regression expectations, downstream parity. No unrelated financial fixes or redesign.
- Preserve current user-entered/default host fee percentages, maintenance/CapEx/management calculation semantics, and existing annual-total override behavior.
- Official reference: https://www.airbnb.com/help/article/1857 (host service fee includes nightly price and host-set charges; host-only versus split structure changes rate, not this base).
- Audit reproduction: $3,000 room revenue + $1,500 cleaning revenue, $1,500 cleaning expense, 15.5% fee. Expected fee $697.50; expected cash flow $2,302.50 before other costs.
- Verification: RED regression observed fee -$465 instead of -$697.50 before correction; after correction, full engine suite 118/118, unit suite 16/16 and final full UI suite 105/105 passed on Node 22.23.2. Production build passed. ESLint zero errors/seven existing warnings. `git diff --check` passed.
- Local built-app verification: desktop 1440x1000 shows $2,302.50 monthly cash flow (formatter displays $2,302.5); new fee explanation readable/contained at desktop and 390x844 mobile. No cloud writes or real sends.
- Downstream tests cover annual override without double counting, split/host-only rates, unchanged management/reserves, zero occupancy/fees, projection profit, BRRRR operating income, PDF work rows and saved-scenario reload.
- Existing three test-source TypeScript errors remain: `test/deal-workout-layout.test.ts:18,32`; `test/ui.integration.test.tsx:387`. No new standalone type errors. Step 5 owns these blockers.
- Fresh dependency audit: 12 advisories (one critical Next.js, six high, four moderate, one low). Detailed advisory applicability and upgrades belong to Step 5; no dependency versions or lockfile changed.
- First full UI run had one existing-style lightbox timeout; targeted replay and final full rerun passed. Do not claim the historic flakiness is fixed; Step 5 retains that work.
- Before a later public release, regenerate engine-backed landing examples using the release candidate and verify their STR/BRRRR numbers; no marketing deployment occurred here.
- Step 1 release state: not committed, not pushed, not deployed. Later roadmap items remain unimplemented.

## Phase release gates

Trust changes precede broad promotion. No step completion certifies later steps. Before production release: supported-runtime tests, standalone types, lint, production build, exact diff/security review, and affected desktop/mobile behavior must be evaluated; existing blockers must be resolved or explicitly accepted. Production verification follows any authorized deployment.

## Coverage map

Audit financial findings 1–8 -> steps 1, 2, 3, 6, 7, 8, 9, 10.
Trust/definitions -> steps 11–12. Security/performance/code/tests -> steps 4–5 and 13–14.
First-use -> steps 15–17. Mobile/visual recommendations -> steps 18–24.
Reversible changes/sharing -> steps 25–26. Analytics, real-user validation and distribution -> steps 27–29.


## Continuation execution ledger

- Steps 1–27 are implemented and verified. The final canonical Node 22 run passed 278 tests, types, lint and build; the six populated report paths then passed production-build browser inspection.
- Financial regression files cover combined targets, cent-safe offer presentation, zero-investment and zero-interest HELOC-funded offer intervals, excess draw cash at acquisition/refinance/sale, missing BRRRR ARV, turnaround timing, sensitivity fallback values and estimated costs, future operating contributions, and cash needed at sale.
- The largest late offer-search probe used a $100,000 zero-interest HELOC and a $200,000 exit. A 25% ROI target permits a $180,000 purchase, but the former zero-investment endpoint returned no offer. The corrected fixture was run red/green, including the endpoint's actual ROI.
- Financial objectives now evaluate the requested strategy without unrelated flip/IRR work. The measured weak-rental benchmark improved from roughly 3.2 seconds to below 0.1 seconds on the local machine; this is a scoped benchmark, not a universal latency claim.
- New first-use and decision components preserve the advanced workbench, saved-deal queue and auth/storage isolation. Decimal down payments, quoted fractional interest rates and cents in costs have native-form regressions.
- Placeholder labeling exposed old vault-count expectations. Multiple-record counts remain visible; only the untouched first placeholder is labeled a draft. The first-placeholder test now asserts that intentional product contract rather than calling it an analyzed deal.
- New summaries distinguish provisional/author-reviewed inputs, include user goals, monthly money, upfront/future/refinance cash, downside comparisons, return drivers, and non-destructive workout undo. Print and PDF summaries use the same engine-derived values.
- Listing previews no longer fetch any user-provided destination. Feedback, deal-review, diagnostic and analytics endpoints have origin/body/time/rate backstops. The rate limiter is per instance, not a claim of distributed DDoS protection. Vercel's documented edge IP header is used only on Vercel.
- Public/imported financial payloads reject explicit wrong types, nonfinite values and unbounded hold/loan ranges. Existing persisted records are not rewritten or deleted by this boundary.
- Node 22 is declared in the app and both CI/deployment lanes. Next and affected transitive dependencies were deliberately updated; a clean Node 22 install was exercised. Production dependency audit currently reports zero advisories. Two moderate Vitest development-tool advisories remain; no Vitest development server is exposed by this app, and a forced major upgrade was not bundled into the release.
- Seven existing lint warnings remain, with no new lint errors. Prior raw test/TypeScript failures and intermediate regressions are not concealed by later targeted passes; final full-suite output is the release gate.
- The landing generator was rebuilt from corrected engine inputs. Public methodology explains STR cleaning-fee treatment, leasing-cost exclusion and HELOC/BRRRR cash meaning. Substantive dates were changed only on the affected pages, and the nine-page audit retains explicit date assertions.
- Steps 28–29: the pilot protocol, 20 unfilled participant slots and unsent launch drafts are prepared in `dealcooker-user-validation.md`, `dealcooker-user-validation.csv`, and `dealcooker-launch-kit.md`. There are no invented participants, testimonials, activation statistics or retention results. Broad promotion remains gated on real observations.
- No delegated implementation or reviewer agents were used. Verification consists of direct source/diff review, independently specified regression cases, automated suites and real browser inspection; it is not represented as an independent third-party audit.

- Final print verification also corrected an existing SSR/client mismatch in report actions. The first-render regression went red/green; six populated production-build reports then loaded without JavaScript exceptions. The printed sample's first page contains the decision and money explanation.
