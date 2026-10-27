# VALIDATION REPORT 05: Cohorts, PECOS layer, Facility snapshot (independent red team)

Date: 2026-10-26 · Validator: red-team agent (did not build any of this) · Source of truth: `db/snf.duckdb` (opened read-only). No app source files were modified.

**Build under test.** I started on build `index-Dig9YON0.js` (commit 96f7a6e). Partway through the round the builder committed 6ab1d1d ("stat cards on fixed rows …") and rebuilt `dist`, which produced `index-CIWIBCNa.js`. That commit changed card labels and the Stat card layout. It did not touch the cohort, PECOS or picker logic: `lib/cohort.ts`, `pages/Cohorts.tsx`, `HospitalPicker.tsx` and `scripts/07_load_pecos.py` have no diff. I re-ran every number check on the final build (`CIWIBCNa`). The results did not change: 7,411 cohort checks and 88 facility checks, all matching. Finding 5 is new in 6ab1d1d.

**Server.** Two `vite preview` processes were already running on :4173 and I was not permitted to stop them. I served the same `dist` on :4180 and checked that both ports return the same asset hash.

**Files.**
- Scripts: `app/tests/redteam/r5_*.cjs` and `r5_*.py`.
- Raw outputs: `app/tests/redteam/out_r5/`.
- Screenshots: `app/tests/screenshots/redteam5-*.png`.

## VERDICT: NOT READY TO SHARE (no wrong numbers, but text and color contradict the numbers)

Every number I checked matches DuckDB:

| Area | Checks | Mismatches |
|---|---|---|
| Cohort pages (29 condition sets) | 7,411 | 0 |
| Cohort CSV cells | 4,676 | 0 |
| Facility pages: Snapshot, star cards, Stat cards, PECOS paragraph (6 facilities) | 131 | 0 |
| Hospital pages, plus every "Part of" link followed into Explore | all | 0 |
| Picker results for Hopkins, HCA TX-only and University of Kentucky | all | 0 |

The query layer survived every injection attempt. Every value reaches SQL only as a whitelisted key, a finite JS number or a `sqlStr`-escaped string.

Several things on screen still say something the data does not support:
- **Ignored conditions (1).** A cohort condition the app cannot read is still shown in the description, but it is silently ignored, and the page reports all 14,690 facilities. Typing "18%" in a field whose placeholder is "%" is enough to trigger it.
- **Tone bars (3).** On QRP 004 they disagree with CMS's own "No Different" verdict for 7,983 facilities.
- **"Better/worse" wording (4).** It contradicts the two numbers printed beside it in 1,604 places.
- **System search (6).** For several independent systems it returns a different mega-system first, and Enter picks it.
- **Hospital page link (8).** A link labelled "(0)" opens every nursing home in the country.
- **Ownership-change counts (9).** These are presented as complete, but the CMS file only holds the most recent change.

Fix findings 1, 3, 4, 6, 8 and 9 before anyone outside the team sees the Cohorts, Facility or System features. Findings 5 and 7 should follow soon after. The minor items can wait.

---

## Findings

### 1. MAJOR: a cohort condition the app cannot read is shown but silently ignored, and the count becomes 14,690
**Reproduce:** `/cohorts?c=qm_521_adj.le.18%25`. Also:
- `c=pen_total_fines_usd.le.1,000`
- `c=pen_total_fines_usd.eq.$0`
- `c=hospital_area.in.21009` (a 5-digit CCN)
- `c=qm_521_adj.ge.abc`, `.ge.NaN`, `.ge.Infinity`, `.ge.1e400`
- `c=qm_521_adj.between.10_` (missing upper bound)
- `c=hospital_area.in.210009;DROP`
- `c=provider_name.eq.` (empty value)

**Expected:** the condition is marked "not applied: not a number" (or similar) and excluded from the description. Alternatively the cohort is empty.

**Observed:** the card shows **14,690 facilities**, and the condition line reads, for example, "Short-stay residents rehospitalized (QM 521) at most 18%" or "In a hospital's service area (hospital CCN) is any of … 21009" (`out_r5/cohort_typed.json`, `out_r5/cohort_dump.json` x05–x12, x34).

