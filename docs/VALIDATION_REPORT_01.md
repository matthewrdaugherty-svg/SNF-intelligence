# VALIDATION REPORT 01: SNF Intelligence workbook (CMS Care Compare, Sep 2026 refresh)

- **Validator:** independent red team (did not build the pipeline or workbook)
- **Date:** 2026-10-26
- **Artifacts tested:** `output/SNF_Intelligence_CareCompare_Sep2026.xlsx`, `output/Facility_Master_AllColumns.csv`, `db/snf.duckdb` (read-only), `scripts/02_load.py`, `scripts/03_export_xlsx.py`, the docs in `docs/`
- **Method:** I read every raw value myself from `raw/*.csv`, using pandas and DuckDB `read_csv(all_varchar=true)` directly on the raw files, never from `db/snf.duckdb`. I compared those values to the workbook as read back with pandas `read_excel` and openpyxl. The validation scripts are in the session scratchpad (`spot.py`, `code.py`, `code2.py`, `audit.py`, `full.py`).

---

## VERDICT: **PASS WITH FIXES**

**The data values are correct.** Every value I checked reproduces from the raw CMS files:
- 180 of 180 spot-check values matched.
- Separately, 92 Facility_Master columns matched for all 14,690 facilities, which is about 1.35 million cells.
- Blanks (suppressed values) are truly blank, and zeros are true zeros.
- The live CMS API agreed 5 of 5.

**The packaging does not yet meet the "very high trust" bar.** Problems:
- One cast is broken and silently empties a whole field.
- The README promises footnotes that are not in the sheet.
- One limitation statement is false.
- The VBP "withhold" is not explained.
- Some numbers are stored as text.
- Header names are duplicated.
- VBP and QRP columns use different units with no label.

None of these change a published number, but several would mislead a user. All are fixable in the export script within a day.

---

## 1. Random spot checks (raw → workbook)

**Seed:** `numpy.random.RandomState(20261026)`.

**Draw order:**
- 2 from State = MD
- 2 from Provider Type = "Medicaid"
- 1 from Special Focus Status = "SFF"
- 1 from CCNs that are not in the Penalties file
- 6 at random from the rest

All draws were without replacement and made from sorted pools.

**Comparison rules:**
- The raw side was read from `raw/` only.
- Fines are summed, and fine counts counted, from the raw Penalties file (`Penalty Type='Fine'`).
- G-or-worse is counted from the raw Health Citations file as Scope Severity Code in {G,H,I,J,K,L}.
- QM 521 is the raw Claims `Adjusted Score` and `Footnote for Score`.
- QM 401 is the raw MDS `Four Quarter Average Score`.
- QRP is the raw `Score` for `S_004_01_PPR_PD_RSRR` and `S_005_02_DTC_RS_RATE`.
- VBP is the raw `SNF VBP Program Ranking`.
- Numbers match when they agree within 1e-6. Blank must equal blank.

**Result: 180 of 180 fields match exactly (15 fields × 12 CCNs). Zero mismatches.**

My first run reported 8 footnote "mismatches". The cause was my own comparator, which turned a blank raw footnote into the text "nan". I fixed the comparator and re-ran; the workbook was correct.

Workbook values below. Raw values are identical. Decimals are rounded for display only; the comparison used full precision.

