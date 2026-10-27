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

## Status (2026-10-26)
- DONE: load, join, reconcile, workbook v1, data-dictionary digest, external-source research, red-team validation round 1 (see report).
- OPEN: 162 unexplained rating-cycle vs inspection-cycle count differences (T-009); severity grid A–L confirmation from the
  Five-Star Technical Users' Guide; Matt's answers on commercial use / client discharge data / permanent home for the project.
- NOT STARTED: hospital catchment layer (needs Post-Acute Care PUF + Hospital Service Area File + Hospital Spending by Claim),
  composite `x_` scores (need Quality Expert + Validator sign-off per D-005), queryable app (UX design first).