**Cause:**
- `condSql` returns `null` and `whereSql` drops the condition (`cohort.ts:55–62`), but `describe()` and the condition rows still show it.
- The value box's placeholder for percentage fields is literally "%" (`Cohorts.tsx:26`), which invites "18%".

**SQL:** `SELECT count(*) FROM facility_master WHERE qm_521_adj <= 18` returns 2,288, not 14,690.

### 2. MINOR: conditions after the 20th are dropped silently, including from shared links
**Reproduce:** a URL with 20 × `c=overall_rating.ge.1` followed by `c=state.eq.MD`.

**Expected:** MD facilities only, or a visible note that the limit is 20.

**Observed:** 14,565 facilities nationwide. The MD condition is gone with no notice (`parse(...).slice(0,20)`, `cohort.ts:76`). In the UI, "Add condition" does nothing once 20 conditions exist.

**SQL:** `SELECT count(*) FROM facility_master WHERE overall_rating >= 1` returns 14,565; adding `AND state='MD'` returns 219.

### 3. MAJOR: QRP 004 tone bars contradict CMS's statistical verdict for 7,983 facilities
**Reproduce:** `/facility/215085`, card "Readmitted within 30 days of SNF discharge".

**Observed:** 11.6% with a **red** bar. The measure row below says "No Different than the National Rate". The same happens on:
- 015463: red bar, CMS says "No Different".
- 025025: **green** bar, CMS says "No Different".

**Cause:** `tone()` (`Facility.tsx:52`) compares the risk-standardized facility rate with the national **unadjusted** average (10.72) using a 5% relative threshold. It ignores `qrp_004_ppr_pd_comp_perf`, which is CMS's own determination (D-004).

**Count:** of the 12,836 facilities with a value, red or green bars appear on 3,777 + 4,206 = **7,983** facilities that CMS rates "No Different". Only 298 "Worse" and 81 "Better" are real CMS verdicts.

**SQL:** `SELECT qrp_004_ppr_pd_comp_perf, count(*) FROM facility_master WHERE qrp_004_ppr_pd_rsrr IS NOT NULL GROUP BY 1`, then the tone rule replicated in `out_r5` (inline in the report run).

**Expected:** the QRP 004 tone follows the comparative-performance text.

### 4. MAJOR: "better/worse" and "about the same" wording contradicts the numbers printed beside it (1,604 places)
**Reproduce:**
- `/facility/035106`: the Snapshot reads "23.7% of its short-stay residents were rehospitalized, **worse than** the AZ average of 23.7%". The card reads "AZ average 23.7% · 0.1 pts worse than state".
- `/facility/055906`: "22.9% … **the same as** the CA average of 23.0%". The card says "about the same as state".

**Cause:** the difference is rounded after subtracting the unrounded values, while each displayed number is rounded on its own (`Delta`, `Facility.tsx:30–40`; `cmpWord`, `:68`). D-019 was meant to rule this out.

**Count:** across all facilities and all 31 measures with a CMS state average:
- 770 displays say better or worse while the two printed numbers are identical.
- 834 say "about the same" while the printed numbers differ.

Per measure, with examples: `app/tests/redteam/r5_delta_scan.py`.

**Expected:** compare the displayed (rounded) values, or print enough decimals that the words follow.

### 5. MAJOR (new in 6ab1d1d): at phone width the better/worse text is cut off and only the tone bar is left
**Reproduce:** `/facility/215085` at 390 px. Screenshot: `redteam5-facility-215085-cards-390.png`.

**Observed:** the note reads "MD average 21.0% · nation 23.8% · 0.8 pts…" and "… nation $30,972 · …". The new `line-clamp-2 h-8` note (`ui.tsx` Stat) hides the Delta wording. It is also cut:
- at 1024 px on the Fines card;
- on the Cohorts median card at 390 px, where "… · 57 with a value" is cut.

Full list: `out_r5/cardclip.json`. On a phone the only verdict left visible is the tone bar, which is unreliable (findings 3 and 13).