| CCN | Why drawn | State / type / SFF | Overall | Health | QM | Staff | Beds | Nurse HPRD | Fines $ | # fines | G+ (3 cyc) | QM521 | 521 fn | QM401 4Q | QRP S_004 RSRR | QRP S_005 DTC | VBP rank |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 215096 | MD draw | MD/Medicare and Medicaid/- | 5 | 4 | 5 | 3 | 118 | 4.0695 | 0 | 0 | 0 | 23.2691 | (blank) | 10.2222 | 14.26 | 60.82 | 7292 |
| 215118 | MD draw | MD/Medicare and Medicaid/- | 5 | 5 | 4 | 4 | 141 | 3.6339 | 0 | 0 | 0 | 23.994 | (blank) | 12.1469 | 9.61 | 56.7 | 3438 |
| 21E104 | Medicaid-only draw (also MD) | MD/Medicaid/- | 5 | 5 | 4 | 5 | 44 | 4.1805 | 0 | 0 | 0 | (blank) | 9 | 53.6 | (blank) | (blank) | (blank) |
| 39A435 | Medicaid-only draw | PA/Medicaid/- | 5 | 3 | 5 | 5 | 238 | 5.4633 | 15733 | 1 | 3 | (blank) | 9 | 11.5328 | (blank) | (blank) | (blank) |
| 135058 | SFF draw | ID/Medicare and Medicaid/SFF | (blank) | (blank) | (blank) | (blank) | 55 | 3.2855 | 41954 | 1 | 1 | 19.3222 | (blank) | 20.4678 | 9.59 | 37.25 | 7265 |
| 225315 | no-penalty draw | MA/Medicare and Medicaid/- | 3 | 3 | 4 | 3 | 168 | 3.8641 | 0 | 0 | 0 | 27.8005 | (blank) | 7.839 | 9.73 | 62.58 | 10666 |
| 235582 | random | MI/Medicare and Medicaid/- | 3 | 2 | 5 | 2 | 172 | 3.9129 | 28815 | 1 | 5 | 27.9887 | (blank) | 9.1954 | 11.96 | 62.67 | 5574 |
| 535034 | random | WY/Medicare and Medicaid/- | 4 | 4 | 4 | 4 | 60 | 3.7285 | 0 | 0 | 0 | 17.7293 | (blank) | 17.4699 | 9.09 | 65.73 | 2426 |
| 245490 | random | MN/Medicare and Medicaid/- | 4 | 3 | 4 | 5 | 94 | 5.272 | 14433 | 1 | 3 | 14.5907 | (blank) | 23.6967 | 9.21 | 60.54 | 986 |
| 366411 | random | OH/Medicare and Medicaid/- | 5 | 4 | 5 | 5 | 25 | 7.0448 | 0 | 0 | 0 | 24.0201 | (blank) | 4.3478 | 11.59 | 60.07 | 6485 |
| 05A357 | random (Medicaid-only) | CA/Medicaid/- | 3 | 2 | 3 | 5 | 36 | 10.3248 | 0 | 0 | 0 | (blank) | 10 | 5.2632 | (blank) | (blank) | (blank) |
| 43A137 | random (Medicaid-only) | SD/Medicaid/- | 3 | 3 | 1 | 5 | 50 | 3.6269 | 47187 | 4 | 4 | (blank) | 9 | 23.0769 | (blank) | (blank) | (blank) |

**Notes on the sample:**
- The sample contains 3 Maryland facilities (21E104 is both MD and Medicaid-only) and 6 Medicaid-only facilities.
- SFF 135058 has blank star ratings. This is correct: raw Overall Rating Footnote is 18, and the live API confirms it.
- For the Medicaid-only CCNs, the raw QRP footnote for S_004/S_005 is `14`. The workbook shows these values as blank but **has no column carrying that footnote** (see Fix 2).
- None of the 12 has an MDS 401 footnote in raw.

### 1b. Whole-population check (beyond the brief)
Twelve facilities is a small sample, so I also compared **every facility (14,690)** on **92 Facility_Master columns**. Each workbook column was compared with the same value computed independently from the raw CSVs (`full.py`). The columns covered:
- all 6 star ratings
- beds, residents per day, and all staffing and turnover columns
- chain fields, SFF status, abuse icon, provider type, ownership type, overall-rating footnote
- the survey-summary cycle-1 deficiency count
- all 9 citation aggregates (3-cycle, G+, J/K/L, abuse, complaint, infection control, last-12-month, last-12-month G+, fire)
- all 6 penalty aggregates
- all 4 claims QMs and their footnotes, and all 12 MDS QMs on the sheet
- all 18 QRP numeric columns and 3 QRP "vs national" text columns
- all 7 VBP columns

**Result: 92 of 92 columns match for 14,690 of 14,690 facilities.** In particular:
- Every blank in a QM, QRP or VBP column corresponds to a blank or "Not Available" / "---" raw value.
- Every 0 corresponds to a raw 0. For example, QM 521 has 15 real zeros and 2,772 blanks, and both counts match raw.

---

## 2. Live public source check

**API.** The URL pattern given works unchanged:
`https://data.cms.gov/provider-data/api/1/datastore/query/4pq5-n9py/0?conditions[0][property]=cms_certification_number_ccn&conditions[0][value]=<CCN>&limit=1`

| CCN | Live overall / health / staffing / QM | Live # fines / total fines | Live processing_date | Workbook | Result |
|---|---|---|---|---|---|
| 215096 (MD) | 5 / 4 / 3 / 5 | 0 / 0.00 | 2026-09-01 | 5 / 4 / 3 / 5; 0 / $0 | MATCH |
| 135058 (SFF) | blank / blank / blank / blank (footnote 18) | 1 / 41954.00 | 2026-09-01 | blank ×4; 1 / $41,954 | MATCH |
| 235582 | 3 / 2 / 2 / 5 | 1 / 28815.00 | 2026-09-01 | 3 / 2 / 2 / 5; 1 / $28,815 | MATCH |
| 43A137 (Medicaid-only) | 3 / 3 / 5 / 1 | 4 / 47187.00 | 2026-09-01 | 3 / 3 / 5 / 1; 4 / $47,187 | MATCH |
| 245490 | 4 / 3 / 5 / 4 | 1 / 14433.00 | 2026-09-01 | 4 / 3 / 5 / 4; 1 / $14,433 | MATCH |

