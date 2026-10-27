#!/usr/bin/env bash
# CMS-671 Long-Term Care Facility Characteristics, Q2 2026 (data.cms.gov catalog title "Long-Term Care Facility Characteristics : 2026-04-01").
set -euo pipefail
mkdir -p "$(dirname "$0")/../raw/ltc671" && cd "$(dirname "$0")/../raw/ltc671"
curl -sS -m 600 -O "https://data.cms.gov/sites/default/files/2026-07/4b0024b0-dad0-4039-9d5a-1042655480fb/Form_671_Q2_2026.csv"
