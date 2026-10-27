# DATA DICTIONARY DIGEST — CMS Nursing Home / SNF Provider Data Catalog

**Source (only source for this document):** `/home/claude/snf-intel/raw/NH_Data_Dictionary.pdf` — "Nursing Home Care Compare and Provider Data Catalog Consolidated Data Dictionary", footer "Nursing Home Data Dictionary, updated September 2026", 56 pages, Author: CMS. PDF page number = printed footer page number (page 1 is the cover).
**Raw CSV headers** were read from line 1 of every CSV in `/home/claude/snf-intel/raw/` (header row only; no data values were inspected for this document).

**Rules used while writing this file**
- Everything under a dataset heading is taken from the PDF. Descriptions are verbatim or near-verbatim.
- Where the PDF does not say something that a reader would reasonably expect, the text reads `UNCLEAR IN DICTIONARY: ...`. Nothing was filled in from outside knowledge.
- "Type" is the dictionary's "Variable Type" column (Text, Text (n), Numeric, Date, Y/N). The dictionary footnote on p.12 says: *"If there is a number in parentheses for a text variable, it means that this field always has this length. For example, PROVNUM listed as Text (6) always has 6 characters, and these can be letters or numbers."*
- Column names below are written exactly as they appear in the actual CSV header unless noted. Where the PDF spells a name differently, see section 6 (mismatches).

---

## 0. HEADLINE FINDINGS (read this first)

1. **All 18 raw CSVs have a section in this dictionary.** The three SNF QRP files (fykj-qjee, 5sqm-2qku, 6uyb-waub) are in Section II (Tables 18-23, pp.37-49) and the two SNF VBP files (284v-j9fz, ujcx-uaut) are in Section III (Tables 24-25, pp.50-56). The expectation that these would have no section is **not** correct. The only files in `raw/` without a dictionary section are `NH_Data_Dictionary.pdf` itself and `manifest.json`.
2. **Field counts match for every file** (dictionary vs CSV header). Field order also matches for every file. There are **no missing or extra columns**. The differences are limited to: capitalization (Provider Info, 20 columns), wording (Survey Summary, 3 columns; Claims QM, 1 column) and one spacing difference (Swing Bed `MeasureDateRange`). See section 6.
3. **Things the dictionary does NOT contain** (so no agent should assume they are documented here):
   - No Scope/Severity grid (A-L) and no definition of any letter. Only hints: fire safety says "(B-L)"; Abuse Icon text mentions "G or greater" and "D or above". See 3.6.
   - No list of valid values for Resident type, Penalty Type beyond "Fine or Payment Denial", Survey Type for the health/fire citation files beyond "Health or Fire Safety", Deficiency Corrected, Tag Version beyond old/new, Ownership "Owner Type" beyond "Individual or Organization".
   - No listing of MDS or Claims Measure Codes and descriptions (only fragments in the revision history, see 3.12). The SNF QRP measure codes ARE fully listed (Tables 20-21).
   - No star-rating methodology. The dictionary repeatedly defers to the "CMS 5-Star Technical Users' Guide".
   - No date format for any `Date` column, and no statement of whether percentage columns are stored as 0-100 or 0-1.
   - Footnote codes 3, 4, 5, 8, 11, 12, 15, 16, 17, 19 are not in the master list (12 and 19 are stated as retired/dropped; the others are not mentioned anywhere).

---

## 1. TABLE OF CONTENTS — PDF sections mapped to raw files

| PDF section | Table | PDF pages | Dictionary file name pattern (Table 1) | Raw file in `/home/claude/snf-intel/raw/` | Rows of the dictionary table |
|---|---|---|---|---|---|
| Introduction; Excel leading-zeros note | - | 3 | - | - | - |
| Table 1 list of PDC tables | 1 | 4-7 | - | - | - |
| Section I (primary NH files): Provider Information | 2 | 8-12 | `NH_ProviderInfo_MonYYYY.csv` | `4pq5-n9py_2026-09-30_NH_ProviderInfo_Sep2026_3.csv` | 102 fields |
| State US Averages | 3 | 13-16 | `NH_StateUSAverages_MonYYYY.csv` | `xcdc-v8bm_2026-09-30_NH_StateUSAverages_Sep2026_2.csv` | 51 |
| Nursing Home Data Collection Intervals | 4 | 16 | `NH_DataCollectionIntervals_MonYYYY.csv` | `qmdc-9999_2026-09-30_NH_DataCollectionIntervals_Sep2026_2.csv` | 6 |
| Inspection Dates | 5 | 16 | `NH_SurveyDates_MonYYYY.csv` | `svdt-c123_2026-09-30_NH_SurveyDates_Sep2026_2.csv` | 6 |
| Fire Safety Deficiencies | 6 | 17-18 | `NH_FireSafetyCitations_MonYYYY.csv` | `ifjz-ge4w_2026-09-30_NH_FireSafetyCitations_Sep2026_2.csv` | 24 |
| Health Deficiencies | 7 | 18-19 | `NH_HealthCitations_MonYYYY.csv` | `r5ix-sfxw_2026-09-30_NH_HealthCitations_Sep2026_2.csv` | 24 |
| Citation Code Look-up | 8 | 19 | `NH_CitationDescriptions_MonYYYY.csv` | `tagd-9999_2026-09-30_NH_CitationDescriptions_Sep2026_2.csv` | 5 |
| State-Level Health Inspection Cut Points | 9 | 19 | `NH_HlthInspecCutpointsState_MonYYYY.csv` | `hicp-9999_2026-09-30_NH_HlthInspecCutpointsState_Sep2026_2.csv` | 6 |
| Survey Summary | 10 | 19-21 | `NH_SurveySummary_MonYYYY.csv` | `tbry-pc2d_2026-09-30_NH_SurveySummary_Sep2026_2.csv` | 42 |
| MDS Quality Measures | 11 | 21-22 | `NH_QualityMsr_MDS_MonYYYY.csv` | `djen-97ju_2026-09-30_NH_QualityMsr_MDS_Sep2026_2.csv` | 23 |
| Medicare Claims Quality Measures | 12 | 22-23 | `NH_QualityMsr_Claims_MonYYYY.csv` | `ijh5-nb2v_2026-09-30_NH_QualityMsr_Claims_Sep2026_2.csv` | 17 |
| Ownership | 13 | 23-24 | `NH_Ownership_MonYYYY.csv` | `y2hd-n93e_2026-09-30_NH_Ownership_Sep2026_2.csv` | 13 |
| Penalties | 14 | 24 | `NH_Penalties_MonYYYY.csv` | `g6vv-u9sr_2026-09-30_NH_Penalties_Sep2026_2.csv` | 14 |
| Footnote Codes (all NH files) | 15 | 25 | - | (applies to many files) | 19 codes |
| Revision history for Section I | 16 | 26-36 | - | - | - |
| Section II SNF QRP intro | - | 37 | - | - | - |
| Acronym index | 17 | 38 | - | - | 15 acronyms |
| SNF QRP National Data | 18 | 38 | `Skilled_Nursing_Facility_Quality_Reporting_Program_National_Data_MonYYYY.csv` | `5sqm-2qku_2026-07-01_Skilled_Nursing_Facility_Quality_Reporting_Program_National_Data_Jul2026.csv` | 7 |
| SNF QRP Provider Data **and** Swing Bed (one shared table) | 19 | 39-40 | `Skilled_Nursing_Facility_Quality_Reporting_Program_Provider_Data_MonYYYY.csv` and `Swing_Bed_SNF_data_MonYYYY.csv` | `fykj-qjee_2026-09-30_Skilled_Nursing_Facility_Quality_Reporting_Program_Provider_Data_Sep2026_2.csv` and `6uyb-waub_2026-07-01_Swing_Bed_SNF_data_Jul2026.csv` | 16 each |
| SNF QRP national measure codes | 20 | 40-41 | - | (values of Measure Code in 5sqm-2qku) | - |
| SNF QRP provider measure codes | 21 | 42-44 | - | (values of Measure Code in fykj-qjee and 6uyb-waub) | - |
| SNF QRP footnote usage | 22 | 45 | - | - | - |
| SNF QRP refresh / collection timeframes | 23 | 46-49 | - | - | - |
| Section III FY 2026 SNF VBP Facility-Level | 24 | 50-54 | `FY_2026_SNF_VBP_Facility_Performance.csv` | `284v-j9fz_2025-11-01_FY_2026_SNF_VBP_Facility_Performance.csv` | 49 |
| FY 2026 SNF VBP Aggregate Performance | 25 | 54-56 | `FY_2026_SNF_VBP_Aggregate_Performance.csv` | `ujcx-uaut_2025-12-02_FY_2026_SNF_VBP_Aggregate_Performance.csv` | 21 |

**Raw files with NO dictionary section:** none (see headline finding 1).
**Dictionary-described tables with NO raw file:** none among current tables. Table 16 (p.27-31) says the "COVID-19 Vaccination Rates – Provider Data" and "COVID-19 Vaccination Rates – State and National Averages" datasets were removed (202507); they are not in `raw/` and not in `manifest.json`.

**Dataset descriptions from Table 1 (pp.4-7), near-verbatim**
- Provider Information: "General information on currently active nursing homes, including number of certified beds, monthly star ratings, staffing data and other information used in the Five-Star Rating System. Data is presented as one row per nursing home."
- State US Averages: "A list of a variety of averages for each state or territory as well as the national average, including each quality measure, staffing, fine amount, and number of deficiencies. Each row displays a specific state or territory, the associated measure and average." (NOTE: this row description says each row is state + measure; Table 3 and the CSV header are one-row-per-state with measures as columns. See 5.)
- Data Collection Intervals: "lists the data collection periods for the quality measures displayed for Nursing Homes including Rehab Services as well as the intervals for complaint citations and citations on focused infection control inspections. It also includes the data collection period for the nursing home staffing measures. The data collection periods for some short-stay measures differ slightly from the measure periods in the MDS Quality Measure file due to the look-back periods for these measures."
- Inspection Dates: "A list of nursing home inspection dates in the past three cycles, including health inspections, fire safety inspections, complaint inspections and infection control inspections".
- Fire Safety Deficiencies: "A list of nursing home fire safety citations in the last three cycles, including the nursing home that received the citation, the associated inspection date, citation tag number and description, scope and severity, the current status of the citation and the correction date. Data is presented as one citation per row."
- Health Deficiencies: same wording for health citations, plus: "Note that this dataset includes citations that are not used for the health inspection rating (e.g., citations under IDR/IIDR and citations from cycle 3 standard surveys). See CMS 5-Star Technical Users' Guide for more details."
- Citation Code Look-up: "a look-up table for nursing home inspection citations, providing a text description for each citation or tag code."
- State-Level Health Inspection Cut Points: "State-specific ranges for the weighted health inspection score for each health inspection star rating category. Data is presented as one row per state or territory."
- Survey Summary: "Nursing home summary information for nursing home health, fire safety, infection control, and complaint inspections in the last three cycles, including dates of the three most recent inspections (including those with no citations), and counts of citations, overall and within specified categories. Data is presented as one inspection per provider. Citation counts also include citations from infection control surveys and complaint inspections. Note that not all citations included in these counts are used for the health inspection rating (e.g., citations under IDR/IIDR and citations from cycle 3 standard surveys). See CMS 5-Star Technical Users' Guide for more details."
- MDS Quality Measures: "Quality measures that are based on the resident assessments that make up the nursing home Minimum Data Set (MDS). Each row contains a specific quality measure for a specific nursing home and includes the 4-quarter score average and scores for each individual quarter."
- Medicare Claims Quality Measures: Table 1 repeats the MDS wording word-for-word (including "based on the resident assessments that make up the nursing home Minimum Data Set (MDS)" and "4-quarter score average and scores for each individual quarter"). This does not match Table 12, whose fields are Adjusted/Observed/Expected Score. UNCLEAR IN DICTIONARY: whether the Table 1 text is a copy/paste error (it appears to be).
- Ownership: "A list of ownership information for currently active nursing homes."
- Penalties: "A list of the fines and payment denials received by nursing homes in the last three years."
- SNF QRP: "Skilled Nursing Facilities (SNFs) provide Medicare Part A SNF services to beneficiaries and must report data on certain measures of quality to Medicare through the Skilled Nursing Facility Quality Reporting Program (SNF QRP)." National file "contains national averages on quality measures implemented under the IMPACT Act." Provider file "contains a list of SNFs, as well as their results on the quality of resident care measures implemented under the IMPACT Act." Swing bed file: "Non-Critical Access Hospitals (CAHs) with swing beds are hospitals that provide Medicare Part A Skilled Nursing Facility (SNF) services to beneficiaries... contains a list of the swing bed units participating in the SNF QRP, as well as their results on quality measures implemented under the IMPACT Act."
- SNF VBP Facility-Level: results for FY 2026 SNF VBP: "baseline period and performance period measure results for each measure, achievement scores for each measure, improvement scores for each measure, measure scores for each measure, performance scores, rankings, and incentive payment multipliers". Note (pp.6-7, both VBP files): "CMS will not publicly report any data for excluded SNFs. CMS finalized a measure minimum policy for the FY 2026 Program year. To receive a performance score and incentive payment multiplier for the FY 2026 Program year, SNFs must meet the case minimum during the performance period for at least two of the four quality measures. SNFs that do not meet the measure minimum are excluded from the SNF VBP Program for FY 2026. Payments to these SNFs will not be affected by the SNF VBP Program; instead, they will receive their adjusted federal per diem rate."
- SNF VBP Aggregate: "national, aggregate-level results for FY 2026 SNF VBP: national average measure results for the baseline period and performance period, the achievement thresholds and benchmarks (that is, the performance standards for each measure for the FY 2026 SNF VBP Program year), and information on performance scores, incentive payment multipliers, value-based incentive payments (in dollars), and the total number of SNFs receiving value-based incentive payments".

