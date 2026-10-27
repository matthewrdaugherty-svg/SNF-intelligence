# UX critique 01 — SNF Intelligence

Reviewer: UX critic (did not build the app). Build reviewed: `npm run build` of 2026-10-26, served by `vite preview` on :4173.
Viewports: 1440×900 (`-d`), 1024×768 (`-t`), 390×844 (`-m`). Screenshots: `app/tests/screenshots/critic-*.png`.
Method: Playwright pass over every page × viewport, recording computed font sizes, line-heights, contrast (WCAG formula against the real background), control heights, touch-target sizes, horizontal overflow and missing `.press`; then visual review of full pages and zoomed crops. Raw numbers are quoted in each finding.

Severity: **must-fix** = breaks the grid, hides information, fails WCAG, or is the exact kind of defect the owner has already complained about. **should-fix** = visible inconsistency or clutter. **polish** = refinement.

---

## A. Findings, most damaging first

### 1. Flows summary cards: big numbers at different heights (owner's exact complaint) — must-fix
- Page / viewport: /flows (after upload), 1024 (also any width where a label wraps).
- Element: the five hand-rolled cards in `Flows.tsx` (`grid grid-cols-2 md:grid-cols-5 gap-3` → `div.bg-surface.rounded-[10px].p-4`).
- What is wrong: the fifth label "Unrated or unmatched CCN" wraps to 2 lines, pushing its number down 16px (number top 573 vs 557 in the other four). These cards also use a third card spec: number `text-2xl` (24px) with `mt-1`, note `text-[11px] text-ink-3`, no reserved rows.
- Screenshot: `critic-t-flows-cards.png`, `critic-flows-d.png`.
- Fix: replace the hand-rolled cards with `<Stat>` (it reserves a 2-line label row, `h-8`). Pass `source="Hospital-reported"`, drop the progress bar (`c.bar`) or move it into `note`. Label copy: "To 4–5★ (good)", "To 3★ (average)", "To 1–2★ (poor)", "Unrated or not found" so labels fit one line at 1024.

### 2. Facility: the two card rows use different card specs, so label→value spacing jumps — must-fix
- Page: /facility/215085, /facility/435092, all viewports.
- Element: the star-rating cards (`Facility.tsx` hand-written `div.bg-surface.rounded-[10px].p-4`) directly above the `<Stat>` cards.
- What is wrong: in the star row the value sits 8px under a 1-line label (label top 409, chip top 425). In the Stat row below, the value sits under a reserved 2-line label (label top 533, number top ~565). Two adjacent rows, two rhythms; the star row has no footer, so card heights are 112 vs 184.
- Screenshot: `critic-zoom-fac-cardrows.png`, `critic-zoom-fac-header.png`.
- Fix: render the star cards with `<Stat>`: `value={<Stars value={…} size="lg" />}`, `unit={tierWord(v)}`, `note={\`${state} average ${sa.toFixed(1)}\`}`, `source="CMS"`. One card spec on the page (see section B, card spec).