**5 of 5 facilities match on all fields.** Certified beds also match: 118, 55, 172, 50 and 94.

I also queried the live Penalties dataset (`g6vv-u9sr`) for 43A137. It returned 4 Fine rows: 2024-01-30 $9,009; 2024-07-11 $10,839; 2025-03-31 $14,901; 2025-06-26 $12,438. These sum to $47,187, which matches. None falls on or after 2025-09-01, which matches the workbook's "Fines, last 12 months" value of 0.

**Caveat on independence.** The live API currently serves the **same release** as the files: processing date 2026-09-01 on every record. So this check proves the downloaded files equal what CMS publishes. It does not provide a second, independent computation. No live value differed, so no refresh-date explanation was needed.

**medicare.gov.** `https://www.medicare.gov/care-compare/details/nursing-home/235582` returns only a JavaScript application shell (`meta-ccxp-shell-version: 1.2.0`, `base: /care-compare/en/`). It contains no facility name, ratings or fines. **Nothing could be read**, so I could not verify against the consumer website. If Operating Rule 1.7 must be satisfied literally, a human, or a browser-capable agent, needs to view 3–5 of these CCNs on medicare.gov.

---

## 3. Code review of `scripts/02_load.py`

### 3a. `scope_severity_code >= 'G'`
These are the raw codes present, and whether each passes `>= 'G'`:

| File | B | C | D | E | F | G | H | I | J | K | L |
|---|---|---|---|---|---|---|---|---|---|---|---|
| Health citations | 4,814 | 4,402 | 264,694 | 93,485 | 28,988 | 12,858 ✔ | 439 ✔ | 19 ✔ | 6,637 ✔ | 2,004 ✔ | 607 ✔ |
| Fire citations | 561 | 8,810 | 52,911 | 57,631 | 80,065 | 7 ✔ | 1 ✔ | 1 ✔ | 23 ✔ | 48 ✔ | 130 ✔ |

The file has no blanks, nulls, lowercase codes, "A" codes, or letters after L. So `>= 'G'` is **exactly equivalent** to `IN ('G'..'L')` **for this release**. The Citations_SeverityG+ sheet has 22,564 rows, which equals 12,858+439+19+6,637+2,004+607.

This is fragile. Any future code after "L", or any lowercase code, would silently count as harm. **Recommendation:** replace it with an explicit `IN ('G','H','I','J','K','L')`, as the GHI/JKL columns already do.

The README says the severity grid is "not in the data dictionary". That is partly wrong. The dictionary's Abuse Icon definition says "harm level or above … (Scope/severity G or greater)", and the project's own `DATA_DICTIONARY_DIGEST.md` §3.6 quotes it. So "G or greater = harm" is sourced in the dictionary. The meanings of the individual letters are not.

### 3b. "Last 12 months" window and date parsing
- **Anchor is correct.** CMS's own `Collection_Intervals` file (`C_H_CMPL`, `C_F_CMPL`, `C_IC_SRVY`) defines "Most recent 12 month period" as **09/01/2025 – 08/31/2026**. The code's `>= DATE '2025-09-01'` is consistent with it.
  - Max health survey date is 2026-08-26, max fire survey date 2026-08-20, max penalty date 2026-08-17. Nothing falls after 2026-09-01.
  - No penalty or health citation falls on exactly 2025-09-01, so the boundary has no effect.
  - Weakness: the date is **hard-coded**. At the next refresh it will silently be wrong. Derive it from `processing_date` or from `Collection_Intervals` instead.
- **Dates parse cleanly.** All raw dates are ISO `YYYY-MM-DD`. Nulls after the cast (in `db/snf.duckdb`) equal blanks in raw:

| Field | Non-blank raw | Parsed | Nulls introduced |
|---|---|---|---|
| health `survey_date` | 418,947 | 418,947 | 0 |
| fire `survey_date` | 200,188 | 200,188 | 0 |
| `penalty_date` | 15,419 | 15,419 | 0 |

- **Gap in the cast guard.** These casts have **no assert**, even though D-009 says "every numeric/date cast asserts". Only the provider_info casts are guarded. This gap is how the ownership date bug in 3c got through.
- `correction_date`, `payment_denial_start_date` and survey-summary dates stay as text (VARCHAR). That is harmless in the database but becomes text in Excel (see Fix 5).
- Raw data contains a correction date of `1902-07-14`. This is a CMS data oddity. It is not used anywhere, but it is worth noting.