**Excel note (p.3):** "Due to a limitation in how Microsoft Excel removes leading zeros when opening comma separated value (CSV) files, instructions are provided on the Provider Data Catalog..." (see https://data.cms.gov/provider-data/about#download-files-in-excel). The dictionary does not say which columns have leading zeros. It does say CCN is "Text (6)" with "letters or numbers".

---

## 2. COMMON FIELD DEFINITIONS (appear in many files; defined identically each time)

| Column | Dictionary definition | Type |
|---|---|---|
| CMS Certification Number (CCN) | "CMS Certification Number (CCN)". Always 6 characters; "these can be letters or numbers" (p.12 footnote). Tables 2, 5, 6, 7, 10-14, 18, 19, 24. | Text (6) |
| Provider Name | Provider Name | Text |
| Provider Address | Provider Street Address | Text |
| City/Town | Provider City/Town | Text |
| State | Provider State - postal abbreviation | Text (2) |
| ZIP Code | Provider Zip Code | Numeric (as typed in dictionary; see Gotchas) |
| Location | "Location of facility (provider address, city, state, zip)" | Text |
| Processing Date | "Date the data was retrieved" | Date |

---

## 3. DATASET-BY-DATASET REFERENCE

### 3.1 Provider Information — Table 2, pp.8-12 — `4pq5-n9py`
One row per nursing home (Table 1). 102 fields, in this order. Names below are the actual CSV headers.

| # | Column | Dictionary description | Type |
|---|---|---|---|
| 1 | CMS Certification Number (CCN) | CMS Certification Number (CCN) | Text (6) |
| 2 | Provider Name | Provider Name | Text |
| 3 | Provider Address | Provider Street Address | Text |
| 4 | City/Town | Provider City/Town | Text |
| 5 | State | Provider State - postal abbreviation | Text (2) |
| 6 | ZIP Code | Provider Zip Code | Numeric |
| 7 | Telephone Number | Provider Phone Number | Numeric |
| 8 | Provider SSA County Code | SSA county code | Numeric |
| 9 | County/Parish | Provider County/Parish Name | Text |
| 10 | Urban | Urban/Rural flag: Y=Urban; N=Rural. "Urban is defined by a non-missing CBSA (core-based statistical area) code or a MSA (metropolitan statistical area) code > 0." | Y/N |
| 11 | Ownership Type | Nature of organization that operates a provider of services | Text |
| 12 | Number of Certified Beds | Number of Federally Certified Beds | Numeric |
| 13 | Average Number of Residents per Day | Average number of residents based on MDS daily census | Numeric |
| 14 | Average Number of Residents per Day Footnote | Footnote for Resident Census value (see footnote table for definitions of footnote codes). Per revision 202008: "The footnote column will be populated only when the resident count is not available (i.e., null)." | Numeric |
| 15 | Provider Type | Category which is most indicative of provider | Text |
| 16 | Provider Resides in Hospital | Facility Resides in Hospital Indicator | Y/N |
| 17 | Legal Business Name | Legal Business Name | Text |
| 18 | Date First Approved to Provide Medicare and Medicaid Services | Date First Approved to Provide Medicare/Medicaid Services | Date |
| 19 | Chain Name | "Unique name identifying a group of nursing homes that share at least one individual or organizational owner, officer, or entity with operational/managerial control" | Text |
| 20 | Chain ID | Unique numeric identifier assigned to each chain | Numeric |
| 21 | Number of Facilities in Chain | Number of facilities in the chain. Missing if the provider is not part of a chain. | Numeric |
| 22 | Chain Average Overall 5-star Rating | Average overall 5-star rating across all facilities in the chain. Missing if the provider is not part of a chain. | Numeric |
| 23 | Chain Average Health Inspection Rating | Average health inspection rating across all facilities in the chain. Missing if not part of a chain. | Numeric |
| 24 | Chain Average Staffing Rating | Average staffing rating across all facilities in the chain. Missing if not part of a chain. | Numeric |
| 25 | Chain Average QM Rating | Average quality measure (QM) rating across all facilities in the chain. Missing if not part of a chain. | Numeric |
| 26 | Continuing Care Retirement Community | Continuing Care Retirement Community Indicator | Y/N |
| 27 | Special Focus Status | "Special Focus Status (SFF, SFF Candidate or null if provider not SFF or Candidate)" | Text |
| 28 | Abuse Icon | "Cited for abuse or neglect at harm level or above on survey cycle 1 (Scope/severity G or greater) or cited for abuse or neglect at potential harm level (Scope/Severity D or above) on both survey cycles 1 and 2." | Y/N |
| 29 | High Performing Icon | "Exceeds the traditional five-star rating. Higher performing nursing homes have fewer citations (safety violations), higher staffing levels, and other quality indicators." (added 202609) | Y/N |
| 30 | Most Recent Health Inspection More Than 2 Years Ago | Most recent survey occurred more than 2 years ago indicator | Y/N |
| 31 | Provider Changed Ownership in Last 12 Months | Facility Changed Ownership in Last 12 Months Indicator | Y/N |
| 32 | With a Resident and Family Council | "With a Resident and Family Council (Resident, Family, Both, None)" | Text |
| 33 | Automatic Sprinkler Systems in All Required Areas | "Automatic Sprinkler Systems in All Required Areas (Yes, Partial, No, Data Not Available)" | Text |
| 34 | Overall Rating | Overall Rating (1-5) | Numeric |
| 35 | Overall Rating Footnote | Overall Rating Footnote | Numeric |
| 36 | Health Inspection Rating | Health Inspection Rating (1-5) | Numeric |
| 37 | Health Inspection Rating Footnote | Health Inspection Rating Footnote | Numeric |
| 38 | QM Rating | Quality Measure (QM) Rating (1-5) | Numeric |
| 39 | QM Rating Footnote | QM Rating Footnote | Numeric |
| 40 | Long-Stay QM Rating | Long-stay QM Rating (1-5) | Numeric |
| 41 | Long-Stay QM Rating Footnote | Long-Stay QM Rating Footnote | Numeric |
| 42 | Short-Stay QM Rating | Short-Stay QM Rating (1-5) | Numeric |
| 43 | Short-Stay QM Rating Footnote | Short-Stay QM Rating Footnote | Numeric |
| 44 | Staffing Rating | Staffing Rating (1-5) | Numeric |
| 45 | Staffing Rating Footnote | Staffing Rating Footnote | Numeric |
| 46 | Reported Staffing Footnote | Reported Staffing Footnote | Numeric |
| 47 | Physical Therapist Staffing Footnote | Physical Therapy Staffing Footnote | Numeric |
| 48 | Reported Nurse Aide Staffing Hours per Resident per Day | Reported Nurse Aide Staffing - Hours per Resident per Day | Numeric |
| 49 | Reported LPN Staffing Hours per Resident per Day | Reported LPN Staffing - Hours per Resident per Day | Numeric |
| 50 | Reported RN Staffing Hours per Resident per Day | Reported RN Staffing - Hours per Resident per Day | Numeric |
| 51 | Reported Licensed Staffing Hours per Resident per Day | Reported Licensed Staffing - Hours per Resident per Day (RN + LPN) | Numeric |
| 52 | Reported Total Nurse Staffing Hours per Resident per Day | Reported Total Nurse Staffing - Hours per Resident per Day (Aide+LPN+RN) | Numeric |
| 53 | Total number of nurse staff hours per resident per day on the weekend | Total number of nurse staff hours on the weekend - Hours per resident per day | Numeric |
| 54 | Registered Nurse hours per resident per day on the weekend | Registered Nurse hours on the weekend - Hours per resident per day | Numeric |
| 55 | Reported Physical Therapist Staffing Hours per Resident Per Day | Reported Physical Therapy Staffing - Hours per Resident Per Day | Numeric |
| 56 | Total nursing staff turnover | Total nursing staff turnover | Numeric |
| 57 | Total nursing staff turnover footnote | Total nursing staff turnover footnote | Numeric |
| 58 | Registered Nurse turnover | Registered Nurse turnover | Numeric |
| 59 | Registered Nurse turnover footnote | Registered Nurse turnover footnote | Numeric |
| 60 | Number of administrators who have left the nursing home | Number of administrators who have left the nursing home | Numeric |
| 61 | Administrator turnover footnote | Administrator turnover footnote | Numeric |
| 62 | Nursing Case-Mix Index | Weighted Average Nursing Case-Mix Index | Numeric |
| 63 | Nursing Case-Mix Index Ratio | Weighted Average Nursing Case-Mix Index divided by National Weighted Average Nursing Case-Mix Index | Numeric |
| 64 | Case-Mix Nurse Aide Staffing Hours per Resident per Day | Case-Mix Nurse Aide Staffing - Hours per Resident per Day | Numeric |
| 65 | Case-Mix LPN Staffing Hours per Resident per Day | Case-Mix LPN Staffing - Hours per Resident per Day | Numeric |
| 66 | Case-Mix RN Staffing Hours per Resident per Day | Case-Mix RN Staffing - Hours per Resident per Day | Numeric |
| 67 | Case-Mix Total Nurse Staffing Hours per Resident per Day | Case-Mix Total Nurse Staffing - Hours per Resident per Day (Aide+LPN+RN) | Numeric |
| 68 | Case-Mix Weekend Total Nurse Staffing Hours per Resident per Day | Case-Mix Weekend Total Nurse Staffing - Hours per Resident per Day | Numeric |
| 69 | Adjusted Nurse Aide Staffing Hours per Resident per Day | Adjusted Nurse Aide Staffing - Hours per Resident per Day | Numeric |
| 70 | Adjusted LPN Staffing Hours per Resident per Day | Adjusted LPN Staffing - Hours per Resident per Day | Numeric |
| 71 | Adjusted RN Staffing Hours per Resident per Day | Adjusted RN Staffing - Hours per Resident per Day | Numeric |
| 72 | Adjusted Total Nurse Staffing Hours per Resident per Day | Adjusted Total Nurse Staffing - Hours per Resident per Day (Aide+LPN+RN) | Numeric |
| 73 | Adjusted Weekend Total Nurse Staffing Hours per Resident per Day | Adjusted Weekend Total Nurse Staffing - Hours per Resident per Day | Numeric |
| 74 | Rating Cycle 1 Standard Survey Health Date | "Date of Rating cycle 1 Standard Health Survey Date, which is the most recent health inspection. See CMS 5-Star Technical Users' Guide for description of Rating cycles and Health Inspection Scoring" | Date |
| 75 | Rating Cycle 1 Standard Survey Footnote | Standard Survey Footnote for Rating cycle 1 (added 202609) | Numeric |
| 76 | Rating Cycle 1 Total Number of Health Deficiencies | "Total Number of Health Deficiencies in Rating cycle 1, which includes the most recent standard survey, as well as complaint and infection control surveys from the most recent 12 months." | Numeric |
| 77 | Rating Cycle 1 Number of Standard Health Deficiencies | Number of Health Deficiencies from the Standard Survey During Rating cycle 1 | Numeric |
| 78 | Rating Cycle 1 Number of Complaint Health Deficiencies | Number of Health Deficiencies from Complaint Surveys during Rating cycle 1 for complaints | Numeric |
| 79 | Rating Cycle 1 Health Deficiency Score | Rating cycle 1 - Health Deficiency Score | Numeric |
| 80 | Rating Cycle 1 Number of Health Revisits | Number of Health Survey Repeat-Revisits for Rating cycle 1 | Numeric |
| 81 | Rating Cycle 1 Health Revisit Score | Points Associated with Health Survey Repeat Revisits for Rating cycle 1 | Numeric |
| 82 | Rating Cycle 1 Total Health Score | Rating cycle 1 - Total Health Inspection Score | Numeric |
| 83 | Rating Cycle 2 Standard Health Survey Date | Date of Rating cycle 2 Standard Health Survey Date | Date |
| 84 | Rating Cycle 2 Standard Survey Footnote | Standard Survey Footnote for Rating cycle 2 (added 202609) | Numeric |
| 85 | Rating Cycle 2/3 Total Number of Health Deficiencies | "Total Number of Health Deficiencies in Rating cycle 2/3. This includes the second most recent standard survey, as well as complaint and infection control surveys from 13-36 months ago. See CMS 5-Star Technical Users' Guide for more details." | Numeric |
| 86 | Rating Cycle 2 Number of Standard Health Deficiencies | Number of Health Deficiencies from the Standard Survey during Rating cycle 2 | Numeric |
| 87 | Rating Cycle 2/3 Number of Complaint Health Deficiencies | Number of Health Deficiencies from Complaint Surveys from 13-36 months ago. | Numeric |
| 88 | Rating Cycle 2/3 Health Deficiency Score | Rating cycle 2/3 - Health Deficiency Score | Numeric |
| 89 | Rating Cycle 2/3 Number of Health Revisits | Number of Health Survey Repeat-Revisits for Rating cycle 2/3 | Numeric |
| 90 | Rating Cycle 2/3 Health Revisit Score | Points Associated with Health Survey Repeat Revisits for Rating cycle 2/3 | Numeric |
| 91 | Rating Cycle 2/3 Total Health Score | Rating cycle 2/3 - Total Health Inspection Score | Numeric |
| 92 | Total Weighted Health Survey Score | Total Weighted Health Survey Score - See CMS 5-Star Technical Users' Guide for detailed explanation | Numeric |
| 93 | Number of Citations from Infection Control Inspections | Number of citations from infection control inspections in the past 3 years | Numeric |
| 94 | Number of Fines | Number of Fines | Numeric |
| 95 | Total Amount of Fines in Dollars | Total Amount of Fines in Dollars | Numeric |
| 96 | Number of Payment Denials | Number of Payment Denials | Numeric |
| 97 | Total Number of Penalties | Total Number of Penalties | Numeric |
| 98 | Location | Location of facility (provider address, city, state, zip) | Text |
| 99 | Latitude | Latitude of facility address | Numeric |
| 100 | Longitude | Longitude of facility address | Numeric |
| 101 | Geocoding Footnote | Footnote for geocoding facility address | Numeric |
| 102 | Processing Date | Date the data was retrieved | Date |

Provider Information notes:
- Rating cycle (this file) vs Inspection cycle (citation files) are different concepts. See 4.3.
- UNCLEAR IN DICTIONARY: valid values/codes for Ownership Type, Provider Type, Special Focus Status beyond the parenthetical above, Chain Name/ID null convention beyond "Missing".
- UNCLEAR IN DICTIONARY: the unit for turnover (percentage vs fraction) and for the 1-5 ratings' "missing" encoding. The footnotes explain why a rating is absent (see section 7).
- Revisions affecting this file (Table 16): 202609 added High Performing Icon and both Rating cycle Standard Survey Footnotes; 202602 deleted "Number of Facility Reported Incidents" and "Number of Complaints that Resulted in a Citation" (renamed from "Number of Substantiated Complaints" in 202601); 202510 added "Urban"; 202507 added chain columns, renamed to "Rating cycle 2/3" columns and dropped all Rating cycle 3 columns; 202407 added Nursing Case-Mix Index, Nursing Case-Mix Index Ratio and Case-Mix Weekend Total Nurse Staffing; 202308 added Latitude/Longitude/Geocoding Footnote; 202306 added Affiliated Entity Name/ID (renamed "Chain" in 202507).

### 3.2 State US Averages — Table 3, pp.13-16 — `xcdc-v8bm`
51 fields. Per Table 1: "A list of a variety of averages for each state or territory as well as the national average". Key field "State or Nation": "State or Nation - two-character postal abbreviation for state or 'NATION'" (Text). All other fields are Numeric except Processing Date (Date).

| # | Column | Dictionary description |
|---|---|---|
| 1 | State or Nation | two-character postal abbreviation for state or 'NATION' (Text) |
| 2-5 | Overall Rating; Health Inspection Rating; QM Rating; Staffing Rating | same names (added 202507) |
| 6 | Cycle 1 Total Number of Health Deficiencies | "includes the most recent standard survey as well as complaint and infection control surveys from the most recent 12 months." |
| 7 | Cycle 1 Total Number of Fire Safety Deficiencies | Cycle 1 Number of Fire Safety and Emergency Preparedness Deficiencies |
| 8 | Cycle 2 Total Number of Health Deficiencies | "includes the second most recent standard survey as well as complaint and infection control surveys from 13-24 months ago." |
| 9 | Cycle 2 Total Number of Fire Safety Deficiencies | Cycle 2 Number of Fire Safety and Emergency Preparedness Deficiencies |
| 10 | Cycle 3 Total Number of Health Deficiencies | "includes the third most recent standard survey as well as complaint and infection control surveys from 25-36 months ago. Note that cycle 3 standard surveys are not used for the health inspection rating." |
| 11 | Cycle 3 Total Number of Fire Safety Deficiencies | Cycle 3 Number of Fire Safety and Emergency Preparedness Deficiencies |
| 12 | Average Number of Residents per Day | Average of daily census derived from MDS |
| 13 | Reported Nurse Aide Staffing Hours per Resident per Day | Reported Nurse Aide Staffing - Hours per Resident per Day |
| 14 | Reported LPN Staffing Hours per Resident per Day | Reported LPN Staffing - Hours per Resident per Day |
| 15 | Reported RN Staffing Hours per Resident per Day | "... - US value calculated quarterly and used in calculation of adjusted staffing" |
| 16 | Reported Licensed Staffing Hours per Resident per Day | Reported Licensed Staffing - Hours per Resident per Day |
| 17 | Reported Total Nurse Staffing Hours per Resident per Day | "... - US value calculated quarterly and used in calculation of adjusted staffing" |
| 18 | Total number of nurse staff hours per resident per day on the weekend | "... US value calculated quarterly and used in calculation of adjusted staffing" |
| 19 | Registered Nurse hours per resident per day on the weekend | Registered Nurse hours on the weekend - Hours per resident per day |
| 20 | Reported Physical Therapist Staffing Hours per Resident Per Day | Reported Physical Therapy Staffing - Hours per Resident Per Day |
| 21 | Total nursing staff turnover | same name |
| 22 | Registered Nurse turnover | same name |
| 23 | Number of administrators who have left the nursing home | same name |
| 24 | Nursing Case-Mix Index | "Weighted Average Nursing Case-Mix Index - US value calculated quarterly and used in calculation of adjusted staffing" |
| 25 | Case-Mix RN Staffing Hours per Resident per Day | "... - US value calculated quarterly and used in calculation of adjusted staffing" |
| 26 | Case-Mix Total Nurse Staffing Hours per Resident per Day | "... - US value calculated quarterly and used in calculation of adjusted staffing" |
| 27 | Case-Mix Weekend Total Nurse Staffing Hours per Resident per Day | "... - US value calculated quarterly and used in calculation of adjusted staffing" |
| 28 | Number of Fines | "Number of Fines; state and US averages include 0s for providers with no fines" |
| 29 | Fine Amount in Dollars | "Fine Amount in Dollars; state and US averages include 0s for providers with no fines" |
| 30-50 | 21 quality-measure columns | Each is "Percentage of ..." (19 columns) or "Number of ... per 1000 long-stay resident days" (2 columns). Full list in the table below. |
| 51 | Processing Date | Date the data was retrieved (Date) |

Quality-measure columns (columns 30-50 of the CSV, same order as the dictionary, p.14-16):
30 Percentage of long stay residents whose need for help with daily activities has increased; 31 ...who lose too much weight; 32 ...with a catheter inserted and left in their bladder; 33 ...with a urinary tract infection; 34 ...who have depressive symptoms; 35 ...who were physically restrained; 36 ...experiencing one or more falls with major injury; 37 ...assessed and appropriately given the pneumococcal vaccine; 38 ...who received an antipsychotic medication; 39 Percentage of short stay residents assessed and appropriately given the pneumococcal vaccine; 40 Percentage of short stay residents who newly received an antipsychotic medication; 41 Percentage of long stay residents whose ability to walk independently worsened; 42 ...who received an antianxiety or hypnotic medication; 43 ...assessed and appropriately given the seasonal influenza vaccine; 44 Percentage of short stay residents who were assessed and appropriately given the seasonal influenza vaccine; 45 Percentage of long stay residents with pressure ulcers; 46 ...with new or worsened bowel or bladder incontinence; 47 Percentage of short stay residents who were rehospitalized after a nursing home admission; 48 Percentage of short stay residents who had an outpatient emergency department visit; 49 Number of hospitalizations per 1000 long-stay resident days; 50 Number of outpatient emergency department visits per 1000 long-stay resident days.
(Exact CSV header text for each is in `raw/xcdc-v8bm...csv` line 1; dictionary descriptions equal the field names.)

Notes: Table 16 202109 says the Fire Safety "Cycle N Total Number of Fire Safety Deficiencies" calculation "has been revised to include Emergency Preparedness deficiencies (E tags) as well as Fire Safety Deficiencies (K tags)". Table 16 202407 added Nursing Case-Mix Index and Case-Mix Weekend Total Nurse Staffing Hours. Table 16 201904: "only the US Average is included in the adjusted staffing calculations". UNCLEAR IN DICTIONARY: whether the "US value calculated quarterly" statements mean the state rows are computed on a different schedule.

### 3.3 Nursing Home Data Collection Intervals — Table 4, p.16 — `qmdc-9999`
| Column | Dictionary description | Type |
|---|---|---|
| Measure Code | "Numeric code assigned to each quality measure (internal code for complaint intervals)" | Text |
| Measure Description | Measure Description | Text |
| Data Collection Period From Date | "Data Collection Period From Date. Note that the data collection period for short-stay QMs is five quarters and begins one quarter before the data collection period for long-stay QMs." | Date |
| Data Collection Period Through Date | Data Collection Period Through Date | Date |
| Measure Date Range | "Measure Date Range; allows for a gap in the data collection period" (202207: "populated only for the three SNF QRP claims-based measures that have a gap in the data collection period") | Text |
| Processing Date | Date the data was retrieved | Date |

Special measure codes named in Table 16: `STAFFING` (202105) renamed `STAFFING_LEVELS` (202203); `STAFFING_TURNOVER` added 202203 with description "Reporting Period for Nursing Home Staff Turnover Measures." Description for the staffing-levels row: "Reporting Period for Nursing Home Staffing Measures". Type is "Text" here but the MDS/Claims Measure Code fields are typed "Numeric (###)" (see 5).

### 3.4 Inspection Dates — Table 5, p.16 — `svdt-c123`
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN) | CMS Certification Number (CCN) | Text (6) |
| Survey Date | Date of the Inspection | Date |
| Survey Footnote | Survey Footnote (added 202609; footnote 29 can apply, i.e., Risk-Based Survey) | Numeric |
| Type of Survey | "Survey Type: Fire Safety Standard, Fire Safety Complaint, Health Inspection Standard, Health Inspection Complaint, Infection Control" | Text |
| Survey Cycle | "The inspection cycle for the survey, with a value of 1,2, or 3 with 1 being most recent" | Numeric |
| Processing Date | Date the data was retrieved | Date |

