import { Link } from 'react-router'
import { useReference } from '../components/ui'

/** Plain-English definitions for people new to post-acute care. Facts here are stable program rules or descriptions of this app's own data;
 *  anything that changes year to year (dollar amounts, thresholds) is deliberately left out. */
const SECTIONS: { id: string; title: string; body: { h?: string; p: string }[] }[] = [
  { id: 'settings', title: 'Where a patient can go after a hospital stay', body: [
    { h: 'Skilled nursing facility (SNF)', p: 'A nursing home certified by Medicare to provide daily skilled care: licensed nursing (IV medicines, wound care, injections, monitoring) and rehabilitation therapy (physical, occupational, speech). Most patients come straight from a hospital for a short stay — typically days to a few weeks — to recover before going facility. Medicare Part A pays for up to 100 days per benefit period after a qualifying hospital stay of at least three inpatient days (some Medicare Advantage plans and accountable-care arrangements waive the three-day rule); the first 20 days are fully covered and days 21–100 carry a daily copayment. This tool is built around SNFs.' },
    { h: 'Nursing facility (NF)', p: 'A nursing home certified by Medicaid for long-term care — help with daily living, supervision and nursing for people who cannot live at home. Most nursing homes are certified for both programs (dual SNF/NF), so the same building houses short-stay rehab patients on Medicare and long-stay residents on Medicaid. 247 facilities in this data are Medicaid-only: they are not SNFs, and the Certification filter removes them.' },
    { h: 'Distinct part', p: 'A certified SNF unit inside a larger institution — a hospital (a "hospital-based SNF") or a nursing home whose other beds are certified differently or not at all. CMS surveys and rates the distinct part as a provider in its own right.' },
    { h: 'Swing beds', p: 'Beds in small or rural hospitals that can "swing" between acute and skilled-nursing use. They are SNF care delivered inside a hospital. This tool does not list them; they appear in CMS\'s separate swing-bed file.' },
    { h: 'Inpatient rehabilitation facility (IRF)', p: 'A rehabilitation hospital or hospital unit for patients who can tolerate intensive therapy — generally three hours a day, most days — under close physician supervision, after events such as stroke, brain or spinal cord injury, major fractures or joint replacement with complications. It is a hospital-level benefit, not a nursing home, and is not in this tool.' },
    { h: 'Long-term acute care hospital (LTACH)', p: 'A hospital for medically complex patients who need hospital-level care for weeks (average stays over 25 days): ventilator weaning, complex wounds, multiple organ problems. Not a nursing home; not in this tool.' },
    { h: 'Home health, hospice, assisted living', p: 'Home health brings skilled nursing and therapy to the patient\'s home. Hospice provides comfort care for a terminal illness, at home or in a facility (some nursing homes have a dedicated hospice unit). Assisted living is housing with help for daily living and is not Medicare-certified. None of the three is in this tool except where a nursing home reports a hospice unit.' },
  ] },
  { id: 'discharge', title: 'How a hospital discharge becomes a SNF admission', body: [
    { p: 'When a hospital patient no longer needs hospital-level care but cannot safely go home, the case manager or discharge planner looks for a post-acute setting. The main question is what the patient needs every day: intensive therapy points to an IRF, hospital-level medical care to an LTACH, daily skilled nursing or rehab to a SNF, and intermittent visits to home health. Within SNFs, the planner matches the patient\'s needs (a ventilator, dialysis, a dementia-safe unit, wound care, behavioral support) to facilities that can provide them, that have a bed, that accept the patient\'s insurance, and that the patient or family will accept. Federal discharge-planning rules (42 CFR 482.43) require the hospital to give the patient a list of participating post-acute providers in the area that can meet their needs, to share quality data to help them choose, to disclose any financial interest it has in a provider, and to respect the patient\'s choice.' },
    { p: 'Hospitals differ in what they discharge. A tertiary center sends many stroke, cardiac-surgery and transplant patients; a community hospital sends more pneumonia, heart failure and hip fractures; a behavioral hospital sends few patients to SNFs at all. A hospital\'s page in this tool shows its Medicare inpatient volume and where its patients live; the modeled service area shows which SNFs sit in those neighborhoods.' },
  ] },
  { id: 'ratings', title: 'What the star ratings mean', body: [
    { h: 'Overall rating (1–5 stars)', p: 'CMS\'s summary rating. It starts from the health-inspection stars, then moves up or down for the staffing and quality-measure stars. In this tool 4–5 stars is good, 3 is average, and 1–2 is poor; colors follow that meaning everywhere.' },
    { h: 'Health inspection stars', p: 'Based on the deficiencies found in the last three years of standard inspections and recent complaint inspections, weighted by how serious and widespread they were. These stars are relative within each state (the best 10% of facilities in a state get five stars), so a Maryland three is not the same as a Texas three.' },
    { h: 'Quality measure stars', p: 'Built from clinical measures CMS collects for every resident (the MDS) and from Medicare claims: rehospitalization, emergency visits, falls with injury, pressure ulcers, antipsychotic use and others, separated into short-stay and long-stay residents.' },
    { h: 'Staffing stars', p: 'Based on nurse hours per resident per day reported through payroll, adjusted for how sick the residents are, plus staff turnover and weekend staffing.' },
    { h: 'Special focus facility and abuse icon', p: 'A special focus facility has a history of serious problems and is under extra inspection; a candidate is on the watch list. The abuse icon marks a facility cited for abuse that caused harm in the past year or had the potential for harm in each of the last two years. Both are shown in red here.' },
  ] },
  { id: 'measures', title: 'The measures a discharging hospital cares about', body: [
    { h: 'Short-stay residents rehospitalized (QM 521)', p: 'Of residents who entered the facility from a hospital, the share admitted to a hospital again within 30 days of entering the facility — whether or not they had already been discharged from the facility — adjusted for how sick they were. Claims-based; lower is better. This is the closest public measure of whether a facility keeps its patients out of the hospital.' },
    { h: 'Potentially preventable readmissions within 30 days of SNF discharge (QRP 004)', p: 'Of patients who left the SNF, the share readmitted to a hospital within 30 days for a condition that might have been prevented. CMS also labels each facility better than, no different from, or worse than the national rate; the tool shows CMS\'s own verdict.' },
    { h: 'Successful discharge to community (QRP 005)', p: 'The share of patients who went home (or to a community setting) and stayed there without an unplanned hospitalization or death for 31 days. Higher is better.' },
    { h: 'Medicare spending per beneficiary (QRP 006)', p: 'What Medicare spent on the patient during the SNF stay and the 30 days after, as a ratio to the national median episode (1.00). Lower means a less costly episode.' },
    { h: 'Harm-or-jeopardy deficiencies (G–L)', p: 'Inspection citations graded G to L: actual harm to residents (G–I) or immediate jeopardy to their health or safety (J–L). Counted across the last three inspection cycles. Fines and payment denials are CMS penalties over the last three years.' },
  ] },
  { id: 'services', title: 'What the services data can and cannot tell you', body: [
    { p: 'Every certified nursing home files a CMS-671 application and updates it at each survey. It reports the facility\'s certification, whether it is hospital-based, how many beds sit in dedicated special-care units — ventilator, dialysis, Alzheimer\'s/dementia, hospice, head trauma, specialized rehabilitation, children and young adults, AIDS, Huntington\'s — and how many residents were on Medicare, Medicaid or other payers on the day of the survey.' },
    { p: 'Use it with care. The unit beds are self-reported and not verified by inspectors. A facility that lists no ventilator beds may still accept a patient with a tracheostomy; a facility that lists a dementia unit may be full. The form has no field for IV antibiotics, wound vacs, bariatric care, behavioral units or cardiac monitoring. The best public evidence of what a facility routinely handles is the mix of diagnoses among its Medicare patients, which the tool draws from CMS\'s post-acute utilization file. Real admissions criteria and bed availability come only from the facility itself — which is what a placement product like Rondo collects.' },
  ] },
  { id: 'modeled', title: 'What "modeled" means in this tool', body: [
    { p: 'CMS does not publish which nursing home each hospital patient went to. The modeled service area is built from two public facts: the ZIP codes a hospital\'s Medicare inpatients live in (with volumes), and each nursing home\'s Medicare stays. The model assumes patients use the facilities in their own ZIP code in proportion to those facilities\' volume. It is a proxy for referral exposure — useful for sizing a hospital\'s footprint and the quality of the facilities around its patients — not an observed flow. Every number built on it carries the word "Modeled". When a hospital shares its real discharge counts, the Flows page replaces the model with the real thing.' },
    { p: 'A placement scenario asks a what-if: if the patients who would have gone to facilities below a chosen bar went to the nearest acceptable facilities instead — or, with Optimize, to the best-fit one — what would the readmission rate, discharge-to-community rate and Medicare payment per stay look like? The answer is arithmetic on CMS\'s published rates for each facility, weighted by volume. "Realization" is how much of the optimal improvement a given scenario captures, a number a P&L or clinical leader can track as real placements come in. It assumes the receiving facilities keep their published rates, have beds, and are chosen by patients — none of which the public data can confirm — so treat it as a way to size the opportunity, not a forecast.' },
    { p: 'Hospital systems come from CMS\'s PECOS ownership file: the organizations holding a controlling share in each hospital, grouped with their holding companies. Joint-venture partners and minority investors are shown but do not pull a hospital into their system.' },
  ] },
  { id: 'notsee', title: 'What this tool cannot see', body: [
    { p: 'No patient-level data of any kind. No bed availability or admission decisions. No Medicare Advantage or Medicaid managed-care contracts, which decide which facilities a given patient can actually use. No prices beyond Medicare\'s published spending measures. No clinical capability beyond the dedicated units and the diagnosis mix described above. Every figure is a CMS public file or a labeled model built from one; the Methods page lists the file and column behind every number.' },
  ] },
]

