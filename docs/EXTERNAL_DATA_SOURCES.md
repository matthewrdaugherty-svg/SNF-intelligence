# External Data Sources for the SNF Intelligence Project

Author role: Industry Maven. Research date: 2026-10-26.

## How to read this document

- **VERIFIED** means I fetched the page (WebFetch) or got the number from a search result in this session, and the URL is next to the claim.
- **UNVERIFIED** means the page I fetched did not say it, or I could not fetch the page. I did not fill gaps from memory.
- **DERIVED** means I did arithmetic on numbers I fetched. The formula is shown.
- **[inference]** means it is my reasoning, not a fact from a page (the Operating Rules call this `[industry context, unverified]`).
- Existing downloads (Provider Info, MDS QMs, Claims QMs, Deficiencies, Penalties, Ownership, Survey Summary/Dates, State averages, SNF QRP, SNF VBP FY2026) are NOT re-researched here.

### Two operational findings that affect the whole project

1. **data.cms.gov is blocked from the Bash sandbox.** A `curl` to `https://data.cms.gov/data-api/...` returned `CONNECT tunnel failed, response 403`, and the proxy report said `data.cms.gov:443 — connect_rejected` (likely not on this session's allowed-domain list). WebFetch (a different path) could reach data.cms.gov API URLs and return a few rows, but that is not a bulk download. To pull full CSVs, `data.cms.gov` (and `downloads.cms.gov`, `www.cms.gov`) need to be allowed for the session, or the files must be downloaded by Matt's machine. I did not test whether `provider-data.cms.gov` or `downloads.cms.gov` are reachable from Bash. UNVERIFIED.
2. **Most data.cms.gov landing pages are JavaScript apps** and return no content to WebFetch. I got field names by calling the public JSON API (`/data-api/v1/dataset/<id>/data?size=N`) and from data.gov catalog mirrors. Catalog mirrors can lag the live data (see 1a: the data.gov mirror says 2014-2023 but the live API returned FY2024).

---

# QUESTION 1. Hospital to SNF discharge flows

## Bottom line for Question 1

**No free, public CMS dataset that I could find gives actual hospital-to-SNF patient counts for current years.** What I found:

| Route | Gives real hospital-to-SNF counts? | Cost | Current? |
|---|---|---|---|
| Physician Shared Patient Patterns (CMS FOIA release) | Possibly (organization-to-organization pairs, counts of 11 or more patients) but UNVERIFIED that hospital-SNF pairs are in the files | Free | Stale: calendar years 2009 to 1 Oct 2015 only |
| MedPAR, identifiable version (RIF) | Yes, this is the gold standard route | Fees plus DUA, research purpose | Through 2024 |
| MedPAR, limited version (LDS) | No. It has hospital ID and discharge destination, but no patient ID, so it cannot say which SNF | $3,600 per year (hospital file) | Fee list dated 10/25/24 |
| Maryland HSCRC public-use patient files | UNVERIFIED. Lists "discharge status of patient" as a data element; does not say SNF identity is included | Vendor processing fee (amount not published), annual DUA | Discharge data from 2016 onward |
| HCUP State Inpatient Database, Maryland | Hospital discharges with a disposition code (SNF = code 3); SNF identity UNVERIFIED | Purchase; price not on the pages | 1990 to 2024 |
| Hospital Service Area File (HSAF) | No. Gives hospital to patient-ZIP volumes only. Can be used to build hospital catchments | Free | Through 2024 |
| Medicare Post-Acute Care PUF (SNF) | No. SNF-level volume, no referring hospital field | Free | FY2024 live; mirror says 2023 |
| Medicare Hospital Spending by Claim | No flows, but gives each hospital's average SNF spending in the 30 days after discharge | Free | Modified 2026-01-26 |

**Best free workaround (modeled, not observed):** build each hospital's catchment ZIPs from HSAF, then estimate which SNFs receive its patients by combining (a) SNF location and (b) each SNF's Medicare stay volume from the PAC PUF, and (c) the hospital's SNF-spending intensity from Hospital Spending by Claim. This produces a *modeled share*, and every output must say so. [inference]

**Best honest answer for the Johns Hopkins example:** the hospital system's own discharge records (EHR/ADT/case-management data) already say which SNF each patient went to. [inference] The public data then supplies SNF quality, cost, and capacity. I could not verify any public source that replaces the hospital's own records.

---

## 1a. CMS "Medicare Post-Acute Care and Hospice - by Provider and Service", SNF table

| Item | Detail |
|---|---|
| Official dataset name | "Medicare Post-Acute Care Utilization - Skilled Nursing Facility" (part of the Post-Acute Care and Hospice family) |
| Owner | CMS |
| Landing page | https://data.cms.gov/provider-summary-by-type-of-service/medicare-post-acute-care-hospice/medicare-post-acute-care-utilization-skilled-nursing-facility (JavaScript app; content not readable by WebFetch) |
| Catalog mirror | https://catalog.data.gov/dataset/medicare-post-acute-care-utilization-skilled-nursing-facility and https://catalog-beta.data.gov/dataset/medicare-post-acute-care-utilization-skilled-nursing-facility |
| Live API (what I actually read) | https://data.cms.gov/data-api/v1/dataset/eaed338b-847e-41b1-a4d3-a206f40dc72b/data (append `?size=N&offset=N&filter[STATE]=MD`) |
| Row count | `found_rows: 13837` from https://data.cms.gov/data-api/v1/dataset/eaed338b-847e-41b1-a4d3-a206f40dc72b/data/stats (this includes national and state summary rows, so provider rows are fewer; I did not count them) |
| Granularity | One row per SNF (`SMRY_CTGRY = PROVIDER`), plus state rows (`STATE`) and a national row (`NATION`) |
| Latest period | **Live API returned `YEAR = 2024`, `YEAR_TYPE = FY` for national, AK, and MD rows. VERIFIED.** The data.gov mirror says coverage 2014-01-01 to 2023-12-31, issued 2025-12-09, data last modified 2025-08-14. The mirror is behind the live API. |
| Cost | Free, U.S. government works license (catalog page) |
| Join | `PRVDR_ID` is the 6-digit CCN (examples fetched: 215120, 215121, 215123 for Maryland SNFs). Keep as string. Also `PRVDR_ZIP`, `STATE`. |
| Suppression | Beneficiary counts of 10 or fewer are shown as `*` (methodology PDF). The methodology does not state a stay-count threshold. Each table is suppressed separately, so details may not add to totals. https://data.cms.gov/sites/default/files/2025-08/2685ddd1-a3a9-406c-a4e7-e56a8b789731/RY%202025%20PAC%20PUF%20Methodologies.pdf |

**Fields in the live API (VERIFIED, from the API response):**
- Identifiers: `YEAR, YEAR_TYPE, SMRY_CTGRY, SRVC_CTGRY, PRVDR_ID, PRVDR_NAME, PRVDR_CITY, STATE, PRVDR_ZIP`
- Volume and money: `BENE_DSTNCT_CNT` (distinct beneficiaries), `TOT_EPSD_STAY_CNT` (stays), `TOT_SRVC_DAYS`, `TOT_CHRG_AMT`, `TOT_ALOWD_AMT`, `TOT_MDCR_PYMT_AMT`, `TOT_MDCR_STDZD_PYMT_AMT`
- Patient mix: `BENE_DUAL_PCT`, `BENE_RRL_PCT` (rural percent, by name; meaning not confirmed on a dictionary page), `BENE_AVG_AGE`, `BENE_MALE_PCT`, `BENE_FEML_PCT`, race percentages (`BENE_RACE_*`), `BENE_AVG_RISK_SCRE`
- Chronic condition percentages (`BENE_CC_BH_*` behavioral health, `BENE_CC_PH_*` physical health such as CKD, COPD, diabetes, heart failure, stroke)
- Primary diagnosis category percentages (`PRMRY_DX_*`: infection, circulatory, respiratory, skin/muscle, injury/poisoning, and others)
- Methodology document also names PDPM-era (FY2020 onward) clinical category percentages such as `STAY_CLNCL_CTGRY_ORTH_SRGY_PCT`, `STAY_CLNCL_CTGRY_MED_MNG_PCT`, and PDPM day-mix percentages. Those did not appear in the first rows I read from the API. Check the real file.

**Is there a referring-hospital field? No.** The API response had no field with READM, HOSP, REFER, DISCH, or ADMIT in its name, and the methodology PDF names no referring-hospital or readmission field. VERIFIED (absence in what I read; I did not read the full data dictionary because https://data.cms.gov/resources/medicare-pac-utilization-snf-data-dictionary is a JavaScript page).

**How to use it:** SNF-level Medicare FFS stays, days, payments, and case mix, joined on CCN. This is the SNF "denominator" for volume and cost. It does not tell you where patients came from.

**Confidence:** VERIFIED for fields, join key, FY2024 vintage. UNVERIFIED for exact stay-count suppression rule and the full data dictionary.

**Sample (national row, FY2024, read from the API):** 1,171,990 distinct beneficiaries; 1,586,658 stays; 44,861,806 service days; Medicare payment $25,451,696,743.

---

## 1b. CMS Hospital Service Area File (HSAF)

| Item | Detail |
|---|---|
| Owner | CMS |
| Catalog page | https://catalog.data.gov/dataset/hospital-service-area |
| Landing page | https://data.cms.gov/provider-summary-by-type-of-service/medicare-inpatient-hospitals/hospital-service-area |
| What it holds | Calendar-year Medicare inpatient hospital claims (the catalog says fee-for-service and Medicare Advantage), summarized by hospital provider number and the ZIP code of the beneficiary |
| Fields (read from a live API row) | `MEDICARE_PROV_NUM`, `ZIP_CD_OF_RESIDENCE`, `TOTAL_DAYS_OF_CARE`, `TOTAL_CHARGES`, `TOTAL_CASES` |
| API endpoint I read | https://data.cms.gov/data-api/v1/dataset/8708ca8b-8636-44ed-8303-724cbfaf78ad/data (the year of this specific dataset ID is UNVERIFIED; stats showed 1,175,708 rows) |
| Latest period | 2024 (catalog: coverage 2015-01-01 to 2024-12-31, modified 2025-09-10, annual). 10 CSV files, 2015-2024 |
| Cost | Free |
| Join | Hospital CCN (`MEDICARE_PROV_NUM`) to hospital data; `ZIP_CD_OF_RESIDENCE` to SNF `PRVDR_ZIP`, HUD ZIP crosswalks, Dartmouth ZIP-HRR crosswalk |
| Caveat 1 | Suppression: values appear as `*`. All three rows I read for Johns Hopkins Hospital (CCN 210009) were `*` (these were the first rows in sort order: a blank ZIP, 00669, 00718, all far from Baltimore). I did not read Baltimore ZIP rows. The suppression threshold is not stated on any page I could read (methodology page is JavaScript). UNVERIFIED. |
| Caveat 2 | Counts discharges of Medicare patients from the hospital by patient home ZIP. It says nothing about discharge destination. Medicare only (no commercial, Medicaid-only, uninsured). |
| Caveat 3 | `TOTAL_CASES` is the field name; the catalog calls the measure "discharges". Assume they match but confirm in the data dictionary. UNVERIFIED. |

**Can it define hospital catchments and intersect with SNF locations? Yes, as an approximation.** HSAF gives the hospital's patient ZIP mix. SNFs have a ZIP (`PRVDR_ZIP`). A hospital's catchment ZIP set can be intersected with SNF ZIPs, counties (via HUD), or distance bands. The result is "SNFs located where this hospital's patients live", not "SNFs this hospital sends patients to". Hospital referrals to SNFs often cross catchment lines (patient choice, SNF acceptance, bed availability), so this is a proxy. [inference]

**Confidence:** VERIFIED for fields, vintage, join key. UNVERIFIED for suppression threshold and exact FFS/MA wording beyond the catalog.

---

## 1c. Physician Shared Patient Patterns / DocGraph (facility-to-facility shared patients)

| Item | Detail |
|---|---|
| Owner | CMS (FOIA release); NBER hosts a copy; DocGraph is the original community project |
| NBER copy | https://www.nber.org/research/data/physician-shared-patient-patterns-data (page last updated February 13, 2018) |
| Technical doc | https://nber.org/physician-shared-patient-patterns/physician_shared_patient_patterns_technical_requirements.pdf |
| Contents | Pairs of NPIs that billed for the same patient within a time window |
| Fields | `NPI 1, NPI 2, Pair Count, Bene Count (unique beneficiaries), Same Day Count` |
| Windows | 30, 60, 90, and 180 days |
| Years | **Calendar years 2009 through 10/1/2015.** NBER lists 2009 to 2015, four windows per year, formats zip, Stata, SAS, CSV. |
| Which NPIs | The technical doc says both individuals and organizations. For institutional claims it uses Organization NPI (mapped to Facility/Pay-to/Billing) plus attending, operating, and other NPIs. Referring NPI is excluded. |
| Suppression | Pairs with fewer than 11 distinct beneficiaries are excluded |
| Cost | Free (as described by NBER) |
| Join | NPI. Needs an NPI to CCN crosswalk (see 3c) |

**Does any current public release include facility-to-facility counts? I found none.** My searches found only the 2009-2015 release. I could not confirm that no later release exists. UNVERIFIED that none exists. The healthjournalism.org Medicare PUF guide (https://healthjournalism.org/data/medicare-data-use-files/) does not mention shared patient patterns and lists calendar year 2023 as the latest for its other files.

**Whether hospital to SNF pairs are actually in the files:** the technical doc says organization NPIs are included for institutional claims, which suggests hospital and SNF facility NPIs may appear. I did not download or inspect a file, so UNVERIFIED. The data is 11 years old; the SNF market (PDPM, consolidation, closures) has changed. Treat as historical context only, and only after a short test pull.

**Confidence:** VERIFIED for years, fields, windows, suppression. UNVERIFIED for hospital-SNF pair presence and for the existence of newer releases.

---

## 1d. MedPAR and LDS files: confirm cost and gating

**Confirmed: NOT free. Fees plus a signed Data Use Agreement, research purpose.**

| Item | Detail |
|---|---|
| Owner | CMS (data distributed through ResDAC / CMS) |
| What MedPAR is | One record per Medicare hospital or SNF stay, rolled up from claims. Includes hospital provider ID. Years 1999-2024; 2025 data "may be requested after 10/1/2026". https://resdac.org/node/344 |
| Discharge destination | Variable `DSCHRG_DSTNTN_CD` is in the MedPAR file. Code 3 = discharged/transferred to a Medicare-certified SNF; code 61 = swing-bed hospital; code 04 = ICF (non-certified). https://www.resdac.org/cms-data/variables/destination-upon-discharge-facility-code |
| Fee list (version dated "Updated 10/25/24") | https://resdac.org/sites/datadocumentation.resdac.org/files/2024-10/CMS%20Fee%20List%20for%20Physical%20Research%20Data%20Request.pdf |
| RIF (identifiable) MedPAR, per year of data | $2,000 (up to 1M beneficiaries), $2,500 (1-5M), $3,000 (5-20M), $5,000 (20M+) |
| LDS (limited) MedPAR Hospital National, per year | $3,600 (final rule and proposed rule versions) |
| LDS MedPAR Skilled Nursing Facility, per year | $650 |
| LDS MedPAR LTCH | $100 |
| Other RIF items | Finder/crosswalk fees $0 to $5,000; crosswalk file $1,000 |
| Initial project fee (RIF) | **$20,000** and project renewal $10,000, both from the earlier version dated "Updated 5/6/24": https://www.resdac.org/sites/datadocumentation.resdac.org/files/2024-05/CMS%20Fee%20List%20for%20Physical%20Research%20Data%20Request.pdf . The 10/25/24 version, as summarized, did not show a project-fee section, and the 5/6/24 list says "Effective 2025, CMS plans to implement a new annual Project Fee." Current project fee is UNVERIFIED. |
| LDS fee increase | CMS says LDS fees will increase 20%, effective February 2027: https://www.cms.gov/data-research/files-for-order/data-disclosures-and-data-use-agreements-duas/limited-data-set-lds |
| Process | LDS DUA requests go through CMS EPPE; CMS says it responds within 3 business days; the organization needs an approved Data Management Plan self-attestation; max two download users per DUA (same CMS page) |
| Research-only rule | "CMS LDS files are only available for research purposes and require an LDS DUA with CMS." Products or tools may be built only if "this work is secondary to the research." Findings must be publicly disseminated. CMS must approve any linkage to other data. https://www.cms.gov/files/document/limited-data-set-data-use-agreement-policies.pdf |
| Commercial use | **Not addressed** in that document. Whether a software product for a hospital client qualifies is UNVERIFIED and needs a ResDAC/CMS ruling before any money is spent. |

**Critical limit of the cheap version (LDS):** LDS MedPAR drops the beneficiary identifier, gives only quarter/year dates, and limits geography to state. ResDAC says the missing identifier "prevents researchers from tracking multiple hospital stays for the same patient." https://resdac.org/articles/differences-between-inpatient-and-medpar-files . LDS MedPAR hospital records do have a discharge destination code and hospital ID, so you could count *how many* of a hospital's Medicare discharges go to SNFs, but not *which SNF*. The identifiable version (RIF) carries a beneficiary ID and dates on both hospital and SNF stays, so a hospital-to-SNF sequence could likely be built; ResDAC's article does not say this explicitly. UNVERIFIED.

**Confidence:** VERIFIED for fees (with the version caveat), DUA rules, variable codes, LDS limitation.

---

## 1e. Hospital-level discharge disposition; state all-payer data (HCUP, Maryland HSCRC)

### CMS hospital-level files
- **Medicare Inpatient Hospitals by Provider and Service**: the data dictionary (RY22 edition) lists 15 fields: CCN, name, address, city, state, ZIP, RUCA, DRG code and description, `Tot_Dschrgs`, average covered charges, average total payments, average Medicare payments. **No discharge disposition or SNF field.** https://data.cms.gov/sites/default/files/2022-07/MUP_INP_RY22_20220722_DD_PrvSrvc.pdf (a newer edition may add fields; UNVERIFIED).
- **Hospital Compare / Care Compare:** I found no published "percent of discharges to SNF" by hospital. UNVERIFIED (absence from what I searched). National context only: MedPAC shows 18.7% of hospital discharges went to SNF in 2019 (Chart 8-3), not stated for 2024 in the text I read. https://www.medpac.gov/wp-content/uploads/2026/07/July2026_MedPAC_DataBook_Sec8_SEC.pdf
- **Best hospital-level SNF proxy: "Medicare Hospital Spending by Claim"** (Hospital Care Compare, Provider Data Catalog dataset `nrth-mfg3`).
  - Each hospital has average price-standardized, not risk-adjusted spending per Medicare Spending Per Beneficiary episode, split by claim type (home health, hospice, inpatient, outpatient, **skilled nursing facility**, DME, carrier) and by period (1-3 days before admission, during the stay, 1-30 days after discharge), with hospital, state, and nation values and percent of spending. https://www.cms.gov/files/document/factsheet-mspbspendingbreakdownsbyclaimtypedescriptionnov2014pdf (describes the structure; fact sheet is dated November 2014)
  - Catalog: modified 2026-01-26, released 2026-08-13; CSV https://data.cms.gov/provider-data/sites/default/files/resources/1f8cde9e222d5d49f88a894bcf7a8981_1770163638/Medicare_Hospital_Spending_by_Claim.csv ; dictionary https://data.cms.gov/provider-data/sites/default/files/data_dictionaries/hospital/HOSPITAL_Data_Dictionary.pdf . https://catalog.data.gov/dataset/medicare-hospital-spending-by-claim
  - Reporting period of the data is not stated on the catalog page. Exact column names UNVERIFIED (the dictionary text I could read was cut off before this section).
  - Same Provider Data Catalog family as the nursing home files you already downloaded. Join on hospital Facility ID = CCN. Free.
  - It shows how much SNF money follows each hospital's discharges in 30 days. It does not show which SNFs.

### Maryland HSCRC (relevant to the Johns Hopkins example)
- **Public datasets page** (https://hscrc.maryland.gov/Pages/data.aspx) lists: Patient-Level Case Mix Data (called confidential; about 700,000 inpatient discharges and 5.7 million outpatient visits per year), annual and monthly hospital financial reports, community benefit, and debt collection reports. **It mentions no discharge disposition, post-acute, or SNF dataset.**
- **Public-use patient-level files are available by request** (https://hscrc.maryland.gov/Pages/hsp-data-request.aspx): Basic, Basic Grouped, Market Shift, Weight Creation & Development, Uncompensated Care, ECMAD, Revisit. Discharge data is available from calendar year 2016 onward. The page lists "Discharge status of patient" among case-mix data elements but does not say whether the *public* files include it, and does not mention SNF identity. **UNVERIFIED whether any public file names the receiving SNF.** The dictionaries for Basic, Grouped, and Revisit would need to be read.
- **Terms that matter for a product:**
  - Annual DUA; HSCRC Review Board decides, review up to 30 days after a complete request.
  - Fees: not listed. Applicants pick a vendor (hMetrix or St. Paul Group, or another) and "contact them directly for a processing fee quote"; grouped files may add 3M licensing fees (https://hscrc.maryland.gov/Documents/data-request-forms/WORD-PUF-DRF-%20DUA%2820200115%29.pdf , an older 2020 form).
  - Use only for purposes the Commission approves; results "must be submitted to the Commission for review prior to public release"; no release to anyone outside the approved organization without written approval; cells of 10 or fewer cannot be released; keep files at most 5 years.
  - Revisit files: non-commercial use only.
  - Public files exclude medical record number, patient ID, date of birth, and dates of service.
- CRISP's "Market Shift" page does not say whether post-acute or SNF data is included. https://www.crisphealth.org/learning-system/crs/hscrc-reg/market-shift/
- Maryland context found in an MHCC slide deck: Maryland's hospital readmission rate for SNF patients is "ranging above 20% in recent years," and it quotes a national rate of 14.2% in 2020 attributed to MedPAC (a second-hand quote; I did not verify it at MedPAC). https://mhcc.maryland.gov/sites/default/files/pdfs/Ag5_PA_and_LTC_WG_update_032023.pdf

### HCUP State Inpatient Databases (SID)
- SID covers inpatient discharges from community hospitals, all payers. https://hcup-us.ahrq.gov/sidoverview.jsp
- **Maryland is available for purchase:** SID 1990-2024, SASD 1997-2024, SEDD 1999-2024; no Maryland-specific restriction listed; price not stated. https://hcup-us.ahrq.gov:443/db/availability_public.jsp
- Purchase through the HCUP Central Distributor; requires the online DUA training and a signed DUA; "Participating data organizations set the price of their data." https://hcup-us.ahrq.gov/tech_assist/centdist.jsp . Prices are in the Central Distributor ordering system, not published; "Costs vary by State and data year."
- Discharge disposition (`DISP`): SNF = 3. Maryland note: it "does not separately classify the disposition of Intermediate Care Facility (DISP=4)." https://hcup-us.ahrq.gov/db/vars/disp/nisnote.jsp
- Whether SID identifies the receiving SNF: not stated on pages I read. UNVERIFIED (I believe disposition is a category only, but that is memory, so unverified).

**Confidence:** VERIFIED for what each page states. UNVERIFIED for public-file contents of HSCRC and for SID receiving-facility fields.

---

## 1f. Medicare Geographic Variation (state and county)

| Item | Detail |
|---|---|
| Owner | CMS |
| Name | "Medicare Geographic Variation - by National, State & County" |
| Catalog page | https://catalog.data.gov/dataset/medicare-geographic-variation-by-national-state-county |
| Latest | 2024 (coverage 2024-01-01 to 2024-12-31); modified 2026-05-15; annual; the dictionary title says 2014-2024 |
| Dictionary | https://data.cms.gov/sites/default/files/2026-05/267755af-8e26-4bcd-a3ea-fef41c96b7fc/2014-2024%20Original%20Medicare%20Geographic%20Variation%20Data%20Dictionary.pdf |
| Granularity | National, state, and county (`BENE_GEO_LVL`, county FIPS in `BENE_GEO_CD`). **ZIP and HRR levels are not mentioned**, so UNVERIFIED. |
| Population | Original Medicare (traditional fee-for-service). Spending is price-standardized; not adjusted for health status. |
| Suppression | Values suppressed when beneficiary or user counts are below 11. Territories suppressed. |
| Cost | Free |

**SNF fields (VERIFIED from the dictionary):**
- `SNF_MDCR_PYMT_AMT`, `SNF_MDCR_PYMT_PCT`, `SNF_MDCR_PYMT_PC` (per capita), `SNF_MDCR_PYMT_PER_USER`
- Standardized versions: `SNF_MDCR_STDZD_PYMT_AMT`, `..._PCT`, `..._PC`, `..._PER_USER`
- `BENES_SNF_CNT` (users with a covered stay), `BENES_SNF_PCT`
- `SNF_CVRD_STAYS_PER_1000_BENES`, `SNF_CVRD_DAYS_PER_1000_BENES`
- **No SNF-specific readmission field.** The readmission fields (`ACUTE_HOSP_READMSN_CNT`, `ACUTE_HOSP_READMSN_PCT`) are all-cause readmissions within 30 days of an acute hospital stay.

**Use:** county-level SNF use rate and cost per user, as a regional baseline for the total-cost-of-care estimate. Join: county FIPS (from SNF ZIP via HUD ZIP-County crosswalk). Not a flow dataset.

---

## 1g. CMS Innovation Center, ACO REACH, BPCI Advanced, MSSP

- **BPCI Advanced final evaluation report** (model years 2018-2025): https://www.cms.gov/priorities/innovation/data-and-reports/2026/bpci-adv-ar7 . Reports effects, not facility-level files. Findings: SNF payments fell by $413 to $452 per medical episode and $507 to $558 per surgical episode (about $500 on average); SNF length of stay fell 2.66 days (medical) and 3.50 days (surgical), but that estimate failed a parallel-trends test; discharges to institutional post-acute care fell 1.45 percentage points. Surgical SNF results for model years 7-8 were excluded as likely overstated. The page lists no downloadable data files and no regional breakdown; appendices exist (A-L) but no links were shown. UNVERIFIED that any public BPCI-A episode-level file exists.
- **ACO REACH:** the data.gov catalog lists "ACO REACH Providers" and "ACO REACH Eligible Beneficiaries" (titles seen in search results; pages not fetched). I found no ACO REACH public file with SNF cost per episode. UNVERIFIED.
- **Shared Savings Program (MSSP) public files** (https://www.cms.gov/Medicare/Medicare-Fee-for-Service-Payment/sharedsavingsprogram/program-data):
  - Performance Year Financial and Quality Results (ACO-level, de-identified).
  - SNF Affiliates list by ACO name (https://catalog-beta.data.gov/dataset/accountable-care-organization-skilled-nursing-facility-affiliates ; coverage 2017-01-01 to 2025-12-31; fields named: affiliate name, track status, years in program, contact information; whether a CCN is included is UNVERIFIED; dictionary https://data.cms.gov/resources/aco-snf-affiliates-data-dictionary-0 is a JavaScript page).
  - **County-Level Aggregate Expenditure and Risk Score Data** on assignable beneficiaries (per capita Parts A and B FFS expenditures).
  - Number of ACO assigned beneficiaries by county.
  - Beneficiary-level and provider-level files require ResDAC fees and a DUA.
  - The page does not say that any public MSSP file has SNF cost per episode or SNF readmission by region. UNVERIFIED.
- The MSSP "SNF affiliates" list is useful for knowing which SNFs are inside ACO preferred networks (where the hospital system's ACO may already have a narrow network). [inference]

---

# QUESTION 2. MIMILABS (https://www.mimilabs.ai)

## What it is (VERIFIED from the home page)
mimilabs describes itself as a "data lakehouse with a collaborative cleanroom and an AI Assistant" hosting "thousands of publicly available healthcare datasets" from CMS, CDC, and FDA. You "log in to the workspace, query, transform, and extract the data you need" using SQL against `mimi_ws_1.{schema}.{table}`. https://www.mimilabs.ai
- Platform: **Databricks.** Tables are Delta tables in a Databricks workspace; access is by SQL or PySpark. https://www.mimilabs.ai/dataengineering
- Ingestion scripts are public on GitHub under Apache 2.0 (the page does not state a license for the data itself). Whether processed data can be bulk-downloaded is not stated. UNVERIFIED.

## Cost (VERIFIED, https://www.mimilabs.ai/pricing)
- Standard: **$120 per year after a free 30-day trial.**
- Early-access discount: $60 per year (50% off) for members who post about mimilabs on LinkedIn during the trial.
- Discounts for academic institutions and non-profits: contact the company.
- **No permanent free tier.** The only free option is the 30-day trial.
- Included: full access to the lakehouse, unlimited SQL queries, Slack community.
- **Not included:** Databricks compute (personal or serverless clusters) is billed monthly and separately at Databricks DBU rates. No dollar amounts are given.

## API
- Open public API: **not stated** on the pages I read. UNVERIFIED.
- The search results show pages named "MCP - Model Context Protocol" (https://www.mimilabs.ai/mcp), "Snowflake Integration" (https://www.mimilabs.ai/snowflake) and "FAQs" (https://www.mimilabs.ai/faqs). **All three failed to fetch (client error), so I cannot say what they offer or cost. UNVERIFIED.**

## Datasets relevant to us (VERIFIED from https://www.mimilabs.ai/datacatalog; the catalog gives no free/paid distinction per dataset)

| Our need | What the catalog lists |
|---|---|
| SNF cost reports | `mimi_ws_1.cmsdataresearch`: `costreport_mimi_snf`, `costreport_raw_snf_alpha`, `costreport_raw_snf_nmrc`, `costreport_raw_snf_rpt` (SNF 2540-2010) |
| Nursing home data | `datacmsgov.nursinghome_ae_perf` (Affiliated Entity performance), `pc_snf` (SNF enrollments), `pc_snf_owner` (all ownership), `covid19nursinghomes`; `provdatacatalog.nursinghomes_mds`; `ahrq.compendium_nursinghome_linkage` |
| NPPES | `mimi_ws_1.nppes`: `npidata`, `npi_to_address`, `endpoint`, `deactivated`, `othername`, `pl`, `address_key`, FHIR tables |
| PECOS-style enrollment | `datacmsgov.pc_*` enrollment tables (e.g., `pc_provider`, `pc_hospital`). The word "PECOS" itself is not in the catalog text I got. |
| Post-acute utilization | `datacmsgov.muppac_geo` ("Medicare Post-Acute Care and Hospice - by Geography & Provider") |
| Medicare claims | Only **synthetic** claims (`synmedpuf.*` including `snf`; `desynpuf.*` 2008-2010). Not real patient flows. Also a county-level "Medicare FFS Data" table and a Geographic Variation table (name garbled in the listing). |
| Referral | `datacmsgov.orderandreferring` (the Order and Referring enrollment list: who may refer, not volumes) |
| Crosswalks | `zip_to_cbsa` (HUD); AHRQ `compendium_hospital_linkage` |

**Not found in the catalog text I received:** physician shared patient patterns, Hospital Service Area File, PBJ staffing, and any hospital-to-SNF referral volumes. The summary I received may have dropped items from a long page, so treat "not found" as "not seen", and confirm in the live catalog during the free trial.

**Bottom line on mimilabs:** it appears to be a convenience layer (already-loaded public CMS tables, queryable in SQL) and not a source of hospital-to-SNF flows. Everything it lists we can download ourselves for free. Value is saved ingestion effort, not new data. $120 per year plus Databricks compute.

## Free GitHub crosswalk worth taking (VERIFIED)
https://github.com/mimilabs/mimi-datafiles contains `crosswalk_npi2ccn_one2many_updated_20240429.csv`, an NPI to CCN crosswalk, license Apache-2.0. README: "one NPI can map to many CCNs". The README does not say how it was built or its columns, so validate it against PECOS (3c) before relying on it.

---

# QUESTION 3. OTHER FREE SOURCES

## 3a. CMS SNF Cost Reports (HCRIS), Form CMS-2540-2010

| Item | Detail |
|---|---|
| Owner | CMS |
| Page | https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports/skilled-nursing-facility-2540-2010-form |
| Downloads | All-years reports ZIP: https://downloads.cms.gov/files/hcris/SNF10-REPORTS.ZIP ; documentation ZIP: https://www.cms.gov/files/zip/snf10-documentation.zip ; per-fiscal-year page: https://www.cms.gov/data-research/statistics-trends-and-reports/cost-reports/cost-reports-fiscal-year |
| Years | Fiscal years beginning on or after December 1, 2010. The per-year table lists **2011 through 2025** (FY2025 is the latest row listed; whether FY2025 is complete is UNVERIFIED, since cost reports are filed months after year end). |
| Contents | Highest-status version of each facility's cost report (final settled replaces as-submitted; reopened replaces final settled) |
| Format | ZIP of large relational text files (Rpt, Nmrc, Alpha). The page says most SNF datasets "cannot be loaded into Microsoft Excel." Load with DuckDB. |
| Granularity | One report per facility per fiscal year (facility CCN) |
| Cost | Free |
| Join | CCN (the PECOS SNF Data Guidance says cost reports link to PECOS files "using the Medicare provider ID (CCN)": https://data.cms.gov/sites/default/files/2026-07/SNF_Data_Guidance.pdf ) |
| Fields relevant to us | Per the Operating Rules task list: revenue, Medicare/Medicaid days, occupancy, payer mix. **The specific worksheet and line numbers were not verified.** The documentation ZIP has the layout. UNVERIFIED which worksheets hold which items. |

Confidence: VERIFIED for download location, years listed, structure. UNVERIFIED for worksheet and line detail and FY2025 completeness. Page last modified 09/10/2024 per its footer, so the FY list is as of that page's content.

## 3b. Payroll-Based Journal (PBJ) daily staffing

| Item | Detail |
|---|---|
| Owner | CMS |
| Catalog pages | https://catalog-beta.data.gov/dataset/payroll-based-journal-daily-nurse-staffing and https://catalog.data.gov/dataset/payroll-based-journal-daily-non-nurse-staffing-2026-01-01 |
| Landing page | https://data.cms.gov/quality-of-care/payroll-based-journal-daily-nurse-staffing |
| Contents | Quarterly submissions: paid hours per day per facility by staff category (RN, LPN, CNA, medication aide, aide-in-training, director of nursing; non-nurse categories include therapists and social workers), plus daily census calculated from MDS |
| Latest quarter | **Non-nurse dataset: CY2026 Q1 (2026-01-01 to 2026-03-31), modified 2026-07-29, CSV `PBJ_dailyNonnurseStaffing_CY2026Q1.csv`.** The beta catalog page for the nurse dataset showed coverage only to 2025-06-30 (Q2 2025) and is probably a stale mirror; nurse dataset CY2026 Q1 availability and any Q2 2026 release are UNVERIFIED. |
| Granularity | Facility by day |
| Cost | Free |
| Join | CCN (PBJ provider number). Field name UNVERIFIED (dictionary is a JavaScript page). |
| Policy manual | Version 2.8, August 2026: https://www.cms.gov/files/document/pbj-policy-manual-v2-8-august-2026.pdf |

Size warning: daily data for about 14,000 facilities over quarters is large. Aggregate before loading. [inference]

## 3c. NPPES and PECOS: NPI to CCN crosswalk

- **NPPES monthly file:** `NPPES_Data_Dissemination_October_2026_V2.zip`, 1,106 MB, October 2026. Free ("There is no charge to download the data"). Also weekly incremental, deactivation file, endpoint reference file. http://download.cms.gov/nppes/NPI_Files.html and https://www.cms.gov/medicare/regulations-guidance/administrative-simplification/data-dissemination . Whether taxonomy and address fields are included is not stated on those pages (they point to a readme); UNVERIFIED. NPPES has **no CCN**.
- **PECOS public SNF enrollment files (the authoritative NPI to CCN source I found):** "SNF Enrollments" has one row per approved SNF enrollment with `ENROLLMENT ID`, `NPI`, `MULTIPLE NPI FLAG`, `CCN`, `ASSOCIATE ID` (PAC ID), organization name, DBA, incorporation date and state, organization type, proprietary/nonprofit flag, `NURSING HOME PROVIDER NAME`, `AFFILIATION ENTITY NAME`, `AFFILIATION ENTITY ID`, practice location address, city, state, ZIP. A separate `SNF_ADDITIONAL_NPIS` file holds extra NPIs (joined on `ENROLLMENT ID`). `SNF_ALL_OWNERS` holds owners. Version 1.8, July 2026. Files omit historical enrollments and some records with data quality problems. Free. https://data.cms.gov/sites/default/files/2026-07/SNF_Enrollments_Data_Dictionary.pdf and https://data.cms.gov/sites/default/files/2026-07/SNF_Data_Guidance.pdf
- **Why this matters for hospital-to-SNF work:** a hospital NPI (type 2) also needs a CCN. The PECOS family has Hospital Enrollments; mimilabs lists `pc_hospital`. The Hospital Enrollments dictionary was not fetched. Treat the hospital NPI to CCN mapping as UNVERIFIED until read.
- **Second crosswalk:** mimilabs `crosswalk_npi2ccn_one2many_updated_20240429.csv` (see Question 2).

## 3d. Nursing Home Chain (Affiliated Entity) Performance Measures

| Item | Detail |
|---|---|
| Owner | CMS (data.cms.gov, "Nursing Home Chain Performance Measures", formerly "Affiliated Entity Performance Measures") |
| Catalog | https://catalog.data.gov/dataset/nursing-home-affiliated-entity-performance-measures |
| Latest release | 2025-11-01 (`Chain_Performance_20251205.csv`); metadata updated 2025-12-19; coverage June 2023 to November 2025; catalog says monthly, but no releases appear for August to October 2025. Whether newer releases exist after the catalog check is UNVERIFIED. |
| Contents | Aggregate health inspection, staffing, and MDS quality performance by chain, mainly from the Five-Star system. Chains are groups of nursing homes sharing at least one owner, officer, or entity with operational or managerial control, built from PECOS ownership. A chain gets a name only if it has nursing homes in at least two states or at least five in one state. Methodology: https://data.cms.gov/sites/default/files/2025-06/97e4c3cd-4104-408e-8bef-24dfab14bf07/UPDATE_Methodology_Nursing_Home_Chain_Performance.pdf |
| Join to our data | The methodology does not say how to link CCNs to chains. **UNVERIFIED.** PECOS SNF Enrollments carries `AFFILIATION ENTITY ID/NAME` per CCN (verified field names), which is the likely bridge; the Ownership file you already have may also carry affiliation. |
| Cost | Free |

## 3e. ZIP, county, CBSA, and HRR crosswalks

- **HUD-USPS ZIP crosswalks** (ZIP-Tract, ZIP-County, ZIP-CBSA, and reverse files; ZIP-CBSA division and ZIP-County subdivision also appear in the API list). Accessed through a login/API token: "Sign up for an account," then create a token. The page does not use the word "free" but says the files "remain available to all users" and lists "no special restrictions". Quarterly, 2020 Census geographies from 2023 Q1; if no year or quarter is given the API returns the latest. Ratios provided: residential, business, other, and total. https://www.huduser.gov/portal/dataset/uspszip-api.html and https://www.huduser.gov/portal/datasets/usps_crosswalk.html . Latest quarter UNVERIFIED (not named on the pages). Use ratios to split a ZIP across counties; do not assign a ZIP to one county without noting the ratio.
- **Census ZCTA relationship files:** the 2020 page lists a "2020 ZCTA to County Relationship File" and ZCTA to place, tract, county subdivision, block files. Text files; download links were not printed in what I could read. https://www.census.gov/geographies/reference-files/time-series/geo/relationship-files.2020.html . Note ZCTAs approximate ZIP codes and do not match them one-to-one. [industry context, unverified]
- **Dartmouth Atlas ZIP to HSA to HRR:** one file per year, 1995 to 2019; 2018 and 2019 are zipped CSV (`ZipHsaHrr19.csv.zip`), earlier ones XLS. Latest is 2019 (so ZIPs created or changed after 2019 will not match). Also an HSA-to-HRR file, hospital-to-HSA/HRR files, and boundary files. https://data.dartmouthatlas.org/supplemental/ . The Dartmouth supplemental page has **no SNF or post-acute data tables**. An NBER mirror lists ZIP crosswalks only through 2014 (https://www.nber.org/data/dartmouth-atlas-geography.html ), so use the Dartmouth site itself for 2019.

## 3f. AHA / Definitive Healthcare
PAID. Not researched, per instruction.

---

# QUESTION 4. BENCHMARKS FOR THE TOTAL-COST-OF-CARE CONVERSATION

All numbers below were read on the cited page. Year is the year the number refers to.

| Benchmark | Value | Year | Source |
|---|---|---|---|
| Medicare FFS SNF spending, SNF PPS only | $26 billion | 2024 | MedPAC DataBook Chart 8-4 and March 2026 Report Table 7-1: https://www.medpac.gov/wp-content/uploads/2026/07/July2026_MedPAC_DataBook_Sec8_SEC.pdf and https://www.medpac.gov/wp-content/uploads/2026/03/Mar26_Ch7_MedPAC_Report_To_Congress_SEC.pdf |
| Medicare FFS SNF spending including swing beds | $31 billion | 2024 | MedPAC March 2026 Report chapter 7 summary (same URL). A January 2026 preliminary MedPAC draft says "$34 billion (in SNFs + swing beds)" and notes it includes beneficiary copayments; it is marked "Preliminary and subject to change": https://www.medpac.gov/wp-content/uploads/2025/08/Tab-E-I-SNF-HHA-IRF-Dialysis-Hospice-payment-adequacy-January-2026.pdf |
| Medicare-covered SNF stays | About 1.5 million | 2024 | MedPAC March 2026 Report and DataBook (above) |
| FFS beneficiaries using SNFs | 1.1 million | 2024 | MedPAC March 2026 Report |
| Covered SNF stays per 1,000 FFS beneficiaries | 45 (was 55 in 2019) | 2024 | MedPAC DataBook Chart 8-5 |
| Covered days per admission | 30.7 (was 26.1 in 2019) | 2024 | MedPAC DataBook Chart 8-5; March 2026 Report Table 7-3 |
| Per capita FFS SNF spending | $851 (was $715 in 2019) | 2024 | MedPAC DataBook Chart 8-2 |
| Share of hospital discharges going to SNF | 18.7% | 2019 | MedPAC DataBook Chart 8-3 (the 2024 share was not stated in the text I read) |
| Average SNF stay payment (national, Medicare FFS) | **$16,041 per stay** | FY2024 | **DERIVED:** `TOT_MDCR_PYMT_AMT / TOT_EPSD_STAY_CNT` = $25,451,696,743 / 1,586,658 from the national row of the live CMS PAC PUF API (https://data.cms.gov/data-api/v1/dataset/eaed338b-847e-41b1-a4d3-a206f40dc72b/data). Using the standardized payment gives $16,059. |
| Average Medicare payment per SNF day | **$567 per day** | FY2024 | **DERIVED:** $25,451,696,743 / 44,861,806 service days, same row |
| Average service days per stay (PAC PUF) | 28.3 days | FY2024 | **DERIVED:** 44,861,806 / 1,586,658. This differs from MedPAC's 30.7 covered days per admission; the two use different definitions (not reconciled). |
| MedPAC states average payment per stay or per day | **Not reported** in the MedPAC text I read (only percent change: payment per day in freestanding SNFs up 4.9% in 2024, costs per day up 2.3%) | 2024 | DataBook Chart 8-6 |
| Maryland example SNF stay payment | Autumn Lake Healthcare at Crofton (CCN 215120): $10,353,539 / 663 stays = $15,616; Snow Hill (215121): $11,620; Broadmead (215123): $9,152 | FY2024 | **DERIVED** from PAC PUF API rows. Illustration only; shows stay payments vary about 1.7x across three Maryland SNFs. |
| National SNF readmission: potentially preventable readmissions | Median risk-adjusted rate **10.7%** (SNF level) | FY2023-FY2024 combined | MedPAC DataBook Chart 8-7 and March 2026 Report Figure 7-2. The chapter summary labels it as 30 days after SNF discharge; the DataBook says "potentially preventable readmissions to the hospital". Definition differences vs. SNFRM are not reconciled. |
| National SNF 30-day all-cause readmission (SNFRM, the VBP measure) | Mean risk-standardized rate **0.20** (20%), standard deviation 0.02, 15,089 SNFs | FY2021 performance period | CMS SNFRM report: https://www.cms.gov/files/document/SNFRMAUSReport2022.pdf (Table 5). The FY2027 SNF VBP fact sheet confirms the measure name and periods (FY2025 performance, FY2023 baseline) but gives no national rate: https://www.cms.gov/files/document/snf-vbp-fy2027-factsheet.pdf . Since you already hold the SNF VBP FY2026 facility data, compute the current national mean from it. |
| Second-hand: national readmission 14.2% | 14.2% | 2020 | Quoted in a Maryland MHCC slide deck as "reported ... by MedPAC"; I did not verify it at MedPAC: https://mhcc.maryland.gov/sites/default/files/pdfs/Ag5_PA_and_LTC_WG_update_032023.pdf |
| Freestanding SNF FFS Medicare margin | **24.4%** (22.5% in 2023); projected 25% for 2026 | 2024 | MedPAC DataBook Chart 8-6; March 2026 Report Table 7-4; January 2026 draft for the projection |
| Freestanding SNF all-payer total margin | **2.1%** (0.4% in 2023) | 2024 | MedPAC DataBook; March 2026 Report |
| Non-FFS Medicare margin | -2.3% | 2024 | MedPAC March 2026 Report p. 244 (via extraction) |
| Median share of SNF patients discharged to community | 51.5% | FY2023-FY2024 | MedPAC DataBook Chart 8-7 |
| MedPAC recommendation | The March 2026 report text, as I extracted it, says to "reduce the 2026 Medicare base payment rates for skilled nursing facilities by 4 percent" (Recommendation 7, p. 215), against a current-law increase of 2.3%; estimated savings $2 to $5 billion in one year. **The "2026" wording looks odd for a payment year; check the exact sentence in the PDF before quoting.** | | MedPAC March 2026 Report chapter 7 |
| Value of moving volume (bundled-payment evidence) | BPCI Advanced lowered SNF payments by about $500 per episode on average and cut institutional post-acute discharges by 1.45 percentage points; some of these estimates failed parallel-trends checks | 2021-2025 | https://www.cms.gov/priorities/innovation/data-and-reports/2026/bpci-adv-ar7 |

Interpretation notes (not facts from pages): the margins above are the Medicare FFS payments to freestanding SNFs, not hospital costs. A hospital's TCOC effect from shifting volume comes from post-discharge readmissions, SNF length of stay, and downstream spending, not from SNF margins. [inference]

---

# Recommended next data pulls (ranked)

| Rank | Pull | Why | Cost | Effort |
|---|---|---|---|---|
| 1 | **Medicare Post-Acute Care PUF, SNF table (FY2024 live version)** | Gives per-SNF stays, days, payments, case mix keyed on CCN. First real volume and cost layer; joins to everything we already hold | Free | Low (need `data.cms.gov` access from sandbox, or Matt downloads the CSV) |
| 2 | **Hospital Service Area File, 2024** | Only free source linking hospitals to patient ZIPs; foundation for modeled catchments | Free | Medium |
| 3 | **Medicare Hospital Spending by Claim** | Per-hospital SNF spending in the 30 days after discharge; shows which hospitals lean on SNFs most; same portal as the files we have | Free | Low |
| 4 | **PECOS SNF Enrollments + Additional NPIs (+ All Owners)** | CCN to NPI crosswalk and chain affiliation IDs; fixes the join to NPI-keyed sources | Free | Low |
| 5 | **Medicare Geographic Variation, county, 2024** | County SNF use rate and per-user cost, regional baseline for TCOC | Free | Low |
| 6 | **SNF Cost Reports (HCRIS), FY2023 to latest** | Payer mix, days, revenue, occupancy per facility | Free | Medium-high (large relational files; need worksheet map) |
| 7 | **HUD ZIP-County and ZIP-CBSA crosswalks; Dartmouth 2019 ZIP-HRR; Census ZCTA-County** | Needed to turn ZIP catchments into counties and regions | Free (HUD needs login token) | Low |
| 8 | **PBJ staffing (latest quarter, CY2026 Q1 verified)** | Staffing hours and census per facility | Free | Medium (large) |
| 9 | **Nursing Home Chain Performance Measures** | Chain-level view | Free | Low; link method UNVERIFIED |
| 10 | **Physician Shared Patient Patterns, 2015 files: one-hour test pull** | Only free file that might contain hospital-SNF pairs; check whether SNF NPIs appear, then decide if the 2015 vintage is useful | Free | Low |
| 11 | **Maryland HSCRC public-use patient files: request the data dictionaries first** | Could be the Maryland all-payer source for discharge status; need to confirm whether the receiving SNF is identified; review up to 30 days, vendor fee, annual DUA, and output review by HSCRC | Vendor quote | Medium; start the paperwork in parallel |
| 12 | **MedPAR RIF** (only if a legitimate research path exists) | Only route to true hospital-to-SNF flows; $2,000 to $5,000 per year plus a project fee and DUA; research purpose; commercial eligibility UNVERIFIED | Paid | High; ask ResDAC about eligibility first |
| 13 | **mimilabs trial (30 days free)** | Optional shortcut for SQL access to loaded CMS tables; adds nothing unique on flows | $120 per year plus Databricks compute | Optional |
| Always | **The hospital system's own discharge records** | Real hospital-to-SNF counts for the real client [inference] | n/a | Ask the client |

## Open questions for Matt (things I could not verify)
1. Is `data.cms.gov` / `downloads.cms.gov` / `www.cms.gov` / `nber.org` / `huduser.gov` reachable from the build environment? I could only confirm that `data.cms.gov` is refused for Bash.
2. Will the product be used commercially? CMS LDS and likely RIF terms are research-only, and Maryland HSCRC Revisit files are non-commercial. A ruling is needed before any purchase.
3. Is the hospital system customer expected to share its own discharge records? That would make the public-data modeling a fallback rather than the core.