Per Table 16 (202101): "contains all inspection dates referenced in other files. It includes the dates of standard health inspections, standard life safety inspections, focused infection control inspections, and complaint inspections. For complaint inspections, dates are included only if the inspection resulted in one or more citations (deficiencies). For standard and infection control inspections, dates are included whether or not they resulted in any citations."

**Survey Type values (this table only), exactly five:** Fire Safety Standard; Fire Safety Complaint; Health Inspection Standard; Health Inspection Complaint; Infection Control.

### 3.5 Fire Safety Deficiencies — Table 6, pp.17-18 — `ifjz-ge4w`
One citation per row. 24 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN) | CMS Certification Number (CCN) | Text (6) |
| Provider Name / Provider Address / City/Town / State / ZIP Code | see section 2 | |
| Survey Date | Survey Date | Date |
| Survey Type | Type of survey: Health or Fire Safety | Text |
| Deficiency Prefix | "The alphabetic character that is assigned to a series of data tags that apply to a provider (K or E)" | Text (1) |
| Deficiency Category | Category of Fire Safety Deficiency | Text |
| Deficiency Tag Number | Deficiency Tag Number | Numeric |
| Tag Version | "Indicates whether tag was cited before (old) or on/after (new) 7/5/2016; for a small number of life safety deficiencies (K tags), the same deficiency tag number has a different description in the two versions" | Text |
| Deficiency Description | Text definition of deficiency | Text |
| Scope Severity Code | "Indicates the level of harm to the resident(s) involved and the scope of the problem within the nursing home (B-L)." | Text (1) |
| Deficiency Corrected | "Indicates whether the deficiency has been corrected, a plan of correction has been devised, or the deficiency has yet to be corrected" | Text |
| Correction Date | Date the deficiency was corrected | Date |
| Inspection Cycle | "The inspection cycle of deficiency, where 1 is the most recent cycle. Standard inspection cycles are counted sequentially into the past, complaint inspection cycles are counted annually into the past. If a deficiency is found on a co-occurring standard and complaint inspection, it is assigned to the standard cycle. Life Safety Deficiencies are not used in calculating the Health Inspection Rating" | Numeric |
| Standard Deficiency | Indicates that the deficiency was found on a standard inspection | Y/N |
| Complaint Deficiency | Indicates that the deficiency was found on a complaint inspection | Y/N |
| Infection Control Inspection Deficiency | Indicates that the deficiency was found on an infection control inspection | Y/N |
| Citation under IDR | Indicates that the deficiency is under Informal Dispute Resolution (IDR) | Y/N |
| Citation under IIDR | Indicates that the deficiency is under Independent Informal Dispute Resolution (IIDR) | Y/N |
| Location | see section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

UNCLEAR IN DICTIONARY: the allowed values of Deficiency Category, Deficiency Corrected, Tag Version text (the dictionary says "(old)" and "(new)" but does not state the exact stored strings), and Survey Type (the file is the fire safety file yet the description says "Health or Fire Safety").

