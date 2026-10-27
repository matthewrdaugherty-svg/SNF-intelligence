# VALIDATION REPORT 02: re-validation of workbook v2

- **Validator:** independent red team (did not build v1 or v2)
- **Date:** 2026-10-26
- **Tested:** `output/SNF_Intelligence_CareCompare_Sep2026.xlsx` (v2, 16 sheets, Facility_Master 14,690 × 180, Excel Table `FacilityMaster` A1:FX14691), `output/Facility_Master_AllColumns.csv`, `db/snf.duckdb` (facility_master 326 columns), `db/cast_log.csv`, `scripts/02_load.py`, `scripts/03_export_xlsx.py`, `docs/*.md` (docs as of 18:36)
- **Method:** As in round 1, every expected value was recomputed by my own SQL directly on `raw/*.csv`. The workbook was read back with openpyxl (true cell values and types), plus the raw sheet XML where needed. Scripts are in the session scratchpad (`full2.py`, `fixes.py`).

## VERDICT: **PASS WITH FIXES**

All 16 fixes from Report 01 are in place:
- 15 are VERIFIED.
- Fix 9 (README wording) is PARTIAL.

**No data value regressed.** All 180 Facility_Master columns match raw for all 14,690 facilities, measured on the values stored in the file.

**There is one new defect introduced by v2, and it should be fixed before the workbook goes to Matt** (R-1 below). The export applies a date format to two percentage columns, so Excel displays those percentages as dates. Everything else outstanding is wording.

---

## 1. Fix-by-fix status

| # | Fix | Status | Evidence |
|---|---|---|---|
| 1 | Ownership association date parsed; all casts asserted | **VERIFIED** | Raw CCN 015009, DEARMAN, CAMERON, `5% OR GREATER DIRECT OWNERSHIP INTEREST`: `since 01/25/2012`. Database and Ownership_Detail: **2012-01-25**, with `association_date_raw` kept. Raw values break down as 250,658 `since MM/DD/YYYY`, 19 `NO DATE PROVIDED`, and 637 null. All 19 `NO DATE PROVIDED` rows are NULL in the database (19 rows, 0 dated); 14 of them fall in Ownership_Detail's role set, and all 14 are blank there. `Most recent owner/manager association date` is filled for **14,053** facilities, which is 14,690 − 637, and matches my own per-facility max(date) from raw for 14,690 of 14,690. Ownership_Detail has dates on 97,241 of 97,892 rows, which equals the raw `since …` count for those roles. `cast_log.csv`: 128 casts, **0** with raw ≠ typed; sentinels are declared explicitly. No all-NULL column remains in facility_master (0 of 326). |
| 2 | Footnote column next to every suppressible value | **VERIFIED** for the requested cases (see R-5 on the README wording) | CCN 235324: QM 472 blank, `QM 472 — footnote` = **9**. CCN 43A137: QRP 004 and QRP 005 rates blank, footnotes = **14** and **14**. VBP: CCN 015014 has raw `---` with the case-minimum sentence; the workbook shows the rate blank and `VBP readmission — footnote` = **"Case minimum not met - not reported"** (HAI the same). CCN 015009 has raw `0.19485` with footnote `---`; the workbook shows 0.19485 and a blank footnote. Every footnote column on the sheet matches raw for 14,690 of 14,690. |
| 3 | VBP withhold explained; `x_vbp_net_part_a_payment_change_pct` added | **VERIFIED** (one wording correction, R-2) | 015009: raw 0.9972571246 → (m−1)×100 = **−0.2743**; workbook −0.2743. 215096: 0.9858191191 → **−1.4181**; workbook −1.4181. 245490: 1.0163939348 → **+1.6394**; workbook +1.6394. The whole column matches for 14,690 of 14,690. The README's 10,843 below 1.0 is confirmed; 173 facilities are at the floor. The README cites the cms.gov 2% / 60% wording correctly. |
| 4 | LIMITATIONS #9 corrected | **VERIFIED** | Now reads: "not in the SNF QRP/VBP programs (QRP footnote 14), but … 167 of 247 have QM 551". Both figures are confirmed from raw. Minor: the closing reason ("because those measures use all Medicare claims…") is not sourced; label it [industry context]. |
| 5 | Numbers and dates stored correctly | **VERIFIED** | CCN 025025: `Health deficiencies, most recent cycle` = **22, type n**. `Most recent standard health survey date` = **2025-12-24 as an Excel date, type d**, format yyyy-mm-dd. `Fire safety deficiencies, most recent cycle` = 27, type n. The detail-sheet dates (`payment_denial_start_date`, `correction_date`) are now DATE. |
| 6 | No duplicate or leading-space headers | **VERIFIED** | 180 headers, 0 duplicates, 0 with leading or trailing spaces. The export script now asserts both. |
| 7 | Units in VBP headers | **VERIFIED** | "…readmission rate (SNFRM; fraction 0–1)", "…HAI rate (fraction 0–1)", "…turnover (fraction 0–1)", and "(%)" on every QM and QRP percentage. A README UNITS line was added. |
| 8 | Complaint columns | **VERIFIED** | My raw recount [complaint deficiencies last 12 months, of which G–L, complaint inspections over 3 cycles, complaint inspections last 12 months] equals the workbook for all 3 facilities: 235582 = (2, 0, 10, 1); 43A137 = (4, 0, 5, 1); 245490 = (0, 0, 3, 0). All 4 columns also match for every facility. The README claim "complaint inspections are listed only if they resulted in a citation" is sourced (Data Dictionary Table 16, 202101) and confirmed in the data: 0 Health Complaint survey dates lack a complaint citation on that date. |
| 9 | README statements | **PARTIAL** | Fixed: the column count (180), "one known nuance" (now 449 + 38, 287 / 162), the CSV warning, the complaints scope. Still open: R-3 (QRP "processing date"), R-4 (the VERIFICATION line cites Report 01 / 92 columns), R-6 (severity sourcing). |
| 10 | LINEAGE_FacilityMaster complete | **VERIFIED** | 181 rows (180 headers + a note row). **0** null `source_file`, 0 null `original_header`, 0 null `how_derived`. `Data vintage` → ProviderInfo `Processing Date`, "direct copy (renamed)". QM and QRP rows name the file and measure code, e.g. "row where Measure Code = S_040_02_OBS_RATE". `ss_c1_*` rows are marked as direct copies. |
| 11 | Ownership buckets | **VERIFIED** | CCN 015460 `Partnership-interest owners` = JCT FAMILY LIMITED PARTNERSHIP \| TUTERA, DOMINIC \| TUTERA, HANNAH \| TUTERA, JOSEPH \| TUTERA, LAURA. CCN 015012 `Operational/managerial control — individuals` = ANDERSON, JOHN \| CARRIER, JOHN. `Ownership data available (Y/N)`: **N = 637**, Y = 14,053. All 6 owner text columns match raw for every facility, compared as sets of names. The raw percentage text is kept on Ownership_Detail (NOT APPLICABLE 70,961; NO PERCENTAGE PROVIDED 10,119 in that role set). |
| 12 | MDS 409 / 415 / 452 / 454 / 480 present | **VERIFIED** | All 5, each with a footnote column, matching for 14,690 of 14,690. |
| 13 | Severity IN-list; 12-month start derived | **VERIFIED** (script read) | `SEV_HARM = ('G','H','I','J','K','L')` is used for health, fire and the Citations_SeverityG-L sheet, and the build asserts that only A–L codes are present. `W12 = PROC.replace(year=PROC.year-1)` gives 2025-09-01 and is asserted against `collection_intervals` C_H_CMPL `09/01/2025`. |
| 14 | Docs | **VERIFIED** (updated 18:36) | TRUTH_LEDGER T-002 now says "915 nursing homes are not in VBP". OPERATING_RULES §2 now says `data_vintage` is on facility_master only. One small overstatement remains (R-7). |
| 15 | CSV leading-zero warning | **VERIFIED** | README "CSV WARNING" line present. |
| 16 | Live-API limitation stated | **VERIFIED** | README VERIFICATION line says the API is the same data vintage and that medicare.gov could not be machine-read, recommending a human check. |

