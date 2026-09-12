# DealCooker: code, financial math, and mainstream usability review

## Verdict

DealCooker has a useful foundation and a meaningful differentiator: help a user understand how a property's economics change, not merely calculate a return. Do not rewrite it or add more strategies before fixing trust, first-use clarity, and calculation responsiveness. A mainstream experience should answer: What cash do I need? What will be left each month? What assumptions could make this fail? What price or terms meet my own goals?

## Scope and provenance

- Reviewed GitHub main `59240cd7d9de0982f69ebd3ea0fdbc8df7a3d8ef` (Calculator repository).
- Extracted immutable source into this temporary audit directory. Original project checkout remained clean and at its pre-existing local revision; only its remote-tracking information was refreshed. No product source was edited, committed, pushed, or deployed.
- Source coverage: all six strategy implementations, debt and investment math, recommendation searches, projection helpers, model defaults, readiness checks, primary UI and controls, report schema, storage normalization, analytics, and selected public API handlers.
- Live observation: www.dealcooker.app first-use tutorial, empty and populated long-term Build/Results, projections/comparison, settings, annual-income override behavior; 1440x1000 and 390x844 CSS viewports, plus a 320px settings spot check. Homepage also inspected at desktop width.
- Used an isolated anonymous Chrome profile and fictional deal inputs stored only in that browser. Blocked analytics request destinations during these captures. Did not sign in, send feedback/review requests, create public shares, or change cloud data.
- This is a targeted code and product audit, not a security certification or exhaustive verification of every strategy/modal/browser/theme. Production deployment SHA was not independently attested; source pin and live observations are stated separately. No production build was run.

## Financial and result-integrity findings

### 1. High — Airbnb platform fees omit cleaning revenue

**Source:** `lib/engine/strategy-modules.ts:836–850`.

In the normal nightly-rate path, gross revenue includes room and cleaning revenue, but platform fees apply only to room revenue. Airbnb's official service-fee description includes host-set fees in the fee base; the applicable host fee rate varies by fee structure/account.

**Isolated test:** 30 occupied nights at $100, ten three-night bookings, $150 cleaning charged and paid per booking, user-entered host fee 15.5%, no other costs.

- Booking revenue: $4,500/month.
- Engine fee: $465/month; subtotal-based fee: $697.50/month.
- Engine cash flow: $2,535/month; corrected fee-base cash flow: $2,302.50/month.
- Overstatement: $232.50/month, $2,790/year.

**Fix:** separate platform-fee base from management/reserve bases; apply host fees to the applicable booking subtotal. Explain host-only versus split-fee assumptions and preserve editable rates. Test normal and annual-revenue-override paths.

**Official evidence:** https://www.airbnb.com/help/article/1857

### 2. High — Flip Max Offer can ignore a requested impossible target

**Source:** `lib/engine/strategy-modules.ts:1472–1500`; consumer `app/page.tsx:1502–1519`.

The solver uses null both for disabled targets and impossible targets, filters nulls, then reports the remaining constraint's offer.

**Isolated test:** $150,000 exit, $10,000 rehab, cash purchase, no other costs, $200,000 requested profit and 20% ROI target.

- Profit-target offer: null, correctly impossible.
- ROI-target offer: approximately $115,000.
- Combined Max Offer: approximately $115,000, incorrectly presented despite the impossible profit requirement.

**Fix:** distinguish disabled, feasible and infeasible statuses. Any enabled infeasible constraint must make the combined result infeasible. Re-evaluate the final rounded offer against every enabled target.

### 3. Medium — Flip Max Offer can also reject a valid cash deal

**Same source:** `lib/engine/strategy-modules.ts:1472–1498`; ROI sentinel in `lib/engine/investment-math.ts:276–285`.

The search first evaluates price zero. With no rehab or other costs, contributed capital is zero and ROI is returned as numeric zero. The solver treats that as proof the target cannot be met anywhere.

