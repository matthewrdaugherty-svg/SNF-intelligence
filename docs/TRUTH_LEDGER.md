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

## T-018 App validation round 3 (docs/VALIDATION_REPORT_03_APP.md, independent agent, different model, 2026-10-26)
- Data correctness: 8 facilities × every displayed value (1,673 values) vs db/snf.duckdb → 0 mismatches. 28/28 Explore filter combinations match DuckDB counts; haversine distances match Python; CSV keeps leading zeros. Flows quality mix, weighted averages, unmatched bucket and nearby alternatives match a Python recompute.
- Verdict FAIL on packaging: 16 defects, led by a SQL-injection path through the `sort` URL parameter (DuckDB-wasm executes multi-statement strings; a crafted link could alter the in-browser tables for that session — never the source files or other users). All 16 fixed in app v1.1 (commit c99296a); 5 regression tests added. Re-verification requested (report 04).
- Correction to the report: the count for "baltimore" within Maryland is 40 (DuckDB), not 41.

## T-019 Hospital layer (scripts/06_load_hospital.py, 2026-10-26; sources in scripts/05_download_hospital.sh)
- Hospital Service Area file 2025 (dataset 8708ca8b…): 1,175,708 rows = the API's found_rows; 7,452 provider numbers; 1,024,470 rows (87%) suppressed ('*', fewer than 11 cases); 151,238 visible rows; minimum visible cases = 11. Values are zero-padded strings in the CSV.
- Care Compare Hospital General Information (Jul 2026): 5,419 hospitals (3,107 acute care, 1,382 critical access, 624 psychiatric, 132 VA, 94 children's, 43 rural emergency, 32 DoD, 5 long-term). 2,368 HSAF provider numbers are not in this list (kept in `hsaf`, not in `hospital_master`).
- Medicare Inpatient Hospitals by Provider 2024: 3,044 hospitals; 2,982 match the Care Compare list. Johns Hopkins Hospital (210009): 10,157 discharges, 7,404 beneficiaries, $428,579,020 Medicare payment.
- Hybrid hospital-wide readmission (Hybrid_HWR) is 'Not Available' for ALL 4,790 hospitals in the Sep 2026 Unplanned Hospital Visits file (footnote 4). Condition-specific READM_30 rates are populated (HF 3,253; PN 3,758; COPD 3,086; AMI 1,971; hip/knee 1,695).
- Hospital Spending by Claim (2024): 2,877 hospitals have a SNF 1–30-days-after-discharge row. Maryland hospitals (e.g. 210009) have none [industry context: Maryland hospitals are exempt from the MSPB measure under the state's all-payer model — not verified from a CMS page in this project].
- PAC PUF SNF 2024: 13,784 provider rows (+52 state, 1 nation); 13,511 match the 14,690 nursing-home universe. National: 1,586,658 stays, $25,451,696,743 Medicare payment, 1,171,990 beneficiaries. Sentinels '*' and '+'.
- 93 casts, all lossless (db/cast_log_hospital.csv).

## T-020 Service-area model (MODELED — decision D-013)
- hospital_service_area: 151,222 hospital-ZIP rows for 6,405 hospitals (visible rows with a ZIP); shares of visible cases sum to 1.000000 per hospital (asserted).
- snf_hospital_area: 138,281 hospital-SNF pairs; a SNF is "in" a hospital's service area when its ZIP is one of the hospital's visible ZIPs. modeled_weight = ZIP share × SNF's share of Medicare stays among SNFs in that ZIP (equal split if none report stays).
- Johns Hopkins Hospital: 10,834 visible cases from 200 ZIPs; 209 SNFs in those ZIPs; 65.6% of visible volume comes from ZIPs that contain ≥1 SNF (the rest is unassigned — patients from ZIPs with no SNF use SNFs elsewhere; a distance-based assignment needs ZIP centroids, blocked until www2.census.gov is allowed). Modeled quality mix: 42.9% in 4–5★ (94 SNFs), 19.1% in 3★ (42), 37.6% in 1–2★ (71), 0.4% unrated.
- Hospital *system* grouping: resolved by T-021 (PECOS owner organizations). Before T-021 users selected a system's hospitals individually.

## T-021 PECOS ownership layer (scripts/07_load_pecos.py; data.cms.gov release 2026-09-29, loaded 2026-10-26)
- Files: Hospital All Owners 146,948 rows; Hospital Enrollments 9,138; Hospital CHOW 779; SNF All Owners 300,738; SNF Enrollments 14,404; SNF CHOW 5,340 (each equals the download's line count minus the header; asserted). Downloaded by scripts/08_download_pecos.sh; the catalog (data.cms.gov/data.json) also exposes each file as an API dataset.
- Encoding: 72 lines across the six files contain stray Windows-1252 bytes (en dash, inverted question mark, non-breaking space); raw/pecos/clean/ holds UTF-8 copies transcoded from cp1252 with 0 unrecoverable characters (raw/pecos/clean/_encoding_log.json). The loader reads the clean copies.
- Keys: CCN and Enrollment ID are unique in both enrollment files (asserted). Hospital CCNs include 7–9-character sub-unit IDs (e.g. 09S005); they are kept but only 6-character CCNs join to Care Compare.
- Coverage: 5,133 of 5,419 Care Compare hospitals and 14,210 of 14,690 nursing homes have a PECOS enrollment row; 3,188 hospitals have at least one organization holding a 5%+ direct or indirect ownership interest (role codes 34/35). Hospitals with no such owner are typically their own top-level entity (2,231) — they have no "system" in this definition.
- Owner organizations: 3,102 (associate ids) with role 34 (direct) or 35 (indirect); 2,327 own ≥1 Care Compare hospital; 57 names map to more than one associate id; large chains appear under several holding-company names (HCA Inc 152 hospitals, HealthTrust 149, HCA Healthcare Inc 148, Frisco Holding II 141 …) because a hospital lists every owner up its chain.
- Hospital *families* (D-025, revised after Validation Report 05): built from CONTROLLING interests only — an owner's stake counts when its reported percentage is ≥50% or unreported (Hercules Holding II / Frisco Holding II hold 14–20% of ~155 HCA hospitals; Ascension holds 20% of Henry Ford hospitals; neither can pull a hospital into its family). Rules: same exact name = one organization; an organization with ≥2 controlled hospitals attaches to the largest organization that holds a DOCUMENTED controlling share (reported ≥50%) in at least two-thirds of them (all 24 attachments between 2/3 and 80% were checked by hand: Dignity → CommonSpirit, Northwell, Novant, Trinity, UHS, Ascension Via Christi…; unreported shares never create a subsidiary, so joint-venture partners such as Baylor/Tenet and single-hospital investors such as Bain Capital stay separate); families are the resulting trees; label = largest member not named as a HOLDING/HOLDINGS/ACQUISITION/BUYER vehicle; all member names kept as searchable aliases. Result: 2,286 owner names → 1,953 families (76 with >1 name). Known limit: VHS San Antonio Partners LLC (9 USPI joint-venture surgical hospitals) stays its own family because Tenet reports no percentage on any of them. Asserted in the loader: HCA Inc / HCA Healthcare Inc / HealthTrust are ONE family (156 hospitals, 18 states, every member hospital controlled by an HCA entity); Henry Ford ≠ Ascension; Baylor ≠ Tenet; Dignity = CommonSpirit; Bain Capital ∉ HCA; HCA / UHS / CommonSpirit / Tenet / Hopkins are FIVE families. 76 hospitals are controlled by organizations from two families (joint ventures) and appear in both.
- Geography: family membership carries each hospital's state, so the picker adds a system's hospitals by chosen state(s). Hopkins family: MD 5 (4 with service-area data → 226 SNFs), DC 1, FL 1. Tested end-to-end.
- Johns Hopkins Health System Corporation (associate id 6002711397): 8 enrollments (090005 Sibley, 09S005 sub-unit, 103300 All Children's FL, 210009 Hopkins, 210022 Suburban, 210029 Bayview, 210048 Howard County, 213300 Mt Washington Pediatric); 7 in Care Compare; 5 with service-area data; 235 SNFs in their combined service areas. Tested end-to-end.
- SNF view (snf_pecos): 10,140 of 14,404 enrollments carry a CMS "affiliation entity"; where both exist, Care Compare's chain name equals the PECOS affiliation entity for 9,960 of 9,973 facilities (211 Care Compare chains have no PECOS affiliation; 57 the reverse). 5,338 enrollments have at least one change of ownership since 2016. Self-reported private-equity and REIT owner flags are carried as stated in PECOS (not verified).
- Casts: 8, all lossless (db/cast_log_pecos.csv). Reconciliation: db/reconciliation_pecos.json.

## T-022 SNF vs Medicaid-only nursing facility — classification verified against CMS rules (2026-10-27)
- Care Compare "Provider Type" (data dictionary: "Category which is most indicative of provider", no code list) takes three values: Medicare and Medicaid 13,905 · Medicare 538 · Medicaid 247.
- CMS State Operations Manual ch. 2 §2779A1 assigns Medicare skilled nursing facilities CCNs 5000–6499 in positions 3–6; §2779B says title XIX-only (Medicaid-only) providers get a 6-character alphanumeric CCN whose third character is a letter identifying the level of care: A001–A999 and B001–B999 = NF (formerly Medicaid SNF), E001–E999 and F001–F999 = NF (formerly ICF), G/H = ICF/MR, K = Medicaid HHAs, L = PRTF.
- Our data obeys that rule for all 14,690 homes (asserted in scripts/07_load_pecos.py): the 14,443 Medicare-certified homes all have a 5 or 6 in position 3; the 247 Medicaid-only homes have E (122), A (116) or F (9).
- Independent confirmations: 0 of the 247 appear in CMS's PECOS "SNF Enrollments" file (every row of which is "PART A PROVIDER – SKILLED NURSING FACILITY", 00-18; its dictionary defines CCN as the "Skilled Nursing Facility's CMS Certification Number"), vs 14,210 of 14,443 Medicare homes; 0 of the 247 are in SNF VBP; all 247 carry QRP footnote 14 "not required to submit data for the SNF QRP".
- Conclusion: Provider Type = Medicaid ⇔ Medicaid-only nursing facility (NF), not a SNF. The app's Certification filter and the "SNF / nursing home / facility" wording (D-029) rest on this.
- Not checked: mimilabs documentation (their site requires an account); nothing found publicly that contradicts the CMS rule.

## T-023 Services layer — CMS-671 Long-Term Care Facility Characteristics (Q2 2026; scripts/09_load_ltc671.py; loaded 2026-10-27)
- 14,696 facilities (unique CCNs); 14,686 match facility_master (4 Care Compare homes have no 671 row; 10 671 rows are not in Care Compare). 14 casts, all lossless.
- Certification detail (Program Participation Code): SNF/NF Medicare/Medicaid 9,205 · SNF/NF dual 4,109 · SNF/NF distinct part 577 · SNF Medicare participation 397 · NF Medicaid participation 186 · SNF Medicare only 149 · NF Medicaid only 71 · blank 2. Agreement with Care Compare Provider Type on "Medicaid-only": 14,675 of 14,684 (9 differ; both shown as-is).
- Dedicated special-care-unit beds (self-reported): ventilator 429 homes / 12,108 beds · dialysis 341 / 3,828 · Alzheimer's 1,994 / 56,477 · hospice 469 / 5,010 · head trauma 134 / 2,047 · other specialized rehab 295 / 9,384 · AIDS 83 · Huntington's 83 · children/young adults 61. Not verified by inspectors; a zero does not prove inability to accept such patients (stated in the app).
- Hospital-based flag: 591 Yes; agrees with Care Compare "provider resides in hospital" for 14,645; 27 Y/No and 14 N/Yes differ.
- Census by payer at last survey: Total Residents equals Medicare + Medicaid + Other in every row (asserted). 113 rows nulled as unreliable (19 impossible values such as a CCN typed into the field or totals in the billions; 94 above 1.2 × certified beds). National sums over the kept rows are not meaningful as a point-in-time census because surveys are spread over 2023–2026.
- Reconciliation: db/reconciliation_ltc671.json; casts: db/cast_log_ltc671.csv.

## T-024 Hospital discharge mix, SNF patient mix, ZIP centroids (scripts/11_load_drg.py, 12_load_zip_centroids.py; loaded 2026-10-27)
- Medicare Inpatient Hospitals by Provider and Service, calendar 2024: 145,879 hospital×DRG rows, 2,906 hospitals, 4,952,481 visible discharges (CMS suppresses DRGs with <11 cases at a hospital). 2,867 hospitals match hospital_master; visible DRG rows cover a mean 57.7% (median 60.1%) of each hospital's full 2024 Medicare discharge count — the app states this beside every mix.
- DRG → MDC from the CMS MS-DRG v42.1 Definitions Manual Appendix A (docs/reference/msdrg_v42_1_list.txt, 773 DRGs, retrieved verbatim) plus the five v41 spinal-fusion DRGs (453–455, 459–460) still present in the 2024 claims file; every DRG in the file maps (asserted). 43 plain-English discharge families: 16 named DRG sets (joint replacement, hip fracture, spine surgery, stroke, heart failure, heart attack, cardiac procedures, amputation, pneumonia, COPD, ventilator/trach/respiratory failure, sepsis, kidney failure, UTI, wounds, transplant) and the MDC name for everything else. Shares sum to 1 per hospital (asserted).
- SNF patient mix: PAC PUF 2024 primary-diagnosis chapter shares and chronic-condition shares for 13,784 SNFs; '*' = suppressed, '0' = zero (both kept as such). Only 6,741 SNFs have published chapter shares covering ≥60% of their stays.
- Case-mix overlap (MODELED, D-031): Σ min(hospital chapter share, SNF chapter share) using an MDC→ICD-chapter crosswalk; reported only when the SNF's published shares cover ≥60% of its stays, otherwise withheld with the reason. Hopkins × FutureCare Pineview = 47% (91% published); Hopkins × Carroll Park withheld (0% published).
- Census 2024 ZCTA Gazetteer: 33,791 ZCTAs with centroids; 26,764 of 28,966 service-area ZIPs (99.3% of cases) and 14,606 of 14,690 facility ZIPs have a centroid.

## T-025 Placement scenario engine (app/src/lib/scenario.ts; MODELED — decision D-032; verified 2026-10-27)
- Baseline = the hospital's SNF volume by home: user-loaded counts (Flows) when present, else snf_hospital_area modeled_weight. Acceptable set = overall rating ≥ minStars, no special-focus/abuse-icon home (optional), Medicare-certified only (optional), required CMS-671 units (optional), case-mix overlap ≥ threshold (optional; homes with withheld overlap are excluded when the threshold is on).
- Move rule: for each non-acceptable home, shift × its volume goes to the k nearest acceptable homes within maxMiles (haversine between ZIP centroids, T-024), split equally; if none is in reach the volume is counted as unplaced and keeps its original home's rates.
- After = volume-weighted mean of each home's published rates (QRP 004, QM 521, QRP 005, overall rating, 1–2★ share) and PAC PUF Medicare payment per stay; homes missing a rate are excluded from that rate's average, before and after alike (coverage stated in the card note).
- Johns Hopkins Hospital, defaults (4★+, flags excluded, SNF only, 10 mi, 3 homes, 100% shift): 55.3% of modeled volume moved to 99 receiving homes; 1.8% unplaced; +3.0 miles average; QRP 004 11.66% → 11.58%; QM 521 21.2% → 19.5%; QRP 005 56.0% → 58.9%; payment/stay $15,638 → $13,981; 1–2★ share 37.6% → 1.2%; average rating 3.18 → 4.48. Replicated independently in DuckDB from the same tables (app/tests/app.spec.ts asserts the rendered figures against that arithmetic). With n=1,800 annual SNF discharges the same rates are shown as counts per year.
- Not modeled, stated in the app: bed availability, admission criteria, payer contracts, patient choice, any change in a home's rates when its volume changes, travel from the patient's home (distance is measured from the home they would otherwise have used).