### 6. MAJOR: System search puts a merged mega-system ahead of the system the user typed, and Enter selects it
**Reproduce:** `/explore` → System → type the name → Enter (`HospitalPicker.tsx:53` picks `systems[0]`).

| Typed | Enter selects | Real family exists? |
|---|---|---|
| Providence | Universal Health Services Inc (141 hospitals, 39 states) | yes, 2nd: Providence Health & Services – Washington |
| HonorHealth | Universal Health Services Inc | no other result |
| Henry Ford | Ascension Health | no other result |
| Memorial Hermann | Tenet Healthcare Corporation | yes, 2nd |
| Baylor | CommonSpirit Health | 2nd is Tenet |
| Reading Hospital / Southcoast | Acadia Healthcare | no other result |
| Baystate / Baptist Memorial / Fairview | LifePoint / Acadia / Acadia | yes, 2nd |

Evidence: `out_r5/picker.json` (`enter_*`) and the SQL in the report run.

**Cause:**
- The search matches aliases.
- The ordering is `n_with_service_area DESC`.
- The alias line shows only the first 4 aliases, so the user cannot see why a result matched.

**Expected:** exact and label matches rank first, the matched alias is shown, and Enter does not silently pick a result whose label does not contain the text.

### 7. MAJOR: the ≥80% containment rule absorbs independently named systems as "subsidiaries" and pulls 17 of their hospitals into other families
Counts are from `app/tests/redteam/r5_*` and the inline SQL; the dump is in `app/tests/redteam/out_r5/family_top15.txt`, reproducible with `app/tests/redteam/r5_family_audit.py`.

- **Large names absorbed** (organization → family, hospitals):
  - HENRY FORD HEALTH PARENT (12) and HENRY FORD HEALTH SYSTEM (11) → **Ascension Health**.
  - BAYLOR UNIVERSITY MEDICAL CENTER (11) → **Tenet**.
  - MORGAN STANLEY DEAN WITTER CAPITAL (11) → Tenet.
  - SAINT THOMAS NETWORK (4) → **LifePoint**.
  - ROPER ST. FRANCIS (4) and MEDICAL SOCIETY OF S.C. (4) → Bon Secours Mercy.
- **One-hospital joint-venture partners absorbed:**
  - into UHS: HONORHEALTH, PROVIDENCE HEALTH & SERVICES, LANCASTER GENERAL HEALTH HOLDINGS, THE TOLEDO HOSPITAL;
  - into Acadia: FAIRVIEW HEALTH SERVICES, BAPTIST MEMORIAL HEALTH SERVICES, READING HOSPITAL, SOUTHCOAST HEALTH SYSTEM;
  - into LifePoint: BAYSTATE MEDICAL CENTER;
  - into Tenet: MEMORIAL HERMANN HOSPITAL SYSTEM;
  - into HCA: BAIN CAPITAL FUND IX, BANK OF AMERICA CORPORATION, METHODIST HEALTHCARE MINISTRIES;
  - into CommonSpirit: BAYLOR COLLEGE OF MEDICINE.
- **What the user gets:**
  - Picking "Ascension Health" with only MI ticked adds 12 hospitals with service-area data. **7 of them are named Henry Ford** (Henry Ford Health Hospital 230053, St John 230165, Macomb 230047, …).
  - Tenet's family contains Baylor Scott & White Emergency Hospitals 670062 and 670107.
- **Leakage:** 18 members attach to their parent at 80–99% containment. Together they bring in **17 hospitals not owned by the family's root organization**, for example:
  - 234011 Henry Ford Health Behavioral Health → Ascension;
  - 440218 Saint Thomas Hospital for Spinal Surgery → Ascension;
  - 110230 Emory Johns Creek → HCA.
- **Families with two members of ≥20 hospitals each:** 9 (HCA, UHS, LifePoint, Tenet/USPI, Acadia, CHS/HMA/Triad, Prime, Oceans/Webster Equity, AHP/Ardent). In every one the two names belong to the same corporate group, so **no ≥20/≥20 merger of unrelated companies was found**.
- **Caveat:** some absorptions may reflect real joint ventures (for example Ascension–Henry Ford in Michigan). That is [industry context, unverified]. The finding is that the family **label and search hide** the absorbed system.