**Isolated test:** cash flip, $150,000 exit, no costs, 20% ROI target. At $100,000 purchase the actual ROI is 50%, and the target-price boundary is $125,000. Engine Max Offer is null.

**Fix:** search only within a valid objective domain; distinguish undefined ROI from failed ROI. Use a positive-price witness and tests for zero-cost boundaries.

### 4. High usability — Valid annual revenue does not unlock results

**Source:** `app/page.tsx:1387–1431`; engine alternative accepted at `strategy-modules.ts:695–704`.

Live browser reproduction: $300,000 purchase; monthly gross rent blank/zero; annual revenue $36,000. The engine accepts the override, but the page says one strategy field is missing and continues to hide the verdict. Analogous readiness checks require ADR/weekly rate despite supported revenue alternatives.

**Fix:** shared strategy-specific validation must accept any complete supported income path. Distinguish omitted from legitimate zero values, including zero-interest and zero-down structures. Test rendered readiness, not only scalar engine output.

### 5. Medium — Tenant placement expense is entered but deliberately excluded

**Source:** `strategy-modules.ts:699–701,716–725,797–801`; input `components/dashboard/strategy-module-inputs.ts:198–202`.

Changing the placement fee from 0% to 100% with $3,000 rent produces an informational $3,000 expense line but leaves cash invested and ROI unchanged. The detailed line says FYI, but the normal input does not clearly tell a novice that this entered expense will be omitted from returns.

**Fix:** decide whether this is an actual cost or informational only. Prefer a dated initial leasing cost when applicable and a separate recurring turnover assumption. If intentionally excluded, disclose that at the input and in the main summary.

### 6. Medium, advanced financing — HELOC overfunding loses proceeds

**Source:** `lib/engine/finance.ts:119–129`; acquisition event `strategy-modules.ts:339–348`.

**Isolated test:** $100,000 cash purchase, $120,000 zero-interest IO HELOC, no other income/costs, $100,000 sale before maturity. The model clamps acquisition cash to zero, deducts $120,000 at sale, and reports a $20,000 loss without recognizing the original $20,000 excess loan proceeds.

**Fix:** distinguish credit limit from actual draw and either restrict the funded draw to modeled uses or book excess cash explicitly. Never discard one side of a financing cash-flow identity.

### 7. Medium — Missing BRRRR value disagrees with projection/payback

**Source:** `strategy-modules.ts:295–303,1140–1144`; `lib/projection-metrics.ts:242–264`.

With a $100,000 cash property, BRRRR-specific ARV missing and purchase ARV $100,000, the canonical engine uses zero sale proceeds and shows a $100,000 modeled loss. The projection helper instead uses $100,000 sale cash and reports one-month payback. This is incomplete-input behavior, not a fully specified-deal verdict, but both surfaces should be unavailable or consistent.

**Fix:** one valuation resolution contract plus a missing-input status, propagated to engine, projections, PDF, comparisons, and imported/shared scenarios.

### 8. Lower priority, imported/API edge — Turnaround exit before stabilization

**Source:** `strategy-modules.ts:479–498` and `lib/projection-metrics.ts:225–239`.

A six-month hold with $100,000 acquisition basis and $200,000 stabilized value produces $200,000 engine sale proceeds but $100,000 projection sale proceeds before the model's first-year stabilization date. The normal hold-year control clamps to at least one year, so this is chiefly an imported/programmatic boundary.

**Fix:** reject unsupported timing at the model boundary or model pre-stabilization exit consistently.

## Strong formulas verified

Seventeen independent numerical checks passed across all six strategies, including ordinary amortizing mortgage payment, LT NOI/cash flow/cap rate/CoC/ROI/sale, commercial operating revenue, STR nightly revenue, weekly room-rental annualization, six-month flip annualization, loan maturity without duplicate post-maturity service, debt-free owned mode with stale purchase financing, and BRRRR payoff of both amortizing primary and HELOC balances.

Example: $100,000 cash flip sold for $121,000 after six months correctly produces $21,000 profit and approximately 46.41% annualized IRR. BRRRR's tested six-month payoff correctly used remaining balances for both debts rather than original principal.