### 3c. Ownership aggregation: **BUG FOUND**
**Association date.**
- The cast is `TRY_CAST(replace(association_date,'since ','') AS DATE)`.
- Raw values look like `since 01/25/2012`, i.e. **MM/DD/YYYY**. Example: CCN 015009, owner DEARMAN, CAMERON.
- DuckDB's `TRY_CAST` does not parse MM/DD/YYYY, so **all 250,677 non-blank raw association dates became NULL**.
- As a result:
  - `facility_master.own_most_recent_association_date` is **100% NULL** (the only all-NULL column out of 311).
  - The CSV's `own_most_recent_association_date` column is empty.
  - **The `association_date` column on the Ownership_Detail sheet is blank in all 97,255 rows.**
- Fix: `strptime(replace(association_date,'since ',''),'%m/%d/%Y')` plus a lossless assert.

**Ownership percentage.** 250,677 raw values are non-blank but only 16,175 parse. The other 234,502 are the texts `NOT APPLICABLE` (224,383) and `NO PERCENTAGE PROVIDED` (10,119). Losing them as numbers is correct, but the text is discarded with no `_raw` column, which goes against Operating Rules §2. On Ownership_Detail, "not applicable" and "not provided" both appear as blank.

**Distinct roles and the bucket each lands in** (from the raw file):

| Role | Rows (Indiv / Org) | Direct owners | Indirect owners | Op-control orgs | Ownership_Detail sheet |
|---|---|---|---|---|---|
| 5% OR GREATER DIRECT OWNERSHIP INTEREST | 4,759 / 8,169 | ✔ | | | ✔ |
| DIRECT OWNERSHIP INTEREST | 1,499 / 2,026 | ✔ | | | ✔ |
| 5% OR GREATER INDIRECT OWNERSHIP INTEREST | 4,155 / 9,211 | | ✔ | | ✔ |
| INDIRECT OWNERSHIP INTEREST | 4,009 / 4,915 | | ✔ | | ✔ |
| GENERAL PARTNERSHIP INTEREST | 224 / 288 | ✘ | ✘ | | ✔ |
| LIMITED PARTNERSHIP INTEREST | 309 / 396 | ✘ | ✘ | | ✔ |
| OPERATIONAL/MANAGERIAL CONTROL | 44,846 / 12,449 | | | Org rows only | ✔ |
| 5% OR GREATER MORTGAGE INTEREST | 279 / 1,577 | | | | ✘ |
| 5% OR GREATER SECURITY INTEREST | 154 / 1,590 | | | | ✘ |
| MANAGING CONTROL - GOVERNING BODY | 12,885 / 0 | | | | ✘ |
| CORPORATE OFFICER / CORPORATE DIRECTOR | 23,786 / 25,629 (Indiv) | | | | ✘ |
| ADP OF THE SNF | 43,354 / 29,907 | | | | ✘ |
| INDIVIDUAL IS AN OWNER, PARTNER OR TRUSTEE OF ANY ADP OF THE SNF | 4,354 / 0 | | | | ✘ |
| TRUSTEE OF THE SNF | 3,200 / 366 | | | | ✘ |
| CONTRACTED MANAGING EMPLOYEE / W-2 MANAGING EMPLOYEE | 1,117 / 5,224 (Indiv) | | | | ✘ |
| Ownership Data Not Available | 637 | excluded | excluded | excluded | ✘ |

The `NOT LIKE '%INDIRECT%'` guard correctly keeps "INDIRECT" out of the direct bucket. The Ownership_Detail filter yields 97,255 rows, which equals the sum of the ✔ rows. That checks out.

**Consequences:**
- **Partnership interests are owners but appear in neither owner column.** 94 facilities whose only ownership rows are partnership interests show **blank** "Direct owners" and blank "Indirect owners". Example: **CCN 015460**, whose owners are listed only as LIMITED PARTNERSHIP INTEREST (e.g. JCT FAMILY LIMITED PARTNERSHIP, TUTERA, DOMINIC).
- **"Operational/managerial control orgs" leaves out individuals.** 4,435 facilities whose operators are all individuals show blank. Example: **CCN 015012** (operators ANDERSON, JOHN; CARRIER, JOHN). The header does say "orgs", but a blank reads as "no operator".
- **"No data" looks the same as "no owners".** The 637 "Ownership Data Not Available" facilities are blank in every owner column, with no flag.

### 3d. QRP pivot
I checked 3 CCNs × 57 measures = **171 values, 171 match** (value and footnote). The CCNs were 215149, 105196 and Medicaid-only 43A135; seed `RandomState(7)`.

The comparison covered:
- numeric scores
- "Not Available" → NULL
- COMP_PERF text ("Better / No Different / Worse than the National Rate") kept verbatim
- footnote "-" → NULL

