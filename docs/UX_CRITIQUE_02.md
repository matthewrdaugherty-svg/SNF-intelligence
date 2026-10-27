# UX critique 02 — SNF Intelligence (re-check of commit b9fb18f)

Reviewer: UX critic and validator (did not build the app; no app source edited).
Build: `npm run build` of b9fb18f (`index-BIJSsxY9.js`), served by `vite preview` on :4190.
Viewports: 1440×900 (`-d`), 1024×768 (`-t`), 390×844 (`-m`). Screenshots: `app/tests/screenshots/critic2-*.png`.
Source of truth for numbers: `db/snf.duckdb` (read-only).

Method:
- A Playwright audit of 12 pages × 3 widths, plus the Explore and Map filter drawers at 390 and all 6 About tabs (53 page states). For each it records font sizes and line-heights, WCAG contrast against the real background, control heights, touch targets, horizontal scroll, clipped text, missing `.press`, table header style, and Stat-row baselines.
- Probes:
  - cohort edge-case URLs (20);
  - System picker Enter behavior (17 names);
  - hospital "Part of" links (6 hospitals);
  - keyboard flows;
  - cohort CSV download.
- Verdict-word check on 300 facility pages (296 random from DuckDB, seed 42, plus 035106, 055906, 215085, 015463). Every "better / worse / same as state" phrase was compared with the two numbers printed beside it.
- A full DuckDB scan of all 426,771 facility × measure pairs for rounding disagreements.
- The family-rule SQL was re-run.

Scripts and raw output are in the reviewer's scratchpad: `audit2.cjs`, `audit2.json`, `verdict_dump.cjs`, `verdict_check.py`, `round_scan.py`, `cohort_probe.cjs`, `picker_probe.cjs`, `hosp_probe.cjs`, `kbd_probe.cjs`, `fam_check.py`.

**Short version.**
- **The numbers are right.** There are no word-versus-number contradictions in 9,707 phrases on screen. The cohort parser now refuses conditions it cannot read.
- **Desktop has improved a lot.** At 1440 and 1024: one control height, one table spec, cards on fixed rows, and no sideways scroll.
- **Phone width got worse.** Five pages now scroll sideways at 390, Compare's star chips overlap, and hospital names are cut off.
- **The System feature still gives answers a colleague would question.** Dignity Health is shown as a system separate from CommonSpirit, Baylor University Medical Center is inside Tenet, and typing "Bain" then Enter picks HCA.
- **About 40% of the first critique is not done.** It is either partly done or not started.

---

## 1. System re-measure

### 1a. Font sizes in use (target: at most 5 plus h1)

| Page | 1440 / 1024 (excluding h1) | Count | h1 |
|---|---|---|---|
| Explore | 10 · 11 · 12 · 14 · 16 | 5, but includes the banned 10 | none (no h1 on the page) |
| Cohorts | 10 · 11 · 12 · 14 · 16 · 24 | **6** | 26px |
| Facility 215085 / 435092 | 11 · 12 · 14 · 16 · 24 | 5 ✓ | 26px |
| Hospital 210009 | 10 · 11 · 12 · 14 · 16 · 24 | **6** | 26px |
| Hospitals | 11 · 12 · 14 · 16 | 4 ✓ | 26px |
| Map | 11 · 12 · 14 · 16 | 4 ✓ | none |
| Compare | 11 · 12 · 14 · 16 | 4 ✓ | 26px |
| Flows (after upload) | 10 · 11 · 12 · 14 · 16 · 24 | **6** | 26px |
| About (all tabs) | 12 · 14 · 16 | 3 ✓ | 26px |

Where the extra sizes come from:
- The 10px is the new `StripHeader` slot labels (`ui.tsx:26`, `text-[10px]`) and the histogram axis labels (`fontSize="10"`).
- h1 uses a fluid `clamp()` size: 26px at 1440 and 1024, 22px at 390, with a 29.9px line-height. Spec B1 is 24/32.
- 11px text uses three line-heights (15, 16 and 16.5px).
- Banned one-offs still in the code: `text-[12px]` (picker note, `HospitalPicker.tsx:95`) and `text-[9px]` (`QualityStrip` captions, `ui.tsx:39`).

### 1b. Controls (target: 36px desktop, 40px mobile)

All met:
- Every `.btn` and `.control` is 36px at 1440 and 1024, and 40px at 390. This includes inputs, selects, primary/surface/quiet buttons, and the label-as-button Upload.
- There is one focus ring (2px accent outline) on every control.