These checks support the ordinary cases, not a claim that every combination is financially certified.

## Product trust and usability

### Replace “works” with a decision tied to the user's target

**Sources:** `lib/engine/deal-workout.ts:30–33,73–85`; `components/dashboard/deal-workout-card.tsx:92–102`.

The default workable test is nonnegative cash flow and DSCR at least 1, or nonnegative flip profit. Live sample: $300,000 purchase and $3,000 rent produced $97.38 monthly cash flow, 1.75% CoC and DSCR 1.06, yet the page said “This strategy already works on current terms.” Another $100/month of costs makes cash flow negative. Positive cash flow is not the same as meeting an investor's return or safety requirements.

Use messages such as “Positive, but thin: about $97/month with these assumptions.” Show configurable cash-flow/return goals and downside checks. Distinguish meets target, near target, and misses target without pretending to predict investment success.

### First-use should produce value before teaching the interface

The fresh desktop tutorial opened on Quick Tour 1/9, explaining Deal Vault before the user had evaluated a property. The blank app also showed one saved New Deal. The sample deal exists but is buried in Settings.

Recommended flow:

1. Choose a plain-language goal: Rental / Vacation rental / Flip / More strategies.
2. Enter price, expected income, cash available/down payment and known expenses. Mark all supplied defaults as estimates.
3. Show a useful provisional result, then invite refinement.

Offer “Try a sample property” prominently. Keep the current detailed workspace as Advanced, not the required first encounter. Do not imply a listing link currently imports complete property/financial data; the inspected preview mainly extracts the deal name.

### Make visual output explain money

Keep the warm DealCooker identity and orange primary actions. Reduce layers of rounded cards, shadows, repeated strategy labels and ornamental framing. The app already has charts; more charts alone will not solve comprehension.

Prioritize:

- Income → vacancy → operating costs/reserves → mortgage → money left each month, with a labeled waterfall.
- Cash required now versus future contributions versus cash left after refinance.
- Conservative/base/optimistic scenarios, with visible editable assumptions, not invented probabilities.
- Separate operating income, loan paydown and appreciation in long-term returns.
- Labels that expose periods: “10-year total return,” “Annualized return,” and “Break-even if sold,” rather than unqualified ROI/IRR/Break-even.
- Strategy-specific headline metrics: monthly margin for rental, profit and maximum offer for flip, upfront funding and refi residual for BRRRR.

At 390px, the Results header/navigation consumed substantial height, Cash to Close visibly truncated, and the Projections strategy-selection panel occupied most of the opening screen before useful comparison results. Collapse controls by default and bring the result and next useful action higher. Preserve the working bottom navigation.

### Clarify definitions across screens

Live mobile Cap Rate helper says annual NOI/current property value, while the ordinary engine divides by acquisition basis. Live IRR helper says yearly cash-flow timeline, while current engine IRR uses dated monthly events. Cash-on-cash uses different denominators by strategy; BRRRR cash left after refinance is not total upfront funding. Correct visible labels and centralize their definitions with the metric contract.

## Code quality, performance and launch safety

### High — Unrestricted server-side listing fetch

**Sources:** `app/api/listing-preview/route.ts:8–32`; `lib/listing-link.ts:100–110`.

The handler accepts a user-supplied URL, follows redirects, and fetches it without an application-level public-destination restriction, explicit timeout or response-size cap. A local mocked-fetch test proved that a loopback destination reaches the fetch call and returns HTTP 200. No actual internal or production network request was sent. Hosting/network-layer restrictions were not audited; this establishes the application defect, not a demonstrated production exploit.

**Fix before broad launch:** allow approved listing sources where practical; otherwise enforce public destinations through DNS resolution and every redirect, block private/local/link-local targets, restrict protocols, and bound time, redirects and bytes. Add endpoint throttling. Review feedback and diagnostic endpoints for abuse controls; absence of an app-level limiter does not prove no hosting-level protection exists.

