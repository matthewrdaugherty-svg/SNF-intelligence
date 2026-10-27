#!/usr/bin/env bash
# Hospital-layer source files (all public CMS). Re-run to refresh; update the URLs from https://data.cms.gov/data.json when CMS re-issues them.
set -euo pipefail
cd "$(dirname "$0")/../raw/hospital"
dl() { curl -sS -L -m 900 --retry 3 -o "$2" "$1" && echo "  $2  $(stat -c%s "$2") bytes"; }
dl "https://data.cms.gov/sites/default/files/2026-06/5c0137be-b61d-4493-af6b-63a79b4a314c/Hospital_Service_Area_2025.csv" Hospital_Service_Area_2025.csv
dl "https://data.cms.gov/sites/default/files/2026-04/d9525c59-002b-45b3-af22-c81061a62dcd/mup_inp_ry26_p04_v10_dy24_prv.csv" Medicare_Inpatient_Hospitals_by_Provider_2024.csv
dl "https://data.cms.gov/sites/default/files/2026-07/aef4ec54-f674-41a1-9abb-b10e084910ab/RY26_PACPUF_SNF_2024_main_S.csv" PACPUF_SNF_2024_main.csv
dl "https://data.cms.gov/provider-data/api/1/datastore/query/xubh-q36u/0/download?format=csv" Hospital_General_Information.csv
dl "https://data.cms.gov/provider-data/api/1/datastore/query/nrth-mfg3/0/download?format=csv" Hospital_Spending_by_Claim.csv
dl "https://data.cms.gov/provider-data/api/1/datastore/query/632h-zaca/0/download?format=csv" Unplanned_Hospital_Visits.csv
dl "https://data.cms.gov/provider-data/api/1/datastore/query/9n3s-kdb3/0/download?format=csv" Hospital_Readmissions_Reduction_Program.csv