Exceptions:
- `.btn-sm` is 28px on desktop (by design).
- Star filter buttons are 32px on desktop and 36px at 390 (`h-8` / `h-9`).
- The Segmented control (Hospital / System) and the hospital tier filter (All / 4–5★ / 3★ / 1–2★) are **28px** at every width.
- At 390, Cohorts selects and inputs and the Flows hospital select are **14px**: `text-sm` overrides the 16px mobile rule, so iOS will zoom into them.
- The Cohorts "Remove" buttons are 12px quiet buttons, not `btn-sm`.

### 1c. Table header spec

- **Hand-written tables follow the spec.** Cohorts "By state", Hospital service area and SNF table, Flows Destinations and Nearby, and About lineage all use `.tbl th` at 12px / 500 / ink-2 with 8px padding (0 on the outer edges).
- **Header and first-cell alignment match in all 7 tables checked.** For example "Facilities" spans 317–367px and "97" spans 349–367px.
- **DataTable headers use a different weight**: 12px/400 ink-2, with the sorted column at 12px/600 ink. That is a second header spec next to `.tbl`'s 500.
- **DataTable headers are broken** (see N2): `block` overrides `line-clamp-2`, so a three-line header spills out of the top of its 48px button.

### 1d. Horizontal page scroll

| Width | Pages that scroll sideways |
|---|---|
| 1440, 1024 | none |
| 390 | Explore **+24px** (no filters) / **+37px** (one hospital); Facility 215085 **+53px**; Facility 435092 +2px; Hospital 210009 **+155px**; Flows **+23px**; About › Measures **+292px** |

See N1.

### 1e. Touch targets under 40px at 390

| Element | Size |
|---|---|
| Segmented Hospital / System | 78×28 |
| Hospital tier filter | 40–63×28 |
| Star filter | 50×36 |
| State chips | 41×36 |
| Filter checkbox rows | 268×32 |
| ⓘ buttons | 24×24 |
| Breadcrumb links "Explore" / "Hospitals" | 38×14 |
| Hospital page system links | 17px tall |
| Hospital SNF table name links | 64–93px wide, 17–37px tall |
| Brand link | 146×24 |
| MapLibre attribution toggle | 24×24 |

Fixed since last time:
- Table compare checkbox: 36×39.
- Mobile menu rows: 48px.
- Map zoom buttons: 40px.
- Drawer "Done": 40px.

### 1f. Contrast failures