### 3.6 Health Deficiencies — Table 7, pp.18-19 — `r5ix-sfxw`
One citation per row. 24 fields; same layout as fire safety except: has **Survey Footnote** (Numeric; added 202609; code 29 possible); has no Tag Version; Deficiency Prefix is "(F)"; Scope Severity Code has no range printed.
| Column | Dictionary description | Type |
|---|---|---|
| Survey Date | Date of Health Inspection Survey | Date |
| Survey Footnote | Survey Footnote | Numeric |
| Survey Type | Type of survey: Health or Fire Safety | Text |
| Deficiency Prefix | "The alphabetic character that is assigned to a series of data tags that apply to a provider (F)" | Text (1) |
| Deficiency Category | Category of Health Deficiency | Text |
| Deficiency Tag Number | Deficiency Tag Number | Numeric |
| Deficiency Description | Text definition of deficiency | Text |
| Scope Severity Code | "Indicates the level of harm to the resident(s) involved and the scope of the problem within the nursing home." | Text (1) |
| Deficiency Corrected | Indicates whether the deficiency has been corrected, a plan of correction has been devised, or the deficiency has yet to be corrected | Text |
| Correction Date | Date the deficiency was corrected | Date |
| Inspection Cycle | "The inspection cycle of deficiency for display on Nursing Home Compare, where 1 is the most recent cycle. Standard inspection cycles are counted sequentially into the past, complaint inspection cycles are counted annually into the past. If a deficiency is found on a co-occurring standard and complaint inspection, it is assigned to the standard cycle. Please refer to the 5-star Technical Users Guide for further information." | Numeric |
| Standard Deficiency / Complaint Deficiency / Infection Control Inspection Deficiency / Citation under IDR / Citation under IIDR | same definitions as fire safety | Y/N |

Other columns (CCN, name/address fields, Location, Processing Date) as in section 2.

**Scope/Severity grid (A-L): NOT IN THE DICTIONARY.**
What the PDF does say: (a) Scope Severity Code is a single character, Text (1); (b) it "Indicates the level of harm to the resident(s) involved and the scope of the problem within the nursing home"; (c) for fire safety the range is printed as "(B-L)"; (d) Abuse Icon (Provider Information) uses "Scope/severity G or greater" for "harm level or above" and "Scope/Severity D or above" for "potential harm level". UNCLEAR IN DICTIONARY: what each letter means, whether A is possible, and the ordering of letters. Consult the CMS 5-Star Technical Users' Guide that the dictionary cites.

### 3.7 Citation Code Look-up — Table 8, p.19 — `tagd-9999`
| Column | Dictionary description | Type |
|---|---|---|
| Deficiency Prefix | Deficiency Prefix (F, K, E) | Text (1) |
| Deficiency Tag Number | Deficiency Tag Number | Numeric |
| Deficiency Prefix and Number | Deficiency Prefix and Number (e.g., F-0880) | Text (6) |
| Deficiency Description | Deficiency Description | Text |
| Deficiency Category | Category Description for Care Compare website | Text |

### 3.8 State-Level Health Inspection Cut Points — Table 9, p.19 — `hicp-9999`
| Column | Dictionary description | Type |
|---|---|---|
| State | State postal abbreviation | Text (2) |
| 5 Stars | Cut point range to obtain a 5-star health inspection score within a specific state | Text |
| 4 Stars | Cut point range ... 4-star ... | Text |
| 3 Stars | ... 3-star ... | Text |
| 2 Stars | ... 2-star ... | Text |
| 1 Star | ... 1-star ... | Text |

UNCLEAR IN DICTIONARY: the string format of a "range" and whether lower or higher weighted score is better. (Table 1: "State-specific ranges for the weighted health inspection score for each health inspection star rating category.")

### 3.9 Survey Summary — Table 10, pp.19-21 — `tbry-pc2d`
Table 1: "Data is presented as one inspection per provider." Table 16 (201404): "one record per provider per survey cycle." 42 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN), Provider Name, Provider Address, City/Town, State, ZIP Code | section 2 | |
| Inspection Cycle | "The inspection cycle of deficiency for display on Nursing Home Compare, where 1 is the most recent cycle. Values can be 1,2 or 3" | Numeric |
| Health Survey Date | Health Survey Date | Date |
| Survey Footnote | Survey Footnote (added 202609) | Numeric |
| Fire Safety Survey Date | Fire Safety Survey Date | Date |
| Total Number of Health Deficiencies | Total Number of Health Deficiencies | Numeric |
| Total Number of Fire Safety Deficiencies | Total Number of Fire Safety Deficiencies | Numeric |
| 14 counts in the first run (all Numeric): Count of Freedom from Abuse and Neglect and Exploitation Deficiencies; Quality of Life and Care; Resident Assessment and Care Planning; Nursing and Physician Services; Resident Rights; Nutrition and Dietary; Pharmacy Service; Environmental; Administration; Infection Control; Emergency Preparedness; Automatic Sprinkler Systems; Construction; Services | "Count of ___ Deficiencies" | Numeric |
| 14 counts in the second run (all Numeric): Count of Corridor Walls and Doors; Egress; Electrical; Emergency Plans and Fire Drills; Fire Alarm Systems; Smoke; Interior; Gas and Vacuum and Electrical Systems; Hazardous Area; Illumination and Emergency Power; Laboratories; Medical Gases and Anaesthetizing Areas; Smoking Regulations; Miscellaneous | "Count of ___ Deficiencies" | Numeric |
| Location | section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

Category grouping: the dictionary does not label which count columns are "health" vs "fire safety". The split above into two runs of 14 is by column position only (first run: Freedom from Abuse through Services; second run: Corridor Walls and Doors through Miscellaneous). UNCLEAR IN DICTIONARY: which category columns belong to health vs fire safety (the Emergency Preparedness, Automatic Sprinkler Systems and Construction columns sit in the first run). Table 16 201802: "categories of Health Deficiencies and Fire (life safety) deficiencies have changed so all columns containing counts of deficiencies within each category have changed." Table 16 202503: "This file also now includes counts of deficiencies from complaint and infection control surveys (previously it only included counts of deficiencies from standard surveys)."
Table 16 201612 (historical): "Starting in December 2016 and until further notice, because of an issue with the life safety deficiencies, all columns that include information related to life safety surveys (other than the survey dates) or deficiencies cited on these surveys (K tags) are being set to NULL." UNCLEAR IN DICTIONARY: whether this is still in effect in the Sep 2026 file.

