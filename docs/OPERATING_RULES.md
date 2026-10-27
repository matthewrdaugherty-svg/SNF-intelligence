# SNF Intelligence Project — Operating Rules

Every agent (human or model) working on this project reads this file first. These rules are owned by the
Lessons-Learned Manager role and change only through an entry in DECISION_LOG.md.

## 1. Trust rules (non-negotiable)
1. **No number without a source.** Every figure in any output must trace to (a) a raw CMS file + column + row key, (b) a
   computation in a script under `scripts/` with the formula visible, or (c) a URL fetched in-session. Otherwise it
   is labeled `UNVERIFIED` or omitted.
2. **No inference dressed as fact.** Industry knowledge is context, not data. If a claim comes from an agent's prior
   knowledge rather than a fetched/loaded source, it is labeled `[industry context, unverified]`.
3. **Suppressed is suppressed.** (Every column cast declares its sentinel strings — '---', 'NOT APPLICABLE', 'NO DATE PROVIDED' — and the build fails if any other non-blank value is lost; pivots handle 'Not Available' → blank and are verified by the validator.) CMS footnotes 9/10/14 etc. mean the value does not exist. Never impute, never fill
   with averages, never treat as zero. Carry the footnote code alongside the value in every output.
4. **Raw files are immutable.** `raw/` is never edited. All transformations are scripts in `scripts/`, re-runnable
   end-to-end from raw.
5. **Row-count reconciliation at every step.** Each load/join/pivot step asserts expected row counts and distinct-key
   counts and fails loudly if they differ. Expected counts live in TRUTH_LEDGER.md.
6. **Cross-file consistency checks are mandatory.** Where two CMS files report the same thing (e.g. Provider Info
   "Total Amount of Fines" vs. the sum of Penalties rows), the pipeline computes both and records the agreement rate.
   Disagreements are investigated and logged, not silently resolved.
7. **Public-source spot checks.** Before any deliverable ships, an independent validator agent (one that did not build
   the output) spot-checks a random sample of facilities against the public Care Compare website.
8. **Say what we don't know.** Every deliverable carries a "Known limitations" section. Chief among them, until
   resolved: the Care Compare data does NOT contain hospital-to-SNF discharge flows.

## 2. Data conventions
- Primary key everywhere: `ccn` (6-character string, zero-padded; never cast to integer — leading zeros matter).
- Column names in the database are snake_case; the mapping from original CMS header → snake_case is stored in
  `db/column_map.csv` and in the Excel LINEAGE sheet.
- Numeric measures are stored as DOUBLE; the original text (e.g. "Not Available") is preserved in a `_raw` or
  footnote column.
- Dates stored as DATE. CMS uses MM/DD/YYYY in some files and YYYY-MM-DD in others; conversions are asserted.
- Processing Date (2026-09-01 for the Sep 2026 refresh) is carried as `data_vintage` on `facility_master`; raw tables keep their own `processing_date` column.
- Every derived/composite score we invent is prefixed `x_` so it can never be mistaken for a CMS-published value.

## 3. Division of labor (roles, not necessarily separate processes)
| Role | Responsibility | Default model tier |
|---|---|---|
| Orchestrator | Scope, sequencing, final sign-off, talks to Matt | Top |
| Heavy Thinker | Analytical design, methodology, join logic, scoring design | Top |
| Data Engineer | Load, QC, join, pivot, lineage | Mid (execution) |
| Pattern Finder | Distributions, outliers, regional/chain patterns, seasonality | Mid |
| Actuary | Cost/utilization modeling, TCOC impact estimates, confidence intervals | Top for design, Mid for execution |
| Quality Expert | Correct interpretation of Stars, QMs, QRP, VBP; HEDIS/Stars analogies | Mid |
| Discharge-Planning Expert | Hospital→SNF placement realities, narrow-network design | Mid |
| Fact/Sanity Checker | Does the output make sense against industry benchmarks? | Mid |
| UX Engineer | App design per HIG and modern analytics UI standards | Top for design |
| Validator / Red Team | Independent verification, bug hunting, requirement audit | Top (must not have built the thing) |
| Industry Maven | External data sources, APIs, connectors | Mid (web research) |
| Lessons-Learned Manager | Owns this file, TRUTH_LEDGER.md, DECISION_LOG.md | Orchestrator |

Rule: the agent that builds a thing never validates it. Validators get the output and the raw files, not the
builder's reasoning.

## 4. Cost discipline
- Research and extraction tasks → mid-tier models with tight briefs.
- Design, methodology, and final validation → top-tier.
- No agent re-reads a 100MB+ file to answer a question that a DuckDB query answers in one line.
- Agents write results to files under `docs/` or `output/`; the orchestrator reads files, not transcripts.

## 5. Output standards
- Plain English for Matt. No jargon. Numbers with their source and vintage.
- Every workbook: a README sheet, a LINEAGE sheet (column → source file → original header), a LIMITATIONS sheet.
- Every app view: data vintage visible, footnote/suppression visible, "how computed" one click away.