---

## 2. Whole-population regression test (v2)

- I compared all **180** Facility_Master columns, every facility. The expected values were built independently from the raw CSVs; the only input taken from the export script was the list of database-column ↔ header pairs.
- **The data matches.** On values as normal Excel readers return them, 178 of 180 columns match for 14,690 of 14,690. The other two are QRP 040 and QRP 045. Read from the stored cell XML, they also match **14,690 of 14,690** each, so every stored value is correct.
- **The two exceptions come from the date-format bug, not the data.** Because those cells carry a date format, openpyxl and pandas return them as dates. For values between 60 and 61 (10 cells in QRP 040, 46 in QRP 045), turning that date back into a number is off by exactly 1.0, because of Excel's 1900 date system (it treats 1900 as a leap year). Anyone reading the file programmatically would receive wrong values; see R-1.
- **The columns covered include:**
  - every Provider Info value and footnote
  - all 21 count and aggregate columns, including the 4 new complaint columns
  - all 6 ownership text columns plus the association date and flag
  - all 17 MDS + 4 claims QMs with footnotes
  - all 18 QRP numeric columns with footnotes, 3 "vs national" columns and 3 volume columns
  - all VBP values and footnotes, and `x_vbp_…` (rounded to 4 dp)
  - data vintage

**Summary sheet.** The headers moved, and the formulas moved with them correctly:

| Summary column | Formula range | Facility_Master header |
|---|---|---|
| B (count) | `$AJ:$AJ` | Overall star rating |
| C | `$CK:$CK` | QM 521 Short-stay rehospitalization (%, adjusted) |
| D | `$CE:$CE` | Total fines $ (3-yr window) |
| E | `$FN:$FN` | SNF VBP incentive payment multiplier |

