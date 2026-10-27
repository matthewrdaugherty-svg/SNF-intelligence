# Refreshing the raw CMS files

The 18 files in `raw/` come from https://data.cms.gov/provider-data/topics/nursing-homes (and the SNF QRP / SNF VBP topics on the same portal).
`raw/manifest.json` lists each dataset's id, name and the file name/size we used (Sep 2026 refresh).

Fastest path: on the portal, open each dataset page, click Download (CSV). Keep the file names as the portal gives them; the loader
matches files by the dataset id prefix in the name (e.g. `4pq5-n9py_…ProviderInfo…csv`), so after a refresh update the
`FILES` map and `EXPECTED_ROWS` in `scripts/02_load.py` to the new names and counts (the counts are asserted on purpose).

Note: data.cms.gov could not be reached from the Claude cloud workspace used to build this (domain not on its allow-list),
so a scripted download was not verified there. The portal's datastore API does offer CSV downloads of the form
`https://data.cms.gov/provider-data/api/1/datastore/query/<dataset-id>/0/download?format=csv` (UNVERIFIED from the sandbox).

After placing the files: `python3 scripts/01_profile.py && python3 scripts/02_load.py && python3 scripts/03_export_xlsx.py && python3 scripts/04_export_app_data.py`
(the Excel step needs LibreOffice for formula recalculation; see the xlsx notes in the script). Then rebuild the app (`cd app && npm run build`).