**SQL:** `SELECT org_name, n_hospitals, parent_org FROM hospital_family_org WHERE family_id = ? ORDER BY n_hospitals DESC`; containment recomputed from `hospital_owner_org` (upper(trim(owner_name)) × hospital_ccn, `in_hospital_master`).

### 8. MAJOR: the hospital page's "Part of … its XX hospitals (0)" link opens all 14,690 nursing homes
**Reproduce:** `/hospital/014000` (Hill Crest Behavioral, AL, a UHS hospital). The line reads "SNFs serving its AL hospitals (0)", and the link is `/explore?h=` with an empty list, so Explore applies no hospital filter.

**Observed:** **14,690 facilities** (`out_r5/hospital_dump.json`).

**Count:** this affects **152 hospitals**, the ones with no service-area member of their family in their own state.

**SQL:** the `tf` CTE in the report run (rn = 1 family, n_hospitals > 1, `NOT EXISTS` member in same state with `has_service_area`).

**Expected:** no link (or plain text) when the count is 0.

### 9. MAJOR: "N changes of ownership since 2016" is presented as a complete count, but the CMS file holds only the change into the current enrollment
**Reproduce:** the PECOS line on `/facility/215085` reads "1 change of ownership since 2016, most recently 2023-08-01".

**Evidence in `pecos_snf_chow`:**
- The buyer enrollment is a current enrollment in **5,340 of 5,340** rows.
- The seller enrollment is current in **2 of 5,340** rows.
- **No** seller enrollment appears as a buyer in an earlier row, so a chain A→B→C never appears.
- Distribution: 5,336 facilities have 1 change, 2 have 2 changes, and none have more.

**SQL:**
```sql
SELECT count(*) FILTER (WHERE enrollment_id_buyer IN (SELECT enrollment_id FROM pecos_snf_enroll)) FROM pecos_snf_chow;
SELECT count(*) FROM pecos_snf_chow WHERE enrollment_id_seller IN (SELECT enrollment_id_buyer FROM pecos_snf_chow);
```

**Problem:** the file pattern is consistent with "changes of ownership into currently active enrollments" only. The meaning "all changes since 2016" has not been checked against the CMS data dictionary, so the count is an unverified claim (Rule 1.2). It probably undercounts, and "no change of ownership recorded since 2016" may be false for some facilities.

**Expected:** fetch the dictionary, or reword to "the current owner took over on <date> (PECOS CHOW file)".

### 10. MINOR: a joint-venture hospital shows only one "Part of" system
**Reproduce:** `/hospital/110230` (Emory Johns Creek).
- Owners: HCA Inc and Emory Healthcare Inc, among others.
- The page shows only "Part of Hca Healthcare Inc (156 hospitals)". `Hospitals.tsx:61` uses `fams[0]` only.

**Count:** 149 hospitals belong to 2 or more families, and 6 of those belong to 3 or more.

**Conflict:** the Methodology (Limits tab) says "A joint-venture hospital belongs to each of its owners' systems".

**SQL:** `SELECT count(*) FROM (SELECT hospital_ccn FROM hospital_family_member GROUP BY 1 HAVING count(DISTINCT family_id) >= 2)` returns 149.

Positive control: `/hospital/330101` (no owner organization) correctly shows neither "Owned by" nor "Part of".

### 11. MINOR: the Cohort CSV exports blank star ratings with no footnote
**Reproduce:** `/cohorts?c=overall_rating.blank.` → Export CSV.

**Observed:**
- All 125 rows have blank star columns and there is no footnote column. Every Explore CSV has these columns (Rule 1.3).
- The Hopkins cohort has 4 such rows.
- The CSV has no state, city, cohort definition or data vintage.

All 4,676 values that are exported match DuckDB.

### 12. MINOR: histogram percentile labels overlap or are clipped
**Observed:**
- In 10 of the 30 dumped cohorts with a histogram, the p10, p50 and p90 labels overlap. Example: `c=qm_521_adj.between.15_20&c=state.eq.MD` renders as "p10 16.1%p50 18.0%p90 19.5%" (`redteam5-cohorts-histogram-1440.png`).
- With `m=pen_total_fines_usd`, the "p10 $0" label starts at x = −14 and is cut off the left edge. It also overlaps the "$0" axis label.