### 3. "How to read this" legend repeated in every measure section — must-fix (repeated-label clutter)
- Page: /facility/*, 1440 and 1024.
- Element: `Facility.tsx` line 204, header cell "Dot = facility · tall mark = state · short mark = nation". It shows in all 9 sections, including "Star ratings", which has no tracks at all.
- Screenshot: `critic-zoom-fac-section.png`.
- Fix: delete the text from the per-section header (leave that cell empty). Show the legend once, as a small inline key above the first section that has tracks: `<div class="text-xs text-ink-2 flex gap-4">` with a drawn dot, tall mark and short mark, each followed by "This facility", "State average", "National average". In the "Star ratings" section hide the whole header row (`g.id === 'ratings'`).

### 4. Stat card footer repeated on every card ("● CMS  How this is calculated") — must-fix (repeated-label clutter)
- Page: /hospital/210009 (8 times), /facility/* (4), /cohorts (4). All viewports. At 390, "How this is calculated" wraps to 2 lines on every card.
- Element: `Stat` in `ui.tsx`, footer `div.mt-auto.pt-3…` with the source dot and the text button.
- Screenshot: `critic-zoom-hospital-top.png`, `critic-m-hospital-cards.png`, `critic-m-fac-cards.png`.
- Fix: (a) remove the source dot and word from each card; add `StatRow({ source, children })`, which renders the grid plus one caption under it: `<div class="text-xs text-ink-3 mt-2">Source: CMS</div>` (or "Modeled — see note"). (b) Replace the "How this is calculated" text button with a 24×24 icon button in the label row (`absolute top-3 right-3`, an ⓘ glyph, `aria-label="How this is calculated"`, `.press`). It opens the same `how` panel. The card then has 3 rows: label, value, note.

### 5. Mobile Stat notes cut off the most important words — must-fix
- Page: /facility/215085 at 390 ("MD average 21.0% · nation 23.8% · 0.8 pts…" — "better than state" is lost); /hospital/210009 at 390 and 1024 ("readmitted after SNF…").
- Element: `Stat` note `h-8 line-clamp-2`.
- Screenshot: `critic-m-fac-cards.png`, `critic-t-hospital-cards.png`.
- Fix: put the verdict first and the reference values second: note = `<Delta/>` on line 1, then `"{state} {sa} · US {na}"` on line 2. Use `grid-cols-1 sm:grid-cols-2 md:grid-cols-4` for Stat rows with long notes (the facility "measure" row, the hospital "Volume-weighted" card), so 390 is 1-up. For the hospital's "Volume-weighted facility measures" card, show the three rates as a 3-line note, not a middle-dot string, or move them to their own row.

### 6. Hospital detail header: the right column steals width and the facts wrap into 8 lines — must-fix
- Page: /hospital/210009, 1440 and 1024.
- Element: `Hospital.tsx` header. The right column (`shrink-0 flex flex-col md:items-end`) holds the long "Part of … SNFs serving its MD hospitals (4) or all with service-area data (5)" sentence, so the left `flex-1` column shrinks to ~320px. The address, type and owner lines wrap into 8 lines while the right column is mostly empty.
- Screenshot: `critic-zoom-hospital-top.png`.
- Fix: the right column holds only actions, at a fixed width: `md:w-64 shrink-0`. Move the system sentence into the left column as its own meta line (`text-sm text-ink-2 mt-1`), worded "Part of Johns Hopkins Health System (7 hospitals) · Explore nursing homes for its 4 MD hospitals · all 5". Make "Show on the map" a `btn btn-surface` beside the primary button (same height), not a 12px link.

### 7. Numeric column headers are left-aligned over right-aligned numbers, and the sorted header is clipped — must-fix
- Page: /explore, /cohorts (DataTable), all viewports.
- Element: `DataTable.tsx` `head()`: `<span className="leading-tight line-clamp-3">`. `line-clamp` makes the span a full-width box, so `justify-end` on the button has no effect and multi-line numeric headers render left-aligned ("Readmission % (QRP 004)" starts 130px left of its numbers). The sorted column's header loses its last letters: "Rehospitalize" (no ellipsis), because the arrow is a flex sibling inside the fixed width.
- Screenshot: `critic-zoom-cohorts-sorted-header.png`, `critic-zoom-explore-toolbar.png`.
- Fix: span `className={\`leading-4 line-clamp-2 min-w-0 ${numeric ? 'text-right' : 'text-left'}\`}`. Put the arrow inline at the end of the text (`<span aria-hidden className="ml-0.5">↓</span>` inside the same span) instead of as a flex sibling. Shorten headers so none needs 3 lines (see #24).

### 8. Compare: numbers are left-aligned, and the 320px label column breaks mobile — must-fix
- Page: /compare, all viewports; 390 is unusable.
- Element: `Compare.tsx` value cells `div.text-sm.tabular-nums` (left-aligned); grid `320px repeat(n, minmax(150px,1fr))`.
- What is wrong: values in a column do not line up on the decimal (2.7% under 20.2%). At 390 the label column takes the whole screen and the three facilities are off-screen to the right.
- Screenshot: `critic-compare-d.png`, `critic-zoom-compare-values.png`, `critic-m-compare.png`.
- Fix: value cells `text-right`, and the facility header cells `text-right` to match. Grid `minmax(140px,240px) repeat(n, minmax(112px,1fr))`; make the label column sticky (`sticky left-0 bg-surface z-10`) so labels stay visible while scrolling across. Wrap the page in `max-w-6xl mx-auto` like the other pages (it is currently full width, left edge at 24px vs 168px elsewhere).

### 9. Top navigation clips at 1024 and 390 — must-fix
- Page: every page; 1024 ("Methodo…" cut, collides with "CMS data as of"); 390 ("Hosp" cut; 5 of 7 items hidden with no sign there is more).
- Element: `Shell.tsx` `nav.overflow-x-auto` and `div.ml-auto.text-xs.hidden.md:block`.
- Screenshot: `critic-t-explore.png`, `critic-explore-m.png`.
- Fix: shorter labels: "Discharge flows" → "Flows", "Methodology & trust" → "Methods". Show the data-vintage text only at `xl:block` (≥1280); it is already on About. Below `md`: show brand + current page name + a "Menu" button (`btn btn-surface h-10`) that opens a full-width sheet listing all 7 links as 48px rows. Nav link height `h-9` at desktop.

### 10. Map legend runs off the screen at 390 — must-fix
- Page: /map?st=MD, 390 (overflow 37px; "special focus or abuse icon" is cut off and each label breaks one word per line).
- Element: `MapPage.tsx` legend `div.absolute.bottom-3.left-3…flex.items-center.gap-2`.
- Screenshot: `critic-m-map.png`.
- Fix: `right-3 flex-wrap gap-x-3 gap-y-1` and `whitespace-nowrap` on each item. At <md, collapse it to a "Legend" button that toggles the panel. Shorten "special focus or abuse icon" to "Flagged".

### 11. Page scrolls sideways on About → Column lineage (all widths), Measures and Verification (390) — must-fix
- Page: /about tabs. Overflow: lineage 143px at 1440, 351px at 1024, 977px at 390; measures 301px at 390; verification 126px at 390.
- Element: `About.tsx` tables, `table.w-full.text-xs`, with long unbroken file names and `code` identifiers.
- Screenshot: `critic-about-column-d.png`, `critic-about-column-m.png`, `critic-about-measures-m.png`.
- Fix: wrap each table in `<div class="overflow-x-auto">`. On file-name and `code` cells add `break-all` (or `[overflow-wrap:anywhere]`). Drop the `4pq5-n9py_2026-09-30_` hash prefix from displayed file names (the same regex as `howText` in Facility).

### 12. Controls do not share one height, font size or focus style — must-fix (system)
- Measured at 1440: `.control` input 34px at **16px** text (Filter panel, Hospitals search); the input with a `Set` button 36px; Cohorts selects 33px at 14px; Cohorts inputs 32px at 14px; `.btn-surface` 36px (it has a 1px border); `.btn-primary` 34px (no border); quiet `text-xs` buttons 30px. In the Explore toolbar, "Columns · 11" (36) sits beside "Export CSV" (34).
- Focus: `.control:focus` uses a border plus a 3px `accent-soft` box-shadow (it shows on mouse click too), while every other element uses the `:focus-visible` 2px accent outline.
- Screenshot: `critic-zoom-explore-toolbar.png`, `critic-zoom-cohorts-top.png`.
- Fix (index.css): see the control spec in section B. Every `.btn` gets `border:1px solid transparent; height:36px; display:inline-flex; align-items:center; font-size:14px; line-height:20px`. `.control` gets `height:36px; font-size:14px`. `select.control` gets `padding-right:28px`. Below 768px use 40px height and 16px font (16px stops iOS zooming into the field). Add `.btn-sm` (28px, `text-xs`) for in-row "Remove"/"Clear" and give it a 40px hit area at <md via `min-h-10`. Change `.control:focus` to `.control:focus-visible`, and keep one ring everywhere: `outline:2px solid var(--color-accent); outline-offset:2px`.

### 13. Seven type sizes per page, with orphan sizes for the same role — must-fix (system)
- Measured sizes in use: Facility 11/12/14/15/16/24/28; Hospital 11/12/14/16/18/24/28; Cohorts 10/11/12/14/16/20/28; Flows 11/12/14/16/20/24; Explore inputs at 16 next to 12px labels and 14px body.
- Same role, different size: page title 20px (`text-xl`, list pages) vs 24px (`text-2xl`, detail pages); narrative lead 15px (`text-[15px]`, Facility snapshot) vs 18px (`text-lg`, Hospital sentence); section title 16px vs 14px (Compare group titles `font-medium text-sm`, About › Limitations `h2`); stat number 28px (Stat) vs 24px (Flows); histogram labels 10–11px inside a scaled SVG (they render at 10px); `text-[9px]` captions in `QualityStrip`.
- Fix: the five-size scale in section B. Concretely: all `h1` → `.t-display` (24/32 semibold); all `h2` → `.t-title` (16/24 medium); Snapshot and Hospital sentence → `.t-lead` (16/24 regular, i.e. the title size at weight 400); Stat value → 24/32 semibold; remove `text-[15px]`, `text-lg`, `text-xl`, `text-[28px]`, `text-[9px]`, `text-[12px]` (use `text-xs`). Histogram: `font-size` in px is scaled by the viewBox, so draw axis text in HTML below the SVG or set the SVG at its real width (`width={W}` with no `w-full`).

### 14. Flows "nearby" table: columns have no padding, so numbers run together — must-fix
- Page: /flows (with lat/lng), 1440 and 1024.
- Element: the second table in `Flows.tsx`: `td.text-right.tabular-nums` with no horizontal padding. "58.5%$13,627" runs together; headers "BedsResidents/day" and "Fines 3-yr|Already a destination" collide.
- Screenshot: `critic-zoom-flows-alt-table.png`, `critic-flows-d.png`.
- Fix: apply the table spec (section B): `th, td { padding: 8px 8px }`, first cell `pl-0`, last `pr-0`. Same fix for the Destinations, Hospital and Cohorts hand-written tables, which rely on `pl-3` in some cells and nothing in others.

### 15. Star-rating filter buttons fail contrast and have an unclear selected state — must-fix
- Page: /explore, /map filter panel, all viewports.
- Element: `FilterPanel.tsx` star buttons `opacity-80 hover:opacity-100`; selected = `here ring-1 ring-ink`.
- Measured: white on q2 at 80% opacity = **3.70:1**, white on q5 at 80% = **3.86:1** (needs 4.5). Selected vs unselected differs only by a 1px ring and a 20% opacity step. They are 28px tall at 390.
- Screenshot: `critic-zoom-star-filter.png`, `critic-explore-drawer-m.png`.
- Fix: remove `opacity-80`; unselected = full color. Selected = `ring-2 ring-accent ring-offset-2 ring-offset-surface`. When any star is selected, unselected chips become `bg-well text-ink-2` (color returns on select). Height `h-9` (36px) desktop, `h-10` at <md; width `flex-1`, so the five fill the panel width.

### 16. Touch targets under 40px at 390 — must-fix
- Measured at 390: nav links 32px tall; Explore table compare checkbox hit area 13×13; state chips `h-6` (24px); star filters 28px; quiet buttons "Remove", "Clear 1", "Done", "Show all 200" 30px; "Open on Medicare Care Compare" 190×16; "Show on the map" 98×16; breadcrumb "Explore" 43×15; system links 15px tall; footnote markers ~14px; MapLibre zoom 29×29; "How this is calculated" 33px.
- Fix: at <md, every `.btn`/`.control` is 40px (#12). Table checkbox: wrap it in `<label class="w-9 h-10 flex items-center justify-center cursor-pointer">`. State grid `h-10 grid-cols-6 gap-1` at <md (`md:h-6`). Inline text links that act as actions ("Show on the map", "Open on Medicare Care Compare") become `btn btn-quiet` (40px at <md). MapLibre: `.maplibregl-ctrl-group button{width:40px;height:40px}` at <md.

### 17. Facility and Hospital narrative repeats the numbers shown in the cards right under it — should-fix
- Page: /facility/* (20.2%, 11.6%, 4 deficiencies, $306,550 in bold in the paragraph, then again as 28px numbers); /hospital/210009 (43% / 19% / 38% in bold, then again as cards).
- Screenshot: `critic-zoom-fac-header.png`, `critic-zoom-hospital-top.png`.
- What is wrong: two focal points that say the same thing; 5–6 bold runs compete with the H1.
- Fix: keep the cards as the focal point. Cut the paragraph to one sentence of facts the cards don't show (Facility: "A 2-star (poor), 140-bed for-profit nursing home in Baltimore, MD, run by Engage Healthcare (5 nursing homes)."). Remove the `<b>` runs. Hospital: keep only the first sentence (cases, ZIP codes, nursing homes) and let the 4–5★ / 3★ / 1–2★ cards carry the mix.

### 18. Staffing star rating shown twice on Facility — should-fix
- Page: /facility/*; the "Staffing" card in the star row and the "Staffing" row in the "Star ratings" section.
- Element: cards use `GROUPS[0].measures` indices 0,1,2,5; the section uses `measures.slice(3)`, which includes index 5.
- Fix: section shows `g.measures.filter((_, i) => ![0,1,2,5].includes(i))`, or move the comparison text ("State avg 3.2 · Nation 2.9") into the card note and drop the section row.

### 19. Long middle-dot meta strings in headers — should-fix
- Page: /facility/* ("For profit - Limited Liability company · 140 certified beds · 95.8 residents per day · Engage Healthcare (5 facilities) · Medicare and Medicaid · certified since 1972", which wraps to 2–4 lines); /hospital ("Acute Care Hospitals · Voluntary non-profit - Private · emergency services · Metropolitan area core: primary flow within an urbanized area of 50,000 and greater", 4 lines); PECOS box (one 4-line sentence joined with semicolons); Cohorts description line; HospitalPicker result meta.
- Fix: a key-facts row under the address: `<dl class="mt-3 grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-2">`, each `<div><dt class="text-xs text-ink-2">Beds</dt><dd class="text-sm text-ink tabular-nums">140</dd></div>`. Facility: Owner type, Beds, Residents per day, Chain, Certified since. Hospital: Type, Ownership, Emergency services, Area (short RUCA label "Urban core"). PECOS: the same `dl` (Enrolled as, Affiliation, Ownership changes since 2016, Private equity owner, REIT owner).

### 20. Explore table: one-line cells float between the two lines of the name cell — should-fix
- Page: /explore, /cohorts, all viewports.
- Element: `DataTable.tsx` row `flex items-center`; the name cell has two lines (name + "CCN …"), so "Adelphi", "MD", "170" sit on the midline between them, on no baseline.
- Screenshot: `critic-zoom-explore-row.png`.
- Fix: row `items-start`; every cell `pt-2.5 leading-5` (name cell the same); `QualityStrip` cell `pt-3`. All values then share the first-line baseline of the name.

### 21. "CCN" repeated on every row, "discharges 2024" on every row, "rehosp" on every row — should-fix (repeated labels)
- Page / element: Explore & Cohorts DataTable second line "CCN 215064"; Hospitals list "discharges 2024" under every number and "Acute Care Hospitals · CCN …" on every row; Map side list "· rehosp 17.6%" on every row; HospitalPicker chips "· CCN".
- Screenshot: `critic-hospitals-d.png`, `critic-map-d.png`, `critic-explore-md-d.png`.
- Fix: Hospitals list: add a header row (`text-xs text-ink-2 px-4 py-2 border-b border-hairline`, flex) with "Hospital", "Medicare discharges, 2024" (right) and "Rating" (right); delete the per-row "discharges 2024"; drop `hospital_type` from the meta when it equals "Acute Care Hospitals" (show only exceptions). DataTable: header "Nursing home · CCN"; second line shows the bare number (`215064`), and flags appear before it as now. Map list: name the meta once in the list header ("City · rehospitalized %"); rows show `Adelphi · 17.6%`.

### 22. Explore footer averages: long labels on two to six lines, not under their columns — should-fix
- Page: /explore at all widths (6 lines, ~130px tall at 390).
- Element: `Explore.tsx` `Footer` (`flex flex-wrap gap-x-5`), using full labels ("Potentially preventable readmissions within 30 days of SNF discharge 11.8%").
- Screenshot: `critic-explore-md-d.png`, `critic-explore-m.png`.
- Fix: render it as a sticky last row inside `DataTable` (`sticky bottom-0 bg-surface border-t border-hairline`, same widths as the columns). "Average" sits in the name column and each mean sits under its own column, right-aligned, `text-sm font-medium tabular-nums`. No labels are needed. At 390 it scrolls with the table.

### 23. Stars column header does not line up with the four chips — should-fix
- Page: /explore, /cohorts, /hospital (SNF table), /flows, /map list, /compare.
- Element: `STRIP_HEADER` / DataTable header "Stars / overall · inspection · quality · staffing". It wraps to 3 lines in a 150px column; on Hospital and Flows it is one 11px line ("Stars: overall · inspection · quality · staffing"); on Compare it sits in the corner cell. The words never sit over the chips they name.
- Fix: one component `StripHeader` that renders four `w-7 text-center text-[11px] leading-4 text-ink-2` labels "All", "Insp", "Qual", "Staff", using the same `gap-1` and chip width as `QualityStrip size="sm"` (make the sm chip `w-7`, not `min-w-7`), and `title` on each label for the full word. Use it in every table header.

### 24. The same measure has five different names across the app; codes in labels — should-fix (copy)
- Short-stay rehospitalization appears as: "Rehospitalized % (QM 521)" (Explore header), "Rehosp. %" (Hospital, Flows tables), "rehosp" (Map list), "Short-stay residents rehospitalized" (Facility card), "short-stay rehospitalization" (Flows strip), "Rehospitalized" (Hospital card note). Fines appear as "Fines $ (3 yr)", "Fines 3-yr", "Fines, 3 years", "Total fines", "Avg fines 3-yr". The averages label appears as "MD average" (Stat notes), "State avg" (measure rows), "state average" (star cards), "nation" / "Nation" / "National".
- Fix: one `short` label per measure in `lib/measures.ts`, used by every table: "Rehospitalized %", "Readmitted %", "Back home %", "Fines, 3 yr", "Harm citations". Move codes (QM 521, QRP 004) out of labels into the `title` tooltip and the About › Measures tab. One comparison phrase everywhere: "{ST} avg {v} · US avg {v}".

### 25. Terminology: SNF / facility / nursing home mixed — should-fix (copy)
- Count of visible text across the 1440 pages: "facility/facilities" 132, "SNF(s)" 95, "nursing home(s)" 44. Even single screens mix all three (Hospital page: 9 / 12 / 12; Cohorts: 7 / 10 / 4). Example: "Explore SNFs in this service area" button above "Nursing homes in the service area" section with a "Facility" column.
- Fix: use "nursing home" in all UI copy, headers and buttons (plain English). Keep "SNF" only inside proper names (product name, "SNF VBP", "SNF Quality Reporting Program"). "Facility" is allowed only in CMS-quoted text. Examples: "Explore nursing homes in this service area", column header "Nursing home", "221 nursing homes".

### 26. Hand-written tables do not follow one header spec, are not sortable, and treat empty cells four ways — should-fix (system)
- Headers measured: DataTable 12px/400 ink-2 (sorted 12px/600 ink); Hospital, Flows and Cohorts tables 11px/400 ink-3; About › Lineage 12px/400 ink-3; Cohorts "By state" mixes both. Header labels: "Group" (should name the breakdown), lowercase "with value".
- Empty cells: blank (Explore "Special focus", Flows "Rehosp." for Little Sisters, Hospital "Beds"/"Fines"), "–" (unrated stars, Hospital "Medicare stays"), "none" (Service area "Nursing homes in ZIP"), "n/a" (Hospital card notes), "fn 9" (suppressed).
- Hospital "Nursing homes in the service area" (209 rows) and Flows tables cannot be sorted, while Explore and Cohorts can.
- Fix: one `<Th numeric sortable>` / `<Td numeric>` pair in `ui.tsx` implementing the table spec in section B, used by all five hand-written tables. Empty-cell rule: `—` in `text-ink-3`, with `title="Not reported"`; CMS-suppressed → the `Fn` marker; true zero → `0`. Rename "Group" → the chosen breakdown ("State", "Chain"…), "with value" → "With a value". Make the Hospital SNF table sortable by modeled share, stars, rehospitalized % and fines (reuse `DataTable` with `showShare`).

### 27. Section gaps, panel padding and page widths vary page to page — should-fix (system)
- Section gap: Facility `mt-8` (32), Hospital `mt-8` then `mt-6` (24), Cohorts `mt-4` (16), Flows `mt-6`; card rows `mt-5`, `mt-3`, `mt-4`.
- Panel padding: Stat and star cards `p-4` (16); sections `px-5 py-4` (20/16). So card text and section text start 4px apart on the same page (184 vs 188 on Facility at 1440) — the left edges don't line up.
- Page frame: Facility, Hospital, Cohorts, Flows `max-w-6xl`; Hospitals and About `max-w-5xl` (left edge 232); Compare full width (left edge 24).
- Fix: tokens in section B: `--space-section: 24px` (`mt-6`) between every top-level block; `--space-row: 16px` (`gap-4`, `mt-4`) between card rows and between cards; panel padding `p-4 md:p-6` for both cards and sections, so all inner left edges match. One frame: `.page { max-width: 72rem; margin-inline: auto; padding: 24px 16px }` and `md:px-6` on every non-full-bleed page, including Hospitals, About and Compare.

### 28. Cohorts: the description line repeats the controls; the condition columns don't line up — should-fix
- Page: /cohorts, all viewports.
- Element: `{conds.map(describe).join(' · ')}` under the rows ("Overall star rating is any of 4,5 · State equals MD") — it says exactly what the controls show. Condition rows use `flex flex-wrap`, so the value field sits at x=625 on row 1 and x=641 on row 2 (operator select widths differ). At 390, "Add condition" wraps to 2 lines and "all must be true" to 2 lines.
- Screenshot: `critic-zoom-cohorts-top.png`, `critic-m-cohorts.png`.
- Fix: delete the describe line. Rows use `grid grid-cols-[minmax(0,20rem)_9rem_9rem_auto] gap-2 items-center` (desktop) and `grid-cols-2` at <md (field spans 2). "Add condition" gets `whitespace-nowrap`. Put "all must be true" under the title as `text-xs text-ink-2`, not beside it. "Break down by": remove `ml-2` and use a `gap-x-6` group, so the label starts at the left edge when it wraps.

### 29. Cohorts histogram: accent blue used as a data color; half the card empty; jargon labels — should-fix
- Element: `Histogram` fill `var(--color-accent)` at 0.75 opacity; SVG `max-w-3xl` inside a full-width card; labels "p10 13.5%", "p50", "p90"; legend string "cohort filled · all facilities outlined · dashed = cohort 10th / median / 90th percentile".
- Screenshot: `critic-zoom-cohorts-top.png`.
- Fix: add `--color-data: #475467` (ink-2) and use it for the cohort bars; accent stays for interaction only. SVG `w-full` (drop `max-w-3xl`) with `preserveAspectRatio="none"` on the bars group, or a viewBox at the card's width. Labels: "Low 10%: 13.5%", "Median 20.0%", "High 10%: 25.4%". Legend: two swatches, "This cohort" and "All nursing homes" (drop the dashed explanation; the labels say it).

### 30. Selected state has four different looks — should-fix (system)
- Top nav = `bg-well`; Segmented and the Hospital tier filter = white pill with shadow on well; About tabs = 2px ink underline; state chips and system-state chips = solid accent; star filter = 1px ink ring; checkboxes `accent-ink` (black) while every other selection is blue.
- Fix: two idioms only. **Place** (top nav, About tabs): `bg-well text-ink font-medium` pill; About tabs use the `Segmented` component or the nav pill, plus `role="tablist"`/`role="tab"`/`aria-selected`. **Choice** (chips, toggles, checkboxes): accent — `bg-accent text-white` for chips, `accent-[var(--color-accent)]` on every checkbox (replace all `accent-ink`), `ring-2 ring-accent` for color-coded star chips. Segmented controls keep their pill style (it is a choice within a group).

### 31. Decorative and duplicate colors — should-fix
- `#dc6803` (orange) is hard-coded for "average" in `Stat` tone bars and Flows bars, while "average" is `--color-q3` `#fedf89` everywhere else. Same meaning, two colors.
- `Stat` tone bar: orange under "20.2% · 0.8 pts better than state" — the `tone()` threshold (5% relative) and `Delta` (rounded difference) disagree, so the bar signals "average" while the text says "better".
- `Stat` source dot: Modeled = accent blue, CMS = ink-3, Derived = ink-2. The interaction color carries a data meaning, and a dot next to a word adds nothing.
- Hard-coded `#fafbfb`, `#c2c9d2`, `#dbe4ff`, `#e9edec`, `#111827`/`#b42318` in map strokes: they should be tokens.
- Fix: remove the tone bar from `Stat` (the Delta words carry the verdict). If a bar is kept for the 4–5★/3★/1–2★ cards, it is a proportion bar using `--color-q5`/`--color-q3`/`--color-q2` on `bg-well`, as Flows does. Add tokens `--color-hairline-strong: #c2c9d2`, `--color-surface-hover: #fafbfb`, `--color-selection: #dbe4ff` and use them. Remove the source dots (#4).

### 32. Contrast: ink-3 on the well background — should-fix
- Measured 4.39:1 (`#667085` on `#eef1f4`): the unrated "–" chip in `Stars`; the "3" compare count in the active nav pill (`text-ink-3` on `bg-well`). ink-3 on paper is 4.59 (passes, barely).
- Fix: text on `bg-well` uses `text-ink-2` (7.0:1+). Rule: ink-3 only on surface (white).

### 33. Mobile filter drawer: no scrim, tiny Done, count hidden at the bottom — should-fix
- Page: /explore and /map at 390, Filters open.
- Element: `FilterPanel.tsx` `aside.absolute…w-72`. The table stays fully visible and clickable in the 102px beside the drawer. "Done" is `text-xs` 30px. The result count is the last line of a long scroll.
- Screenshot: `critic-explore-drawer-m.png`.
- Fix: full-width sheet at <md (`inset-0 w-full`), or keep w-72 and add a scrim `fixed inset-0 bg-ink/30` that closes on tap. Replace "Done" with a sticky footer `sticky bottom-0 bg-surface border-t border-hairline p-4` holding one `btn btn-primary w-full h-10` "Show 221 nursing homes". Remove the bottom "221 facilities match" line on desktop (`md:hidden`), because the toolbar already shows the count.

### 34. Filter panel helper text explains what the controls show — should-fix (clutter)
- Element: "Keeps SNFs located in the ZIP codes the hospital's Medicare patients come from (modeled layer; see Hospitals)."; "Sends the place you type to OpenStreetMap's lookup service. Or drop a pin on the Map."; HospitalPicker "A system is a PECOS owner organization (5%-or-greater…)"; "Keep the states you want, then add."
- Fix: delete all four. Move the privacy note about OpenStreetMap to the input's `title` and to About (it is already there). Change the label "In a hospital's service area" to "Near a hospital's patients (modeled)". Placeholders that are cut off ("e.g. Genesis, Baltimore, 21…", "Address, hospital or…") → "Name, city or CCN" and "Address or city".

### 35. HospitalPicker chip: the CCN breaks onto its own line; "Remove" is off the name's baseline — should-fix
- Page: /explore?h=210009, 1440.
- Element: chosen-hospital `li.flex.items-start` with `span.text-[11px]` "Baltimore, MD · CCN" / "210009".
- Screenshot: `critic-zoom-explore-hosp-chip.png`.
- Fix: `li` → `items-center`; meta `whitespace-nowrap truncate`; drop "CCN" (show `Baltimore, MD`); Remove → an icon button "×" (`btn-sm`, `aria-label`).

### 36. Compare: ties all bold, stars as text, no sticky header — should-fix
- Element: `Compare.tsx`. When all three are $0 or 0, all three are bold, so bold carries no meaning (≈25 rows). Star ratings render as "2★" text, while everywhere else they are colored `Stars` chips. Facility names scroll away on a 3,400px page. The corner cell holds helper text and the strip header.
- Screenshot: `critic-compare-d.png`.
- Fix: bold only when exactly one value equals `best` (`vals.filter(v => v === best).length === 1`). Rows with `m.unit === 'stars'` render `<Stars value size="sm" />`, right-aligned. Header row `sticky top-[52px] bg-surface z-10`. Corner cell: delete the text; put "Bold = best of the group" once in a caption under the page title (`text-xs text-ink-2`).

### 37. Map: no count or list on phones and tablets below 1024 — should-fix
- Element: `aside.hidden.lg:block` holds both the list and the only result count.
- Fix: at <lg show a floating count chip in the top bar ("221 nursing homes", same `bg-surface here rounded-[6px] h-9 px-3` as the other chips). Add a "List" button that opens the list as a bottom sheet (max-h 60dvh).

### 38. Export CSV is primary on Explore, secondary on Cohorts — should-fix
- Fix: Export is a secondary action on both (`btn-surface`). The filled button is reserved for the screen's main forward action (Hospital "Explore nursing homes…", Facility "Add to compare", Flows "Upload CSV"). Explore then has no filled button, which is fine. Also fix the two places where two filled buttons show at once: the Columns popover "Done" (make it `btn-surface`, or remove it — Escape and outside-click close it) and HospitalPicker "Add N hospitals" next to Explore's Export.

### 39. Readmission card "1 / 6 / 3 — better / same / worse" — should-fix
- Page: /hospital/210009.
- Fix: value = the count worse than national ("3"), unit "of 10 worse than national", note "1 better · 6 no different". Or show three mini-values with their own captions in one card (`grid grid-cols-3`, each `text-2xl` + `text-xs` caption).

### 40. Link styles differ for the same role — should-fix
- "Show on the map" and system links: accent with underline on hover. "Open on Medicare Care Compare": ink-2, `text-xs`. Table facility links: ink, accent and underline on hover (Explore, Hospital) vs ink and underline only (Flows, Compare). Breadcrumbs: ink-3, underline on hover, and the state segment is not a link.
- Fix: `.link { color: var(--color-accent); text-underline-offset: 2px } .link:hover { text-decoration: underline }` for inline links. Table name links: `text-ink hover:text-accent hover:underline` everywhere (add `hover:text-accent` in Flows and Compare). Breadcrumb state → `<Link to={/explore?st=MD}>`.

### 41. Hospitals search: the rating column has no header and the page is narrower than its siblings — should-fix
- Covered in #21 (header row) and #27 (frame). Also: the input `autoFocus` shows the focus ring on load — keep it, but with the unified ring (#12).

### 42. Flows intro and upload panel: long jargon text in three places — should-fix
- Element: a 5-line intro ("the schema is fixed so real data drops in without any rework"); a right-floating helper that wraps under the buttons at 1024; a "Columns:" code line.
- Screenshot: `critic-t-flows-cards.png`, `critic-m-flows.png`.
- Fix: intro → one sentence: "Upload your hospital's discharge counts to see how much of its volume goes to high- and low-rated nursing homes. Without an upload, the Hospitals pages show a modeled view." Upload panel: buttons on row 1; one `text-xs text-ink-2` line on row 2: "Counts only, no patient records. Stays in this browser until you remove it." Put the column list inside the template download (it already is) and in a `<details>` "File format".

### 43. Reduced motion not respected by the map — should-fix
- Element: `MapPage.tsx` `fitBounds(..., { duration: 500 })` runs on first load (no user action) and on every filter change, whatever the OS setting.
- Fix: `const dur = matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 400` and pass `duration: dur`. Skip the animation on the first fit (`duration: 0` when `!hadData`).

### 44. Facility measure rows: value floats mid-block on mobile; code orphans on desktop — polish
- Element: `MeasureRow` grid `grid-cols-[1fr_auto]` (mobile) centers the value across the label plus the comparison lines; desktop `1fr_120px_1fr_200px` wraps "(QM 522)" onto its own line.
- Fix: `items-start`, value `pt-0.5`; desktop `grid-cols-[minmax(0,1.4fr)_96px_minmax(0,1fr)_200px]`; codes moved out of labels (#24). Comparison text `text-xs` (12px), not `text-[11px]`.

### 45. Missing `.press` on row links — polish
- Hospitals list rows, Map list rows, DataTable name links, HospitalPicker chosen list and Check labels give no pressed feedback (measured: buttons are all `.press`; these links are not). MapLibre zoom buttons also lack it.
- Fix: add `press` to the row `Link`s (`Hospitals.tsx` list, `MapPage.tsx` list) and use `active:bg-well` for rows (scale on a full-width row looks wrong): `.press-row:active { background: var(--color-well) }`.

### 46. Six radii in use — polish
- `rounded` (4), `rounded-[5px]`, `rounded-[6px]`, `rounded-[8px]`, `rounded-[10px]`, `rounded-full`.
- Fix: three tokens: `--radius-chip: 4px` (stars, flags, state chips), `--radius-control: 6px` (inputs, buttons, segmented outer; inner pill 4px), `--radius-panel: 10px` (cards, sections, popovers, the PECOS box, map chips). Replace every `rounded-[5px]` and `rounded-[8px]`.

### 47. Panel depth uses three treatments — polish
- Stat and star cards: inline `boxShadow: 0 1px 0 rgba(16,24,40,.04)`; sections: none; map chips: `.here` shadow; the PECOS box: `bg-well`.
- Fix: panels = surface on paper, no shadow, no border. `.here` only on floating things (map chips, popovers, the segmented thumb).

### 48. Explore with one state chosen still shows a State column of "MD" on every row — polish
- Fix: hide the `state` column when `f.states.length === 1` (and the `city` column when a radius under 5 mi is set), or let the Columns picker show it greyed out.

### 49. Mobile Explore table: names scroll away — polish
- Fix: sticky checkbox and name columns in `DataTable` (`sticky left-0 bg-surface z-[5]` on the first two cells and their headers; name column 200px at <md instead of 300).

### 50. Copy polish
- CMS strings shown in Title Case: "No Different than the National Rate", "Worse than the National Rate", "Acute Care Hospitals", "Limited Liability company". Sentence-case them at display ("No different from the national rate").
- "Methodology & trust" → "Methods". "Columns · 11" → "Columns (11)". "Clear 1" → "Clear". "p25 / p75" → "middle half 16.7–23.2%".
- About › Limitations `h2` is 14px; other section titles are 16px (#13).
- Explore and Map have no `h1`; add a visually hidden `<h1 class="sr-only">Explore nursing homes</h1>`.

---

## B. System recommendations (to enforce everywhere)

Add these to `src/index.css` and replace page-level one-offs. Each finding above names the class it should use.

### B1. Type scale — five sizes only
```css
@theme static {
  --text-caption: 11px;  --text-caption--line-height: 16px;   /* chips, table second line, footnote markers */
  --text-label:   12px;  --text-label--line-height: 16px;     /* card labels, table headers, notes, helper */
  --text-body:    14px;  --text-body--line-height: 20px;      /* body, table cells, controls, buttons */
  --text-title:   16px;  --text-title--line-height: 24px;     /* section titles (500), lead paragraph (400) */
  --text-display: 24px;  --text-display--line-height: 32px;   /* page title (600), stat value (600, tabular) */
}
.t-caption { font-size: 11px; line-height: 16px; color: var(--color-ink-3); }
.t-label   { font-size: 12px; line-height: 16px; color: var(--color-ink-2); }
.t-body    { font-size: 14px; line-height: 20px; color: var(--color-ink); }
.t-title   { font-size: 16px; line-height: 24px; font-weight: 500; color: var(--color-ink); }
.t-lead    { font-size: 16px; line-height: 24px; font-weight: 400; color: var(--color-ink); max-width: 48rem; }
.t-display { font-size: 24px; line-height: 32px; font-weight: 600; letter-spacing: -0.01em; color: var(--color-ink); }
.t-num     { font-variant-numeric: tabular-nums; }
```
Weights: 400 body, 500 titles/labels that need emphasis, 600 page title, stat values and sorted header only. No 700 (`<b>`) in running text. Banned after the change: `text-[9px] text-[10px] text-[12px] text-[15px] text-[28px] text-lg text-xl text-2xl`. Controls are 16px only below 768px (iOS zoom).

### B2. Spacing scale — 8-pt, 4 for micro
```css
@theme static {
  --space-1: 4px;   /* micro: label↔value inside a row, chip gaps */
  --space-2: 8px;   /* label→value in a card, title→blurb, cell padding */
  --space-3: 16px;  /* card padding (mobile), gap between cards and card rows, header→body in a panel */
  --space-4: 24px;  /* panel padding (≥md), gap between sections, page top padding */
  --space-5: 32px;  /* page title block → first content */
  --space-6: 48px;  /* page bottom padding */
}
.page    { max-width: 72rem; margin-inline: auto; padding: 24px 16px 48px; }
@media (min-width: 768px) { .page { padding-inline: 24px; } }
.stack-section > * + * { margin-top: 24px; }   /* between top-level blocks */
.stack-row     > * + * { margin-top: 16px; }   /* between card rows */
```
Retire `mt-5`, `mt-3`, `mt-8` between sections, `px-5`, `py-2.5`, `gap-3`, `gap-1.5`, `gap-2.5`, `mb-1.5`. The only 12px/20px values allowed are line-heights.

### B3. Controls
```css
.control, .btn { height: 36px; border-radius: var(--radius-control); border: 1px solid transparent;
  font-size: 14px; line-height: 20px; display: inline-flex; align-items: center; gap: 6px; }