- `B9 =COUNTBLANK($AJ$2:$AJ$14691)` gives 125, and `B10` gives 14,690.
- Cached values for stars 1–5 equal Report 01 (2,982 / 25.3999538 / $83,438.33 … 3,011 / 21.9525324 / $3,228.84).
- The new E column gives 0.98652 → 0.99930, rising from 1 star to 5 stars.

**Sheet row counts vs DuckDB** all match:

| Sheet | Rows |
|---|---|
| Citations_SeverityG-L | 22,564 |
| Ownership_Detail | 97,892 (97,255 + the 637 "not available" rows) |
| Penalties_Detail | 15,419 |
| VBP_FY2026 | 13,900 |
| Measure_Catalog | 78 |
| CAST_LOG | 128 |

---

## 3. Remaining defects (ranked)

| # | Severity | Defect | Evidence | Fix |
|---|---|---|---|---|
| R-1 | **High (new in v2)** | QRP 040 and QRP 045 percentages are formatted as **dates**. `03_export_xlsx.py` line 282 applies `yyyy-mm-dd` to any header containing "date", and "Staff COVID vaccine **up to date** (%)" and "Residents COVID vaccine **up to date** (%)" both match. | Row 2, CCN 025025: QRP 045 stored as 17.51, displayed as `1900-01-17 12:14:24`; QRP 040 stored as 0.72, displayed as `17:16:48`. Covers 13,892 and 12,347 non-blank cells. The stored values are correct (14,690 of 14,690 via XML), but Excel shows dates, sorting and filtering show dates, and pandas/openpyxl return datetimes (wrong by 1.0 for 56 cells after conversion back). | Pick the date columns by database column name (`*_date`, `data_vintage`, the DATE list), not by header text. Add an assert that no percentage column gets a date format. |
| R-2 | Low | The README says "0.9803 = the whole 2% is lost". The data says the floor is **0.980322**, a net change of **−1.9678%**, not −2.00%. (I wrote "keeping none of the 2%" in Report 01, so this error originated with me.) | 173 facilities at 0.980322. `x_vbp` = −1.9678 at the floor. | Reword to "the lowest multiplier, 0.9803, is a net cut of about 1.97%". |
| R-3 | Low | README SOURCE says the SNF QRP provider file has "processing date 2026-09-01". That file has **no Processing Date column**; its manifest `modified_date` is 2026-09-30. | `fykj-qjee` header: no Processing Date field. | Say "released 2026-09-30 with the nursing-home files". |
| R-4 | Low | The README VERIFICATION line still cites Report 01 and "92 columns". | — | Point to Report 02: 180 of 180 columns, stored values. |
| R-5 | Low | README FOOTNOTES says "every value CMS can suppress has a '— footnote' column **immediately to its right**". That overstates it. | `Reported staffing hours — footnote` sits after the RN column and also covers the total, weekend and adjusted hours and the case-mix index, none of which has its own footnote. **14 facilities have blank case-mix-adjusted hours with no reported-staffing footnote**; only `Staffing stars — footnote` = 1 explains them (e.g. CCN 045480, 555935, 175571, 225786, 215373). Weighted health survey score is blank for 38 facilities, explained only by `Health inspection stars — footnote` (38 of 38). The QRP volume and "vs national" blanks are explained by the rate footnote 1–3 columns to the left (487 of 487 for QRP 004 volume). | Reword to "a footnote column next to the value or its group". Optionally add a footnote column after the adjusted, weekend and case-mix columns. |
| R-6 | Low | README SEVERITY and LIMITATIONS #11 still say the dictionary does not define the grid. Strictly true for the individual letters, but the dictionary's Abuse Icon definition does equate "Scope/severity G or greater" with "harm level or above". | Data dictionary, Provider Info Abuse Icon. | Cite that sentence. Keep the J–L labels as [industry context]. |
| R-7 | Low (docs) | TRUTH_LEDGER T-012 says "EVERY cast in every table (128 casts) asserts". OPERATING_RULES rule 3 lists 'Not Available' as a declared sentinel. In fact the MDS, Claims and QRP pivot `TRY_CAST`s do not go through `cast()`. QRP has its own count guard; MDS and Claims have none. No values are lost: 0 non-numeric scores, and the full-population check passes. | `02_load.py` lines 102, 107, 115–117, 134. | Route the pivots through a guard, or reword the two docs. |
| R-8 | Low | LIMITATIONS #4 lists "VBP" among the claims-based measures. The VBP file's turnover and nurse-staffing measures are staffing measures, not claims. LIMITATIONS #5 says "MDS QMs 2025Q2–2026Q1", but 454 and 472 are 2024Q3–2025Q2 (raw Measure Period), and Collection_Intervals gives 01/01/2025–03/31/2026 for 430 and 434. | Measure_Catalog; Collection_Intervals. | Say "VBP readmission and HAI are claims-based". List the MDS exceptions. |

None of R-2 to R-8 changes a published number. R-1 does not change a stored number, but it changes what Matt would **see** in two columns, so it must be fixed before the workbook is shared.