**What the raw file contains:**
- Non-numeric values: 134,078 "Not Available" in numeric measures; 8,625 "Not Available" plus 3,038 / 30,564 / 1,843 "Better / No Different / Worse" text in COMP_PERF measures.
- No COMP_PERF row holds a number, and there are no duplicate CCN × measure rows.

The pipeline's own guard (long numeric count = wide non-null count) is sound.

### 3e. MDS pivot
3 of 3 CCN × measure pairs match raw:

| CCN | Measure | Raw | facility_master |
|---|---|---|---|
| 676089 | 401 | 19.354839 / no footnote | 19.354839 / NULL |
| 155825 | 406 | 1.851266 / no footnote | 1.851266 / NULL |
| 235324 | 472 | blank / footnote 9 | NULL / '9' |

No non-blank MDS 4-quarter or quarterly score fails to parse (0 lost), and no Claims adjusted/observed/expected score fails (0 lost). No duplicate CCN × measure rows.

### 3f. Penalties
- **Fine amounts parse completely.** All 12,989 Fine rows have a numeric amount (0 failed TRY_CAST; no `$` or `,` present; none zero or blank). They sum to **$454,984,026**, matching TRUTH_LEDGER T-004.
- All 2,430 Payment Denial rows have a blank Fine Amount and a parseable length in days.
- `penalty_type` takes only the values {Fine, Payment Denial}. There are no duplicate Fine IDs.

### 3g. facility_master structure
- **Shape:** 14,690 rows = 14,690 distinct CCNs. 311 columns, with no duplicate names in the database and no naming collisions from the loader (`column_map.csv` shows suffixing only for the separate address-line columns in qrp_long and swing_bed_long, which are not in the master).
- **All-NULL column:** **`own_most_recent_association_date`**, the broken cast in 3c. No other column is entirely NULL.
- **Near-empty columns:** only two (`average_number_of_residents_per_day_footnote`, 66 values; `rating_cycle_2_standard_survey_footnote`, 4), and both are genuine.
- **VBP "---" placeholder.** VBP numeric columns lose values to TRY_CAST, for example FY2024 readmission rate: 13,900 non-blank, 10,307 numeric. Every lost value is the CMS placeholder `---`, paired with the footnote "did not meet this measure's case minimum". That is legitimate suppression, but the VBP footnotes are not carried to Facility_Master (see Fix 2).
- **Text-typed counts in the master:**
  - `ss_c1_health_deficiencies` and `ss_c1_fire_deficiencies` are still VARCHAR even though 100% of their values are numeric. This is a missed cast (see Fix 5).
  - `ss_c1_health_survey_date` is VARCHAR.

### 3h. Fines reconciliation, re-run independently from raw
I compared Provider Info against the raw Penalties file, matching by CCN, for all 14,690 facilities:

| Check | Result |
|---|---|
| `Number of Fines` = count of Fine rows | 14,690 of 14,690 |
| `Total Amount of Fines in Dollars` = sum of fines, exact to the cent | 14,690 of 14,690 |
| `Number of Payment Denials` | 14,690 of 14,690 |
| `Total Number of Penalties` | 14,690 of 14,690 |
| Provider Info `Number of Fines` blank | 0 facilities |

**Confirmed.** The `coalesce(…,0)` in the builder's check is not masking anything.

---

## 4. Workbook audit

**Row counts.** Every sheet matches the DuckDB source it claims to come from:

| Sheet | Rows | Source query | Result |
|---|---|---|---|
| Facility_Master | 14,690 | facility_master 14,690 | OK |
| Measure_Catalog | 78 | 17+4+57 = 78 | OK |
| Penalties_Detail | 15,419 | penalties 15,419 | OK |
| Citations_SeverityG+ | 22,564 | G–L health citations 22,564 | OK |
| Ownership_Detail | 97,255 | role filter 97,255 | OK |
| VBP_FY2026 | 13,900 | vbp_facility 13,900 (125 flagged N) | OK |
| State_Averages | 54 | 54 | OK |
| Inspection_Cutpoints | 53 | 53 | OK |
| Collection_Intervals | 47 | 47 | OK |
| LINEAGE_AllColumns | 442 | `column_map.csv` 442 | OK |
| CSV (companion file) | 14,690 × 311 | facility_master | OK |

**LINEAGE_FacilityMaster.** 115 rows for 115 headers.
- 114 have a table. **"Data vintage (CMS processing date)" (`data_vintage`) has a blank table, header and file.**
- 66 of 115 rows show `original_header = "derived — see scripts/02_load.py"` with a blank `source_file`. That includes direct copies (the `ss_c1_*` survey-summary columns) and single-measure pivots.
- The QM rows say "mds_qm_long / claims_qm_long" without naming which file. No QM or QRP row names the measure code (for example `S_004_01_PPR_PD_RSRR`).
- This does not reach the "trace every column to file + column + key" standard in Operating Rule 1.1.