.control { background: var(--color-surface); border-color: var(--color-hairline); padding: 0 10px; }
select.control { padding-right: 28px; }
.btn { padding: 0 12px; font-weight: 500; justify-content: center; white-space: nowrap; }
.btn-primary { background: var(--color-accent); border-color: var(--color-accent); color: #fff; }
.btn-surface { background: var(--color-surface); border-color: var(--color-hairline); }
.btn-quiet   { background: transparent; color: var(--color-ink-2); }
.btn-sm      { height: 28px; padding: 0 8px; font-size: 12px; }
.btn:disabled, .control:disabled { opacity: .45; cursor: not-allowed; }
.control:hover, .btn-surface:hover { border-color: var(--color-hairline-strong); }
:focus-visible, .control:focus-visible { outline: 2px solid var(--color-accent); outline-offset: 2px; }
@media (max-width: 767px) { .control, .btn { height: 40px; font-size: 16px; } .btn-sm { min-height: 40px; } }
```
Every interactive element has `.press` (buttons, chips) or `.press-row` (full-width rows). One filled button per screen.

### B4. Table header and cell spec (DataTable and every hand-written table)
```css
.tbl            { width: 100%; font-size: 14px; line-height: 20px; font-variant-numeric: tabular-nums; }
.tbl th         { font-size: 12px; line-height: 16px; font-weight: 500; color: var(--color-ink-2);
                  text-align: left; vertical-align: bottom; padding: 8px; border-bottom: 1px solid var(--color-hairline);
                  white-space: normal; }                /* max 2 lines; header copy must fit */
.tbl th[aria-sort="ascending"], .tbl th[aria-sort="descending"] { color: var(--color-ink); font-weight: 600; }
.tbl td         { padding: 10px 8px; vertical-align: top; border-top: 1px solid color-mix(in srgb, var(--color-hairline) 60%, transparent); }
.tbl th:first-child, .tbl td:first-child { padding-left: 0; }
.tbl th:last-child,  .tbl td:last-child  { padding-right: 0; }
.tbl .num       { text-align: right; }                  /* both th and td */
.tbl .sub       { display: block; font-size: 11px; line-height: 16px; color: var(--color-ink-3); }
.tbl .empty     { color: var(--color-ink-3); }          /* renders "—", title="Not reported" */
```
Rules: sentence case; no codes in headers (codes go in `title`); the sort arrow is inline after the text; truncated text always carries `title`; the empty cell is "—", a CMS suppression is the `Fn` marker, zero is "0". Row height 40 for one line and 56 for two lines (DataTable `ROW = 56` when the second line shows, or drop the CCN line and keep 40).

### B5. Card spec (Stat and every summary card)
```
.panel      background surface; radius 10px; padding 16px (<md) / 24px (≥md); no shadow; no border
.stat       = .panel, display grid, grid-template-rows: 32px 32px 32px; row-gap: 8px
  row 1     label  .t-label, line-clamp-2 (reserved 32px), ⓘ button top-right (24×24)
  row 2     value  .t-display .t-num, one line, unit in .t-body ink-2 on the same baseline (items-baseline)
  row 3     note   .t-label, line-clamp-2 (reserved 32px); verdict first, reference values second
StatRow     grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4; one caption under the row: "Source: CMS"
```
Every card in a row uses this spec, whatever its content (number, star chip, or "—"), so labels, values and notes share three baselines across the row at every width. No tone bar, no source dot, no per-card footer.

### B6. Color use
- Interaction only: `--color-accent` (links, primary button, focus, selected chips, checkboxes).
- Meaning only: rating tiers `--color-q1…q5`; danger `--color-rust` / `--color-rust-soft`; a neutral data color `--color-data` (= ink-2) for charts.
- Text: ink, ink-2, and ink-3 only on white. No hard-coded hex in components; map style colors read from `getComputedStyle(document.documentElement)`.

---

## C. Counts

| Severity | Count |
|---|---|
| must-fix | 16 |
| should-fix | 27 |
| polish | 7 |
| **Total** | **50** |

(must-fix: 1–16; should-fix: 17–43; polish: 44–50.)
