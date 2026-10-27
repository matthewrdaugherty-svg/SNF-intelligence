# VALIDATION REPORT 04 — Web app v1.1 re-validation (independent red team)

Date: 2026-10-26 · Validator: red-team agent (did not build the app) · Build: commit c99296a (app v1.1), rebuilt locally (`npm run build`, `vite preview :4173`). Source of truth: `db/snf.duckdb` (read-only). No app source files were modified.

Scripts are in `app/tests/redteam/`. Selectors were updated for the v1.1 layout. These scripts are new this round: `flows_race.redteam.ts`, `semi.redteam.ts`, `upload_focus.redteam.ts`.
- Raw outputs: `app/tests/redteam/out/` (the round-3 outputs are kept in `out_r3/`).
- Screenshots: `app/tests/screenshots/redteam-*.png` (the round-4 ones overwrite the round-3 ones of the same name).

## VERDICT: PASS WITH FIXES

All 16 findings from Report 03 are fixed except one, which is only partly fixed: 6e, an old upload coming back after a failed one. No data has regressed. Fix A and fix B below before deploying, and get the builder's own test suite fully passing first: **13 of 14 tests pass; test 13 fails, and it fails because of a real defect (fix A).**

## Re-checks

| # | Finding in Report 03 | Status in v1.1 | Evidence |
|---|---|---|---|
| 1 | Injection through `?sort=` | **Fixed** | The same payload, followed by in-app navigation, still shows Carroll Park Healthcare, 2★ (`out/explore_ui.json`). A `;` in a search is stripped (`filters.ts:23`). `db.ts:48` refuses any multi-statement SQL. |
| 2 | Keystrokes lost when typing fast | **Fixed** | "baltimore" typed at 0, 15, 60 and 150 ms per key keeps the text intact every time and shows 41. Rapid state toggles show FL+NY = 1,287, which is correct. |
| — | Correction asked about: "baltimore" count | **41 is correct for all states; 40 is correct for MD only** | My test did not filter by state. DuckDB gives 41 across all states. The extra facility is 365387 Briar Hill Health Campus in North Baltimore, OH. With `state='MD'` the count is 40. Both counts are right. |
| 3 | CSS overriding buttons and inputs | **Fixed** | The selected state chip is now white on ink at 11 px/600. The column headers are 12 px (`out/styles.json`). |
| 4 | Better/worse text contradicting the numbers | **Fixed** | 215085 now reads "Fines 0.4 worse", "QM 430 44.8 pts worse" and "QM 409 about the same as state". No "0 better/worse" text appears on any of the 8 facilities. |
| 5 | State average shown two ways | **Fixed** | 435092 staffing shows "state avg 3.5" on the card and "State avg 3.5" in the row. |
| 6 | Flows validation | **Fixed except 6e** | Blank counts, `1e2`, `0x10`, `2025-13-45`, reversed periods and 5-digit CCNs are all rejected with line numbers. A missing column now says "not loaded". With a gap of 100 ms or more between uploads, the bad file correctly clears storage. **With no gap, the old file comes back (fix A).** |
| 7 | Blanks with no reason | **Mostly fixed** | The VBP not-in-program note appears for 15A011 and 435092. The CSV now has a "— CMS footnote" column after each footnoted value: 36 of 36 PR values and footnotes match the DB. **Star-rating columns still export blank with no footnote (fix C).** |
| 8 | Color rules | **Fixed** | Teal is used only on ratings and star tiers, and rust only on SFF, abuse and severity. **The map still hard-codes the old palette (fix E).** |
| 9 | Phone layout | **Fixed** | At 390 px no page scrolls sideways (scrollWidth = 390 on all 6 pages). The nav scrolls inside itself. |
| 10 | Contrast | **Fixed for text** | ink-3 is 5.06:1 on white and 4.58:1 on paper. White on q4 is 5.10:1. Rust on rust-soft is 5.22:1. Remaining gaps: ink-3 on well (the "–" unrated chip) is 4.29:1, and the 1–2★ bar (q2) on its track is 1.48:1. The bar has a number label next to it, so it is minor. |
| 11 | Silent failure when reference data is missing | **Fixed** | With `footnotes.json` removed, a visible notice explains the problem. With a missing `.arrow` in local preview, the message is still cryptic (expected, because Vercel returns a real 404 for that path). Both files were restored. |
| 12 | Raw SQL errors for bad URL parameters | **Fixed** | `?own=foo` and `?mi=Infinity` are ignored, and the page shows 14,690 with no error. |
| 13 | Accessibility | **Fixed** | Column headers and cells have their roles, and `aria-sort` sits on the column header. Footnotes can be reached with Tab and carry an `aria-label`. Escape closes the column picker. **New: the Upload CSV control has no visible focus ring (fix D).** |
| 14 | Facility page polish | **Fixed** | It now reads "Baltimore City", and Louisiana uses "Parish". The address shows "8th Street". The ownership note says which roles are left out. A failed load is caught and shown. |
| 15 | Trust text | **Fixed** | The About page names Nominatim and OpenFreeMap and says that uploads are kept in browser storage. |
| 16 | Minor issues | **Fixed** | `%` and `_` searches return 0. VBP rates show as % with a note. The four shares now add to exactly 100 (10/19/66/5). The track is hidden when the facility value is suppressed. |

