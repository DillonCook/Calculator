# First-user validation

Status: prepared, not conducted. There are no recruited participants or measured user outcomes in this document. Automated QA is not user research.

## Who to recruit

Target 20 people: 8 prospective rental buyers, 8 small landlords and 4 investor-friendly agents. These are recruitment targets, not completed interviews. Use volunteers and warm, relevant introductions. Do not upload contacts, cold-message a list or buy traffic for this test.

## Session

Ask the participant to bring one property they are genuinely considering and any costs they already know. Explain that the calculation is provisional and they should not use the session as investment advice. Get consent before recording. Keep names, contact information, recordings and actual property inputs outside Git and public analytics.

Use the same release commit for the measured cohort. Start on a clean browser, not an already populated example. Let the participant work without pointing to controls or explaining financial terms. If they need coaching, record that as a stall before helping.

Tasks:
1. Choose the intended use and enter the property.
2. Explain the provisional result in their own words.
3. Identify money needed at the start and money left each month.
4. Identify two costs or assumptions still needing confirmation.
5. Try a conservative scenario and explain what changed.
6. Find what would have to improve, test a supported adjustment, and undo it.
7. Save or share the result, then reopen it without signing in on the recipient side.

Ask afterward: What did you think was verified? Was there any number you treated as guaranteed? What would you do next with this property? Would you use this for a second property without help?

## Record

Use `dealcooker-user-validation.csv` for anonymous participant IDs, device, release SHA, start/end times, completion, stalls and comprehension scores. Blank rows are unfilled slots, not invented observations. Do not enter the property address or financial details in this repository.

Record first-result time, unassisted completion, correct monthly-cash interpretation, correct upfront-cash interpretation, recognition of estimated inputs, successful downside comparison, successful reopen, and whether a second property is analyzed later. Record failures, not only compliments.

## Go/no-go rules for this pilot

These are chosen product gates, not claimed industry benchmarks:
- At least 16 of 20 finish a first analysis without coaching.
- At least 16 of 20 correctly distinguish monthly cash, upfront funding and paper equity.
- At least 16 of 20 can identify unverified assumptions and interpret the downside view.
- No participant should mistake a modeled return for a guarantee. Any recurring misunderstanding of fees, cash needed, reserves or borrowing is a release blocker for broad promotion.
- Fix recurring stalls before increasing distribution. If a material fix changes the flow mid-cohort, keep results separated by commit and do not claim that the new build inherited earlier validation.

## Analytics boundaries

The new milestones measure meaningful analyses, saves, later valid deals, assumption review, stress comparisons and workout use. Local, preview, QA and shared-link entry traffic are excluded from these milestones, as are samples and incomplete properties. Product-event properties contain only the strategy enum. Financial values, property names and private URLs are not product-event properties.

First/second analysis and return markers are device-local proxies, not a verified count of unique people or accounts. The existing analytics service can still associate events with its existing anonymous/session/auth identity. Do not claim measured activation or retention until production records contain real eligible usage.