Only one remains (finding #32, not fixed): ink-3 on `well` at **4.39:1**. It affects the unrated "–" chip (Explore, Hospital SNF table, Map list, Facility 435092) and the "3" count in the active Compare nav pill.

### 1g. Missing `.press`

None on buttons, radios or tabs (0 on every page). Row links still lack pressed feedback: Map list rows and DataTable name links (#45).

---

## 2. Status of the 70 prior findings

Counts:
- UX_CRITIQUE_01 (50): **11 fixed, 21 partly fixed, 18 not fixed**.
- VALIDATION_REPORT_05 (20): **12 fixed, 7 partly fixed, 1 not fixed**.
- All 70: **23 fixed, 28 partly fixed, 19 not fixed**.

### 2a. UX_CRITIQUE_01

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Flows cards: numbers at different heights | **FIXED** | The five cards use `<Stat>`. Value bottoms are all 579px at 1440 and all 627px at 1024. `critic2-zoom-flows-t.png`. (Bar colors: N7.) |
| 2 | Facility: two card specs | **FIXED** | The star cards are now `Stat`. Both rows are 152px with equal value bottoms (557px and 754px). `critic2-zoom-fac-top.png` |
| 3 | Legend repeated in every section | **FIXED** | One "How to read the measure tables" key. The Star ratings section has no header row. `critic2-zoom-fac-sections.png` |
| 4 | Card footer repeated | **FIXED** | The source is stated once under each row. "How this is calculated" is now a 24×24 ⓘ. (The source dot is still there: #31.) |
| 5 | Mobile Stat notes cut | **PARTLY** | The verdict comes first and cards are 1-up at 390. Still cut: Hospital "Volume-weighted average star rating" note ("… · to…") at every width, and Facility QRP 004 at 1024 (loses "US 10.7%"). `critic2-zoom-hospital-top.png` |
| 6 | Hospital header layout | **FIXED** at ≥768 | Actions column `md:w-64`, the system sentence moved left, and "Show on the map" is a button. At 390 the button is off-screen (N1). |
| 7 | Numeric headers left-aligned; sorted header clipped | **PARTLY** | Right-aligned, arrow inline. But clamping no longer works and three-line headers lose their first line (N2). Codes are still in headers. |
| 8 | Compare alignment and mobile | **PARTLY** | Values right-aligned, page frame, sticky label column. At 390 the star strips overlap (N3). No sticky header. |
| 9 | Nav clips at 1024 / 390 | **FIXED** | Menu button below md, "Flows" / "Methods" labels, data vintage shown only at xl. `critic2-zoom-explore-t.png` |
| 10 | Map legend overflow | **FIXED** | Wraps to 2 lines at 390, no overflow. `critic2-map-m.png` |
| 11 | About tables scroll the page | **PARTLY** | Lineage and Verification are fixed. **Measures still overflows by 292px at 390.** `critic2-zoom-about-measures-m.png` |
| 12 | One control spec | **PARTLY** | Heights 36/40 everywhere and one focus ring. Cohorts and Flows controls are 14px at 390 (iOS zoom). Segmented and tier filter are 28px. See §1b. |
| 13 | Type scale | **PARTLY** | 6 sizes on Cohorts, Hospital and Flows (10px added). h1 is fluid 22–26px. `text-[9px]` and `text-[12px]` remain. See §1a. |
| 14 | Flows nearby table padding | **FIXED** | `.tbl` padding is 8px. Columns are separated and headers align (probe). |
| 15 | Star filter contrast and selected state | **FIXED** | No opacity. Selected = `ring-2 ring-accent ring-offset-2`; others go grey once one is picked. (Height 32/36, not 36/40.) |
| 16 | Touch targets < 40 | **PARTLY** | Checkbox, menu, map zoom and Done fixed. The rest is listed in §1e. |
| 17 | Narrative repeats the card numbers | **NOT FIXED** | Facility still has 6 bold runs (20.2%, 11.6%, 4, $306,550…). Hospital still bolds 43% / 19% / 38%. `critic2-zoom-fac-top.png` |
| 18 | Staffing stars shown twice | **NOT FIXED** | Staffing card plus a Staffing row in the Star ratings section. `critic2-zoom-fac-sections.png` |
| 19 | Long middle-dot meta strings | **NOT FIXED** | Facility meta (2 lines at 1440, 4 at 390), Hospital meta, the PECOS one-sentence box, and the 14-owner sentence on 670060. |
| 20 | One-line cells float between the name's two lines | **NOT FIXED** | DataTable rows still `items-center`. `critic2-zoom-explore-footer.png` (City / MD / 180 sit on the midline). |
| 21 | Repeated per-row labels | **PARTLY** | "CCN" dropped from DataTable and the Hospitals list has a header row. "Acute Care Hospitals" is still on every row (2 lines at 390). The Map list still shows "rehosp" on every row and cuts off the % (`critic2-map-d.png`). |
| 22 | Explore footer averages | **NOT FIXED** | Still a wrapped label string, not under the columns. 4 lines at 390. `critic2-explore-m.png` |
| 23 | Stars header doesn't line up with chips | **PARTLY** | DataTable, Hospital and Flows tables have slot labels over each chip (10px). The Compare corner and Map list still use the sentence. |
| 24 | One name per measure; no codes | **PARTLY** | Hospital and Flows tables say "Rehospitalized" / "Fines, 3 yr". Explore headers still say "Rehospitalized % (QM 521)", "Fines $ (3 yr)", "Readmission % (QRP 004)". The Map says "rehosp". The CSV says "Total fines". |
| 25 | SNF / facility / nursing home mixed | **NOT FIXED** | Hospital 210009 at 1440: snf 8 · nursing home 15 · facility 10. Explore count reads "14,690 facilities". |
| 26 | Hand tables: one spec, sortable, empty-cell rule | **PARTLY** | The spec is applied. The Hospital SNF table (209 rows) still can't be sorted. The header still says "Group". "Nursing homes in ZIP" shows "—" for a true zero. The Facility penalties table is still hand-styled. |
| 27 | Spacing and frames | **PARTLY** | One `.page` frame and a 24px `.stack`. Card padding (16px) differs from section padding (24px), so the inner left edges are still 8px apart (cards at x=184, sections at x=192 on Facility at 1440). |
| 28 | Cohorts description repeats controls; columns don't line up | **NOT FIXED** | The describe line is still there. Value fields sit at x=746 and x=770 in rows 1 and 2. At 390, "all must be true" wraps to 4 lines and "Break down by" is indented. `critic2-zoom-cohorts-top.png`, `critic2-zoom-cohorts-m2.png` |
| 29 | Histogram: accent fill, half-empty card, jargon | **NOT FIXED** | Still accent blue, `max-w-3xl`, "p10 / p50 / p90", and the old legend string. |
| 30 | Four selected-state looks | **PARTLY** | Checkboxes are now accent. About tabs still use an underline, and there is no `tablist` / `tab` / `aria-selected` (0 found). |
| 31 | Decorative and duplicate colors | **PARTLY** | Tone bars kept, with `#dc6803` hard-coded (`ui.tsx:119`). The source dot is kept (Modeled = accent). `#b9c1cb` and `#dbe4ff` are in the CSS and map hex in components. Bar meaning: N7. |
| 32 | ink-3 on well contrast | **NOT FIXED** | 4.39:1 (§1f). |
| 33 | Mobile filter drawer | **PARTLY** | "Done" is 40px. No scrim; tapping the table beside the drawer does nothing. Escape doesn't close it. No sticky "Show N" footer; the count is still the last line. `critic2-explore-drawer-m.png` |
| 34 | Filter helper text | **PARTLY** | Three helper lines kept (shortened). The placeholder "e.g. Genesis, Baltimore, 215…" is still cut off. |
| 35 | Picker chosen-hospital chip | **PARTLY** | Still shows "Baltimore, MD · CCN 210009". The name is truncated with no title. "Remove" is still a text button. `critic2-zoom-explore-h.png` |
| 36 | Compare ties bold, stars as text, no sticky header | **PARTLY** | Ties are no longer bold ✓. Stars are still "2★" text. No sticky header. The corner text is still there. `critic2-zoom-compare-top.png` |
| 37 | Map: no count or list below 1024 | **NOT FIXED** | `aside.hidden.lg:block` is unchanged. `critic2-map-m.png` |
| 38 | Export primary vs secondary; two filled buttons | **NOT FIXED** | Explore and Cohorts Export are still `btn-primary`. The Columns "Done" and the picker "Add N" are primary too. The drawer shows two filled buttons at once (Done + Export). |
| 39 | Readmission card "1 / 6 / 3" | **NOT FIXED** | `critic2-zoom-hospital-top.png` |
| 40 | Link styles | **PARTLY** | "Open on Care Compare" is now a quiet button. Flows and Compare name links still `hover:underline` only (no accent). The breadcrumb state is still not a link. |
| 41 | Hospitals search header and frame | **FIXED** | Header row present, 72rem frame. `critic2-hospitals-d.png` |
| 42 | Flows intro and upload jargon | **NOT FIXED** | The 5-line intro still says "the schema is fixed so real data drops in without any rework". The helper still floats right. `critic2-zoom-flows-t.png` |
| 43 | Map ignores reduced motion | **NOT FIXED** | `fitBounds(... duration: 500)`, `MapPage.tsx:121,127` |
| 44 | Measure rows: value floats; `text-[11px]` | **NOT FIXED** | Grid is still `items-center`. Comparison text is still 11px. |
| 45 | `.press` on row links | **PARTLY** | Hospitals rows have it. Map list rows and DataTable name links don't. |
| 46 | Six radii | **NOT FIXED** | In use: 4, 5, 6, 8, 10 and 12px plus full. 9 `rounded-[5px]` / `rounded-[8px]` remain in the TSX. |
| 47 | Panel depth | **FIXED** | Panels have no shadow. |
| 48 | State column shows "MD" on every row | **NOT FIXED** | `critic2-zoom-explore-footer.png` |
| 49 | Sticky name column on mobile | **NOT FIXED** | |
| 50 | Copy polish | **PARTLY** | The nav says "Methods" but the h1 still says "Methodology & trust". Still unchanged: "Columns · 11", "Clear 1", "p25 / p75", the About Limitations h2 at 14px, and no h1 on Explore or Map. |

### 2b. VALIDATION_REPORT_05

| # | Finding | Status | Evidence |
|---|---|---|---|
| 1 | Unreadable condition silently ignored → 14,690 | **FIXED** | All 11 bad URLs (`21009`, `abc`, `NaN`, `Infinity`, `1e400`, `10_`, `210009;DROP`, empty, `0x10`, `2.5,4.0`) now show "Fix the highlighted condition…" and run no count. `18%`, `1,000` and `$0` are accepted. `le.18%` gives 2,288, which equals `SELECT count(*) … WHERE qm_521_adj <= 18`. |
| 2 | Conditions after the 20th dropped silently | **FIXED** | Red alert: "This link carried more than 20 conditions; only the first 20 are used." (The count is 14,565, as announced.) |
| 3 | QRP 004 bars contradict CMS | **FIXED** | The bar follows `qrp_004_ppr_pd_comp_perf`. DB: 12,457 No Different (amber), 298 Worse (red), 81 Better (green); every value has a verdict. In the 300-page sample: 792 bars, 0 disagree with their words. |
| 4 | "Better / worse" contradicts the printed numbers | **FIXED** (residue) | 300 pages: 8,653 measure rows, 533 cards and 521 Snapshot sentences, with **0** word contradictions. Full DB scan of 426,771 pairs: 0 word contradictions, but 25 magnitudes off by one in the last digit (S3). |
| 5 | Notes cut at phone width | **PARTLY** | As UX #5. |
| 6 | Mega-system first; Enter picks it | **PARTLY** | Label matches now rank first and the matched alias is shown ("matches owner name Baylor University Medical Center"). Providence → Providence; Henry Ford → Henry Ford Health Parent; Memorial Hermann → Memorial Hermann. But **Enter still picks an alias-only match**: "St. David" → HCA, "Bain" → HCA. "HonorHealth", "Reading Hospital" and "Southcoast" now show an empty list with no message. |
| 7 | Containment rule absorbs independent systems | **PARTLY** | See below the table. |
| 8 | "(0)" link opens every nursing home | **FIXED** | /hospital/014000 now reads "nursing homes serving all 77 with service-area data", with no "(0)" link. |
| 9 | Change-of-ownership count presented as complete | **FIXED** | "changed ownership on 2023-08-01 (buyer…, seller…) — the PECOS file lists the change into the current enrollment, so earlier changes may not appear". `critic2-zoom-fac-pecos.png` |
| 10 | Joint-venture hospital shows one "Part of" | **FIXED** | /hospital/110230 shows HCA (156) and Emory Healthcare (3). |
| 11 | Cohort CSV: no footnotes or context | **FIXED** | Downloaded: 3 `#` header lines (vintage, conditions, link), City, State and a footnote column for every star rating (128 lines for 125 rows). |
| 12 | Histogram labels overlap or clip | **PARTLY** | p50 moved to a second line. p10 and p90 still overprint: MD 15–20% renders "p10 16.1%" over "p90 19.5%" (`critic2-cohort-hist-md1520.png`). On fines, p10 $0, p90 and the "$0" axis label collide and **the p50 label is cut off at the bottom** (`critic2-cohort-hist-fines.png`). |
| 13 | Unexplained ±5% bar rule | **FIXED** | The bar is the same verdict as the words. The ⓘ text says so. |
| 14 | Wrong window for fines in the Snapshot | **FIXED** | "…in fines over the three-year penalties window". |
| 15 | No PECOS row shows nothing | **FIXED** | "No PECOS enrollment record matches this CCN in the … release" (applies to 480 facilities, from DB). |
| 16 | Explore scrolls sideways at 390 | **NOT FIXED** (worse) | Now +24px with no filter and +37px with one hospital. "Export CSV" is off-screen. `critic2-explore-m.png` |
| 17 | Hospital star chip clipped | **FIXED** | `critic2-zoom-hospital-top.png` |
| 18 | Wording and labels | **PARTLY** | Grammar fixed ("1 in the chosen state has … and was left out"). HCA, UHS, CHS and UPMC are correct. See below the table. |
| 19 | Loose number parsing | **PARTLY** | Hex, exponents and decimal stars are rejected. `between.10_20_30` still silently runs 10–20 (3,080 facilities). Star lists have no length cap or de-duplication. |
| 20 | Picker keyboard | **PARTLY** | ArrowDown now moves focus into the results. There is no `aria-activedescendant`. Enter still acts on an alias-only first result (#6). |

**VR05 #7 in detail (family rule, SQL re-run):**
- **Fixed:** Henry Ford is its own family (12 hospitals). Ascension has 0 Michigan members.
- **Still absorbed:** BAYLOR UNIVERSITY MEDICAL CENTER is still in Tenet. 11 Baylor Scott & White hospitals are Tenet members (670060, 450422, 670062 …). The reason is that `coalesce(pct,100)` treats every unreported share as controlling: 670060 lists 13 owners with no percentage.
- **Still aliases of HCA:** Bain Capital Fund IX, Bank of America Corp, Methodist Healthcare Ministries and St. David's Foundation (HCA: 156 hospitals, 78 names).
- **New splits:** hospitals in 2 or more families fell from 149 to 76 (2 of them in 3 or more), but many are now one system split in two:
  - Dignity Health (24 hospitals, 19 of them also CommonSpirit, 79% < 80%);
  - VHS San Antonio Partners (8) apart from Tenet;
  - St Vincent's Health System apart from Ascension;
  - The Massachusetts General Hospital apart from Mass General Brigham.

  See N5.

**VR05 #18 in detail:**
- Still wrong: "Commonspirit", "Usp", "Fund Ix", "Ehca", "Vhs", "Trmc", "Hcn", "Adventhealth".
- The label "Oceans Midco, Inc." is still a holding-vehicle name (MIDCO and HOLDCO are not in the pattern). 13 family labels contain TOPCO, MIDCO, BUYER, HOLDCO or PARENT.
- The pending header says "1 hospitals" (Fairview).
- Picker labels now carry a title.
- The description no longer repeats the operator hint.

---

## 3. New findings (regressions and defects introduced or exposed by the redesign)

### Must-fix

**N1. At phone width, five pages scroll sideways and push actions off-screen.**
- Viewport: 390.
- Pages, elements and screenshots:

| Page | Overflow | What goes off-screen | Screenshot |
|---|---|---|---|
| /hospital/210009 | **155px** | "Show on the map" is entirely off-screen; the action row is `flex-row` with a full-width primary button | `critic2-zoom-hospital-top-m.png` |
| /facility/215085 | 53px | "Open on Care Compare" is cut | `critic2-zoom-fac-top-m.png` |
| /explore | 24px (37px with a hospital) | "Export CSV" is cut | `critic2-explore-m.png` |
| /flows | 23px | the hospital `<select>` and its arrow run off the right edge | `critic2-zoom-flows-m.png` |
| /about › Measures | 292px | the code cells | `critic2-zoom-about-measures-m.png` |

- Fix:
  - Hospital and Facility action wrappers: `flex flex-col md:items-end gap-2 w-full md:w-64`, with buttons `w-full md:w-auto`.
  - Explore toolbar: `flex-wrap`. Put the count on its own row below md (`basis-full md:basis-auto`), and below md show "Columns" without the count.
  - Flows select: `w-full max-w-full min-w-0`.
  - About Measures: wrap the table in `overflow-x-auto` and add `[overflow-wrap:anywhere]` to the `code` cells.
  - Add a test that fails on `scrollWidth > innerWidth` at 390 for every route.

**N2. DataTable headers: line clamping is broken, and the word "Modeled" is hidden on the hospital-filtered Explore.**
- Page and viewport: /explore?h=210009 (all widths). Any header that needs 3 lines is affected.
- Element: `DataTable.tsx` head span `block w-full text-xs leading-4 line-clamp-2`.
- What is wrong:
  - The computed display is `block`, so `line-clamp-2` has no effect.
  - "Modeled share of hospital SNF volume" is 64px tall inside a 48px button (`items-end`). Its first line, the word **Modeled**, is pushed above the button and cut off. That column is the default sort.
  - "G–L deficiencies (3 cycles)" fills exactly 48px.
- Screenshot: `critic2-zoom-explore-h.png`.
- Fix:
  - Drop `block` (keep `w-full line-clamp-2 text-xs leading-4`).
  - Rename the header to "Modeled share" with `title="Modeled share of the hospital's nursing-home volume"`.
  - Shorten every header to fit 2 lines: "Harm citations, 3 cycles", "Rehospitalized %", "Readmitted %", "Back home %", and move the codes into `title`.

**N3. Compare at 390: star chips overlap the next facility.**
- Page and viewport: /compare at 390 (and any width where a column is under 156px).
- Element: header cell `QualityStrip`, four 36px chips plus gaps = 156px, inside a `minmax(112px,1fr)` column.
- What is wrong: Carroll Park's fourth chip sits under Blue Point's first chip.
- Screenshot: `critic2-zoom-compare-m.png`.
- Fix: column `minmax(164px,1fr)` (the panel already scrolls sideways). Or give the `sm` chip `w-7` (4×28 + 12 = 124px) and use `minmax(128px,1fr)`.

**N4. Hospitals list at 390: hospital names cut to 142px with no title.**
- Page and viewport: /hospitals at 390.
- What is wrong: names read "Adventhealth Orlan…", "Mayo Clinic Hospit…" and "Massachusetts Gen…", while "Acute Care Hospitals" wraps to a second line under every row.
- Screenshot: `critic2-hospitals-m.png`.
- Fix:
  - Name `line-clamp-2` instead of `truncate`, with `title`.
  - Show `hospital_type` only when it is not "Acute Care Hospitals".
  - Discharges column `w-20` below md.

**N5. The System feature now splits one system into two, and still absorbs partners.**
- Pages: /explore System picker, /hospital/030119, /hospital/670060.
- What is wrong:
  - **Splits.** Mercy Gilbert reads "Part of Commonspirit Health (113)" and "Part of Dignity Health (24)". Typing "Dignity" offers Dignity Health with 24 hospitals, 19 of which are also CommonSpirit's. 670060 is "Part of Tenet" and "Part of Vhs San Antonio Partners LLC (8 hospitals)".
  - **Absorptions.** "Baylor", then Tenet, "matches owner name Baylor University Medical Center". "Bain", "St. David" and "Methodist" all match HCA; for the first two, Enter picks HCA.
- Cause (`scripts/07_load_pecos.py`):
  - `coalesce(pct,100)` turns every unreported stake into control.
  - The fixed 80% cut splits Dignity at 79%.
  - Aliases list every member name, including PE and bank investors that were attached through hospitals they control.
- Evidence: `fam_check.py` output in §2b #7 and `picker_probe.cjs` output.
- Fix:
  1. Treat an unreported `pct` as not controlling when any other owner of the same hospital reports 50% or more (670060: TRMC Holdings 63%).
  2. Attach an organization to a parent when the parent is listed as its **indirect owner** (role 35) on at least 80% of its hospitals, not only by set containment. This keeps Dignity under CommonSpirit and VHS under Tenet.
  3. Exclude from aliases (or show as "investor") any organization whose name matches `\b(CAPITAL|FUND|BANK|PARTNERS LP|FOUNDATION)\b` or that holds a minority stake in most of its hospitals.
  4. Enter selects the first result only when its **label** contains the text. Otherwise Enter moves focus to the list.
  5. Add assertions for Dignity ⊂ CommonSpirit, VHS ⊂ Tenet and Baylor ∉ Tenet.

### Should-fix

**N6. Suppressed and empty Stat cards look broken.**
- Pages: /facility/435092 (Rehospitalized and Readmitted cards suppressed); every facility's "Harm or jeopardy deficiencies" card.
- What is wrong:
  - For a suppressed value, the 24px value row holds an 11px dotted "too few residents to report", 4px off the row's baseline (value bottoms 666 / 666 / 662 / 662).
  - The note starts with an empty line, because `<br/>` comes with nothing before it, so "SD 19.9% · US 23.8%" floats on line 2.
  - The Harm card has no note at all: 70px of blank.
- Screenshots: `critic2-zoom-fac435092-cards.png`, `critic2-zoom-fac-cards-m.png`.
- Fix:
  - Suppressed value → `<span class="t-display text-ink-3">—</span>`, and note line 1 → `<Fn>` short reason.
  - Only emit the `<br/>` when line 1 has content.
  - Harm card note: "{ST} avg x · US avg y" if CMS publishes averages; otherwise "Severity G–L citations, last 3 inspection cycles".

**N7. Bars on the tier cards show the tier, not a verdict (a green bar beside "0%").**
- Pages and viewports: /flows ("To 4–5★ (good) **0%**" with a green bar, `critic2-zoom-flows-t.png`); /hospital/210009 ("In 1–2★" is always red and "4–5★" always green, `tone="good"` hard-coded in `Hospitals.tsx`); Cohorts "Rating mix" (green above 50% good, an unexplained threshold).
- What is wrong: this contradicts the "verdict-driven colors" claim.
- Fix: on these cards, replace the tone bar with a proportion bar (width = share, color = tier, on a `bg-well` track), or remove it. Keep tone bars only where words state a verdict.

**N8. The ⓘ panel opens inside the card, stretches the whole row, and ignores Escape.**
- Page: /facility/215085 (all Stat rows).
- What is wrong:
  - Opening one card's "How this is calculated" makes all four cards grow from 152 to 289px, leaving three blank cards.
  - Escape doesn't close it.
  - The trigger is a bare letter "i" with no circle at rest, so it reads as a stray character.
- Screenshot: `critic2-fac-info-open.png`.
- Fix: render `how` as a popover (`absolute z-20 top-10 right-3 w-72 panel p-3` with `--shadow-float`) that closes on Escape and outside click. Draw the trigger as a 16px circled-i icon with a 24px hit area (40px below md).

**N9. Keyboard and dismissal on the overlays.**
- Mobile Menu: Escape doesn't close it.
- Filters drawer (390):
  - Escape doesn't close it.
  - There is no scrim, and tapping the visible table beside it does nothing.
- Columns popover:
  - Focus stays on the trigger when it opens, so Escape (handled on the dialog) never fires.
  - The only way to close it is the primary "Done" button or clicking the trigger again.
- Evidence: `kbd_probe.cjs` output.
- Fix:
  - One `useDismiss(ref, onClose)` hook (Escape plus outside pointer-down) for the Menu, the drawer, the Columns popover and the ⓘ popover.
  - The drawer gets `fixed inset-0 bg-ink/30` behind it.
  - Move focus to the first control on open and back to the trigger on close.

**N10. The verdict magnitude and the displayed numbers use different rounding.**
- What is wrong: `verdict()` rounds with `Number.toFixed` (the exact binary value), while `fmt()` uses `Intl.NumberFormat` (the decimal value). Half-way values split, in **25 of 426,771** pairs. Examples:
  - 105482, PT hours: value 0.045 is displayed as 0.05 against a state average of 0.09, but the words say "0.05 worse", not 0.04.
  - 075196, total nurse hours: 3.20 vs 3.73, words say "0.54 worse".
- The verdict words are never wrong; only the magnitude is.
- Evidence: `round_scan.py`.
- Fix: compute the difference from the formatted strings, e.g. `const r = (x) => Number(fmt(x, m.unit, dec).replace(/[^0-9.-]/g, ''))`, so the arithmetic always matches the screen.

**N11. Flows: the "Discharges to nursing homes" card counts an unknown CCN as a facility.**
- Page and viewport: /flows after uploading a 5-row file with CCN 999999, 1440.
- What is wrong: card 1 reads "280 · 5 facilities". Card 5 reads "3% · 10 to CCNs not in the CMS file". So one of the "5 facilities" is not a facility, and its 10 discharges are counted as nursing-home discharges.
- Fix: card 1 label "Discharges in the file", note "5 destination CCNs · 4 found in CMS".

**N12. The Map list cuts off its only number.**
- Page and viewport: /map at 1440 (139 rows).
- What is wrong: the meta "Lutherville · rehosp 18.…" is truncated at 131px, so the percentage is lost on 139 rows.
- Screenshot: `critic2-map-d.png`.
- Fix: put the percentage in its own right-aligned `w-12 tabular-nums` slot. Name it once in the list header ("City · Rehospitalized %"), and give the city `truncate` plus `title`.

**N13. Flows Destinations: the name column is too narrow.**
- Page and viewport: /flows at 1024.
- What is wrong: names wrap to 3 lines and "abuse icon" splits across lines while the table has free width.
- Screenshot: `critic2-zoom-flows-t.png`.
- Fix: `th:first-child { min-width: 220px }` on this table, and `whitespace-nowrap` on the flag spans.

**N14. Mobile controls at 14px on Cohorts and Flows (iOS zoom).**
- Viewport: 390.
- Fix: remove `text-sm` from `.control` elements (the class already sets 14px at ≥768px and 16px below).

**N15. A system search with no result shows nothing.**
- Page: /explore System picker.
- What is wrong: "HonorHealth", "Reading Hospital" and "Southcoast" give an empty dropdown with no message.
- Fix: show the `listbox` with one row: "No system controls a hospital under that name. Try Hospital search."

**N16. Hospital page: an "Owned by" sentence with 14 names.**
- Page: /hospital/670060.
- Fix: show "Owned by TRMC Holdings Inc 63% · 13 indirect owners" with a `<details>` listing them. Remove "100%" from indirect owners (030119 reads "Dignity Health 100% and Commonspirit Health (indirect) 100%").

### Polish

- **N17.** h1 uses a fluid size (`--text-page` clamp, 22–26px, line-height 29.9). Use 24/32 everywhere, per B1.
- **N18.** Compare "Remove" buttons are centred under right-aligned headers. Use `ml-auto block`.
- **N19.** Cohort CSV `#` comment lines are read as data rows by Excel and pandas. Keep them, but say so in About, or move them to a trailing block. The CSV label "Total fines" lacks "3 years".
- **N20.** The Facility ownership blurb points to "the workbook's Ownership sheet", which a viewer does not have. Reword to "officers, directors and lenders are listed in the CMS ownership file (not shown)".
- **N21.** At 390, the Hospital "Modeled" tag wraps onto its own indented line under the section title. Cohorts "Remove" sits alone on a third row. Use `flex-wrap items-baseline gap-x-2` and put Remove in the operator row.

---

## 4. Verdict

This build is ready for Matt to **show on his own laptop at 1440 or 1024 while he drives**.

Why it is ready:
- Every number checked matches DuckDB. No "better / worse" phrase contradicts the figures beside it: 8,653 rows, 533 cards and 521 Snapshot sentences.
- The cohort page refuses conditions it cannot read.
- The desktop grid, controls and tables now hold together.

It is **not ready to send colleagues a link**, because they will open it on a phone:
- Five pages scroll sideways.
- Compare's chips overprint each other.
- Hospital names are cut off.

The System picker can also embarrass him in front of anyone who knows the market: Dignity is shown apart from CommonSpirit, Baylor is inside Tenet, and "Bain" plus Enter gives HCA.

The five most important fixes:
1. A phone-width pass: N1, N3, N4, plus a 390px no-sideways-scroll test on every route.
2. The DataTable header clamp, so "Modeled" is never hidden: N2.
3. The family rule and picker Enter behavior: N5, VR05 #6 and #7.
4. Card states: suppressed and empty notes (N6), tier bars that read as verdicts (N7), the ⓘ popover (N8), and the clipped hospital note (#5).
5. The unfinished first-critique items that make pages look unfinished: Explore footer under its columns (#22), row baselines (#20), narrative that repeats the cards (#17), histogram labels and colors (#29 / VR05 #12), and one word, "nursing home" (#25).
