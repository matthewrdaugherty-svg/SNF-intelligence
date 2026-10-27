# VALIDATION REPORT 03 — Web app (independent red team)

Date: 2026-10-26 · Validator: red-team agent (did not build the app) · Build tested: local production build (`npm run build` → `vite preview :4173`), same code as https://snf-intelligence.vercel.app (live site not reachable from the sandbox).
Source of truth: `db/snf.duckdb` (opened read-only). No app source files were modified. All red-team scripts live in `app/tests/redteam/` (run with `npx playwright test -c tests/redteam/redteam.config.ts`; they use the `*.redteam.ts` suffix, so the builder's suite does not pick them up). Raw outputs: `app/tests/redteam/out/`. Screenshots: `app/tests/screenshots/redteam-*.png`.

## VERDICT: FAIL. Do not share the link until fixes 1–6 are made.

The numbers the app takes from the database are correct. I made 1,673 value checks on 8 facility pages and found **0 numeric mismatches**. Every Explore count I tested matched DuckDB (the only exception is the `%`/`_` wildcard edge case). All the Flows arithmetic matched a pure-Python recompute.

The app still fails, for two reasons:
1. **Anyone can craft a link that changes the ratings and names the app shows** (SQL injection through `?sort=`). This is demonstrated below.
2. **Normal-speed typing in the search box silently drops letters**, so the user gets the wrong facility count (for example 0 instead of 41).

The owner's rule is zero tolerance for wrong numbers, and the plan is to share the app by link (D-015). Both of these break that rule.

---

## Ranked required fixes

| # | Sev | Finding | Evidence |
|---|---|---|---|
| 1 | **CRITICAL** | **SQL injection through the `sort` URL parameter.** The value goes straight into `ORDER BY`. DuckDB-wasm runs multi-statement strings, so a shared link can run `UPDATE` on the in-browser tables for the rest of the session. | `app/src/pages/Explore.tsx:27` takes `params.get('sort')` unvalidated, and `:19–21` interpolates it. Payload: `?q=215085&sort=provider_name; UPDATE facility_master SET overall_rating = 5, provider_name = 'TAMPERED VIA LINK' WHERE ccn = '215085'; SELECT 1 AS provider_name, 1 AS x ORDER BY x`. After in-app navigation, Explore shows **"Tampered Via Link · 5★"**. The truth for 215085 is Carroll Park Healthcare, 2★. Screenshot: `redteam-explore-after-sort-injection.png`. **Fix:** whitelist `sort.key` against `BASE_COLS ∪ TABLE_COLS ∪ {distance_mi}`, whitelist `dir`, and reject any SQL containing `;`. Ideally use prepared statements. |
| 2 | **HIGH** | **The search, county and beds inputs drop keystrokes**, which gives wrong results. The inputs are controlled by the URL. `set()` spreads a stale `f` from the closure, and `setSearchParams` updates asynchronously. | `components/FilterPanel.tsx:19, 42, 88, 94`. Typing "baltimore" at 60 ms per key left **"bltimore" → 0 facilities**. At 15 ms it left "baliore" → 0. At 0 ms it left "e" → 14,605. At 150 ms it was correct (41). See `out/typing_*.json`. **Fix:** keep local input state, debounce the URL write, and build the next filters from the latest params (a functional update). |
| 3 | **HIGH** | **The unlayered CSS rule `button, input, select { font: inherit; color: inherit; }` overrides every Tailwind utility on buttons and inputs.** Tailwind v4 utilities sit in `@layer utilities`, and unlayered CSS beats them. | `app/src/index.css:34`. The selected state chip renders **text rgb(21,34,30) on background rgb(21,34,30)**, so its label is invisible (`redteam-selected-state-chip.png`, and MD in `redteam-ux-explore-1440.png`). Every `text-xs`/`text-[11px]`/`font-semibold` on buttons computes to 16 px/400. As a result: the active sort header looks the same as the others, column headers are cut mid-word ("Rehospital % (QM…", "Readmissi % (QRP…"), and the state chips and "Remove" buttons are oversized. See `out/styles.json`. **Fix:** wrap the rule in `@layer base`. |
| 4 | **HIGH** | **"Better/worse than state" text that contradicts the numbers next to it.** (a) When the difference rounds to zero, the page still says better or worse. (b) Count averages are rounded to whole numbers. (c) Differences between percentages are percentage points but are labeled "%". | `pages/Facility.tsx:28–35` (Delta) and `:54`. Cases found: **215085 Fines: "State 1 · Nation 1 / 0 worse than state"** (the state average is 0.6). **435092 Administrators: "0 … 1 better than state"** (the state average is 0.3). **QM 409 "0.0% better than state" on 6 of 8 facilities.** 675879 PT hours "0.00 worse". **215085 QM 430: 34.3% vs 79.1% shown as "44.8% worse"** (44.8 points, which is 57% worse in relative terms). 15 such cases are listed in `out/compare_facility.txt`. **Fix:** show averages for counts to 1 decimal place, label percentage differences "pts", and say "about the same" when the difference is below the display precision. |
| 5 | **HIGH** | **The same state average appears as two different numbers on one page.** The top card shows "state avg 3.5". The Star-ratings section shows the same value formatted as stars: "State 4★". | `pages/Facility.tsx:129` vs `:54` (`fmt(st,'stars')` rounds). Seen on 435092 (staffing: card 3.5, row "State 4★") and on 215085 (card 3.2, row "State 3★"). |
| 6 | **MED-HIGH** | **Gaps in the Flows upload validation.** | `pages/Flows.tsx:26–31`: (a) a **blank `n_discharges` is accepted as 0** (Number('')=0). In `flows/b_edge.csv` line 8 (215013) this produced "7 facilities" where it should be 6. (b) `1e2`→100 and `0x10`→16 are accepted (`c4`). (c) A `period_end` earlier than `period_start` is accepted (`c2` line 8). (d) **`2025-13-45` passes the regex, then the INSERT throws.** The UI says "2 valid rows, 1 hospital" but loads nothing, including the good row. The uncaught pageerror is "Conversion Error: date field value out of range" (`redteam-flows-c3_impossible_date.png`). (e) Uploading an invalid file after a valid one leaves the **old file in localStorage**, and it silently comes back on reload (`out/flows.json` → `bad_after_good_reload`; `:75`). (f) A missing-column error is reported as "1 row skipped" (`:147`). |
| 7 | MED | **Blank values with no reason given.** This breaks Operating Rule 1.3 ("carry the footnote code alongside the value in every output"). | (a) The VBP section is blank with no footnote and no "not in VBP" note for 15A011 and 435092 (8 rows each). (b) **The Explore CSV export drops every footnote code**: 235324's suppressed QM 521 exports as an empty cell with no code (`out/suppressed.csv`, `Explore.tsx:50–53`). (c) Blanks in the Flows destination and alternatives tables carry no footnote. |
| 8 | MED | **The color rules are broken in 6 places** (teal = star rating only; rust = enforcement/harm only). | Teal is used for "better than state" text (`Facility.tsx:34`), the logo (`Shell.tsx:20`) and the loading bar (`ui.tsx:59`). Rust is used for the geocode error messages (`FilterPanel.tsx:49–50`), "rows skipped" (`Flows.tsx:147`) and "not in CMS file" (`Flows.tsx:197`). |
| 9 | MED | **There is no layout for phones or narrow screens.** | At 390 px, **every page scrolls sideways** (scrollWidth about 671 vs 390): the nav and data date run off-screen, the facility cards squeeze "state avg" into broken pieces, and the Explore filter panel takes about 65% of the width. See `redteam-ux-*-390.png` and `out/ux_overflow.json`. At 1024 px, the Compare columns overflow, and on the Map the "basemap unavailable" notice covers the zoom control (`redteam-ux-map-1024.png`). |
| 10 | MED | **Text contrast is below WCAG AA.** | `ink-3 #7b8784` on white is 3.72:1 and on paper 3.37:1. It is used for all 11 px secondary text: CCN lines, footnote markers, notes, "state avg". White on `q4` (4★ chips) is 4.0:1. Rust on rust-soft (SFF/Abuse flags) is 3.99:1. The Flows 1–2★ bar (`q1`) on white is 1.32:1, so it is effectively invisible (`redteam-flows-a-1440.png`). |
| 11 | MED | **A failed reference file degrades the page silently.** | With `footnotes.json` missing, the facility page renders with **no state or nation comparisons, no footnote meanings, and the footer reads "Data as of ."**, and no error appears (`ui.tsx` `useReference` catches the error to null; `out/missing_footnotes.json.txt`, `redteam-missing-footnotes.json.png`). With a missing `.arrow`, the loading screen does appear (good), but in the local preview it says "Expected to read 1868833084 metadata bytes", because the SPA fallback returns 200. On Vercel the `data/` path is excluded from the rewrite, so the 404 message would be clear. Files were renamed in `dist/` and restored. |
| 12 | LOW-MED | **Invalid URL parameters show raw SQL errors to the user.** | `?own=foo` → "Parser Error … WHERE ()" (`filters.ts:64`; `redteam-explore-invalid-own.png`). `?mi=Infinity` → Binder error. `?stars=0,6,9` is silently ignored and all 14,690 rows are shown. |
| 13 | LOW-MED | **Accessibility gaps.** | `DataTable.tsx:42` uses role=table but has no `columnheader`/`cell` roles. `aria-sort` sits on a `<button>`, where it is invalid (`:35`). Footnote meanings are only in `title` tooltips, which keyboard and screen-reader users cannot reach: the focus walk never lands on a footnote (`out/ux_focus.json`). The column-picker dialog does not close on Escape (`pickerClosesOnEscape: false`) and has no focus trap. There are 53 state-chip tab stops before the results, with no skip link. Focus rings themselves are visible (2 px solid outline). |
| 14 | LOW | **Polish issues on the facility page.** | `Promise.all` has no `.catch`, so a failed query leaves the page on "Loading…" forever (`Facility.tsx:75–80`). On a CCN change, the previous facility stays on screen. `"{county} County"` gives "Baltimore City County" (159 facilities named "… City") and labels Louisiana parishes "County" (265 facilities). `titleCase` gives "8Th Street Se" (435092) and "Hh Holdings, Inc.." (double period). Ownership shows only the ownership-interest, managerial-control and partnership roles. It leaves out officers, directors, managing employees and mortgage/security interest (for example 245600 hides 49 entries), so the heading should say so. |
| 15 | LOW | **The trust text overclaims.** | "filters and searches never leave your machine" (`About.tsx:27`) and "Nothing is sent anywhere" (`ui.tsx:61`) are not true: the place box sends the typed address to nominatim.openstreetmap.org. Uploaded discharge CSVs also stay in localStorage indefinitely, which is worth stating plainly in case anyone uploads patient-level rows. |
| 16 | LOW | Minor issues. | LIKE wildcards are not escaped: searching for `%` or `_` matches all 14,690 (expected 0). VBP turnover shows as the fraction 0.5804 next to staffing turnover 49.4% on the same page, so the units are inconsistent. The four Flows share cards can add to 101% (10+19+66+6). The per-row "Track" has no common scale, and when the facility value is suppressed it shows a lone nation mark that conveys nothing. The CSV keeps leading zeros (good), but Excel will strip them when it opens the file. |

---

## 1. Data correctness (Facility page vs DuckDB)

**Sample:** seed `20261026` (`app/tests/redteam/pick_facilities.py`), 8 facilities:

| CCN | Why picked | Name |
|---|---|---|
| 215085 | Maryland, with penalties | Carroll Park Healthcare |
| 215353 | Maryland | Ingleside at King Farm |
| 15A011 | Medicaid-only (CCN with letters) | Especially Kidz Health & Rehab, IN |
| 675879 | Special Focus Facility | Terrell Healthcare Center, TX |
| 155383 | Suppressed QM 521 (with footnote) | Washington Healthcare Center, IN |
| 435092 | Not in VBP | Highmore Health, SD |
| 245600 | Random | Good Samaritan Society – Blackduck, MN |
| 335216 | Random with G–L citations | Avon Nursing Home LLC, NY |

**Method:** `facility_dump.redteam.ts` read every rendered value: header, flags, 4 rating cards, all 70 measure rows (value, footnote, state, nation, the better/worse text, CMS comparative-performance text, eligible stays), the penalties table, the G–L citations, and ownership. `compare_facility.py` re-implemented the formatting independently (en-US, half-up on the shortest decimal form, which is how the browser's number formatter rounds) and compared everything against `facility_master`, `penalties`, `health_citations` (G–L), `ownership`, `state_averages`, `qrp_national` and `vbp_aggregate`.

**Result:** 1,673 checks, **0 numeric mismatches**.
- Every rating, staffing, QM, QRP, VBP and enforcement value matched, including the footnotes on suppressed values: fn 9, fn 10, fn 18 (SFF), fn 2, and the text footnote "Case minimum not met – not reported".
- The penalties lists matched row by row. Their count equals `pen_n_fines + pen_n_payment_denials`, and the sum of fine amounts equals `pen_total_fines_usd` for all 8.
- The G–L citation lists match `health_citations` and equal both `hc_n_severity_G_or_worse` and `hc_n_actual_harm_GHI + hc_n_immediate_jeopardy_JKL`. The one difference flagged was a double space in a CMS description, which the browser collapses.
- The ownership entries shown all match.

The 4 apparent rounding mismatches in my first run were my error: I rounded on the exact binary double instead of the CMS text value.

**Display problems (not data errors):** findings 4, 5, 7 and 14 above. The full list is in `out/compare_facility.txt`.

**Direction table (`lib/measures.ts`):** I reviewed all measures, and every direction is defensible:
- Readmissions, ED visits, infections, falls, ulcers, antipsychotics, deficiencies, fines, turnover, MSPB and VBP rank: lower is better.
- Discharge to community, function, medication reconciliation, vaccines, staffing hours and the VBP score/multiplier: higher is better.
- Case-mix: no direction.

Two are judgment calls and should be labeled as such:
- "Administrators who left: lower is better" (the count depends on facility size and history).
- "PT hours: higher is better" (therapy intensity is not clearly better).

The state/nation arithmetic uses the correct `state_averages` column for every measure that has one. The national QRP figures come from `qrp_national` and the VBP figures from `vbp_aggregate`. The labels note that QRP 004 is the unadjusted national figure and QRP 005 the observed one.

## 2. Explore query logic

- I tested 30 URL scenarios: each filter alone, combinations of state, stars, ownership, beds, radius, name search and flags, an apostrophe search, the injection string, wildcards, and invalid parameters (`explore_counts.redteam.ts`). I compared them against hand-written DuckDB SQL (`expected_counts.py`). **28/28 valid scenarios match.** The only differences are the `%` and `_` searches, which match everything (finding 16).
- A UI click path (CA, 4★, 5★, Non profit, beds 50–120) gave 1,165 → 510 → 84 → 45, and all four steps match DuckDB.
- **Haversine:** Python vs DuckDB/app for 215085, 215340 and 215353 match to 4 decimal places (3.4550, 5.2238, 32.8893 mi). The 5 distances on screen in the radius CSV match Python to 1 decimal place.
- **Sorting:** NULLS LAST holds in both directions. The MD sort by QM 521 (asc and desc) had 211 values followed by 10 blanks, and the exported order is identical to DuckDB's `ORDER BY … NULLS LAST, provider_name`.
- **CSV export:** the headers are the full plain-English labels. Suppressed values are blank, but **without footnote codes** (finding 7). Leading zeros are preserved: PR ZIPs 00910, 00928, 00693, and CCN 15A011. Values are exported at full precision.
- **Column picker:** the choice persists across reload (`snf.explore.cols` in localStorage). It does not close on Escape.
- **Safety:** `sqlStr` escaping holds. Searching `x'; DROP TABLE facility_master; --` returns 0 and the table is intact (14,690 afterwards). **The `sort` parameter is not protected** (finding 1).
- **Stale results:** the `live` flag prevents older queries from overwriting newer ones. Rapid state toggles (TX, CA, NY, TX, FL, CA) ended on the correct set, FL+NY = 1,287. The typing bug (finding 2) is lost keystrokes, not stale results.

## 3. Discharge flows

Test files are in `app/tests/redteam/flows/`, the runner is `flows.redteam.ts`, and the recompute is `flows_check.py`.

**(a) Well-formed file** (2 hospitals, 12 real CCNs): the quality mix, total, facility count, unmatched bucket and the 4 volume-weighted averages all match the Python recompute for Johns Hopkins (210009) and LAC+USC (050600). For example, stars 2.09 (exact 2.0855), QM 521 20.2%, QRP 004 11.3%, QRP 005 49.3%. Nearby 4–5★ alternatives were checked at 15 mi (32 facilities, 3,381 beds, average 18.9%) and 5 mi (9 facilities, 1,055 beds; LAC 12 facilities, 992 beds). The count, beds, simple average, every distance and every "already a destination" flag match a haversine recompute that applies the stated exclusions (SFF, abuse icon).

**(b) Edge cases:** all handled correctly except the blank count (finding 6a):
- duplicate rows summed (10+15=25)
- zero counts
- lowercase `15a011` → matched
- unmatched `999999`/`21Z999` → 10 discharges in the "unmatched" bucket (21%)
- CRLF line endings, a UTF-8 BOM, header case and padding variants, an extra column, a quoted comma in a name, and padded values

**(c) Malformed files:** a missing column is rejected with a clear message. MM/DD/YYYY dates, negative counts, `2.5`, `abc` and a 5-digit CCN are rejected with line-numbered messages. The remaining gaps are listed in finding 6.

**Persistence:** a reload restores the data ("previous upload (this browser)"), and every number is identical. **Remove uploaded data** clears the UI and the `snf.flows.csv` key, and that was verified after a further reload.

## 4. UX audit

Screenshots: `redteam-ux-{explore,facility,map,compare,flows,about}-{1440,1024,390}.png`, `redteam-flows-*.png`, `redteam-facility-<ccn>.png` (full page), `redteam-focus-*.png`, `redteam-missing-*.png`.

Findings 3, 8, 9, 10, 11 and 13 cover this. Other observations:
- At 1440 the layout is calm, aligned and text-first.
- The loading gate shows step-by-step progress and respects reduced motion.
- The empty states exist (no results, no compare, no flows), but the query-error state shows raw SQL.
- The ownership type is shown raw ("For profit - Limited Liability company") on the facility page but shortened ("For profit · LLC") in the table, so the two are inconsistent.

## 5. Code review

- **SQL injection:** `sqlStr` is safe. **The `ORDER BY` sort key is not** (finding 1). Every other interpolated value is numeric or validated by a regex.
- **Stale closures:** `FilterPanel.set` and `Explore.onFilters`/`onSort` build from the params captured at render time (finding 2).
- **Races:** Explore, Facility, Compare, Map and the Flows summary all guard with `live`. The Flows hospital-list effect has no guard, and `clearAll()` does not await `loadIntoDb([])`. Both are minor.
- **Memory:** each `.arrow` and `.json` is fetched **exactly once** across 7 in-app route changes (`out/ux_requests.json`). `getDb()` is a singleton, so there are no duplicate inserts.
- **localStorage:** every read and write is in try/catch (`compare.ts`, `Explore.tsx:13,42`, `Flows.tsx:68,75,77`). The Flows restore path's `loadIntoDb(...)` rejection is outside the try, so it would be an unhandled promise.
- **Accessibility:** see finding 13. The Map popup uses `setHTML` with CMS names that are not escaped. That is low risk, but they should be escaped.
- The builder's 9 e2e tests still pass on this build.

## Files added by this review
`app/tests/redteam/`:
- `redteam.config.ts`
- `pick_facilities.py`
- `facility_dump.redteam.ts`, `compare_facility.py`
- `scenarios.json`, `explore_counts.redteam.ts`, `expected_counts.py`
- `explore_ui.redteam.ts`, `explore_race.redteam.ts`
- `flows/*.csv`, `flows.redteam.ts`, `flows_check.py`
- `ux.redteam.ts`, `styles.redteam.ts`, `missing.redteam.ts`
- `out/` (all raw results)
