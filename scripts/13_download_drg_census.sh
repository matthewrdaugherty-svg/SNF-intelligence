#!/usr/bin/env bash
# Hospital discharges by MS-DRG (2024) and Census ZCTA centroids (2024 Gazetteer).
set -euo pipefail
cd "$(dirname "$0")/.."
mkdir -p raw/hospital raw/census
curl -sS -m 900 -o raw/hospital/MUP_INP_RY26_P03_V10_DY24_PrvSvc.CSV "https://data.cms.gov/sites/default/files/2026-04/828defb5-c9e6-4442-8c1b-f27bc0799daf/MUP_INP_RY26_P03_V10_DY24_PrvSvc.CSV"
curl -sS -m 300 -o raw/census/2024_Gaz_zcta_national.zip "https://www2.census.gov/geo/docs/maps-data/data/gazetteer/2024_Gazetteer/2024_Gaz_zcta_national.zip"
(cd raw/census && unzip -o -q 2024_Gaz_zcta_national.zip)