**Numbers stored as text** (openpyxl cell types):
- **"Health deficiencies, most recent cycle": all 14,690 cells are strings** (e.g. `'22'`, CCN 025025). This is a real defect: SUM, AVERAGE and numeric filters ignore or mis-sort them, and a PivotTable will count rather than sum them.
- **"Most recent standard health survey date": all 14,690 cells are text** (`'2025-12-24'`), not Excel dates. Date filters and date grouping will not work.
- **Intentional text, acceptable:** ZIP, Phone and CCN (they preserve leading zeros), and footnote codes (categorical).
- **All other numeric columns** are true numbers, and the two fines-$ columns have a `$#,##0` format.

**Blank vs zero.** Confirmed correct for every QM, QRP and VBP column (see 1b). Example: "Short-stay rehospitalization % (QM 521)" has 11,918 numbers (including 15 true zeros) and 2,772 blanks. Raw has 2,772 suppressed values (footnote 9 or 10), so the counts match.

**Summary sheet formulas** (read as formula strings with openpyxl):
- `B4:B8 =COUNTIF(Facility_Master!$AE:$AE,A4)` → column **AE** = "Overall star rating" ✔
- `C4:C8 =IFERROR(AVERAGEIF(Facility_Master!$AE:$AE,A4,Facility_Master!$BN:$BN),"")` → **BN** = "Short-stay rehospitalization % (adjusted, QM 521)" ✔
- `D4:D8 =IFERROR(AVERAGEIF(…$AE:$AE,A4,Facility_Master!$BH:$BH),"")` → **BH** = "Total fines $ (3-yr window)" ✔
- `B9 =COUNTBLANK($AE$2:$AE$14691)` gives 125 ✔. `B10 =SUM(B4:B9)` gives 14,690 ✔.
- I recomputed the cached values independently in pandas and they match exactly:

| Stars | Facilities | Avg QM 521 % | Avg fines $ |
|---|---|---|---|
| 1 | 2,982 | 25.399954 | 83,438.33 |
| 2 | 2,930 | 24.003832 | 36,564.70 |
| 3 | 2,870 | 23.935531 | 16,303.59 |
| 4 | 2,772 | 23.332278 | 8,138.32 |
| 5 | 3,011 | 21.952532 | 3,228.84 |

**Header problems on Facility_Master:**
- **Duplicate headers:** `"  footnote"` ×4, `"  vs national (CMS determination)"` ×2, `"  eligible stays"` ×2.
- Ten headers start with spaces: the 8 above, plus `"  episodes"` and `"  vs national"`.
- Excel PivotTables silently rename duplicates ("  footnote2"…). Power Query and pandas mangle them. When filtering, the user cannot tell which measure a "footnote" column belongs to.
- **No Excel Table object** is defined. Only AutoFilter is set, so new formulas will not auto-extend. This is minor.

---

## 5. Requirements audit

The owner asked for: "profile SNFs based on quality measures, penalties, withholds, complaints, and other key measures of performance … joined into a useable spreadsheet that I can filter and pivot … very high degree of trustworthiness".

| Ask | Status | Finding |
|---|---|---|
| Quality measures | Mostly met | Star ratings, 12 of 17 MDS QMs, 4 of 4 claims QMs, and 18 QRP measures are on the sheet. **Missing:** MDS 409 (restraints), 415 (long-stay pneumococcal), 452 (antianxiety/hypnotic), 454 (long-stay flu), 480 (incontinence); they are only in the CSV. **No MDS, QRP-numeric, VBP or sub-rating footnotes** (see Fix 2). |
| Penalties | Met | Fines count and $, last-12-month fines, payment denials and days, last penalty date. The detail sheet has every row. Reconciles exactly to Provider Info. |
| **Withholds** | **Not explained** | The VBP incentive multiplier is present but **nowhere explained**. CMS says: "CMS withholds 2% of SNFs' Medicare fee-for-service (FFS) Part A payments to fund the SNF VBP Program" and "CMS redistributes 60% of the withhold to SNFs as incentive payments" (cms.gov SNF VBP page, fetched 2026-10-26). In this data, **10,843 of the 13,775 nursing homes in VBP (79%) have a multiplier below 1.0**, meaning a net Medicare Part A reduction. Only 2,932 are at or above 1.0. **173 sit at the floor of 0.980322**, keeping none of the 2%. The README and LIMITATIONS only call the multiplier a "spending signal", and the column header gives no hint that below 1.0 means lost money. The CMS aggregate file says the dollar amounts are "To be added at the end of FY 2026", so dollar withholds cannot be computed yet. |
| Complaints | Partly met | Only "Complaint-survey deficiencies, 3 cycles" (deficiencies flagged Complaint=Y). **Missing:** (a) complaint deficiencies in CMS's 12-month window (`C_H_CMPL`, 09/01/2025–08/31/2026); (b) the **number of complaint inspections**, which is in the Survey Dates file (health complaint surveys: 17,491 / 20,616 / 21,011 by cycle per T-013) but never surfaced; (c) Provider Info rating-cycle complaint deficiency counts. It should also state plainly that **counts of complaints received or substantiated, and facility-reported incidents, are not in these files**, so the user does not read deficiency counts as complaint counts. |
| Other key measures | Met | Staffing, turnover, case-mix, SFF, abuse icon, ownership, chain, infection control, fire safety. |
| Filter and pivot | Partly met | AutoFilter and freeze panes work. Blocked or impaired by the duplicate and leading-space headers, the text-stored counts and dates, and the unit mismatch below. |
| Very high trust | Values yes, docs no | Values: 100% verified. Docs: inaccurate in several places (below). |