Bounding boxes: geometry check in the report run, reading `out_r5/cohort_dump.json` `hist.texts`.

### 13. MINOR: the tone bar uses an unexplained ±5% relative rule, so it can be amber while the words say "better"
**Reproduce:** `/facility/215085`, QM 521: "0.8 pts better than state" with an amber bar (0.8 / 21.0 = 3.8% < 5%).

The 5% threshold is not mentioned in "How this is calculated" or on the Methodology page.

### 14. MINOR: the Snapshot gives the fines the wrong time window
**Observed:** the Snapshot says "Over the last three inspection cycles CMS recorded … and $306,550 in fines". `pen_total_fines_usd` is the Penalties file's 3-year window (lineage "Total fines $ (3-yr window)"), and the card now says "Fines, 3 years".

### 15. MINOR: facilities with no PECOS row show nothing
**Reproduce:** `/facility/025025`.

**Observed:** the PECOS paragraph is simply missing; there is no "no PECOS enrollment record found". This affects 480 Care Compare facilities (14,690 − 14,210).

### 16. MINOR: at 390 px, Explore scrolls sideways after a system is added (regression of Report 04 fix 9)
**Observed:** `scrollWidth` is 400 against a 390 px viewport. The long "… in the service area of 153 hospitals (modeled)" line pushes "Export CSV" off-screen (`out_r5/ux.json`, `redteam5-explore-system-added-390.png`).

### 17. MINOR (new in 6ab1d1d): the hospital star chip is clipped
**Observed:** on `/hospital/210009` the "Hospital overall rating" chip (32 px tall) sits in the new 32 px value row with baseline alignment, so its bottom 6 px are cut off at every width (`redteam5-hospital-210009-rating-card.png`).

### 18. MINOR: wording and labels
- **Grammar:** the picker note says "…; **1** in the chosen states **have** no service-area data and **were** left out" for Hopkins MD-only, HCA TX-only and University of Kentucky.
- **Acronyms broken by titleCase:** "Hca Healthcare Inc", "Chs Community Health Systems Inc", "Upmc", "Uhs of Delaware", "Bain Capital Fund Ix Lp", "Ehca LLC".
- **Holding-vehicle labels:** "Oceans Buyer, Inc." is used as a system label; the generic-name pattern does not catch BUYER, TOPCO or MIDCO.
- **Clipped picker labels:** labels are cut with no tooltip, for example "Adventist Health System Sunbelt Healthcare Corporation" shows 199 of 375 px.
- **Cohort description:** it repeats the operator hint, as in "is any of (CCNs, comma-separated) 210009".

### 19. MINOR: loose number parsing and no list limits in the cohort parser
- `0x10` is read as 16 (10,458 facilities). `between.10_20_30` silently becomes 10–20. A star list of `2.5,4.0` is accepted, and its description says "2.5".
- There is no limit or de-duplication on lists. A 20,000-item star list or 3,000 hospital CCNs still run in about 1.8 s, but the description becomes a single line of 40,029 characters. Explore caps `h=` at 200; Cohorts has no cap.
- URLs longer than about 16 KB get HTTP 431 from the server before the app loads. That is outside the app and harmless.

### 20. MINOR: picker keyboard behavior
**Works:**
- Tab order is logical: System radio → search box → state chips → Add → Cancel → place box.
- Every control shows a focus ring (a 2 px outline, or a 3 px shadow on the search box).
- Tab from the search box reaches the result buttons.

**Missing:**
- ArrowDown does not move into the results, and the combobox has no `aria-activedescendant`.
- Enter acts on a first result the user may not have seen (see finding 6).

**Chip contrast is fine:**
- Selected chips: white on #1D4ED8, 6.7:1.
- Unselected chips: #475467 on white, 7.5:1.
- The edge of an unselected chip against the `well` panel is about 1.1:1, so only its text shows its shape.

