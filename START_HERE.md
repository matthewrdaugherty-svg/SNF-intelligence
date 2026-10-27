# SNF Intelligence — START HERE (session boot index)

Owner: Matt. Purpose: a trustworthy, queryable profile of every CMS-certified skilled nursing facility (quality, penalties,
staffing, ownership, VBP/QRP), eventually joined to hospital catchments to support narrow-network / total-cost-of-care work.

## Read in this order (every session, every agent)
1. `docs/OPERATING_RULES.md` — the rules. Zero-hallucination, provenance on every number, builder never validates own work.
2. `docs/DECISION_LOG.md` — decisions already made (don't re-litigate without logging a new entry).
3. `docs/TRUTH_LEDGER.md` — verified facts about the data, with how they were verified.
4. `docs/VALIDATION_REPORT_*.md` — what the red team found and what was fixed.
5. `docs/DATA_DICTIONARY_DIGEST.md` — CMS field definitions, footnote codes, join keys, dictionary-vs-CSV mismatches.
6. `docs/EXTERNAL_DATA_SOURCES.md` — what other public data exists, what it costs, and the ranked next pulls.

## Layout
```
raw/        18 original CMS files (immutable) + NH_Data_Dictionary.pdf + manifest.json
scripts/    01_profile.py  → docs/PROFILE.md, db/profile.json
            02_load.py     → db/snf.duckdb (all tables, facility_master, reconciliation.json, column_map.csv)
            03_export_xlsx.py → output/ workbook + all-columns CSV
db/         snf.duckdb (the source of truth for queries), column_map.csv, reconciliation.json, profile.json
output/     SNF_Intelligence_CareCompare_Sep2026.xlsx, Facility_Master_AllColumns.csv
docs/       governance + reference docs listed above
```
Rebuild from scratch: `python3 scripts/01_profile.py && python3 scripts/02_load.py && python3 scripts/03_export_xlsx.py` (≈6 min).

## Key tables in db/snf.duckdb
- `facility_master` — 14,690 rows × 311 cols, one row per nursing home (CCN). Prefix guide: `qm_` MDS/claims quality measures,
  `qrp_` SNF QRP, `vbp_` SNF VBP, `hc_`/`fc_` health/fire citation aggregates, `pen_` penalties, `own_` ownership, `ss_` survey summary.
- Long/detail: `health_citations`, `fire_citations`, `penalties`, `ownership`, `survey_dates`, `survey_summary`, `mds_qm_long`, `claims_qm_long`, `qrp_long`, `swing_bed_long`, `vbp_facility`.
- Reference: `measure_catalog`, `collection_intervals`, `citation_descriptions`, `inspection_cutpoints`, `state_averages`, `qrp_national`, `vbp_aggregate`.

## Web app (app/)
Vite + React + TypeScript; DuckDB runs in the browser over `app/public/data/*.arrow` (exported by scripts/04_export_app_data.py).
Live at https://snf-intelligence.vercel.app (Vercel, static, no server; deploys on every push to main of
github.com/matthewrdaugherty-svg/SNF-intelligence). Pages: Explore (filters in the URL, virtualized table, column picker, CSV export,
filter by a hospital's or a whole system's service area), Cohorts (stackable conditions, benchmarks, group breakdowns, shareable
links), Facility profile (snapshot sentence, key-number cards with provenance, every measure with footnote vs state/nation, PECOS
ownership), Hospitals (service area, modeled quality mix, owners/system), Map, Compare (≤6), Discharge flows (the plug-in: upload
hospital→SNF counts; schema in D-013), Methodology & trust. Tests: `cd app && npm run build && npx playwright test`
(22 end-to-end tests asserting values read from the DB). Design rules: rating colors carry meaning (1–2★ red, 3★ amber, 4–5★ green;
D-022), rust = enforcement/harm, accent blue for interaction only, Public Sans, every modeled number tagged "Modeled".

## Hospital and PECOS layers
scripts/05–08 load Care Compare hospital files, HSAF 2025, PAC PUF 2024 and the PECOS owner/enrollment/CHOW files (release
2026-09-29). Service-area model: D-020 / T-020. Hospital systems grouped across holding companies: D-024, D-025 / T-021.

## Status (2026-10-26, evening)
- DONE: load, join, reconcile, workbook v2.1 (validation rounds 1–2), data-dictionary digest, external-source research, web app
  deployed and red-teamed (rounds 3–4 fixed), hospital layer + modeled service areas, cohort builder, PECOS systems with state
  filter, facility snapshot/cards. Red-team round 5 (cohorts, PECOS, families, snapshot) in progress → docs/VALIDATION_REPORT_05_APP.md.
- OPEN: 162 unexplained rating-cycle vs inspection-cycle count differences (T-009); severity grid A–L confirmation from the
  Five-Star Technical Users' Guide; Hybrid HWR unavailable this release (T-019); ZIP centroids for service-area model v2 need
  www2.census.gov allowed; friendlier system display names (override file) if Matt wants them; the raw PECOS CSVs remain in one
  pushed commit's history (untracked since 29a015d) — rewriting main needs Matt's OK.
- NOT STARTED: composite `x_` scores (need Quality Expert + Validator sign-off per D-005); unified "Modeled" source on the
  Discharge flows page (today it links to the Hospitals pages instead).