**Unit inconsistency (misleading):**
- **VBP rates are fractions:** readmission median 0.2039 (range 0.1343–0.3114), HAI median 0.0711, turnover median 0.4711 (0.05–1.0).
- **QRP and Provider Info rates are percentages:** QRP 004 median 10.66, QRP HAI median 7.11, Provider Info turnover median 44.9.
- The headers state no units. A filter of "> 20" on the VBP readmission column returns nothing.

**Inaccurate statements in README, LIMITATIONS and docs:**
1. **LIMITATIONS #9 is false.** It says "Medicaid-only facilities (247) have no Medicare claims-based measures … by construction". In fact **167 of 247 have a QM 551 value** and 3 have a QM 521 value. Example: **CCN 04A293**: QM 551 = 2.512327, QM 552 = 1.910049 in raw and workbook. Their QRP and VBP values are blank (0 of 247), which is correct.
2. **README, "SNF QRP files dated 2026-07-01": wrong.** The provider-level QRP file used is `fykj-qjee_2026-09-30_…_Sep2026_2.csv`. Only the national QRP file (unused in the workbook) and the swing-bed file are July 2026.
3. **README, "wherever a value is blank, look at the adjacent footnote column": false** for most columns. Only Overall rating and the 4 claims QMs have one. Example: **CCN 235324**: "Short-stay flu vaccine % (QM 472)" is blank, raw footnote is 9, and no footnote column exists on the sheet.
4. **README, "matched for all 14,690 facilities except one known CMS nuance": understated.** The rating-cycle-1 check matches 14,203 of 14,690. **487 facilities do not match** (449 real differences + 38 null), and **162 are unexplained** (T-009).
5. README says "~120 columns"; there are 115. It says the severity grid is undefined in the dictionary; "G or greater" = harm is in it (see 3a).
6. **TRUTH_LEDGER T-002** says "~790 facilities not in VBP". The actual number of nursing homes with no VBP row is **915** (14,690 − 13,775); 790 ignores the 125 hospitals. T-011 has the right figures but T-002 was never corrected.
7. **TRUTH_LEDGER T-012 and DECISION_LOG D-009** say all casts are asserted lossless. That is true only for provider_info. The penalties, citations, ownership and VBP casts are unguarded, and the ownership date cast lost 100% of its values.
8. **Operating Rules §2** says `data_vintage` is carried on every table. It is only on facility_master.
9. **Measure_Catalog period for MDS 430/434** shows `2025Q2-2026Q1`, taken from the MDS file's Measure Period. CMS's Collection_Intervals file says 01/01/2025–03/31/2026. This is CMS's own inconsistency, not a pipeline error, but it should be flagged on the sheet.
10. The Measure_Catalog direction column marks MSPB "lower is better". That is defensible, but it is a value judgment, and it is correctly labelled as needing Quality Expert sign-off.

---

## 6. Required fixes, ranked by severity

