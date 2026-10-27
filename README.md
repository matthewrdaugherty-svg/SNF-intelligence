# SNF Intelligence

A trustworthy profile of every CMS-certified skilled nursing facility (14,690 facilities, CMS Care Compare Sep 2026 refresh),
joined with SNF QRP and SNF VBP results, a hospital layer (Care Compare hospitals, the CMS Hospital Service Area File and the
Post-Acute Care PUF, used for a clearly-labelled *modeled* view of which SNFs serve each hospital), and the PECOS ownership files
(hospital systems grouped across their holding companies; SNF legal entities, affiliations and changes of ownership). Delivered as
(1) a DuckDB database, (2) a filterable Excel workbook, and (3) a web app whose database runs inside the browser
(live: https://snf-intelligence.vercel.app).

Pages: Explore (filter/sort/export every SNF; filter by a hospital's or a whole system's service area), Cohorts (stack conditions,
benchmark against all facilities, break down by state/chain/ownership, share by link), Hospitals (service area, modeled quality mix,
owners), Map, Compare, Discharge flows (drop in a hospital's real discharge counts), Methodology & trust.

Start with `START_HERE.md`. The rules every contributor and agent follows are in `docs/OPERATING_RULES.md`.

## Rebuild from raw
```
pip install duckdb pandas openpyxl pyarrow
python3 scripts/01_profile.py && python3 scripts/02_load.py && python3 scripts/03_export_xlsx.py
bash scripts/05_download_hospital.sh && python3 scripts/06_load_hospital.py
bash scripts/08_download_pecos.sh    && python3 scripts/07_load_pecos.py
python3 scripts/04_export_app_data.py
```
Raw files are not in git (public, re-downloadable): nursing-home files per `scripts/00_download_raw.md` (589 MB); hospital and PECOS
files are fetched by the two download scripts. Every load asserts row counts and lossless casts (`db/cast_log*.csv`); every
cross-file check is in `db/reconciliation*.json`; what was verified and what is still open is in `docs/TRUTH_LEDGER.md`.

## Web app
```
cd app && npm install && npm run dev          # local
npm run build && npx playwright test          # production build + end-to-end tests (needs the data export above)
```
Deploys as a static site (Vercel: root directory `app`, build `npm run build`, output `dist`). No server, no secrets.
