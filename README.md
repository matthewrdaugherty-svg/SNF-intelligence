# SNF Intelligence

A trustworthy profile of every CMS-certified skilled nursing facility (14,690 facilities, CMS Care Compare Sep 2026 refresh),
joined with SNF QRP and SNF VBP results, delivered as (1) a DuckDB database, (2) a filterable Excel workbook, and (3) a web app
whose database runs inside the browser.

Start with `START_HERE.md`. The rules every contributor and agent follows are in `docs/OPERATING_RULES.md`.

## Rebuild from raw
```
pip install duckdb pandas openpyxl pyarrow
python3 scripts/01_profile.py && python3 scripts/02_load.py && python3 scripts/03_export_xlsx.py && python3 scripts/04_export_app_data.py
```
Raw files are not in git (589 MB, public, re-downloadable): see `scripts/00_download_raw.md`.

## Web app
```
cd app && npm install && npm run dev          # local
npm run build && npx playwright test          # production build + end-to-end tests (needs the data export above)
```
Deploys as a static site (Vercel: root directory `app`, build `npm run build`, output `dist`). No server, no secrets.