## No regressions in the data
- **Facility pages:** 8 CCNs (215085, 215353, 15A011, 675879, 155383, 435092, 245600, 335216), 1,673 checks, **0 findings** (`out/compare_facility_v11.txt`). The comparison script was updated to the v1.1 rules: "State avg" at 1 decimal place for stars and counts, "pts" for percentage differences, "about the same", VBP rates as %, and the county label.
- **Explore:** 30 of 30 valid URL scenarios equal the DuckDB count. The UI click path gives 1,165, 510, 84, 45. Haversine distances match Python to 4 decimal places. Blanks sort last in both directions, and the order is identical to DuckDB. ZIPs and CCNs keep their leading zeros. Each data file is fetched once per visit.
- **Discharge flows:** for both hospitals at 15 mi and 5 mi, the cards (with the new exact-100 rounding), the 4 volume-weighted averages, and the alternatives (count, beds, average, every distance, every "already a destination" flag) all match a Python recompute. The edge file now correctly shows 6 facilities. Reload keeps the data, and Remove clears it.

## Remaining defects (ranked)
- **A. MEDIUM: an old upload can come back after a new one fails.** If a second file is chosen before the first file's database insert has finished, the first upload's late `localStorage.setItem` (`Flows.tsx:81`) runs after the second upload's `removeItem` (`:77`). The screen says "not loaded", but a reload brings back the earlier file. Reproduced in `out/flows_race_0.json`: with a 0 ms gap the file is restored; with 100 ms or 2,000 ms it is not. The builder's test 13 (`tests/app.spec.ts:179`) fails for this reason. **Fix:** give each upload a sequence number and skip both `setItem` and `setLoaded` when the upload is no longer the latest.
- **B. LOW-MED: a `;` in `hospital_ccn` fails silently.** `hospital_ccn` is not checked for format, so `21;0009` parses as "1 valid rows, 1 hospital". The summary query is then refused by the `;` guard, the dashboard never appears, the browser logs "Refusing to run a multi-statement query", and the bad file is stored and re-runs on every reload (`flows/d_semicolon.csv`, `redteam-v11-flows-semicolon.png`). **Fix:** validate `hospital_ccn` (6 characters, `[0-9A-Z]`) and catch errors in the summary effect.
- **C. LOW: star ratings export blank with no footnote.** In the CSV, the star columns for SFF facilities and PR facilities (qm_rating_footnote = 2) are blank with no reason. This goes against Operating Rule 1.3.
- **D. LOW: the Upload CSV button shows no focus.** Its focus ring is drawn on a 1 px hidden input (`out/upload_focus.json`), so keyboard users cannot see that it has focus. **Fix:** add a `:focus-within` outline to the label.
- **E. LOW: the map uses the old colors.** `MapPage.tsx:24` still hard-codes the old ramp (`#3c8c7e`, `#1f6659`), and lines 82 and 148 still use the old rust `#b4532a`. Map markers no longer match the star chips and flags on every other page.
- **F. LOW: small wording issues.** The status line says "1 valid rows" (plural). At 390 px the Explore toolbar buttons wrap onto two lines ("Columns · 11", "Export CSV"). Footnote meanings are still only in the tooltip and screen-reader label; a sighted keyboard user who tabs to a footnote sees no text.