export default function Guide() {
  const ref = useReference()
  return (
    <div className="page">
      <h1>Guide</h1>
      <p className="t-body text-ink-2 mt-2 max-w-3xl">Plain-English definitions for anyone getting up to speed on a hospital's post-acute footprint: the settings, the ratings, the measures, and what this data can and cannot tell you. Method details and sources are on the <Link to="/about" className="text-accent hover:underline">Methods</Link> page.</p>
      <p className="t-label mt-2 max-w-3xl">Three words are kept apart throughout this tool: <b className="text-ink font-medium">facility</b> is any post-acute placement (a SNF, a rehabilitation hospital, a Medicaid-only nursing facility); <b className="text-ink font-medium">SNF</b> is used only when the facility is a Medicare-certified skilled nursing facility; <b className="text-ink font-medium">home</b> means the patient's own residence. "Nursing home" appears only as CMS's name for its Care Compare universe.</p>
      <nav className="mt-4 flex flex-wrap gap-x-4 gap-y-1 t-label" aria-label="Sections">{SECTIONS.map(s => <a key={s.id} href={`#${s.id}`} className="hover:text-ink">{s.title}</a>)}</nav>
      <div className="stack mt-6">
        {SECTIONS.map(s => (
          <section key={s.id} id={s.id} className="panel panel-pad scroll-mt-20">
            <h2 className="section-title">{s.title}</h2>
            <div className="mt-3 space-y-4 max-w-3xl">
              {s.body.map((b, i) => <div key={i}>{b.h && <div className="t-body font-medium">{b.h}</div>}<p className="t-body text-ink-2 mt-0.5">{b.p}</p></div>)}
            </div>
          </section>
        ))}
        <div className="t-caption">Data as of {ref?.meta.data_vintage}. Nothing on this page is medical or legal advice; program rules change and the current Medicare rules are at medicare.gov.</div>
      </div>
    </div>
  )
}
