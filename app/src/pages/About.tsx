import React, { useEffect, useMemo, useState } from 'react'
import type { Reference } from '../lib/reference'
import { GROUPS } from '../lib/measures'
import { useReference } from '../components/ui'
import { PAYER_DEFAULTS, payerBaseline, payerValue } from '../lib/value'

/** The full MS-DRG → family mapping, straight from the exported table, so nobody has to trust the prose. */
function DrgMapping({ ref }: { ref: Reference }) {
  const [open, setOpen] = useState(false)
  const fams = useMemo(() => { const m = new Map<string, Reference['drgFamilies']>(); for (const r of ref.drgFamilies) m.set(r.family, [...(m.get(r.family) ?? []), r]); return [...m.entries()].sort((a, b) => a[0].localeCompare(b[0])) }, [ref])
  return (
    <div className="mt-2">
      <button className="press btn btn-quiet btn-sm" onClick={() => setOpen(o => !o)} aria-expanded={open}>{open ? 'Hide' : 'Show'} the DRG-to-family mapping ({ref.drgFamilies.length} DRGs, {fams.length} families)</button>
      {open && <div className="mt-2 max-h-[480px] overflow-auto card p-3">{fams.map(([f, rows]) => <div key={f} className="mb-3"><div className="t-label text-ink font-medium">{f} <span className="text-ink-3 font-normal">· {rows.length} DRGs</span></div><div className="t-caption">{rows.map(r => `${r.drg} ${r.title}`).join(' · ')}</div></div>)}</div>}
    </div>
  )
}