| # | Severity | Fix | Evidence (expected vs actual) |
|---|---|---|---|
| 1 | **High** | Repair the ownership association-date cast: parse `since MM/DD/YYYY` with `strptime('%m/%d/%Y')`, and add the lossless assert to **every** cast (penalties, citations, ownership, VBP). | Raw CCN 015009, DEARMAN, CAMERON: `since 01/25/2012`. Ownership_Detail `association_date`: blank. **250,677 non-blank raw → 0 parsed.** `own_most_recent_association_date`: 14,690 of 14,690 NULL. |
| 2 | **High** | Carry a footnote column next to every value that CMS can suppress: the 12 MDS QMs, the 18 QRP numeric columns, the 4 VBP rates, the health/QM/long-stay/short-stay/staffing rating footnotes, the staffing and turnover footnotes. Or rewrite the README claim. | CCN 235324, QM 472: expected "blank + footnote 9", actual blank with no footnote column. Medicaid-only CCN 43A137, QRP S_004/S_005: raw footnote 14, not visible. |
| 3 | **High** | Explain VBP withholds in README and LIMITATIONS: the 2% withhold, the 60% redistributed, and that multiplier < 1.0 means a net Part A reduction and 0.9803 means the whole 2% is lost. Optionally add an `x_vbp_net_payment_change_pct = (multiplier − 1) × 100` column, labelled as derived. | 10,843 of 13,775 have multiplier < 1.0. 173 at 0.980322. Nothing on any sheet explains this. Source: cms.gov SNF VBP page. |
| 4 | **Medium** | Correct LIMITATIONS #9. | CCN 04A293 (Medicaid-only): QM 551 = 2.512327, QM 552 = 1.910049. 167 of 247 Medicaid-only have QM 551. |
| 5 | **Medium** | Write "Health deficiencies, most recent cycle" as a number and "Most recent standard health survey date" as an Excel date. Also cast `ss_c1_fire_deficiencies` and the detail-sheet dates (`payment_denial_start_date`, `correction_date`). | CCN 025025: cell value `'22'`, type `s`; date `'2025-12-24'`, type `s` (14,690 of 14,690 each). |
| 6 | **Medium** | Make every Facility_Master header unique and remove leading spaces. Examples: "QM 521 footnote", "QRP readmission vs national", "QRP readmission eligible stays". | Duplicates: `"  footnote"` ×4, `"  vs national (CMS determination)"` ×2, `"  eligible stays"` ×2. |
| 7 | **Medium** | Put units in the VBP headers ("fraction, 0–1") or convert them to %, so they line up with the QRP and Provider Info columns. | VBP readmission median 0.2039 vs QRP 004 median 10.66; VBP turnover median 0.4711 vs Provider Info 44.9. |
| 8 | **Medium** | Fill out the complaint measures: complaint deficiencies in CMS's last-12-month window, complaint survey counts from Survey Dates, and a plain statement that complaints received or substantiated are not in the data. | Only `hc_n_complaint` (3-cycle) exists. Survey Dates complaint surveys are loaded but unused. |
| 9 | **Low–Med** | Fix the README statements: QRP file date; "one known nuance" (487 non-matching, 162 unexplained); "~120 columns" (115); the severity-grid sourcing. | See §5, items 2, 4 and 5. |
| 10 | **Low** | Complete LINEAGE: give `data_vintage` a source; name the exact file and measure code for each QM and QRP column; mark `ss_c1_*` as direct copies of Survey Summary. | 66 of 115 rows say "derived" with a blank source_file. `data_vintage` row is blank. |
| 11 | **Low** | Include partnership interests in the owner columns (or add a "Partnership owners" column). Add an "Ownership data available (Y/N)" flag. Rename "Operational/managerial control orgs" or add an individuals column. Keep the raw ownership-percentage text. | CCN 015460: partnership owners only, both owner columns blank. CCN 015012: individual operators only, column blank. 637 facilities have no ownership data and no flag. |
| 12 | **Low** | Add MDS 409, 415, 452, 454 and 480 to Facility_Master, or say in README why they are left out. | In the CSV, not on the sheet. |
| 13 | **Low** | Replace `scope_severity_code >= 'G'` with an explicit `IN (...)`. Derive the 12-month date from `processing_date` instead of hard-coding it. | Correct today (§3a, §3b) but would break silently on a future code or a refresh. |
| 14 | **Low** | Correct TRUTH_LEDGER T-002 (~790 → 915 nursing homes without VBP), T-012 and D-009 (casts are not all asserted), and Operating Rules §2 (`data_vintage` is only on facility_master). | §5, items 6–8. |
| 15 | **Low** | README: warn that opening the CSV directly in Excel strips leading zeros from CCN and ZIP (use Data > From Text with those columns set to Text). | CSV CCN `025025` → Excel shows 25025. |
| 16 | **Process** | Operating Rule 1.7 (check against the medicare.gov website) could not be met: the page is a JavaScript shell. Have a human or browser agent view 3–5 CCNs, or accept the data.cms.gov API (same vintage) as the public source. | §2. |

**What is verified and can be trusted as-is:**
- every number on Facility_Master that I tested (92 columns × 14,690 facilities)
- all detail-sheet row counts
- the Summary formulas
- all cross-file reconciliations claimed in T-008
- the 12-month anchor
- the severity filter (for this release)
- the QRP, MDS and Claims pivots
- the handling of suppression (blank, never 0)