### Recommendation searches can block interaction

`DealWorkoutCard` calls the recommendation synchronously during render. Search loops repeatedly call `calculateDeal`, which computes every strategy, including nested flip searches and IRRs.

Measured local negative-rental recommendation: approximately 1.41–1.48 seconds per call. Ordinary full-deal calculations in the separate probe were about 12–18ms. This is a measured code-path cost, not a measured phone latency.

**Fix:** strategy-local lightweight objective evaluation, avoid IRR work in simple cash-flow/offer searches, memoize stable results, and cancel/defer obsolete calculations while typing. Consider a Web Worker after removing redundant work. Add a responsiveness regression for financially weak deals, not only defaults.

### Refactor high-risk boundaries instead of rewriting

- `app/page.tsx`: 7,285 lines.
- `app/globals.css`: 7,078 lines.
- `lib/engine/strategy-modules.ts`: 1,589 lines.

Separate deal state/sync, validation/readiness, first-use flow, result presentation, and strategy-specific engines incrementally. Consolidate cash-flow events, valuation and metric definitions so UI, exports and projections cannot independently reinterpret them. Preserve existing behavior with tests.

### Test evidence is useful but not a clean all-green gate

- Engine suite: 113 passed.
- Unit suite: 16 passed.
- First UI execution reported 103 passed, but the overall run hit the terminal timeout and subsequently logged a Node/tinypool teardown error.
- A separate UI rerun reported 101 passed and 2 failed: paid deal-review preview and feedback API configuration-error handling.
- `tsc --noEmit --incremental false`: three existing test-source errors (`deal-workout-layout.test.ts:18,32` and `ui.integration.test.tsx:387`).
- ESLint: zero errors, seven warnings, including Hook dependency warnings.
- Runtime here was Node 24; repository CI specifies Node 22. Reproduce the UI failures under the pinned supported runtime before diagnosing them as product defects or dismissing them as flakes.
- Existing dependency installation was reused; no fresh dependency audit, clean production build, live auth/sync test or RLS test was completed in this review.

## Mainstream rollout recommendation

Start with active residential rental buyers, small landlords and investor-friendly agents rather than trying to serve every real-estate audience equally. Keep other strategies available, but lead with one easy, repeatable property decision.

Suggested sequence:

1. **Trust release:** correct fee bases, target solver states, input readiness, projection consistency, metric wording and listing-fetch safety; stabilize tests.
2. **First-deal release:** guided basic flow, visible sample, compact mobile result, verified-versus-estimated inputs, reversible scenario changes.
3. **Decision release:** money waterfall, user goals, downside scenarios, comparable strategy results and a clear shareable summary.
4. **Observed adoption:** watch 20 real users analyze their own properties without coaching; fix the points where they hesitate before buying traffic.

Existing analytics already tracks opens, strategy selection, scenario operations, sharing and print. Add first valid analysis, assumption review, workout use and later meaningful return—not just visits or signups. Avoid logging entered financial amounts or private listing URLs. A useful proposed first-use goal is a comprehensible initial result in under two minutes; validate that with real users rather than treating it as an established capability.

Use shareable deal summaries and partner referrals as distribution. Preserve the current free/no-signup-to-start promise. Do not add more strategies, a large AI chat layer or paid acquisition until people reliably understand and reuse the core outcome.

## Suggested acceptance gates

- Every enabled offer target is satisfied by the final suggested price, or the app clearly reports no feasible result.
- Annual-income alternatives unlock the same results as their equivalent monthly/ADR/weekly inputs.
- Every modeled debt draw, contribution, maturity payment, refinance and sale reconciles across the dated ledger, headlines and reports.
- Entered material expenses either affect results or carry a visible exclusion notice beside the input.
- No blanket “works” claim for merely positive cash flow; the user's objective and assumptions remain visible.
- First mobile result and one clear next action are visible without navigating a full expert form.
- Local UI, standalone TypeScript, engine and production-build gates pass under the supported runtime before deployment.
