# TRUTH LEDGER — verified facts about this dataset

Each entry: what we verified, how, and when. If a later step contradicts an entry, stop and log it in DECISION_LOG.md.
Vintage: CMS Care Compare nursing-home refresh with Processing Date 2026-09-01 (files dated 2026-09-30),
SNF QRP files dated 2026-07-01, SNF VBP FY2026 files dated 2025-11-01 / 2025-12-02.

## T-001 File inventory (verified 2026-10-26 by scripts/01_profile.py against manifest.json)
All 18 files in manifest.json arrived; byte sizes match the manifest exactly.

## T-002 Facility universe
- Provider Information (4pq5-n9py) has **14,690 rows, 14,690 distinct CCNs**, zero null CCNs, all 6 characters.
- Provider Type split: Medicare and Medicaid 13,905; Medicare-only 538; Medicaid-only 247.
- Every per-facility measure file keys to exactly this universe: MDS QM, Claims QM, SNF QRP, Survey Summary,
  Survey Dates, Ownership all have 14,690 distinct CCNs.
- Health Citations: 14,628 distinct CCNs (62 facilities have no health citations in the window — plausible, not an error).
- Fire Safety Citations: 13,905 distinct CCNs.
- Penalties: 6,766 distinct CCNs (only facilities with ≥1 penalty appear; absence = no penalty in window, NOT missing data).
- SNF VBP FY2026: 13,900 rows/CCNs — matches the aggregate file's "Total Number of SNFs Receiving Value-Based
  Incentive Payments = 13900" exactly. 13,775 of them match the nursing-home universe, so **915 nursing homes are not in VBP** (corrected from an earlier '~790' estimate by Validation Report 01); reasons (Medicaid-only, low volume, exclusions) to be confirmed per CMS VBP eligibility rules.
- Swing Bed file: 764 distinct CCNs (hospitals with swing beds; these are NOT in the 14,690 nursing-home universe and are kept separate).

## T-003 Long-file shapes (exact multiples, verified)
- MDS QM: 249,730 rows = 14,690 × 17 measures. Measure codes: 401,404,406,407,408,409,410,415,430,434,451,452,454,472,479,480,481.
  Measure period 2025Q2–2026Q1 except 454/472 (2024Q3–2025Q2). "Used in Quality Measure Five Star Rating"=Y for 401,406,407,410,434,451,479,481.
- Claims QM: 58,760 rows = 14,690 × 4 measures (521,522,551,552), period 2025-01-01..2025-12-31, all four used in 5-star.
- SNF QRP provider data: 837,330 rows = 14,690 × 57 measure codes. Score column is text; non-numeric values are
  "Not Available" (142,703), "No Different than the National Rate" (30,564), "Better than the National Rate" (3,038), "Worse than the National Rate" (1,843).
- Ownership: 251,314 rows; multiple rows per facility (roles). 637 rows are "Ownership Data Not Available".

## T-004 Penalties
- 15,419 rows: 12,989 Fines (6,510 facilities) + 2,430 Payment Denials (1,876 facilities).
- Penalty dates span 2023-09-17 .. 2026-08-17 (≈ 3-year lookback).
- Sum of Fine Amount across all rows = $454,984,026 (to be reconciled against Provider Info "Total Amount of Fines in Dollars" in scripts/02_load.py — see T-010 when done).

## T-005 Footnote codes observed
- MDS 4Q-average footnotes: 9 (9,594), 10 (273), 21 (89). Claims: 9 (11,680), 10 (808). QRP: "-" (none), 9, 10, 14, 1, 13, "9,13", "1,13".
- Meaning of each code: see DATA_DICTIONARY_DIGEST.md (populated from the PDF, not from memory).

## T-006 Ratings
- Overall Rating is 1–5 for 14,565 facilities; null for 125 (footnote 1: 38 facilities; footnote 18: 87 facilities).
- Special Focus Status: SFF 87, SFF Candidate 440, blank 14,163.
- Abuse Icon Y: 1,429 facilities. High Performing Icon Y: 1,699.

## T-007 Not in this data (confirmed by inspecting every column header of every file)
- No hospital identifier, referring provider, or discharge-source field exists in any of the 18 files.
  Hospital→SNF flow analysis REQUIRES an external source (see docs/EXTERNAL_DATA_SOURCES.md).
- No cost, revenue, payer mix, or episode-spend fields except: SNF QRP MSPB score (S_006_01_MSPB_SCORE, a ratio
  vs. national, not dollars) and VBP incentive multiplier.
- No NPI in any file (crosswalk to NPPES will need an external file).

(Entries T-008+ appended by the pipeline and validators as they verify more.)

## T-008 Cross-file reconciliation results (scripts/02_load.py, 2026-10-26; full detail in db/reconciliation.json)
- Provider Info `Number of Fines` == count of Fine rows in Penalties: **14,690 / 14,690 facilities match**.
- Provider Info `Total Amount of Fines in Dollars` == sum of Penalties fine amounts (within $1): **14,690 / 14,690 match**.
- Provider Info `Number of Payment Denials` == count of Payment Denial rows: **14,690 / 14,690 match**.
- Provider Info `Number of Citations from Infection Control Inspections` == citations flagged IC: **14,690 / 14,690 match**.
- Survey Summary cycle-1 `Total Number of Health Deficiencies` == count of Health Citations rows with Inspection Cycle=1: **14,690 / 14,690 match**.
- CMS State Averages file reproduces EXACTLY (max diff 0.000) as the simple unweighted mean of facility values (tested on QM 521 rehospitalization). State mean Overall Rating matches to ±0.05 (CMS rounds to 1 decimal).
- Conclusion: the Penalties, Citations, Survey Summary and State Averages files are internally consistent with Provider Info. Joins on `ccn` are correct.