---

## Checks that passed

**Injection (code read and tested).**
- Field names must match `COHORT_FIELDS`, and operators must be valid for the field type (`parse`).
- Metric (`m=`) must be in the `NUMERIC` list; `g=` must be in `GROUPS_BY`, otherwise it defaults to state.
- Sort goes through `safeSort`.
- Numbers must pass `Number.isFinite`, and text goes through `clean` (`;` and control characters stripped, 80-character limit) and then `sqlStr`.
- Hospital CCNs must match `/^[0-9A-Z]{6}$/`. Family ids pass through `Math.trunc`.
- Results with these payloads:
  - `x' OR 1=1 --` and `a';DROP TABLE facility_master;--` → 0 rows, no error, table intact.
  - `MD' OR 'a'='a` → 0 rows.
  - Field `overall_rating);DROP…`, `__proto__`, `constructor`, `toString`, invalid operators, empty parts, and `g=state;DROP`, `m=provider_name`, `m=__proto__` → all ignored.
  - Unicode (Ñ, ß, right-to-left override, an emoji split at the 80-character boundary) → no errors.
- No page errors in any scenario. (Every page logs one blocked third-party request, `ERR_TUNNEL_CONNECTION_FAILED`, from the sandbox proxy.)

**Cohorts: 7,411 checks, 0 mismatches** (`out_r5/cohort_check.txt`, `cohort_check_v2.txt`). 29 condition sets were covered, including:
- between (forward, reversed, narrow, equal bounds);
- blank and has-a-value;
- flags yes and no;
- text contains and equals;
- `hospital_area` with one or two CCNs, combined with stars;
- all 8 group-bys.

Each set was compared on: count and percent of all; median, mean, p25, p75 and "with a value"; median and mean across all facilities; rating mix and its tone; facility row count; p10, p50, p90 and axis labels; and every group row (facilities, mean, with-value, 4–5★, 1–2★, average fines) plus the top-60 cut. The browser-built `snf_hospital_area` matches the DB table: Hopkins 209, Hopkins + Suburban 101 at 4★ or better.

**Facility pages: 131 checks, 0 mismatches.** Facilities: 215085; 025025 (no PECOS row); 395288 (2 changes of ownership); 015463 (not rated, footnote 18); 035106; 055906. Checked: Snapshot sentences, word for word; star cards and state averages; Stat values, notes, Delta text and tone; PECOS text (legal entity, DBA, affiliation, proprietary, change count, date, buyer). The Snapshot's "better/worse/the same" words agree with the card Delta in every sampled case. Where both are wrong they are wrong together (finding 4).

**Hospital /210009** matches the DB:
- 10,834 cases from 200 ZIPs; 209 nursing homes; 43% / 19% / 38%; 94 / 42 / 71 facilities; 3.18★; 21.2% / 11.7% / 56.0%.
- 10,157 discharges; 7,404 beneficiaries; $428,579,020; readmission measures 1/6/3.
- "Part of" links: MD (4) → 226 and all (5) → 235.
- Also matched: 110230 GA (6) → 144, HCA all (153) → 3,111, UHS (77) → 633.

**Picker**, all matching the DB:
- Hopkins chips MD 5 · DC 1 · FL 1. "Add 5" → 235 with "2 … left out". MD only → "Add 4" → 226 with "1 … left out".
- HCA with only TX ticked: "Add 36" → 898 with "1 left out" (450674 Woman's Hospital of Texas).
- University of Kentucky: KY 3 · OH 1 → "Add 3" → 153 with "1 left out". OH only → "Add 0" is correctly disabled.

**Ledger T-021 figures reproduced:**
- 985 families; 239 with more than one name; 2,286 names.
- Largest families: HCA 156 / 18 states / 98 names, UHS 141, CommonSpirit 114, LifePoint 80, Tenet 65, Trinity 57.
- 3,188 hospitals with an owner organization; 2,231 without one.
- 5,338 enrollments with a change of ownership.

**Layout:** no sideways scroll at 1440, 1024 or 390 px on /cohorts and /facility/215085. Finding 16 is the one exception, on Explore after a system is added.