### 3.10 MDS Quality Measures — Table 11, pp.21-22 — `djen-97ju`
One row per measure per nursing home (Table 1). 23 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN) ... ZIP Code | section 2 | |
| Measure Code | Numeric code assigned to each quality measure (###) | Numeric |
| Measure Description | Measure Description | Text |
| Resident type | Identifies the measure as pertaining to either short-stay or long-stay stay residents | Text |
| Q1 Measure Score | The value for the quality measure for quarter one | Numeric |
| Footnote for Q1 Measure Score | Footnote for the quality measure for quarter one | Numeric |
| Q2 Measure Score / Footnote for Q2 Measure Score | quarter two | Numeric |
| Q3 Measure Score / Footnote for Q3 Measure Score | quarter three | Numeric |
| Q4 Measure Score / Footnote for Q4 Measure Score | quarter four | Numeric |
| Four Quarter Average Score | The value for the four quarter average | Numeric |
| Footnote for Four Quarter Average Score | Footnote for four quarter average score | Numeric |
| Used in Quality Measure Five Star Rating | "Identifies whether the quality measure is used in the calculation of the quality measure rating in the Five-Star Quality Rating System" | Y/N |
| Measure Period | "Indicates the 4 Quarter range covered by the measures (format yyyyQq-yyyyQq)" | Text |
| Location | section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

Notes: Resident type values are not enumerated: UNCLEAR IN DICTIONARY (the text says "short-stay or long-stay"; Table 3 uses "short stay" and "long stay" in measure names; actual strings are not specified). "Used in Quality Measure Five Star Rating" = Y/N flag that the measure feeds the QM rating of the Five-Star system; nothing more is stated. Footnote 28 (annual measure, no quarterly data) "will apply to MDS Quality Measures that are only calculated as annual measures and are not calculated by quarter (this currently only applies to the flu vaccination measures)" (Table 16, 202504). Historical (201910): the QRP pressure ulcer measure (002) "is not calculated for individual quarters... indicated with a new footnote code (19)"; 202001: "The measure code for the SNF Pressure ulcer measure has changed from 002 to 476. It now has the same measure period as the other MDS QMs; however, it is still not calculated for individual quarters." 201503: "QM scores for each quarter and 3-quarter average now shown to 6 decimal places" (historical; the field is now "Four Quarter Average" since 201607 when Q4 rows were added).
Table 4 says short-stay QM collection periods are five quarters, starting one quarter before long-stay (look-back).

### 3.11 Medicare Claims Quality Measures — Table 12, pp.22-23 — `ijh5-nb2v`
17 fields. One row per measure per nursing home.
| Column | Dictionary description | Type |
|---|---|---|
| CCN ... ZIP Code | section 2 | |
| Measure Code | Numeric code assigned to each quality measure (###) | Numeric |
| Measure Description | Measure Description | Text |
| Resident type | Identifies the measure as pertaining to either short-stay or long-stay stay residents | Text |
| Adjusted Score | The risk-adjusted value for the quality measure | Numeric |
| Observed Score | The observed value for the quality measure | Numeric |
| Expected Score | The expected value for the quality measure | Numeric |
| Footnote for Score (dictionary calls it "Footnote for the Measure Score") | Footnote for the quality measure | Numeric |
| Used in Quality Measure Five Star Rating | same definition as MDS | Y/N |
| Measure Period | "Identifies the time period covered by the measure (format yyyymmdd - yyyymmdd)" | Text |
| Location | section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

### 3.12 MDS/Claims measure codes mentioned in the revision history (Table 16) — NOT a complete list
The dictionary has no MDS/Claims measure-code list. These are the only code facts stated:
- 002 -> changed to 476 (SNF pressure ulcer measure) (202001; QM002 dropped and QM476 added in State US Averages).
- 402 and 424 (pain measures) dropped (201910); the QRP pressure ulcer measure (002) added then.
- 472 = "Percentage of short stay residents who were assessed and appropriately given the seasonal influenza vaccine"; 521 = "Percentage of short stay residents who were rehospitalized after a nursing home admission" (202010 sentence about column positions).
- 551 = Long-Stay Hospitalization measure (added to Claims table 201810; "LS hospitalization now a 5-star measure" 201904).
- 552 = LS ED visit measure (added to Claims table 201904).
Table 16 201904 also says "Changes in measure codes for several QMs (long-stay pressure ulcers, flu vaccination measures)" without listing the new codes. UNCLEAR IN DICTIONARY: everything else. Use the CSV `Measure Code`/`Measure Description` columns and `qmdc-9999` as the empirical source.

### 3.13 Ownership — Table 13, pp.23-24 — `y2hd-n93e`
13 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CCN ... ZIP Code | section 2 | |
| Role played by Owner or Manager in Facility | "Role description; possible values are:" (list below) | Text |
| Owner Type | Indicates if owner is an individual or organization (Individual or Organization) | Text |
| Owner Name | Name of Owner | Text |
| Ownership Percentage | "Ownership percentage - value provided only for owners with role description of '5% or greater direct ownership interest' or '5% or greater indirect ownership interest'" | Text |
| Association Date | Date when given owner/manager became associated with provider in this role | Text |
| Location | section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

**"Role played by Owner or Manager in Facility" — possible values listed on p.23** (spelled as in the dictionary; the PDF prints them in a run-on list separated by semicolons):
1. 5% or greater direct ownership interest
2. DIRECT OWNERSHIP INTEREST
3. 5% or greater indirect ownership interest
4. INDIRECT OWNERSHIP INTEREST
5. 5% OR GREATER MORTGAGE INTEREST
6. 5% OR GREATER SECURITY INTEREST
7. MANAGING CONTROL - GOVERNING BODY
8. CONTRACTED MANAGING EMPLOYEE
9. W-2 MANAGING EMPLOYEE
10. CORPORATE DIRECTOR
11. CORPORATE OFFICER
12. OPERATIONAL/MANAGERIAL CONTROL
13. GENERAL PARTNERSHIP INTEREST
14. LIMITED PARTNERSHIP INTEREST
15. INDIVIDUAL IS AN OWNER, PARTNER OR TRUSTEE OF ANY ADP OF THE SNF
16. TRUSTEE OF THE SNF
17. ADP OF THE SNF
Notes: the first value and the third value are in mixed case in the PDF, the others are upper case. The PDF does not spell out "ADP" (UNCLEAR IN DICTIONARY: abbreviation not expanded; Table 17 acronym index does not include it). It is also unclear whether values 1/2 and 3/4 are separate stored strings or whether the PDF is listing a display value plus a data value; the run-on list is ambiguous. Revision history for this field: 201504 role categories changed and ownership percentage + association date added; 202411 "Director" -> "Corporate Director", "Officer" -> "Corporate Officer"; 202506 "Managing Employee" split into "Contracted Managing Employee" and "W-2 Managing Employee", "Partnership Interest" split into "General Partnership Interest" and "Limited Partnership Interest"; 202605 added "DIRECT OWNERSHIP INTEREST", "INDIRECT OWNERSHIP INTEREST", "INDIVIDUAL IS AN OWNER, PARTNER OR TRUSTEE OF ANY ADP OF THE SNF", "TRUSTEE OF THE SNF", "MANAGING CONTROL - GOVERNING BODY", "ADP OF THE SNF". Older value strings may therefore still appear; the dictionary does not say whether old and new strings coexist.

**Owner Type values:** "Individual or Organization" (as stated).

### 3.14 Penalties — Table 14, p.24 — `g6vv-u9sr`
Table 1: "A list of the fines and payment denials received by nursing homes in the last three years." 14 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CCN ... ZIP Code | section 2 | |
| Penalty Date | Date of inspection that triggered the penalty | Date |
| Penalty Type | Penalty type: Fine or Payment Denial | Text |
| Fine ID | Unique numeric identifier assigned to each fine (column added 202606 after "Penalty Type") | Numeric |
| Fine Amount | Fine amount in whole dollars | Numeric |
| Payment Denial Start Date | Date on which Medicare/Medicaid payment for new admissions was suspended | Date |
| Payment Denial Length in Days | Number of days for which Medicare/Medicaid payment was suspended | Numeric |
| Location | section 2 | Text |
| Processing Date | Date the data was retrieved | Date |

**Penalty Type values: "Fine" or "Payment Denial"** (only these two are named). UNCLEAR IN DICTIONARY: which columns are blank for each type (it is implied but not stated that Fine ID/Fine Amount belong to Fines and the two Payment Denial columns to Payment Denials); whether Fine ID is unique across the file or only within a type; whether one Fine ID can repeat across rows.

### 3.15 SNF QRP National Data — Table 18, p.38 — `5sqm-2qku`
7 fields.
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN) | "used to identify the facility listed. However, since this is the national data set, the CCN is listed as 'Nation.'" | Text (6) |
| Measure Code | "The measure code consists of the CMS ID (prefix) and the variable name (suffix) for the corresponding measure score. Example = S_038_02_NATL_OBS_RATE. Prefix: S_038_02. Suffix: NATL_OBS_RATE. See Table 22 for a complete listing of national data measure codes." (NOTE: the complete national list is actually Table 20, p.40-41; "Table 22" is a mis-reference.) | Text |
| Score | The measure score for the corresponding measure code. | Text |
| Footnote | "Indicates the relevant footnote. Currently, there are no footnotes related to the national data." | Numeric |
| Start Date | The start date of the reporting period for the corresponding measure code and score. | Date |
| End Date | The end date of the reporting period for the corresponding measure code and score. | Date |
| Measure Date Range | "The start date through the end date of the reporting period(s)... Note: Only reporting periods that are 'split' are populated and represented by the use of a semicolon between the split periods (e.g., 04/01/2019-12/31/2019; 07/01/2020-09/30/2021)." | Text |

### 3.16 SNF QRP Provider Data and Swing Bed — Table 19, pp.39-40 — `fykj-qjee` and `6uyb-waub`
One shared table. 16 fields each. Differences stated in the dictionary: **Address Line 2** is "only included in the Skilled Nursing Facility Quality Reporting Program - Swing Bed data"; **LOCATION1** is "only included in the Skilled Nursing Facility Quality Reporting Program - Provider Data". The CSV headers agree with this.
| Column | Dictionary description | Type |
|---|---|---|
| CMS Certification Number (CCN) | The CMS certification number (CCN) is used to identify the facility listed. | Text (6) |
| Provider Name | Name of the facility. | Text |
| Address Line 1 | The first line of the address of the facility. | Text |
| Address Line 2 | The second line of the address of the facility. (Swing Bed only) | Text |
| City/Town | The name of the city/town where the facility is located. | Text |
| State | The two-character postal code used to identify the state where the facility is located. | Text (2) |
| ZIP Code | The five-digit postal ZIP code where the facility is located. | Numeric |
| County/Parish | The name of the county/parish where the facility is located. | Text |
| Telephone Number | The ten-digit telephone number of the facility. The format is (xxx) yyy-zzzz. | Text |
| CMS Region | CMS region key (below) | Numeric |
| Measure Code | "consists of the CMS ID (prefix) and the variable name (suffix)... Example = S_038_02_ADJ_RATE. Prefix: S_038_02. Suffix: ADJ_RATE. See Table 23 for a complete listing of facility data measure codes." (NOTE: the facility measure-code list is Table 21, pp.42-44; Table 23 is the refresh timeline; "Table 23" is a mis-reference.) | Text |
| Score | The measure score for the corresponding measure code | Text |
| Footnote | "Indicates the relevant footnote(s). If there is more than one relevant footnote, the values are separated by commas (e.g., 9,13). See Table 17 for the definition of each footnote and Table 24 for more information on how each footnote is used for the SNF QRP measures." (NOTE: the footnote definitions are Table 15 and QRP usage is Table 22; "Table 17"/"Table 24" are mis-references.) | Numeric |
| Start Date | Start date of the reporting period for the measure code and score | Date |
| End Date | End date of the reporting period for the measure code and score | Date |
| Measure Date Range | start through end date of the reporting period(s); only split periods are populated, semicolon between periods (e.g., 04/01/2019-12/31/2019; 07/01/2020-09/30/2021) | Text |
| LOCATION1 | The full facility address. (Provider Data only) | Text |

**CMS Region key (p.39):** 1 = Boston: Connecticut, Maine, Massachusetts, New Hampshire, Rhode Island, Vermont. 2 = New York: New Jersey, New York, Puerto Rico, Virgin Islands. 3 = Philadelphia: Delaware, District of Columbia, Maryland, Pennsylvania, Virginia, West Virginia. 4 = Atlanta: Alabama, Florida, Georgia, Kentucky, Mississippi, North Carolina, South Carolina, Tennessee. 5 = Chicago: Illinois, Indiana, Michigan, Minnesota, Ohio, Wisconsin. 6 = Dallas: Arkansas, Louisiana, New Mexico, Oklahoma, Texas. 7 = Kansas City: Iowa, Kansas, Missouri, Nebraska. 8 = Denver: Colorado, Montana, North Dakota, South Dakota, Utah, Wyoming. 9 = San Francisco: Arizona, California, Hawaii, Nevada, Pacific Territories. 10 = Seattle: Alaska, Idaho, Oregon, Washington.

#### SNF QRP measure codes — national file (Table 20, pp.40-41)
Measure Code = `<CMS ID>_<suffix>`. Listed codes per measure:
- **S_004_01** Rate of potentially preventable hospital readmissions 30 days after discharge from a SNF: `S_004_01_PPR_PD_NAT_UNADJUST_AVG` (National unadjusted average potentially preventable readmission rate); `S_004_01_PPR_PD_N_BETTER_ NAT` [sic, contains a space in the PDF] (Number of SNFs in the nation that performed better than the national rate); `S_004_01_PPR_PD_N_NO_DIFF_ NAT` [sic] (no different than); `S_004_01_PPR_PD_N_WORSE_NAT` (worse than); `S_004_01_PPR_PD_N_TOO_SMALL` (Number of SNFs too small to report).
- **S_005_02** Rate of successful return to home or community from a SNF: `S_005_02_DTC_NAT_OBS_RATE` (National observed discharge to community rate); `S_005_02_DTC_N_BETTER_NAT`; `S_005_02_DTC_N_NO_DIFF_NAT`; `S_005_02_DTC_N_WORSE_NAT`; `S_005_02_DTC_N_TOO_SMALL`.
- **S_006_01** Medicare Spending Per Beneficiary (MSPB) for residents in SNFs: `S_006_01_MSPB_SCORE_NATL` (MSPB score (national)).
- **S_007_02** Percentage of residents whose medications were reviewed and who received follow-up care when medication issues were identified: `S_007_02_NATL_OBS_RATE` (National rate).
- **S_013_02** Percentage of SNF residents who experience one or more falls with major injury during their SNF stay: `S_013_02_NATL_OBS_RATE`.
- **S_024_06** Percentage of residents who are at or above an expected ability to care for themselves at discharge: `S_024_06_NATL_OBS_RATE`.
- **S_025_06** Percentage of residents who are at or above an expected ability to move around at discharge: `S_025_06_NATL_OBS_RATE`.
- **S_038_02** Percentage of residents with pressure ulcers/pressure injuries that are new or worsened: `S_038_02_NATL_OBS_RATE`.
- **S_039_01** Percentage of infections residents got during their SNF stay that resulted in hospitalization: `S_039_01_HAI_NAT_OBS_RATE` (National observed health care-associated infection rate); `S_039_01_HAI_N_BETTER_NAT`; `S_039_01_HAI_N_NO_DIFF_NAT`; `S_039_01_HAI_N_WORSE_NAT`; `S_039_01_HAI_N_TOO_SMALL`.
- **S_040_02** Percentage of SNF health care personnel who are up to date with their COVID-19 vaccines: `S_040_02_NATL_OBS_RATE` (National rate of COVID-19 vaccination).
- **S_041_01** Percentage of health care personnel who got a flu shot for the current season: `S_041_01_NATL_OBS_RATE` (National rate of flu vaccination).
- **S_042_02** Percentage of residents who are at or above an expected ability to care for themselves and move around at discharge: `S_042_02_NATL_OBS_RATE`.
- **S_043_02** Percentage of residents where the SNF provided a current medication list to the next health care setting: `S_043_02_NATL_OBS_RATE`.
- **S_044_02** Percentage of residents where the SNF provided a current medication list to the resident, family, and/or caregiver at final discharge: `S_044_02_NATL_OBS_RATE`.
- **S_045_01** Percentage of SNF residents who are up to date with their COVID-19 vaccines: `S_045_01_NATL_OBS_RATE`.
That is 27 listed national codes (5 + 5 + 1 + 1 + 1 + 1 + 1 + 1 + 5 + 1 + 1 + 1 + 1 + 1 + 1 = 27). (`docs/PROFILE.md` reports 27 rows in the Jul 2026 national CSV; the dictionary count agrees.)

#### SNF QRP measure codes — provider and swing bed files (Table 21, pp.42-44)
- **S_004_01** (readmissions): `_PPR_PD_OBS_READM` Number of potentially preventable readmissions following discharge; `_PPR_PD_VOLUME` Number of eligible stays; `_PPR_PD_OBS` Unadjusted potentially preventable readmission rate; `_PPR_PD_RSRR` Risk-standardized potentially preventable readmission rate (RSRR); `_PPR_PD_RSRR_2_5` Lower limit of the 95% confidence interval on the RSRR; `_PPR_PD_RSRR_97_5` Upper limit of the 95% confidence interval on the RSRR; `_PPR_PD_COMP_PERF` Comparative performance category.
- **S_005_02** (discharge to community): `_DTC_NUMBER` Observed number of discharges to community (DTC); `_DTC_VOLUME` Number of eligible stays for DTC measure; `_DTC_OBS_RATE` Observed discharge to community rate; `_DTC_RS_RATE` Risk-standardized discharge to community rate; `_DTC_RS_RATE_2_5` Lower limit of the 95% CI on the risk-standardized DTC rate; `_DTC_RS_RATE_97_5` Upper limit of the 95% CI; `_DTC_COMP_PERF` Comparative performance category.
- **S_006_01** (MSPB): `_MSPB_NUMB` Number of eligible episodes; `_MSPB_SCORE` MSPB score.
- **S_007_02**, **S_013_02**, **S_024_06**, **S_025_06**, **S_042_02**, **S_043_02**, **S_044_02**: `_NUMERATOR` Numerator; `_DENOMINATOR` Denominator; `_OBS_RATE` Facility rate ("Facility Rate" for S_042_02, S_043_02, S_044_02).
- **S_038_02** (pressure ulcers): `_NUMERATOR`, `_DENOMINATOR`, `_OBS_RATE` Facility observed rate, `_ADJ_RATE` Facility adjusted rate.
- **S_039_01** (HAI): `_HAI_NUMBER` Observed number of health care-Associated Infections; `_HAI_VOLUME` Number of eligible stays; `_HAI_OBS_RATE` Observed health care-associated infection rate; `_HAI_RS_RATE` Risk-standardized health care-associated infection rate; `_HAI_RS_RATE_2_5` Lower 95% confidence limit of the risk-standardized HAI rate; `_HAI_RS_RATE_97_5` Upper 95% confidence limit; `_HAI_COMP_PERF` Comparative performance category.
- **S_040_02** (COVID-19 vaccine, health care personnel): `_NUMERATOR` Number of health care workers vaccinated; `_DENOMINATOR` Number of health care workers; `_OBS_RATE` Rate of COVID-19 vaccination.
- **S_041_01** (flu shot, personnel): `_NUMERATOR` Number of health care workers vaccinated; `_DENOMINATOR` Number of health care workers; `_OBS_RATE` Rate of flu vaccination.
- **S_045_01** (COVID-19 vaccines, SNF residents): `_NUMERATOR`, `_DENOMINATOR`, `_OBS_RATE` Facility Rate.
Full code = prefix + suffix, e.g., `S_004_01_PPR_PD_RSRR`. The dictionary does not give the values of the "comparative performance category" (UNCLEAR IN DICTIONARY). The dictionary does not state units for the "OBS_RATE" and "ADJ_RATE" suffixes (percentage vs fraction) — UNCLEAR.

#### SNF QRP footnote usage (Table 22, p.45)
| Footnote | Displayed on Medicare.gov | Details |
|---|---|---|
| 1 | Newly certified nursing home with less than 12-15 months of data available or the nursing home opened less than 6 months ago, and there were no data to submit or claims for this measure. | SNF has been open for less than 6 months. Minimum denominator to publicly report for assessment-based and claims-based measures was not met (denominator is 0 because of measure exclusion). There were no health care personnel reported by the provider. |
| 7 | CMS determined that the percentage was not accurate, or data suppressed by CMS for one or more quarters. | Data suppressed by CMS for one or more quarters (facility-specific). Data suppressed by CMS for one or more quarters (all facilities). |
| 9 | The number of residents or resident stays is too small to report. Call the facility to discuss this quality measure. | "Minimum denominator to publicly report for assessment-based measures and MSPB claims-based measure is 20 (denominator is between 1-19)." "Minimum denominator to publicly report for the PPR, DTC and SNF HAI claims-based measures is 25 (denominator is between 1-24)." |
| 10 | The data for this measure is missing or was not submitted. Call the facility to discuss this quality measure. | There was no data (assessment, CDC, claims) to submit for this measure because there were no patients admitted and discharged from the facility. |
| 13 | Results are based on a shorter time period than required. | Results were based on data reported from less than the maximum possible time period used to collect data for the measure (assessment-based). |
| 14 | This nursing home is not required to submit data for the Skilled Nursing Facility Quality Reporting Program. | There are no SNF QRP measures data available for this nursing home. |

#### SNF QRP refresh and timeframe table (Table 23, pp.46-49)
Quarterly refresh in January, April, July, October (p.37), "subject to change and not all measure data will be updated during each quarterly release." Table 23 covers refreshes October 2025, January 2026, April 2026, July 2026, October 2026 and states "Periods of performance are subject to change." Measure IDs are written there as `S007.02`, `S013.02`, `S024.06`, `S025.06`, `S038.02`, `S042.02`, `S43.02`, `S44.02`, `S045.01`, `S40.02`, `S041.01`, `S004.01`, `S005.02`, `S006.01`, `S39.01` (different style from `S_007_02`).
| Measure (CMS ID) | Collection period / frequency | Oct 2025 | Jan 2026 | Apr 2026 | Jul 2026 | Oct 2026 |
|---|---|---|---|---|---|---|
| S007.02 Drug Regimen Review Conducted with Follow-Up for Identified Issues | four rolling quarters (12 months), quarterly | Q1 2024-Q4 2024 | Q2 2024-Q1 2025 | Q3 2024-Q2 2025 | Q4 2024-Q3 2025 | Q1 2025-Q4 2025 |
| S013.02 Falls with Major Injury (Long Stay) | same | same as above | | | | |
| S024.06 Discharge Self-Care Score | same | same | | | | |
| S025.06 Discharge Mobility Score | same | same | | | | |
| S038.02 Pressure Ulcer/Injury | same | same | | | | |
| S042.02 Discharge Function Score | same | same | | | | |
| S43.02 Transfer of Health Information to the Provider-PAC | same | same | | | | |
| S44.02 Transfer of Health Information to the Patient-PAC | same | same | | | | |
| S045.01 COVID-19 Vaccine: Percent of Patients/Residents Who Are Up to Date | 3 months, quarterly | Q4 2024 | Q1 2025 | Q2 2025 | Q3 2025 | Q4 2025 |
| S40.02 COVID-19 Vaccination Coverage among Healthcare Personnel | 3 months, quarterly | Q4 2024 | Q1 2025 | Q2 2025 | Q3 2025 | Q4 2025 |
| S041.01 Influenza Vaccination Coverage Among Healthcare Personnel | 6 months, annually | Q4 2024-Q1 2025 | Q4 2024-Q1 2025 | Q4 2024-Q1 2025 | Q4 2024-Q1 2025 | Q4 2025-Q1 2026 |
| S004.01 Potentially Preventable 30-Day Post-Discharge Readmission | 24 months, annually | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 | Q4 2023-Q3 2025 |
| S005.02 Discharge to Community | 24 months, annually | same as S004.01 | | | | |
| S006.01 Medicare Spending Per Beneficiary (MSPB) | 24 months, annually | Q4 2021-Q3 2023 | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 | Q4 2022-Q3 2024 |
| S39.01 SNF Healthcare-Associated Infections Requiring Hospitalization | 12 months, annually | Q4 2023-Q3 2024 | Q4 2023-Q3 2024 | Q4 2023-Q3 2024 | Q4 2023-Q3 2024 | Q4 2024-Q3 2025 |
Note: "same as above" means the rolling-quarter pattern printed on p.46 for the first measure repeats row-for-row in the PDF (pp.46-47). The columns are as printed in the PDF.
Also from Table 16: 202510 initial public reporting of S_043_02, S_044_02, S_045_01 and measure-ID increments for S_024_06, S_025_06, S_042_02; 202410 initial reporting of S_042_01 and removal of S_001_03, S_022_04, S_023_04, increments to S_024_05, S_025_05, S_040_02; 202310 initial reporting of S_041_01 and increments of S_022_04, S_023_04, S_024_04, S_025_04. 202004: "Footnote codes have been consolidated between the QRP QMs and the non-QRP QMs."

### 3.17 FY 2026 SNF VBP Facility-Level — Table 24, pp.50-54 — `284v-j9fz`
49 fields. All "Footnote -- ..." fields are typed **Text** (not Numeric). Measure abbreviations: SNFRM = SNF 30-Day All-Cause Readmission Measure; SNF HAI = SNF Healthcare-Associated Infections Requiring Hospitalization; Total Nursing Staff Turnover; Total Nurse Staffing (Total Nursing Hours per Resident Day). Baseline period FY 2022; performance period FY 2024.
| Column | Dictionary description | Type |
|---|---|---|
| SNF VBP Program Ranking | "A skilled nursing facility's (SNF's) national rank among eligible, included SNFs in the SNF VBP Program for the FY 2026 Program year. Calculated by sorting and ranking all eligible, included SNFs' performance scores. Lower ranks reflect better performance. Any SNFs with equal performance scores each receive the best (that is, lowest) rank within the tie." | Numeric |
| CMS Certification Number (CCN) | Centers for Medicare & Medicaid Services (CMS) Certification Number (CCN) | Text (6) |
| Provider Name / Provider Address / City/Town | Provider name / address / city/town | Text |
| State | Provider state (2-digit postal code abbreviation) | Text (2) |
| ZIP Code | Provider ZIP code | Numeric |
| Baseline Period: FY 2022 Risk-Standardized Readmission Rate | "A SNF's rate of unplanned readmissions during the baseline period (FY 2022), adjusted for stay-level risk factors such as clinical characteristics and comorbidities, as calculated by the SNF 30-Day All-Cause Readmission Measure (SNFRM)." | Numeric |
| Performance Period: FY 2024 Risk-Standardized Readmission Rate | same for performance period (FY 2024) | Numeric |
| SNFRM Achievement Score | "how well a SNF performed on the SNFRM during the performance period (FY 2024) compared with national SNF performance during the baseline period (FY 2022). Scores range from 0 to 10, with higher scores indicating better performance." | Numeric |
| SNFRM Improvement Score | "how much a SNF improved on the SNFRM from the baseline period (FY 2022) to the performance period (FY 2024). Scores range from 0 to 9, with higher scores indicating more improvement." | Numeric |
| SNFRM Measure Score | "The higher of a SNF's achievement score and improvement score for the SNFRM. Scores range from 0 to 10, with higher scores indicating better performance." | Numeric |
| Baseline / Performance Period Risk-Standardized Healthcare-Associated Infection Rate | "A SNF's rate of healthcare-associated infections requiring hospitalizations that are acquired during SNF care during the baseline (FY 2022) / performance (FY 2024) period, adjusted for stay-level risk factors such as clinical characteristics and comorbidities, as calculated by the SNF Healthcare-Associated Infections Requiring Hospitalization (SNF HAI) measure." | Numeric |
| SNF HAI Achievement Score / Improvement Score / Measure Score | same definitions as SNFRM, applied to SNF HAI (achievement 0-10, improvement 0-9, measure score = higher of the two, 0-10) | Numeric |
| Baseline / Performance Period Total Nursing Staff Turnover Rate | "A SNF's annual turnover rate among eligible SNF staff, including registered nurses (RNs), licensed practical/vocational nurses (LPNs), and nurse aides, during the baseline period (FY 2022) / performance period (FY 2024), as calculated by the Total Nursing Staff Turnover measure (Nursing Staff Turnover)." | Numeric |
| Total Nursing Staff Turnover Achievement / Improvement / Measure Score | same score definitions (0-10 / 0-9 / 0-10) | Numeric |
| Baseline / Performance Period Adjusted Total Nursing Staff Hours per Resident Day | "A SNF's average case-mix adjusted total nursing staff hours (including RNs, LPNs, and nurse aides) per resident day during the baseline (FY 2022) / performance (FY 2024) period, as calculated by the Total Nursing Hours per Resident Day measure (Total Nurse Staffing)." | Numeric |
| Total Nurse Staffing Achievement / Improvement / Measure Score | same score definitions (0-10 / 0-9 / 0-10) | Numeric |
| Performance Score | "A calculation of a SNF's overall performance across all quality measures included in the SNF VBP Program for the FY 2026 Program year. Scores range from 0 to 100, with higher scores indicating better performance. CMS uses this score to calculate incentive payment multipliers for the SNF VBP Program." | Numeric |
| Incentive Payment Multiplier | "A multiplier assigned to a SNF based on its performance in the SNF VBP Program. When payments are made for a SNF's Medicare fee-for-service (FFS) Part A claims in FY 2026, CMS multiplies the SNF's adjusted federal per diem rate by this multiplier." | Numeric |
Each measure-level column (rate, achievement, improvement, measure score) is followed by a "Footnote -- <column name>" column (Text). The dictionary gives no list of VBP footnote codes: UNCLEAR IN DICTIONARY (Table 15 and Table 22 do not mention VBP).

### 3.18 FY 2026 SNF VBP Aggregate Performance — Table 25, pp.54-56 — `ujcx-uaut`
21 fields; national aggregate (one row implied; dictionary does not say row count: UNCLEAR). Per-measure fields for SNFRM, SNF HAI, Total Nursing Staff Turnover, Total Nurse Staffing:
- "Baseline Period: FY 2022 National Average ..." / "Performance Period: FY 2024 National Average ..." (Numeric): "The SNF VBP Program's national average, risk-standardized rate of unplanned readmissions [or: risk-standardized rate of healthcare-associated infections requiring hospitalization that are acquired during SNF care; national average turnover rate among eligible SNF staff, including RNs, LPNs, and nurse aides; national average, case-mix adjusted total nursing staff hours (including RNs, LPNs, and nurse aides) per resident day] in the baseline period (FY 2022) / performance period (FY 2024)."
- "<Measure> Achievement Threshold" (Numeric): "The 25th percentile of all SNFs' performance on the [measure] during the baseline period (FY 2022)."
- "<Measure> Benchmark" (Numeric): "The mean of the top decile of all SNFs' performance on the [measure] during the baseline period (FY 2022)."
Other fields: Range of Performance Scores (Numeric range) "The range of SNF VBP Program performance scores for the FY 2026 SNF VBP Program year."; Total Number of SNFs Receiving Value-Based Incentive Payments (Numeric) "The total number of SNFs receiving SNF VBP Program value-based incentive payments in FY 2026."; Range of Incentive Payment Multipliers (Numeric range) "The range of SNF VBP Program incentive payment multipliers for the FY 2026 SNF VBP Program year."; Range of Value-Based Incentive Payments ($) (Dollar range) "The range of SNF VBP Program value-based incentive payments paid to SNFs in FY 2026."; Total Amount of Value-Based Incentive Payments ($) (Dollars) "The total amount of SNF VBP Program value-based incentive payments paid to SNFs in FY 2026."
The four field groups map to: SNFRM (Baseline/Performance readmission rates, Threshold, Benchmark), SNF HAI (rates, Threshold, Benchmark), Total Nursing Staff Turnover (rates, Threshold, Benchmark), Total Nurse Staffing (adjusted hours rates, Threshold, Benchmark) = 16 fields, plus the 5 summary fields above = 21.

### 3.19 Acronym index — Table 17, p.38
CAH Critical Access Hospital; CCN CMS Certification Number; CDC Centers for Disease Control and Prevention; CMS Centers for Medicare & Medicaid Services; COVID-19 Coronavirus Disease 2019; HAI Health care-Associated Infections; HCP Health care Personnel; IRF Inpatient Rehabilitation Facility; MSPB Medicare Spending Per Beneficiary; NH Nursing Home; PAC Post-Acute Care; PHE Public Health Emergency; SNF Skilled Nursing Facility; QRP Quality Reporting Program; RSRR Risk-standardized readmission rate.

---

## 4. KEY CONCEPTS, WITH WHAT THE DICTIONARY ACTUALLY SAYS

### 4.1 CCN key
Field "CMS Certification Number (CCN)"; Text (6); "always has 6 characters, and these can be letters or numbers" (p.12; the example in that footnote calls it PROVNUM). Present in every provider-level file. Not present in State US Averages, Data Collection Intervals, Citation Code Look-up, Cut Points, and the VBP Aggregate file. In the SNF QRP National file the CCN "is listed as 'Nation'". Table 16 202306: "Updated certain variable names (column headers) to be more uniform across care settings. Impacted variables were provider number (CCN), provider name, city, county, state, ZIP code, and phone number."

### 4.2 Footnote columns
See section 7. A footnote column carries the numeric code explaining why a score/rating is blank or caveated. 201904: "all footnote fields will now include codes instead of text."

### 4.3 Inspection Cycle vs Rating Cycle vs Survey Cycle
- **Inspection Cycle** (Fire Safety, Health Deficiencies, Survey Summary): 1 = most recent cycle. "Standard inspection cycles are counted sequentially into the past, complaint inspection cycles are counted annually into the past. If a deficiency is found on a co-occurring standard and complaint inspection, it is assigned to the standard cycle." Survey Summary says "Values can be 1,2 or 3". The Health file says "for display on Nursing Home Compare".
- **Survey Cycle** (Inspection Dates): "a value of 1,2, or 3 with 1 being most recent".
- **Rating cycle** (Provider Information): Rating cycle 1 = most recent standard health survey + "complaint and infection control surveys from the most recent 12 months"; Rating cycle 2/3 = second most recent standard survey + "complaint and infection control surveys from 13-36 months ago". Table 16 (201802) explains: "'cycles' in this table refer to the cycles used in the Health Inspection Rating (i.e., rating cycles)" and that Health Deficiencies cycles "refer to display cycles". The Health Deficiencies table description (Table 1) says it "includes citations that are not used for the health inspection rating (e.g., citations under IDR/IIDR and citations from cycle 3 standard surveys)".
- **State US Averages** "Cycle 1/2/3": Cycle 1 = most recent 12 months standard survey + complaint/infection control; Cycle 2 = second most recent standard + complaint/infection control from 13-24 months; Cycle 3 = third most recent standard + complaint/infection control from 25-36 months. "Cycle 3 standard surveys are not used for the health inspection rating."
- UNCLEAR IN DICTIONARY: how the "annual" complaint cycle counting maps onto cycles 1-3 for an individual citation, and whether Inspection Cycle in the citation files and Survey Cycle in Inspection Dates are always identical for the same survey date.
- Table 16 (201802) also contains this sentence about health deficiencies: "results from health inspections on or after 11/28/2017 are not used in the health inspection rating". UNCLEAR IN DICTIONARY whether this 2018 revision note still applies; the current Table 1 text describes only IDR/IIDR citations and cycle 3 standard surveys as not used for the rating.

### 4.4 Survey Type values
- Inspection Dates (Table 5): Fire Safety Standard; Fire Safety Complaint; Health Inspection Standard; Health Inspection Complaint; Infection Control.
- Fire Safety and Health Deficiencies (Tables 6, 7): "Type of survey: Health or Fire Safety". Standard/Complaint/Infection Control status is carried by the three separate Y/N columns (Standard Deficiency, Complaint Deficiency, Infection Control Inspection Deficiency).

### 4.5 Used in Quality Measure Five Star Rating
Y/N in MDS and Claims QM files: "Identifies whether the quality measure is used in the calculation of the quality measure rating in the Five-Star Quality Rating System". Revision 201904: "LS ED visit measure (552); and LS hospitalization now a 5-star measure".

### 4.6 Resident type
"Identifies the measure as pertaining to either short-stay or long-stay stay residents" (MDS and Claims). Exact stored strings not given. Table 4: "the data collection period for short-stay QMs is five quarters and begins one quarter before the data collection period for long-stay QMs."

### 4.7 Star-rating methodology
Not described in the dictionary. What exists: Provider Information has Overall, Health Inspection, QM (plus Long-Stay and Short-Stay QM), and Staffing ratings, each "(1-5)"; Chain averages of overall, health inspection, staffing and QM ratings; Total Weighted Health Survey Score; Rating cycle scores; Cut Points file with "Cut point range to obtain a N-star health inspection score within a specific state". Footnote 2 ("Not enough data available to calculate a star rating"); footnote 26/27 describe the turnover effect on the staffing score: 26 "This measure will receive the minimum points for calculating the overall staffing score and rating"; 27 "This measure will be excluded from the staffing rating and the staffing score will be rescaled". All other methodology is deferred to the "CMS 5-Star Technical Users' Guide".

---

## 5. JOIN KEYS

| Link | Fields | Dictionary statement / caveat |
|---|---|---|
| Any provider-level file <-> any other | `CMS Certification Number (CCN)` (Text (6), letters or numbers) | Provider Information, Fire Safety, Health Deficiencies, Inspection Dates, Survey Summary, MDS QM, Claims QM, Ownership, Penalties, SNF QRP Provider, Swing Bed, VBP Facility all carry CCN. Keep as text; the Excel leading-zero warning is on p.3. Table 1: Provider Information has "one row per nursing home". Provider Information, Ownership and the penalty/fine totals describe "currently active nursing homes" (Ownership) or "last three years" (Penalties); other files may contain different provider sets (not stated). |
| Provider Information <-> Ownership | CCN | Ownership has many rows per CCN (one per owner/manager role); no uniqueness statement. |
| Provider Information <-> Penalties | CCN | Provider Information carries Number of Fines, Total Amount of Fines in Dollars, Number of Payment Denials, Total Number of Penalties. The dictionary does not state that these are derived from the Penalties file (UNCLEAR). Penalties covers "the last three years". |
| Health / Fire citations <-> Citation Code Look-up | Deficiency Prefix + Deficiency Tag Number (or "Deficiency Prefix and Number", e.g., F-0880, Text (6)) | Lookup prefixes are "F, K, E". Fire Safety: K or E. Health: F. Fire Safety `Tag Version` caveat: "for a small number of life safety deficiencies (K tags), the same deficiency tag number has a different description in the two versions" (before vs on/after 7/5/2016). So Prefix+Tag Number may NOT uniquely identify a description for K tags (UNCLEAR whether the lookup file has one or two rows for those tags). |
| Citation files <-> Inspection Dates | CCN + Survey Date (and cycle) | Table 16 (202101): Inspection Dates "contains all inspection dates referenced in other files". The dictionary does not name the join key explicitly. Complaint inspections appear in Inspection Dates only if they resulted in one or more citations. Standard and infection control inspections appear whether or not there were citations. |
| Survey Summary <-> Inspection Dates / citations | CCN + Inspection Cycle (Survey Summary) vs CCN + Survey Cycle (Inspection Dates) / Inspection Cycle (citations) | Survey Summary is one inspection per provider per cycle (Table 1 and 201404). Not stated as a join in the dictionary. Survey Summary counts also include complaint and infection control surveys (202503). |
| MDS / Claims QM <-> Data Collection Intervals | Measure Code | Table 4 types Measure Code as Text with "(internal code for complaint intervals)"; Tables 11 and 12 type it Numeric (###). Type mismatch risk: keep as text. Data Collection Intervals also has non-numeric codes (`STAFFING_LEVELS`, `STAFFING_TURNOVER`) per Table 16. |
| State-level files <-> provider files | `State` (Text (2), postal abbreviation) = `State or Nation` in State US Averages (also 'NATION') = `State` in Cut Points | "NATION" is a non-state value in State US Averages. Territories exist in these files ("each state or territory"); UNCLEAR which territory codes are used. |
| QRP Provider / Swing Bed <-> National | Measure Code prefix (CMS ID like S_038_02) | Provider file suffixes (e.g., `_OBS_RATE`) differ from National suffixes (e.g., `_NATL_OBS_RATE`). Join on the prefix only after splitting; the dictionary defines "Prefix" and "Suffix" for exactly this. |
| Chain grouping | `Chain ID`, `Chain Name` in Provider Information | Chain = "a group of nursing homes that share at least one individual or organizational owner, officer, or entity with operational/managerial control". Chain averages are "Missing if the provider is not part of a chain". Renamed from "Affiliated Entity" in 202507. |
| Swing Bed vs NH | CCN | Swing bed units are "Non-Critical Access Hospitals (CAHs) with swing beds"; CCNs in the swing bed file are hospitals, not nursing homes; whether they appear in NH files is not stated (UNCLEAR). |
| VBP Facility <-> others | CCN | Excluded SNFs are not in the file ("CMS will not publicly report any data for excluded SNFs"). |

Description inconsistency to remember: Table 1 describes State US Averages as "Each row displays a specific state or territory, the associated measure and average" (long format), while Table 3 and the CSV header are wide (one row per state, one column per measure).

---

## 6. DICTIONARY vs. ACTUAL CSV MISMATCHES

Method: every dictionary table's field list (in dictionary order) was compared to the single header row of the matching CSV, exact match first, then case-insensitive. Result: **same number of fields and same order in all 18 files; no field exists only in the dictionary or only in the CSV.** Differences are only naming.

| File | Dict fields | CSV cols | Differences (dictionary -> actual CSV) |
|---|---|---|---|
| Provider Information (4pq5) | 102 | 102 | Capitalization only (19 + 1): `Date First Approved to Provide Medicare and Medicaid services` -> `...Medicaid Services`; every `Rating cycle ...` -> `Rating Cycle ...` (18 columns: cycle 1 date, footnote, total, standard, complaint, deficiency score, revisits, revisit score, total score; cycle 2 date, footnote; cycle 2/3 total, standard [named "Rating Cycle 2 Number of Standard ..."], complaint, deficiency score, revisits, revisit score, total score); `Number of citations from infection control inspections` -> `Number of Citations from Infection Control Inspections`. All other 82 headers match exactly. Note: the actual headers keep "Rating Cycle 2 Number of Standard Health Deficiencies" and "Rating Cycle 2 Standard Health Survey Date" (cycle 2 only) alongside "Rating Cycle 2/3 ..." for the others, exactly as the dictionary does. |
| Survey Summary (tbry) | 42 | 42 | Wording differences (3): dict `Count of Freedom from Abuse, Neglect, and Exploitation Deficiencies` -> CSV `Count of Freedom from Abuse and Neglect and Exploitation Deficiencies`; dict `Count of Gas, Vacuum, and Electrical Systems` (no "Deficiencies") -> CSV `Count of Gas and Vacuum and Electrical Systems Deficiencies`; dict `Count of Medical Gases and Anesthetizing Areas Deficiencies` -> CSV `Count of Medical Gases and Anaesthetizing Areas Deficiencies` (spelling "Anaesthetizing"). |
| Medicare Claims QM (ijh5) | 17 | 17 | Dict `Footnote for the Measure Score` -> CSV `Footnote for Score`. |
| Swing Bed (6uyb) | 16 | 16 | Dict `Measure Date Range` -> CSV `MeasureDateRange` (no spaces). (The SNF QRP Provider file fykj-qjee uses `Measure Date Range` with spaces, as does the National file.) |
| State US Averages (xcdc) | 51 | 51 | None. |
| Data Collection Intervals (qmdc) | 6 | 6 | None. |
| Inspection Dates (svdt) | 6 | 6 | None. |
| Fire Safety (ifjz) | 24 | 24 | None. |
| Health Deficiencies (r5ix) | 24 | 24 | None. |
| Citation Code Look-up (tagd) | 5 | 5 | None. |
| Cut Points (hicp) | 6 | 6 | None. |
| MDS QM (djen) | 23 | 23 | None. |
| Ownership (y2hd) | 13 | 13 | None. |
| Penalties (g6vv) | 14 | 14 | None (includes Fine ID, consistent with the 202606 revision). |
| QRP National (5sqm) | 7 | 7 | None. |
| QRP Provider (fykj) | 16 | 16 | None (has LOCATION1, no Address Line 2, as stated). |
| VBP Facility (284v) | 49 | 49 | None (all `Footnote -- ...` headers present). |
| VBP Aggregate (ujcx) | 21 | 21 | None. |

Other format observations from the header rows only: the 284v and ujcx files have unquoted header cells, all other files quote every header cell; no file has a UTF-8 byte-order mark. The dictionary's description of the Health and Fire Safety `Survey Type` and Provider Information value lists could not be checked because no data rows were read.

**Dictionary is current as of its own date**, but is **internally inconsistent in several places** (not CSV mismatches):
1. Table 1 Medicare Claims QM description is a verbatim copy of the MDS description (mentions quarters; claims table has Adjusted/Observed/Expected, no quarters).
2. Table 1 State US Averages description says one row per state + measure; Table 3 is wide.
3. Table 18 points to "Table 22" for the national measure-code list; the list is Table 20. Table 19 points to "Table 23" for the facility list (it is Table 21), to "Table 17" for footnote definitions (they are in Table 15, with QRP usage in Table 22) and to "Table 24" for footnote usage (it is Table 22).
4. Table 20 has `S_004_01_PPR_PD_N_BETTER_ NAT` and `..._N_NO_DIFF_ NAT` with an embedded space (typos).
5. Table 23 writes measure IDs as `S007.02`/`S43.02`/`S39.01` while Tables 20-21 write `S_007_02`/`S_043_02`/`S_039_01`.
6. (Not an error) Table 16 says S_042_01 was initially reported in 202410 and that S_042_02 is an incremented ID from 202510; Tables 20-21 list `S_042_02`. Measure IDs carry a version suffix that changes over time, so join on prefix with care.
7. The Table 16 202109 revision note names "Cycle 1 Total Number of Fire Safety Deficiencies" three times (apparently a typo for cycles 1, 2 and 3; the Table 3 fields are Cycle 1, 2 and 3).
8. Table 16 201612 (life-safety columns set to NULL "until further notice") and 201802 (11/28/2017 statement) are old notes whose current status is not given.
9. Tables 6 and 7 say Survey Type is "Health or Fire Safety" in both; Table 5 lists five survey types.
10. Table 16 202609 says "Rating cycle 1 Standard Survey Footnote" and "Rating cycle 2 Standard Survey Footnote" were added, and "Survey Footnote" was added to Inspection Dates, Health Deficiencies and Survey Summary — all are present in the CSV headers (consistent).

---

## 7. FOOTNOTE CODES — master list (Table 15, p.25), code -> meaning

| Code | Meaning (verbatim) | Where the dictionary ties it to a use |
|---|---|---|
| 1 | Newly certified nursing home with less than 12-15 months of data available or the nursing home opened less than 6 months ago, and there were no data to submit or claims for this measure. | QM and QRP measures (Table 22) |
| 2 | Not enough data available to calculate a star rating. | star ratings (Provider Information rating footnotes; the dictionary does not list which) |
| 6 | This facility submitted data that did not meet the criteria required to calculate a staffing measure. | staffing (wording changed 202501; 23/25 replace it "when applicable" for staffing level measures) |
| 7 | CMS determined that the percentage was not accurate, or data suppressed by CMS for one or more quarters. | QM measures; QRP (Table 22) |
| 9 | The number of residents or resident stays is too small to report. Call the facility to discuss this quality measure. | QM; QRP (Table 22): min denominator 20 (assessment-based and MSPB; denominator 1-19) or 25 (PPR, DTC, SNF HAI claims-based; denominator 1-24) |
| 10 | The data for this measure is missing or was not submitted. Call the facility to discuss this quality measure. | QM; QRP (Table 22) |
| 13 | Results are based on a shorter time period than required. | QM; QRP (assessment-based) (Table 22) |
| 14 | This nursing home is not required to submit data for the Skilled Nursing Facility Quality Reporting Program. | QRP (Table 22) |
| 18 | This facility is not rated due to a history of serious quality issues and is included in the special focus facility program. | ratings (SFF) |
| 20 | The accuracy of the data for this rating could not be validated by CMS. | ratings (added 202301; wording changed 202501) |
| 21 | The accuracy of the data for this measure could not be validated by CMS. | measures (added 202301; wording changed 202501) |
| 22 | The street address for this facility could not be matched to latitude/longitude coordinates. Therefore, the latitude/longitude coordinates are based on the facility's zip code. | `Geocoding Footnote` (added 202308) |
| 23 | This facility did not submit staffing data. | staffing level (added 202501) |
| 24 | This facility reported a high number of days without a registered nurse onsite. | staffing (added 202501 per the 202501 row "replaced with footnotes 23-25") |
| 25 | The accuracy of the staffing data for this measure could not be validated by CMS. | staffing level (added 202501) |
| 26 | This facility did not submit staffing data or submitted staffing data that is considered to be invalid for the purpose of calculating turnover. This measure will receive the minimum points for calculating the overall staffing score and rating. | turnover measures (added 202504) |
| 27 | This facility submitted staffing data that did not meet the criteria required to calculate a turnover measure. This measure will be excluded from the staffing rating and the staffing score will be rescaled. | turnover measures (added 202504) |
| 28 | This is an annual measure. Data for individual quarters is not available. | MDS QMs only calculated annually (currently the flu vaccination measures) (added 202504) |
| 29 | This was a Risk-Based Survey. Unlike a standard inspection, a Risk-Based inspection involves a shorter visit with a smaller inspection team and is only given to higher performing facilities. | `Survey Footnote` in Inspection Dates, Health Deficiencies, Survey Summary; "can apply to standard surveys" (added 202609) |

Codes retired or described in the revision history but absent from the master list: **12** ("Retired footnote 12 and replaced with footnotes 23-25", 202501); **19** ("Footnote code 19 dropped as no longer used", 202301; earlier 201910 used 19 for the QRP pressure ulcer measure not calculated per quarter). Codes with no dictionary entry at all: 3, 4, 5, 8, 11, 15, 16, 17, and anything >29. UNCLEAR IN DICTIONARY: whether those are unused.
Footnote column typing: dictionary says "Numeric" for all NH footnote columns (single code). SNF QRP `Footnote` is typed "Numeric" but "If there is more than one relevant footnote, the values are separated by commas (e.g., 9,13)". SNF VBP "Footnote -- ..." columns are typed Text and have no code list. QRP National Footnote: "Currently, there are no footnotes related to the national data."

---

## 8. GOTCHAS

**Identifiers and types**
1. CCN is Text (6) and can contain letters. Never cast to number. Excel strips leading zeros (p.3).
2. ZIP Code is typed "Numeric" in all provider tables (but "five-digit postal ZIP code" in Table 19, typed Numeric). Telephone Number is "Numeric" in Provider Information but "Text" `(xxx) yyy-zzzz` in the QRP/Swing Bed files. Given the Excel/leading-zero warning, load as text (this is a recommendation; the dictionary does not say which ZIPs have leading zeros).
3. Ownership `Ownership Percentage` and `Association Date` are typed **Text**, not Numeric/Date. QRP `Score` is **Text**; VBP Footnote columns are **Text**; VBP aggregate "Range of ..." fields are "Numeric range"/"Dollar range" (not single numbers).
4. Measure Code: Numeric (###) in MDS and Claims QM files; Text in Data Collection Intervals; strings like `S_004_01_PPR_PD_RSRR` in QRP files.
5. No date format is stated for any Date column. The only formats shown: QRP "Measure Date Range" example `04/01/2019-12/31/2019; 07/01/2020-09/30/2021` (MM/DD/YYYY with a semicolon between split periods); MDS Measure Period `yyyyQq-yyyyQq` (4-quarter range); Claims Measure Period `yyyymmdd - yyyymmdd`; Tag Version cutoff "7/5/2016".

**Missing / suppressed / special values**
6. A blank rating/score is explained by a footnote code, not by a special number (see section 7). Codes 1, 2, 6, 7, 9, 10, 13, 14, 18, 20-29 affect whether the value is shown, rescaled or caveated.
7. "Too few residents": footnote 9 ("number of residents or resident stays is too small to report"). QRP thresholds: assessment-based measures and MSPB need denominator >= 20 (1-19 suppressed); PPR, DTC and SNF HAI need >= 25 (1-24 suppressed).
8. "Data suppressed" = footnote 7. "Missing/not submitted" = footnote 10. "Newly certified / opened less than 6 months" = footnote 1.
9. Special Focus Status: "SFF, SFF Candidate or null". Footnote 18: SFF facilities are "not rated". Sprinkler field values: Yes, Partial, No, Data Not Available. Resident and Family Council values: Resident, Family, Both, None. Chain columns "Missing if the provider is not part of a chain."
10. Historical staffing note (201606): suppressed staffing values had a flag changed to "Data Not Available". Historical 201802: some State averages "reported as NA (Not Available)" for cycle deficiency counts; 201805 says "the state and US averages for count of FireSafety Deficiencies are no longer NA". Current status: UNCLEAR whether any "NA"/"Data Not Available" strings remain in numeric columns; check the data.
11. Provider Information `Average Number of Residents per Day Footnote` is populated only when the resident count is null.
12. Ownership `Ownership Percentage` is provided "only for owners with role description of '5% or greater direct ownership interest' or '5% or greater indirect ownership interest'"; blank for every other role.
13. VBP: SNFs failing the case minimum for at least two of the four measures are excluded and **not published at all** ("CMS will not publicly report any data for excluded SNFs"). The file is therefore not a census of SNFs. Lower Program Ranking = better; ties each get the best (lowest) rank within the tie. Scores: Achievement 0-10, Improvement 0-9, Measure Score 0-10 (higher of achievement and improvement), Performance Score 0-100.
14. Percent vs rate: State US Averages columns are "Percentage of ..." for 19 measures and "Number of ... per 1000 long-stay resident days" for hospitalizations and outpatient ED visits (2 columns). The dictionary never says whether percentages are on a 0-100 or 0-1 scale (UNCLEAR). QRP suffix `_OBS_RATE` / `_ADJ_RATE` / `_RS_RATE`: units not stated (UNCLEAR). MDS scores were once shown to 6 decimal places (201503; may have changed).
15. MDS vs Claims: MDS rows have Q1-Q4 scores and a Four Quarter Average Score. Claims rows have Adjusted, Observed and Expected Score and NO quarterly scores. Footnote 28 flags annual-only MDS measures (quarter columns will not be populated).
16. Short-stay QM data collection period is five quarters and begins one quarter earlier than long-stay (Table 4), so Measure Period/Data Collection Intervals differ by resident type.
17. SNF QRP `Measure Date Range` is populated only for split periods; otherwise use Start Date/End Date. QRP Footnote can hold multiple comma-separated codes in one cell.
18. Table 3 US-level staffing and case-mix values are "calculated quarterly and used in calculation of adjusted staffing". Number of Fines and Fine Amount averages "include 0s for providers with no fines" (so they are per-provider averages across all providers, not per-fined-provider).

**Surveys and citations**
19. Health Deficiencies and Survey Summary include citations that are NOT used in the health inspection rating (IDR/IIDR citations; cycle 3 standard surveys). Use the Y/N IDR/IIDR flags and Inspection Cycle to exclude them; the dictionary says see the 5-Star Technical Users' Guide.
20. Fire Safety: "Life Safety Deficiencies are not used in calculating the Health Inspection Rating."
21. Fire Safety `Tag Version` (old before / new on-after 7/5/2016): same tag number can have a different description between versions for a small number of K tags. Fire Safety `Deficiency Prefix` can be K or E (E = emergency preparedness; per 202109 State Averages "Emergency Preparedness deficiencies (E tags)").
22. Complaint inspections appear in Inspection Dates only when they produced at least one citation; standard and infection-control inspections appear regardless. So Inspection Dates cannot be used to count all complaint inspections.
23. Co-occurring standard and complaint inspections: the deficiency is assigned to the standard cycle.
24. A Risk-Based Survey (footnote 29) is a shorter visit with a smaller team, only for higher-performing facilities; it applies to standard surveys.
25. Penalty Date is the "Date of inspection that triggered the penalty", not the date the fine was imposed. Fine Amount is "in whole dollars". Payment denial = "Medicare/Medicaid payment for new admissions was suspended". The dictionary does not give the relationship between Provider Information fine totals and the Penalties rows (UNCLEAR).
26. The Penalties file covers "the last three years"; the infection control citation count in Provider Information is "in the past 3 years".
27. Provider Information "Urban" is Y/N "defined by a non-missing CBSA (core-based statistical area) code or a MSA (metropolitan statistical area) code > 0".
28. Abuse Icon logic (as the dictionary states it): Y if cited for abuse or neglect at harm level or above on survey cycle 1 (Scope/severity G or greater) OR cited for abuse or neglect at potential harm level (Scope/Severity D or above) on both survey cycles 1 and 2.

**Naming / history that explains old code**
29. The dictionary reports many rename/drop events (Table 16). Anything written against pre-202507 column names ("Affiliated Entity Name/ID", "Rating cycle 2 Total ...", any Rating cycle 3 column), pre-202602 columns ("Number of Facility Reported Incidents", "Number of Complaints that Resulted in a Citation"), or pre-202606 Penalties layout (no Fine ID) will not match this snapshot. COVID-19 vaccination datasets were removed in 202507.
30. Ownership role strings changed in 202411, 202506 and 202605 (see 3.13); older strings may or may not persist (UNCLEAR).
31. The dictionary has no stated primary key/uniqueness guarantee for any table beyond "one row per nursing home" (Provider Information), "one citation per row" (Fire Safety, Health Deficiencies), "one inspection per provider"/"one record per provider per survey cycle" (Survey Summary), "one row per state or territory" (Cut Points), and "one measure per nursing home per row" (MDS, Claims).

---

## 9. REVISION HISTORY (Table 16, pp.26-36) — highlights that matter for this snapshot (Sep 2026)
- 202609: Provider Information +High Performing Icon, +Rating cycle 1/2 Standard Survey Footnote; Inspection Dates/Health Deficiencies/Survey Summary +Survey Footnote; footnote 29 added.
- 202606: Penalties +Fine ID (after Penalty Type).
- 202605: Ownership role values added (DIRECT/INDIRECT OWNERSHIP INTEREST, INDIVIDUAL IS AN OWNER..., TRUSTEE OF THE SNF, MANAGING CONTROL - GOVERNING BODY, ADP OF THE SNF).
- 202602: Provider Information deleted "Number of Facility Reported Incidents" and "Number of Complaints that Resulted in a Citation".
- 202601: renamed "Number of Substantiated Complaints" -> "Number of Complaints that Resulted in a Citation".
- 202510: Provider Information +Urban; SNF QRP new measures S_043_02, S_044_02, S_045_01.
- 202507: chain columns added/renamed, Rating cycle 3 columns dropped and cycle 2 renamed "2/3"; State US Averages +Overall/Health Inspection/QM/Staffing Rating; COVID-19 vaccination datasets removed.
- 202506: Ownership role splits. 202504: footnotes 26-28. 202503: Survey Summary includes complaint and infection control deficiency counts. 202501: State US Averages measure renames/replacements; footnote 12 retired, 23-25 added; wording of 6, 20, 21 changed.
- 202411: Ownership Director/Officer renamed Corporate Director/Corporate Officer. 202410 and 202310: SNF QRP measure changes. 202407: PDPM case-mix columns added to Provider Information and State US Averages. 202308: geocoding columns and footnote 22. 202306: Affiliated Entity columns; header standardization for provider-level datasets.
- 202301: IDR/IIDR columns added to Health and Fire Safety; footnotes 7, 20, 21 added; footnote 19 dropped.
- 202208 through 201404: older changes (staffing weekend columns, turnover columns 202201, Measure Date Range 202207, Inspection Dates created 202101, Citation Code Look-up / Cut Points / Data Collection Intervals added to the dictionary 202104, Survey Summary created 201404, etc.), see PDF pp.30-36.

---

*End of digest. Built only from NH_Data_Dictionary.pdf (pp.1-56) plus line 1 of each raw CSV. Anything labelled UNCLEAR IN DICTIONARY must be resolved from the CMS 5-Star Technical Users' Guide, the data itself, or the dictionary owner before being relied on.*