## T-009 Known, explained difference: "Rating Cycle 1" (Provider Info) vs "Inspection Cycle 1" (Survey Summary / Citations)
- 14,203 facilities: identical counts. 38 facilities: Provider Info count is null (new/unrated, footnote 1). 449 facilities differ, all with the SAME survey date.
- 287 of the 449 are exactly explained by Provider Info excluding citations currently under Informal Dispute Resolution (IDR/IIDR flags in the citations file). The remaining 162 are NOT yet explained — OPEN ITEM for the Quality Expert to resolve against the CMS Five-Star Technical Users' Guide. Until resolved, use Survey Summary / citation counts for "what was cited" and Provider Info rating-cycle counts only for "what the star rating used".
- Also: Provider Info `standard + complaint` deficiencies ≠ `total` for 3,933 facilities because a single deficiency can be flagged both standard and complaint (overlap, not error).

## T-010 Scope & severity codes present in Health Citations (counts): B 4,814; C 4,402; D 264,694; E 93,485; F 28,988; G 12,858; H 439; I 19; J 6,637; K 2,004; L 607. No "A" codes in file.

## T-011 SNF VBP FY2026 universe vs nursing-home universe
- 13,900 VBP rows; 13,775 match Provider Info CCNs; 125 do NOT. All 125 are hospitals (hospital-range CCNs, names like "... Medical Center") — i.e. hospital swing-bed units that participate in SNF VBP. 53 of the 125 appear in the Swing Bed QRP file; 72 do not. These 125 are kept out of facility_master (D-007) and listed in the workbook's VBP sheet with a flag.

## T-012 Provider Info typing
- Provider Info date columns are ISO (YYYY-MM-DD). Ownership 'Association Date' is 'since MM/DD/YYYY' (250,658 rows) plus 'NO DATE PROVIDED' (19) and blank (637). Ownership Percentage is text with sentinels 'NOT APPLICABLE' (224,383) and 'NO PERCENTAGE PROVIDED' (10,119). VBP numeric columns use '---' for not reported.
- As of pipeline v2, every column-level cast (128 casts across provider_info, penalties, citations, survey_dates, survey_summary, ownership, VBP) asserts non-blank non-sentinel raw count == non-null typed count; log in db/cast_log.csv. The MDS/Claims/QRP pivots convert values inside the pivot instead; the QRP pivot asserts its numeric count matches the long file, and Validation Reports 01/02 confirmed the MDS and Claims pivots value-for-value.
- Overall Rating populated for 14,565; beds for 14,680; residents/day for 14,624; lat/long for 14,690.

## T-013 Survey types and cycles (Survey Dates file)
- Health Standard surveys: cycle1 14,690 / cycle2 14,652 / cycle3 14,588. Health Complaint: 17,491 / 20,616 / 21,011. Infection Control: cycle2 196, cycle3 1,382 (none in cycle 1). Fire Safety Standard: 14,687 / 14,650 / 14,585.

## T-014 Validation round 1 (docs/VALIDATION_REPORT_01.md, independent agent, different model, 2026-10-26)
- 12 random facilities × 15 fields vs raw files: 180/180 match. 92 Facility_Master columns × 14,690 facilities vs raw: all match. 5 facilities vs live CMS provider-data API: all match (same vintage, processing date 2026-09-01, so this proves the files equal what CMS currently publishes, not an independent second source).
- medicare.gov Care Compare pages are JavaScript shells and cannot be machine-read; a human spot-check there remains open (Operating Rule 1.7).
- Defect found and fixed: ownership association dates were silently nulled by an ISO cast of an MM/DD/YYYY field (v1). Fixed in v2 with strptime + lossless assert (D-011).
- 15 further packaging/documentation defects fixed in v2 (see D-011).

## T-015 SNF VBP mechanics (source: cms.gov SNF VBP program page, fetched by the validator 2026-10-26; wording quoted in VALIDATION_REPORT_01.md §5)
- CMS withholds 2% of SNF Medicare FFS Part A payments to fund the program and redistributes 60% of the withhold as incentive payments.
- FY2026 file: 10,843 of 13,775 nursing homes in VBP have incentive multiplier < 1.0; 173 are at the floor 0.980322; 2,932 at or above 1.0. Dollar amounts "to be added at the end of FY 2026" (aggregate file).

## T-016 Medicaid-only facilities DO have claims-based QMs
- 167 of 247 Medicaid-only facilities have QM 551 values (e.g. CCN 04A293). They are excluded from SNF QRP/VBP (QRP footnote 14), not from the Care Compare claims QMs.

## T-017 Live deployment checks (2026-10-26, in Matt's Chrome against https://snf-intelligence.vercel.app)
- Explore ?st=MD&stars=5 → 54 facilities (matches db). Map radius 10 mi around Johns Hopkins Hospital (39.2970, -76.5929) → 63 facilities, nearest first.
- Facility 215340 (Blue Point Healthcare Center): total fines $341,978, VBP ranking #3,239, QM 521 = 19.7% — all match the raw CMS values.
- Two deployment-only defects found and fixed the same evening: (1) MapLibre worker file not bundled → 404 → no map rendered; (2) MapLibre's unlayered CSS overrode the Tailwind `absolute inset-0` utility → 0-height map. Both were invisible in the sandbox run because the earlier test only checked that the map element existed; the test now asserts a worker-error-free load and real map dimensions.
- Lesson (Operating Rule candidate): a "renders" test must assert something about the rendered output (dimensions, pixels, data), never just element existence.