/** The Value page's sources and arithmetic, in full. Vintages come from meta.json (written by scripts/14_load_underwriting.py), so this text cannot drift from the data. */
function ValueMethods({ ref }: { ref: Reference }) {
  const u = ref.meta.underwriting
  if (!u) return <div className="mt-5 text-sm text-ink-2">The value-model data layer is not in this build.</div>
  const H = ({ children }: { children: string }) => <h2 className="font-medium mt-6">{children}</h2>
  const P = ({ children }: { children: React.ReactNode }) => <p className="mt-1 text-ink-2">{children}</p>
  const M = ({ children }: { children: string }) => <pre className="mt-2 card p-3 text-xs leading-5 whitespace-pre-wrap font-mono text-ink">{children}</pre>
  // The worked example is computed live from the same model the Value page runs (all plans, United States, base case), so it can never drift from the page.
  const [ex, setEx] = useState<{ savings: number; paid: number; share: number; expected: number; carried: number } | null>(null)
  useEffect(() => { let live = true; payerBaseline({ kind: 'us' }, '').then(b => { if (!live || !b?.rev?.pay24) return; const v = payerValue(b, PAYER_DEFAULTS, Math.round(b.members)); if (v.pctOfPayment24 != null && v.payment != null && v.carried27 != null) setEx({ savings: v.totalPmpm, paid: b.rev.pay24.base + b.rev.pay24.rebate, share: v.pctOfPayment24, expected: v.payment, carried: v.carried27 }) }).catch(() => {}); return () => { live = false } }, [])
  const usd = (n: number, d = 0) => '$' + n.toLocaleString('en-US', { minimumFractionDigits: d, maximumFractionDigits: d })
  const payYear = u.plan_payment?.year, toYear = u.ratebook_year
  const Li = ({ k, children }: { k: string; children: React.ReactNode }) => <li><b className="text-ink font-medium">{k}</b> {children}</li>
  return (
    <div className="mt-5 text-sm max-w-3xl" id="value">
      <section className="card p-4 mb-5" data-testid="plain-years">
        <h2 className="font-semibold text-ink">In plain terms: which years are compared, and how the numbers reach {toYear}</h2>
        <p className="mt-2 text-ink"><b className="font-medium">In one sentence:</b> savings and revenue are measured in the same year ({payYear}), turned into a percentage, and that percentage is applied to what the plan is expected to be paid in {toYear}.</p>
        <h3 className="font-medium text-ink mt-4">Step by step</h3>
        <ol className="mt-1 space-y-1.5 text-ink-2 list-decimal pl-5">
          <Li k="How much care members use:">{u.ma_gv_year}, the latest year the government has published for private Medicare plans.</Li>
          <Li k="What that care costs:">{u.gv_year} prices, what traditional Medicare actually paid in each market.</Li>
          <Li k="Savings:">steps 1 and 2 with the improvement assumptions applied. These are dollars in {u.gv_year} prices. They are not inflated.</Li>
          <Li k="Compared with revenue from the same year:">savings are divided by what the government actually paid those same plans in {payYear}. That gives a percentage, and both halves are {payYear}.</Li>
          <Li k={`Rolled forward to ${toYear}:`}>that percentage is applied to the plan's expected {toYear} revenue.</Li>
        </ol>
        {ex && <p className="mt-3 text-ink" data-testid="plain-example"><b className="font-medium">Example, all plans nationally, base case:</b> {usd(ex.savings, 2)} of savings per member per month ÷ {usd(ex.paid)} paid in {payYear} = {(100 * ex.share).toFixed(2)}%. Then {(100 * ex.share).toFixed(2)}% × {usd(ex.expected)} expected in {toYear} = {usd(ex.carried, 2)} per member per month.</p>}
        <h3 className="font-medium text-ink mt-4">What the {toYear} revenue is built from</h3>
        <ul className="mt-1 space-y-1.5 text-ink-2 list-disc pl-5">
          <Li k="Government payment rates:">{toYear}, by county.</Li>
          <Li k="Quality bonus:">each plan's {u.stars?.rating_year} quality rating, which is the one that sets {toYear} pay.</Li>
          <Li k="Members:">where each plan's members lived in late 2026.</Li>
          <Li k={'The plan\'s price to the government (its "bid"):'}>the average published with the {toYear} rates, unless the plan's own is entered.</Li>
          <Li k={'How sick the members are (the "risk score"):'}>{payYear}, the latest published. This is the one older number inside the {toYear} figure, and it is labelled on the page.</Li>
        </ul>
        <h3 className="font-medium text-ink mt-4">The one assumption in the roll-forward</h3>
        <p className="mt-1 text-ink-2">Savings grow at the same pace as the plan's revenue. Nothing here forecasts how much care people will use in {toYear} or what it will cost; the savings are assumed to stay the same share of revenue.</p>
        <h3 className="font-medium text-ink mt-4">What is not rolled forward</h3>
        <ul className="mt-1 space-y-1.5 text-ink-2 list-disc pl-5">
          <Li k={`Care use after ${u.ma_gv_year}.`}>It has swung too much from year to year to project.</Li>
          <Li k="Changes plans made in 2025 and 2026,">such as cutting benefits or pricing for profit. Leaving markets does show up, because 2026 membership is used.</Li>
          <Li k={`The ${u.mlr?.year} profit-and-loss filings.`}>They are shown for background only and nothing is calculated from them.</Li>
        </ul>
      </section>
      <P>The Value page is the one place in this tool that goes beyond CMS's own numbers. It keeps the two kinds of number apart: every <b className="text-ink font-medium">baseline</b> (how many stays, how many days, what they cost, what a hospital or SNF reports) is a CMS figure or a labelled model built from CMS figures; every <b className="text-ink font-medium">improvement</b> (how many readmissions are avoided, how many days are saved) is an assumption that the user sets, offered as a minimum, a base and a stretch case. No improvement figure comes from CMS, and none is presented as a forecast.</P>
      <H>Sources</H>
      <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs mt-2"><thead><tr><th>What</th><th>CMS or Census file</th><th>Period</th></tr></thead><tbody>
        <tr><td>Original Medicare use and payments by county</td><td>Medicare Geographic Variation, by National, State & County</td><td>{u.gv_year}</td></tr>
        <tr><td>Medicare Advantage use by state</td><td>Medicare Advantage Geographic Variation, National & State</td><td>{u.ma_gv_year}</td></tr>
        <tr><td>Enrollment by county: total, Original Medicare, Medicare Advantage</td><td>Medicare Monthly Enrollment</td><td>{u.enrollment_month}</td></tr>
        <tr><td>Medicare Advantage members by plan, parent organization and county</td><td>Monthly Enrollment by Contract/Plan/State/County, with the contract directory ({u.cpsc_parent_orgs} parent organizations)</td><td>{/^\d{4}-\d{2}$/.test(u.cpsc_period) ? new Date(Date.UTC(Number(u.cpsc_period.slice(0, 4)), Number(u.cpsc_period.slice(5)) - 1, 1)).toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' }) : u.cpsc_period}</td></tr>
        <tr><td>County benchmark rates, and CMS's average bid as a share of benchmark</td><td>Medicare Advantage ratebook: county rates at 0%, 3.5% and 5% bonus; employer-plan (EGWP) rates by star category</td><td>{u.ratebook_year}</td></tr>
        <tr><td>Star Ratings by contract</td><td>Star Ratings data tables, summary ratings: the {u.stars?.rating_year} ratings (CMS's July 2026 update), which set {u.stars?.payment_year} payment, and the {u.stars?.next_rating_year} ratings, which set the year after</td><td>{u.stars?.rating_year}, {u.stars?.next_rating_year}</td></tr>
        <tr><td>Enrollment by contract, for averaging a parent's ratings</td><td>Monthly Enrollment by Contract</td><td>November 2025</td></tr>
        <tr><td>What each contract reported as revenue, claims and medical loss ratio</td><td>Medicare Part C and D Medical Loss Ratio data release ({u.mlr?.contracts.toLocaleString()} contracts; single-plan and very small contracts are left out by CMS)</td><td>{u.mlr?.year}</td></tr>
        <tr><td>What CMS paid each plan, and its average risk score</td><td>Plan Payment Data, Part C plan level ({u.plan_payment?.plans.toLocaleString()} plans): the latest reconciled year</td><td>{u.plan_payment?.year}</td></tr>
        <tr><td>Average risk score by county</td><td>Shared Savings Program county-level expenditure and risk score file (assignable beneficiaries)</td><td>{u.mssp_year}</td></tr>
        <tr><td>Counties to metro areas ({u.cbsas} CBSAs)</td><td>Census Bureau / OMB core-based statistical area delineation</td><td>July 2023</td></tr>
        <tr><td>Hospital and SNF finances</td><td>Hospital Provider Cost Report; Skilled Nursing Facility Cost Report</td><td>fiscal year 2024</td></tr>
        <tr><td>Readmission penalty by hospital</td><td>IPPS final rule Table 15, Hospital Readmissions Reduction Program payment adjustment factors ({u.hrrp?.hospitals.toLocaleString()} hospitals, {u.hrrp?.penalized.toLocaleString()} penalized)</td><td>FY {u.hrrp?.fiscal_year}</td></tr>
        <tr><td>Value-based purchasing by hospital</td><td>IPPS final rule Table 16A, proxy adjustment factors (CMS replaces these with actual factors later in the year)</td><td>FY {u.vbp?.fiscal_year}</td></tr>
      </tbody></table></div>
      <P>CMS suppresses small cells in every one of these files. A suppressed value stays blank; it is never treated as zero, and the member-weighted averages leave that county out of that measure. The page states what share of the members is covered.</P>
      <H>Data years: what is mixed and what is not</H>
      <P>The files above come from different years because CMS publishes them on different schedules. Health-plan economics have moved a great deal between those years: use fell and rebounded after 2020, the risk model changed, benchmarks rose by about a sixth from {u.plan_payment?.year} to {u.ratebook_year}, and plans changed how they bid and where they operate. So the rule is that a figure from one year is never rescaled by another year's trend, and no percentage divides one year's dollars by another year's revenue. Where two years do meet, it is stated here.</P>
      <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs mt-2"><thead><tr><th>Figure</th><th>Year</th><th>How it is combined with other years</th></tr></thead><tbody>
        <tr><td>Medicare Advantage use per 1,000 (level)</td><td>{u.ma_gv_year}, by state</td><td>Used at its own observed level. The {u.gv_year} county file supplies only each county's position relative to its state, a same-year ratio. Nothing is trended forward.</td></tr>
        <tr><td>Original Medicare use and prices</td><td>{u.gv_year}</td><td>Same year for both. The "unmanaged" baseline is entirely {u.gv_year}.</td></tr>
        <tr><td>Dollar savings</td><td>{u.gv_year} prices</td><td>Stated in {u.gv_year} prices and labelled as such; not inflated to today.</td></tr>
        <tr><td>Savings as a share of plan revenue</td><td>{u.plan_payment?.year} over {u.plan_payment?.year}</td><td>Divided by what CMS paid the same plans in {u.plan_payment?.year}. The {u.ratebook_year} dollar figure is that share applied to {u.ratebook_year} payment, labelled as assuming savings keep pace with revenue.</td></tr>
        <tr><td>Members and where they live</td><td>2026</td><td>Used only as weights. Plans that left a county are gone from the weights; a plan new since {u.plan_payment?.year} has no published payment or risk score and drops out of those averages (coverage is shown).</td></tr>
        <tr><td>Benchmark, Star Rating tier, average bid</td><td>{u.ratebook_year} payment year</td><td>All three belong to the same payment year ({u.stars?.rating_year} ratings set {u.ratebook_year} payment; the bid ratio is the one in the {u.ratebook_year} ratebook).</td></tr>
        <tr><td>Risk score</td><td>{u.plan_payment?.year}</td><td>The one place a {u.plan_payment?.year} figure is multiplied by a {u.ratebook_year} one. Tagged on the page, with CMS's own estimate of the change in between; 1.0 or the user's own is one click away.</td></tr>
        <tr><td>A plan's own bid position</td><td>{u.plan_payment?.year}</td><td>Never used as it stood. Offered only as the plan's gap to that year's average, carried to today's average, and labelled an estimate.</td></tr>
        <tr><td>Medical-loss-ratio filings</td><td>{u.mlr?.year}</td><td>Shown for context. No figure is calculated from them.</td></tr>
        <tr><td>Hospital and SNF cost reports; hospital Medicare Advantage discharges</td><td>fiscal year 2024</td><td>The Medicare Advantage share of discharges uses {u.gv_year} enrollment from the same file and definition as the utilization rates, not today's enrollment.</td></tr>
        <tr><td>Hospital readmission penalty</td><td>FY {u.hrrp?.fiscal_year} rate</td><td>The FY {u.hrrp?.fiscal_year} penalty rate on fiscal-year 2024 DRG payments, labelled that way; the dollar amount at FY {u.hrrp?.fiscal_year} payment levels would be somewhat higher.</td></tr>
        <tr><td>County risk scores</td><td>{u.mssp_year}</td><td>Used only to compare a market with the nation in the same year; they do not enter any dollar figure.</td></tr>
      </tbody></table></div>
      <H>Payer: the baseline</H>
      <P>Members are weighted by county: the parent organization's visible Medicare Advantage enrollment in each county of the market (plan-county cells of 10 or fewer are hidden by CMS and are missing), or all Medicare Advantage enrollment when no organization is named. The parent filter is a plain text match on CMS's parent-organization name.</P>
      <M>{`Original Medicare rate for the market = Σ members(county) × rate(county) ÷ Σ members(county)      [counties with a published rate]
Medicare Advantage rate (MODELED)  = Σ members(county) × state MA rate × county position ÷ Σ members(county)
   state MA rate   = CMS's observed Medicare Advantage rate for that state, ${u.ma_gv_year}
   county position = the county's Original Medicare rate ÷ its state's Original Medicare rate, both ${u.gv_year}
Price per unit = Σ Original Medicare payments ÷ Σ units     (units = beneficiaries × rate ÷ 1,000; counties where both are published)
SNF cost per stay = SNF days per stay (from the chosen utilization baseline) × SNF payment per day`}</M>
      <P>CMS publishes Medicare Advantage utilization only by state and only through {u.ma_gv_year}, so the county figure is a model: the state's observed level, shaped by local Original Medicare variation. An earlier version multiplied each county's {u.gv_year} Original Medicare rate by the {u.ma_gv_year} ratio of Medicare Advantage to Original Medicare, which quietly assumed the two moved together from one year to the next; they have not (the ratio for SNF days has ranged from 0.51 to 0.62 since 2019), so that was replaced. "Unmanaged" uses the Original Medicare rates directly. The risk-adjusted comparison shown beside each rate is (market rate ÷ (market risk score ÷ national risk score)) ÷ national rate − 1; it is a benchmark for reading the market and does not enter the dollar figures.</P>
      <H>Payer: the levers</H>
      <M>{`Per 1,000 members per year (÷ 12,000 = per member per month):
Readmissions            = inpatient stays × points removed ÷ 100 × inpatient payment per stay
SNF to home health      = SNF stays × % diverted × (SNF cost per stay − home-health episode)
Shorter SNF stays       = SNF days × (1 − % diverted) × % fewer days × SNF payment per day
IRF step-down           = IRF stays × % stepped down × (IRF payment per stay − SNF cost per stay)
LTCH step-down          = LTCH stays × % stepped down × (LTCH payment per stay − SNF cost per stay)
Inpatient days          = inpatient days × % fewer × % paid per diem × inpatient payment per day
Utilization management  = the plan's own $ per member per month × 12,000
All utilization × the acuity factor; all prices × the plan's payment relative to Medicare.`}</M>
      <P>The shorter-stay lever is applied only to stays that still go to a SNF, so it does not double-count the stays sent home. The levers are otherwise added; in practice some overlap (a stay sent home cannot also be readmitted from a SNF), which is one reason to read the minimum case as the floor. Under DRG payment a shorter hospital stay saves the hospital, not the plan, so the inpatient-days lever is zero unless the plan says what share of its days are paid per diem. Quality-bonus revenue is shown but never added. The routing-evidence table is arithmetic on CMS's published SNF rehospitalization rates (QM 521), weighted by each SNF's Medicare stays, and is a ceiling, not a forecast.</P>
      <H>Payer: what CMS pays the plan</H>
      <P>Plan revenue follows CMS's own payment rules (42 CFR 422.258 and 422.266; MedPAC's Medicare Advantage payment basics). Each member is priced in their own county, at the benchmark their contract's Star Rating earns, and the sums are weighted by the plan's visible enrollment in each county and contract.</P>
      <M>{`Rating used for ${u.stars?.payment_year} payment = the contract's ${u.stars?.rating_year} Star Rating: overall rating if it offers Part D, Part C summary rating if not
Benchmark tier:  4 stars or more → the ratebook's 5% bonus rate;  below 4 → the 0% rate;  new or low-enrollment contract → the 3.5% rate
Rebate share:    4.5 stars or more → 70%;  3.5 to 4 → 65%;  below 3.5 → 50%;  new or low-enrollment contract → 65%
A contract too new to be rated takes its parent organization's average rating, weighted by November 2025 enrollment

Benchmark revenue    = risk score × benchmark at the contract's tier
Bid                  = bid ratio × benchmark            (CMS's published average for the county, or the plan's own if entered)
Base payment         = risk score × bid
Rebate               = rebate share × risk score × (benchmark − bid)
Expected CMS payment = base payment + rebate`}</M>
      <P>The ratebook already contains the benchmark caps and the doubled bonus in qualifying counties, so neither is recomputed here. The risk score is the plans' member-weighted average in CMS's {u.plan_payment?.year} payment data wherever CMS has published one, tagged as such on the page; the user can switch to 1.0 or enter their own, and 1.0 is used when CMS has published none. It turns the benchmark into revenue and never changes the savings. Payments are Part C only, before the 2% sequestration reduction; Part D payments and member premiums are not included. Two approximations are made: a parent's average rating is rounded to the nearest half star, and "the parent has no rated contract" stands in for CMS's definition of a new plan (no contract in three years). Together those contracts hold {u.stars ? (100 * (1 - u.stars.share_rated)).toFixed(1) : '–'}% of Medicare Advantage enrollment.</P>
      <P>The published risk score is {u.plan_payment ? u.ratebook_year - u.plan_payment.year : 3} years older than the benchmark. CMS's rate-announcement fact sheets give its own estimate of how the average score moves in between. The new risk model (V28: 67% of the score in 2025, all of it in 2026) and normalization take −2.45% in 2025 and −3.01% in 2026; in 2027 normalization takes −1.12% and dropping diagnoses from audio-only visits and unlinked chart reviews −1.53%: about −7.9% together. Underlying coding growth adds 3.86%, 2.10% and 2.50%: about +8.7%. For the average plan the two roughly cancel, so the score is used as published and the page shows what it would be with the model changes and no coding growth. These are industry averages; a plan's own trend can differ, which is what the "your own" entry is for.</P>
      <P>The contracts' {u.mlr?.year} medical-loss-ratio filings are shown beside the estimate for context: reported revenue (Parts C and D and premiums), hospital and medical claims, and the ratio itself. Nothing is calculated from them, because {u.mlr?.year} is not today: benefits, bids, the risk model and plan footprints have changed. The filings are contract-wide, not local, and are weighted by where the contract's members are today.</P>
      <H>Payer: reasonableness checks on plan revenue</H>
      <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs mt-2"><thead><tr><th>Check</th><th className="num">This tool</th><th className="num">Published</th><th>Source</th></tr></thead><tbody>
        <tr><td>The payment formula, applied to every county, reproduces CMS's own published employer-plan rates in all five star categories</td><td className="num">within ${u.bid_ratio?.max_error_reproducing_cms_egwp_rates_usd.toFixed(2)}</td><td className="num">to the cent</td><td>{u.ratebook_year} ratebook, {u.bid_ratio?.counties.toLocaleString()} counties</td></tr>
        <tr><td>Average {u.stars?.rating_year} overall rating, MA plans with drug coverage, November 2025 enrollment</td><td className="num">{u.stars?.check_avg_rating_2026_nov2025_weights.toFixed(2)}</td><td className="num">4.01</td><td>CMS Star Ratings fact sheet</td></tr>
        <tr><td>Average {u.stars?.next_rating_year} overall rating</td><td className="num">{u.stars?.check_avg_rating_2027.toFixed(2)}</td><td className="num">3.99</td><td>CMS Star Ratings fact sheet</td></tr>
        <tr><td>Members in contracts at 4 stars or more, {u.stars?.next_rating_year} ratings</td><td className="num">{u.stars ? (100 * u.stars.share_4plus_next_year).toFixed(0) : '–'}%</td><td className="num">about 71%</td><td>CMS Star Ratings fact sheet</td></tr>
        <tr><td>Average rebate share</td><td className="num">{u.stars?.average_rebate_pct.toFixed(1)}%</td><td className="num">65.5%</td><td>Wakely, summary of the {u.ratebook_year} rate announcement</td></tr>
        <tr><td>Average bid as a share of benchmark</td><td className="num">{u.bid_ratio ? `${(100 * u.bid_ratio.min).toFixed(1)}–${(100 * u.bid_ratio.max).toFixed(1)}%` : '–'}</td><td className="num">78%; about 76%</td><td>Wakely's assumption for {u.ratebook_year}; MedPAC 2024 (bids 82% and benchmarks 108% of Original Medicare spending)</td></tr>
        <tr><td>Rebate actually paid in {u.plan_payment?.year}, conventional plans, per member per month</td><td className="num">${u.plan_payment?.rebate_conventional_plans.toFixed(0)}</td><td className="num">$194</td><td>CMS Plan Payment Data against MedPAC's projection from bids, March 2024</td></tr>
        <tr><td>The same, including special-needs plans</td><td className="num">${u.plan_payment?.rebate_non_employer_plans.toFixed(0)}</td><td className="num">$209</td><td>as above</td></tr>
        <tr><td>Growth from what CMS paid in {u.plan_payment?.year} to the {u.ratebook_year} estimate, all plans</td><td className="num">about +18%</td><td className="num">about +17%</td><td>CMS's expected average change in revenue, compounded: +3.70% for 2025; +5.06% and 2.10% coding trend for 2026; +2.48% and 2.50% for 2027</td></tr>
        <tr><td>CMS payment per member per month in the {u.mlr?.year} medical-loss-ratio filings, against {u.plan_payment?.year} payment data</td><td className="num">${u.mlr?.ma_payment_pmpm.toFixed(0)}</td><td className="num">${u.plan_payment ? (u.plan_payment.average_base_payment_pmpm + u.plan_payment.average_rebate_pmpm).toFixed(0) : '–'}</td><td>two separate CMS files, a year apart</td></tr>
        <tr><td>Members at 4 stars or more and average rating for Humana, {u.stars?.next_rating_year} ratings</td><td className="num">95%, 4.18</td><td className="num">95%, 4.17</td><td>Humana's third-quarter 2026 earnings call</td></tr>
        <tr><td>Inpatient and post-acute spend in this model ({u.ma_gv_year} use at {u.gv_year} prices), as a share of the hospital and medical claims plans reported for {u.mlr?.year}</td><td className="num">{u.mlr ? 'about 38%' : '–'}</td><td className="num">–</td><td>a rough cross-year check only (${u.mlr?.ab_claims_pmpm.toFixed(0)} per member per month in the filings); no published figure to compare</td></tr>
      </tbody></table></div>
      <P>For all Medicare Advantage members nationally, the model's {u.ratebook_year} payment at the plans' published average risk score comes to about $1,414 per member per month with a $223 rebate. MedPAC's March 2026 report puts 2026 payments at $16,242 per enrollee per year ($1,354 a month) with an average rebate of $222 for non-employer plans, and Wakely expects plan revenue to rise about 2% in {u.ratebook_year}. The remaining gap of two to three percent is within what the three-year-old risk scores can explain. A single plan can sit well away from the national average bid: the page shows what CMS actually paid the chosen plans in {u.plan_payment?.year} beside the estimate, and the bid those payments imply.</P>
      <H>Hospital</H>
      <M>{`Medicare Advantage discharges (MODELED) = Original Medicare discharges × county MA ÷ Original Medicare enrollment × state MA inpatient ratio
SNF-bound discharges (MODELED) = discharges × 18.7% × (county SNF stays per inpatient stay ÷ national)      [MA also × state SNF ratio ÷ state inpatient ratio]
Cost per day    = inpatient charges × cost-to-charge ratio ÷ inpatient days     (operating expense × inpatient share of charges when no ratio is reported)
Revenue per day = net patient revenue × inpatient share of charges ÷ inpatient days
Value of a freed day = (1 − backfill) × variable share × cost per day + backfill × (revenue per day − variable share × cost per day)
Excess days            = SNF-bound discharges × days saved × value of a freed day
Readmission penalty    = Σ DRG payments × (1 − FY ${u.hrrp?.fiscal_year} adjustment factor) × % removed
Value-based purchasing = DRG payments of hospitals in the program × 2% × % earned back
At-risk readmissions   = (Original Medicare + MA discharges) × % at risk × points ÷ 100 × Medicare payment per stay
Case management        = SNF-bound discharges × hours saved × cost per hour`}</M>
      <P>18.7% is MedPAC's national share of Original Medicare hospital discharges that go to a SNF, the same figure the Scenarios page uses. Cost-report amounts are annualized (× 365 ÷ days in the reporting period). A hospital's cost report is left out, not adjusted, when occupancy is above 105% or cost per day falls outside $300–$20,000. Maryland hospitals are in neither payment program and those levers are zero for them. Under DRG payment a readmission is paid for, so avoided readmissions count for a hospital only on the share of patients it is financially at risk for, which the user enters.</P>
      <H>SNF</H>
      <M>{`Empty bed-days = bed-days available − patient days
Added days     = empty bed-days × % filled;  Medicare days = added × Medicare share;  Medicaid/other days = the rest
Medicare revenue per day     = Medicare Part A (inpatient PPS) amount ÷ Original Medicare days
Non-Medicare revenue per day = (net patient revenue − Part A amount) ÷ (patient days − Original Medicare days)      [the default Medicaid rate]
Filled beds  = Medicare days × Medicare revenue per day × payment factor + Medicaid/other days × Medicaid rate − added days × cost per day × variable share
Intake time  = admissions × hours saved × cost per hour
Medicaid days one Medicare day carries = (Medicare revenue per day × payment factor − cost per day) ÷ (cost per day − Medicaid rate)      [at full cost]`}</M>
      <P>A SNF cost report is left out, not adjusted, when occupancy is outside 10–102%, operating expense is more than twice or less than half of patient revenue (which usually means the report covers more than the nursing facility), or it has no Medicare Part A revenue; about 96% of reports pass. Placement moves patients between SNFs and does not create them, so the SNF figure is a gain for the chosen facilities, not for a market as a whole.</P>
      <H>Checks</H>
      <P>An independent replica (scripts/verify/value_indep.py, written in pandas and sharing no query with the app) recomputes all three tabs for a set of fixed selections, and the automated tests compare the page with it lever by lever.</P>
    </div>
  )
}

export default function About() {
  const ref = useReference()
  const [tab, setTab] = useState<'overview' | 'measures' | 'lineage' | 'footnotes' | 'limits' | 'value' | 'checks'>(typeof location !== 'undefined' && location.hash === '#value' ? 'value' : 'overview')
  if (!ref) return <div className="p-8 text-sm text-ink-2">Loading…</div>
  const tabs = [['overview', 'Overview'], ['measures', 'Measures and direction'], ['lineage', 'Column lineage'], ['footnotes', 'Footnote codes'], ['limits', 'Limitations'], ['value', 'Value model'], ['checks', 'Verification']] as const
  return (
    <div className="page">
      <h1>Methodology & trust</h1>
      <p className="text-sm text-ink-2 mt-1 max-w-3xl">Every number in this app comes from a CMS file, unchanged, or from a count or sum of CMS rows whose rule is written down here. Nothing is estimated or filled in. Where CMS suppressed a value, it is blank and carries CMS's footnote. The one exception is the Value page: its baselines follow the same rule, but its improvement percentages are assumptions the user sets, labelled as such (see the Value model tab).</p>
      <div className="flex gap-1 mt-5 border-b border-hairline overflow-x-auto whitespace-nowrap">
        {tabs.map(([k, l]) => <button key={k} onClick={() => setTab(k)} className={`press px-3 py-2 text-sm -mb-px border-b-2 ${tab === k ? 'border-ink text-ink font-medium' : 'border-transparent text-ink-2 hover:text-ink'}`}>{l}</button>)}
      </div>

      {tab === 'overview' && (
        <div className="mt-5 grid grid-cols-[180px_1fr] gap-x-6 gap-y-3 text-sm max-w-3xl">
          <div className="text-ink-2">Data</div><div>CMS Care Compare nursing-home files (processing date {ref.meta.data_vintage}), the SNF Quality Reporting Program provider file, and the SNF Value-Based Purchasing FY2026 facility file. Release: {ref.meta.release}.</div>
          <div className="text-ink-2">Facilities</div><div>{ref.meta.n_facilities.toLocaleString()} — every nursing home in the CMS Provider Information file. Hospital swing-bed units are not included.</div>
          <div className="text-ink-2">“Last 12 months”</div><div>On or after {ref.meta.window_12m_start}, which is CMS's own most-recent-12-month window for this release.</div>
          <div className="text-ink-2">State and national averages</div><div>Taken from CMS's State/US Averages file. They are simple, unweighted averages of facility values, which we confirmed by recomputing them from the facility rows (they match to the published precision).</div>
          <div className="text-ink-2">Severity letters</div><div>CMS scope-and-severity grid A–L. We label G–I “actual harm” and J–L “immediate jeopardy”. The CMS data dictionary confirms “G or greater” means harm; the full grid is defined in the CMS Five-Star Technical Users' Guide, which this project has not yet independently fetched.</div>
          <div className="text-ink-2">Derived columns</div><div>Only one: the VBP net Part A payment change, which is (incentive multiplier − 1) × 100. It is labelled “derived” wherever it appears.</div>
          <div className="text-ink-2">What is not here</div><div>Hospital-to-SNF discharge flows (CMS does not publish them), Medicare Advantage and Medicaid contract rates, complaints filed or substantiated. Dollar figures and payer mix appear only on the Value page, from CMS cost reports and payment files. See Limitations.</div>
          <div className="text-ink-2">Built</div><div>{ref.meta.built}. The database runs inside your browser, so filters, searches and anything you upload on Discharge flows stay on your machine (uploads are kept in this browser's storage until you remove them). Two optional features contact outside services: the place lookup sends the address you type to OpenStreetMap's Nominatim service, and the Map loads its street basemap from OpenFreeMap.</div>
        </div>
      )}

      {tab === 'measures' && (
        <div className="mt-5 text-sm">
          <p className="text-ink-2 max-w-3xl mb-4">“Better” and “worse” in this app follow our reading of each measure's description (lower is better for harms, costs and readmissions; higher is better for vaccinations, function and discharge to community). This is an interpretation, not a CMS value, and is pending sign-off by the project's quality reviewer.</p>
          {GROUPS.map(g => (
            <div key={g.id} className="mb-4">
              <div className="font-medium">{g.title}</div>
              {g.blurb && <div className="text-xs text-ink-2 mb-1">{g.blurb}</div>}
              <div className="overflow-x-auto"><table className="tbl tbl-compact"><tbody>
                {g.measures.map(m => {
                  const cat = ref.catalog.find(c => c.master_column === m.key)
                  return <tr key={m.key}><td className="w-1/2 [overflow-wrap:anywhere]">{m.label}</td><td className="text-ink-2 text-xs whitespace-nowrap">{m.direction === 'none' ? 'no direction' : m.direction === 'lower' ? 'lower is better' : 'higher is better'}</td><td className="text-ink-3 text-xs [overflow-wrap:anywhere]">{cat ? `${cat.source} ${cat.measure_code} · ${cat.period}` : ''}<code className="ml-2">{m.key}</code></td></tr>
                })}
              </tbody></table></div>
            </div>
          ))}
        </div>
      )}

      {tab === 'lineage' && (
        <div className="mt-5 text-sm">
          <p className="text-ink-2 max-w-3xl mb-3">Each column in the facility table, the CMS file and header it came from, and how it was derived.</p>
          <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs"><thead><tr><th>Column</th><th>Database name</th><th>CMS file</th><th>CMS header / rule</th></tr></thead><tbody>
            {ref.lineage.map((l, i) => <tr key={i}><td className="[overflow-wrap:anywhere]">{l['Facility_Master header']}</td><td className="text-ink-2 [overflow-wrap:anywhere]"><code>{l['db column']}</code></td><td className="text-ink-2 [overflow-wrap:anywhere]">{l.source_file.replace(/^[a-z0-9]{4}-[a-z0-9]{4}_\d{4}-\d{2}-\d{2}_/, '')}</td><td className="text-ink-2 [overflow-wrap:anywhere]">{l.original_header}{l.how_derived && l.how_derived !== 'direct copy' ? ` — ${l.how_derived}` : ''}</td></tr>)}
          </tbody></table></div>
        </div>
      )}

      {tab === 'footnotes' && (
        <div className="mt-5 text-sm max-w-3xl">
          <p className="text-ink-2 mb-3">From the CMS Nursing Home data dictionary. A blank value with one of these codes was suppressed or not computed by CMS; it is never zero.</p>
          <table className="w-full"><tbody>
            {Object.entries(ref.footnotes).sort((a, b) => Number(a[0]) - Number(b[0])).map(([c, f]) => <tr key={c} className="border-t border-hairline/60 align-top"><td className="py-1 pr-3 tabular-nums w-10 text-ink-2">{c}</td><td className="py-1">{f.meaning}<div className="text-xs text-ink-3">{f.applies_to}</div></td></tr>)}
          </tbody></table>
        </div>
      )}

      {tab === 'limits' && (
        <div className="mt-5 text-sm max-w-3xl">
          <ol className="space-y-2">{ref.limitations.map((l, i) => <li key={i} className="pl-1">{l.replace(/^\d+\.\s*/, '')}</li>)}</ol>
          <h2 className="font-medium mt-6">Three words, kept distinct</h2>
          <p className="mt-1 text-ink-2"><b className="text-ink font-medium">SNF</b> means a Medicare-certified skilled nursing facility — the post-acute setting that can provide licensed nursing care such as IV therapy, and the destination a hospital discharges to. <b className="text-ink font-medium">Nursing home</b> is CMS's word for the whole Care Compare universe: 14,690 certified facilities, of which 13,905 are certified for Medicare and Medicaid, 538 for Medicare only, and 247 for Medicaid only; those 247 are nursing facilities, not SNFs, and the Certification filter removes them. <b className="text-ink font-medium">Facility</b> is used only as a generic word (a row, "this facility"); it never stands in for SNF, because a facility could also be a rehabilitation or other setting.</p>
          <h2 className="font-medium mt-6">Hospital service areas (modeled)</h2>
          <p className="mt-1 text-ink-2">CMS publishes no hospital-to-SNF discharge flows. A nursing home is "in" a hospital's service area when its ZIP code is one of the ZIPs the hospital's Medicare inpatients come from (CMS Hospital Service Area File, 2025; ZIPs with fewer than 11 cases are suppressed by CMS and cannot be used). The modeled share is the ZIP's share of the hospital's visible cases times the nursing home's share of Medicare SNF stays among the facilities in that ZIP (CMS Post-Acute Care PUF, 2024). It is a proxy for referral exposure, not an observed flow; every number built on it is tagged "Modeled".</p>
          <h2 className="font-medium mt-6">Hospital systems (PECOS ownership)</h2>
          <p className="mt-1 text-ink-2">Owners come from CMS's PECOS "Hospital All Owners" file ({ref.meta.hospital_layer?.pecos_release?.slice(0, 10)}): organizations holding a 5%-or-greater direct or indirect ownership interest. Because a hospital lists every owner up its chain, one system appears under several holding-company names. A "system" here groups them with mechanical rules and no fuzzy matching: owner records with the exact same name are one organization; an owner's stake counts only when it is controlling (a reported share of 50% or more, or no share reported); and an organization with two or more controlled hospitals is treated as a subsidiary of the largest organization that holds a documented controlling share in at least two-thirds of them. Joint-venture partners and minority investors are shown but never pull a hospital into their system. The group is labelled with its largest member that is not named as a holding or acquisition vehicle, and every member name is kept as a searchable alias. Hospitals that are their own top-level entity have no system. A hospital controlled by two systems belongs to both. Ownership percentages and private-equity/REIT flags are as self-reported to CMS. System names are shown in a friendly form by default — title case with corporate suffixes dropped, plus a short hand-curated list of brand names for entities whose legal name does not say who they are (AdventHealth for Adventist Health System Sunbelt Healthcare Corporation, Ardent Health for AHP Health Partners, Intermountain Health for IHC Health Services, Atrium Health for The Charlotte-Mecklenburg Hospital Authority, and a dozen more listed in the code) — and a toggle beside every system name switches to the legal PECOS name. Owner lines always show the legal name, because that is the PECOS record.</p>
          <h2 className="font-medium mt-6">Discharge mix and case-mix overlap (modeled)</h2>
          <p className="mt-1 text-ink-2">A hospital's discharge mix comes from CMS's Medicare Inpatient Hospitals by Provider and Service file (calendar 2024). CMS suppresses any diagnosis group with fewer than 11 cases at a hospital, so the visible rows cover on average 58% of a hospital's Medicare discharges; the page states the coverage beside every mix. Diagnosis groups (MS-DRGs) are rolled into plain-English families using CMS's own DRG-to-major-diagnostic-category list (v42.1), with sixteen named families (joint replacement, hip fracture, stroke, heart failure, sepsis, pneumonia…) and the category name for everything else. A SNF's patient mix comes from the Post-Acute Care PUF diagnosis chapters. "Case-mix overlap" is the share of a hospital's discharge mix that the SNF's published patient mix also covers (the sum, across chapters, of the smaller of the two shares); it is reported only when the SNF's published chapters cover at least 60% of its stays, and withheld with the reason otherwise. A low overlap or a missing unit never proves a facility cannot take a patient. Because the hospital side is the admitting diagnosis and the SNF side is the diagnosis for the SNF stay (often aftercare or rehabilitation), the two mixes differ by nature and even a well-matched pair rarely scores above about 70%.</p>
          <DrgMapping ref={ref} />
          <h2 className="font-medium mt-6">Placement scenarios (modeled)</h2>
          <p className="mt-1 text-ink-2">The Scenarios page starts from the hospital's SNF volume by facility — the modeled service-area shares, or the hospital's own counts when they have been loaded on the Flows page — and a definition of an acceptable SNF (minimum overall rating, no special-focus or abuse-icon facilities, Medicare-certified only, required dedicated units, minimum case-mix overlap). Volume in facilities that do not meet the bar is moved, in the chosen share, to the nearest acceptable facilities within the chosen distance of the facility the patient would otherwise have used (straight-line distance between the two facilities' Care Compare coordinates), split equally among them; volume with no acceptable facility in reach stays unplaced and is reported. Capacity is respected in every mode: a receiving facility can take extra Medicare stays per year only up to its empty beds (certified beds minus average residents per day, Care Compare) × 365 ÷ its own Medicare length of stay (PAC PUF days ÷ stays; the national median when missing), measured against the hospital's annual SNF discharges — the number entered on the page, or, failing that, its 2024 Medicare discharges × 18.7% (MedPAC July 2026 Data Book, Chart 8-3: the share of fee-for-service hospital discharges followed by a SNF stay, 2019). Volume that finds every acceptable facility within reach full stays where it is and is reported. "Optimize" is the ceiling: all of the volume below the bar goes to the best acceptable facility within reach that still has room, "best" meaning the objective chosen on the page. The default, Balanced, scores every SNF by its national percentile on each of four measures — readmission after SNF discharge, short-stay rehospitalization, discharge to community, Medicare payment per stay (1 = best in the country, direction-aware) — and averages them equally; Custom blend uses the weights you set; a measure CMS has not published for a SNF drops out of its average. The single-measure objectives rank by that measure alone. Ties are broken by rating, readmission and distance. A single-measure objective can move the other measures the wrong way, and the page shows that rather than hiding it. "Realization" is (before − your scenario) ÷ (before − optimal) on each measure: the share of the modeled opportunity a scenario captures. Before-and-after figures are volume-weighted averages of each facility's published CMS rates (readmission after SNF discharge, short-stay rehospitalization, discharge to community, overall rating) and of Medicare's average payment per stay from the Post-Acute Care PUF. The distance shown is facility-to-facility, an upper bound on the extra travel from the patient's own address, which the public data does not contain. It assumes receiving facilities keep their published rates at the new volume, have beds, and are accepted by patients; it is a sizing tool, not a forecast. The figures for the Johns Hopkins default case were reproduced independently in pure Python (scripts/verify/scenario_indep.py) before the page shipped.</p>
        </div>
      )}

      {tab === 'value' && <ValueMethods ref={ref} />}

      {tab === 'checks' && (
        <div className="mt-5 text-sm max-w-3xl">
          <p className="text-ink-2 mb-3">{ref.meta.validation}</p>
          <div className="font-medium mb-1">Cross-file reconciliation (facilities matching / total)</div>
          <div className="overflow-x-auto"><table className="tbl tbl-compact text-xs"><tbody>{ref.reconciliation.map((r, i) => <tr key={i}><td>{r.Check}</td><td className="num text-ink-2 whitespace-nowrap">{r.Result}</td></tr>)}</tbody></table></div>
          <div className="text-xs text-ink-3 mt-3">The one known difference — Provider Info's rating-cycle deficiency counts versus the inspection-cycle counts in the survey files — is explained for 287 of 449 facilities (citations under informal dispute) and open for the rest. This app uses the survey-file counts.</div>
        </div>
      )}
    </div>
  )
}
