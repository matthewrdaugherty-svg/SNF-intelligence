// End-to-end checks against values read directly from db/snf.duckdb (see tests/expected.md).
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const SHOTS = path.resolve('tests/screenshots'); fs.mkdirSync(SHOTS, { recursive: true })
const shot = (p: Page, name: string) => p.screenshot({ path: path.join(SHOTS, name + '.png'), fullPage: false })
const count = (p: Page) => p.getByTestId('result-count')
async function ready(p: Page) { await expect(count(p)).toBeVisible({ timeout: 90_000 }) }

test('explore loads all facilities and filters to Maryland', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto('/explore')
  await ready(page)
  await expect(count(page)).toHaveText('14,690')
  await page.getByRole('button', { name: 'MD', exact: true }).click()
  await expect(count(page)).toHaveText('221')
  await expect(page).toHaveURL(/st=MD/)
  await page.getByRole('group', { name: 'Overall star rating' }).getByRole('button', { name: '5' }).click()
  await expect(count(page)).toHaveText('54')
  await shot(page, '01-explore-md-5star')
  expect(errors).toEqual([])
})

test('explore sorts by fines and opens the facility with the largest fines in Maryland', async ({ page }) => {
  await page.goto('/explore?st=MD')
  await ready(page)
  await page.getByRole('button', { name: 'Fines $ (3 yr)', exact: true }).click()
  await expect(page).toHaveURL(/sort=pen_total_fines_usd&dir=desc/)
  const first = page.getByRole('row').nth(1)
  await expect(first).toContainText('Blue Point Healthcare Center')
  await expect(first).toContainText('$341,978')
  await first.getByRole('link', { name: 'Blue Point Healthcare Center' }).click()
  await expect(page).toHaveURL(/facility\/215340/)
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Blue Point Healthcare Center')
  await expect(page.getByText('19.7%').first()).toBeVisible()   // QM 521 adjusted 19.665584
  await expect(page.getByText('$341,978').first()).toBeVisible()
  await expect(page.getByText('#3,239')).toBeVisible()           // VBP ranking
  await shot(page, '02-facility-215340')
})

test('suppressed value shows a footnote, not zero', async ({ page }) => {
  await page.goto('/facility/235324')
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Riverside Healthcare Center')
  const row = page.getByTestId('measure-qm_472_4q')
  await expect(row).toContainText('too few residents to report')
  await expect(row.getByRole('note')).toHaveAttribute('title', /CMS footnote 9: The number of residents or resident stays is too small to report/)
  await expect(row).not.toContainText('0.0%')
})

test('radius around a pin filters and sorts by distance', async ({ page }) => {
  await page.goto('/explore?lat=39.2904&lng=-76.6122&mi=15&place=Baltimore')
  await ready(page)
  await expect(count(page)).toHaveText('77')
  await expect(page.getByRole('columnheader', { name: 'Miles', exact: true })).toHaveAttribute('aria-sort', 'ascending')
  await shot(page, '03-explore-radius')
})

test('export CSV downloads the filtered set', async ({ page }) => {
  await page.goto('/explore?st=MD&stars=5')
  await ready(page)
  await expect(count(page)).toHaveText('54')
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const file = await (await dl).path()
  const text = fs.readFileSync(file!, 'utf8')
  expect(text.split('\n').length).toBe(55)
  expect(text.split('\n')[0]).toContain('CCN,Facility,Overall stars')
})

test('compare holds up to six facilities', async ({ page }) => {
  await page.goto('/explore?q=BALTIMORE&st=MD')
  await ready(page)
  for (let i = 1; i <= 7; i++) await page.getByRole('row').nth(i).getByRole('checkbox').click()
  await expect(page.getByRole('link', { name: /Compare/ })).toContainText('6')
  await page.getByRole('link', { name: /Compare/ }).click()
  await expect(page.getByText('6 of 6')).toBeVisible()
  await expect(page.getByText('Short-stay residents rehospitalized (QM 521)')).toBeVisible()
  await shot(page, '04-compare')
  await page.getByRole('button', { name: 'Clear all' }).click()
  await expect(page.getByText('Nothing to compare yet.')).toBeVisible()
})

test('map renders facility markers and the pin radius', async ({ page }) => {
  await page.goto('/map?st=MD')
  await expect(count(page)).toHaveText('221', { timeout: 90_000 })
  const errors: string[] = []
  page.on('console', m => { if (m.type() === 'error' && /worker/i.test(m.text())) errors.push(m.text()) })
  await page.waitForTimeout(6000)
  const box = await page.locator('.maplibregl-map').boundingBox()
  expect(box && box.height > 300 && box.width > 300).toBeTruthy()
  const markers = await page.evaluate(() => (document.querySelector('.maplibregl-canvas') as HTMLCanvasElement | null)?.height ?? 0)
  expect(markers).toBeGreaterThan(300)
  expect(errors).toEqual([])
  await page.goto('/map?lat=39.2904&lng=-76.6122&mi=15&place=Baltimore')
  await expect(count(page)).toHaveText('77', { timeout: 90_000 })
  await expect(page.getByText('15 mi around Baltimore')).toBeVisible()
  await page.waitForTimeout(3000)
  await shot(page, '05-map-radius')
})

test('discharge flows: rejects a bad file, accepts a good one, computes the quality mix', async ({ page }) => {
  await page.goto('/flows')
  await expect(page.getByText('No discharge data loaded.')).toBeVisible({ timeout: 90_000 })
  // bad: missing column
  await page.setInputFiles('input[type=file]', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('hospital_ccn,snf_ccn,n_discharges\n210009,215022,10\n') })
  await expect(page.getByText(/Missing required column/)).toBeVisible()
  // good: TEST counts (fictional) against real Maryland CCNs; 215031 and 215074 are 1-star, 215037 is 4-star, 215044 is 3-star, 999999 is not a CMS facility
  const csv = ['hospital_ccn,hospital_name,snf_ccn,period_start,period_end,n_discharges,hospital_lat,hospital_lng',
    '210009,Test Hospital,215031,2025-01-01,2025-12-31,40,39.2970,-76.5929',
    '210009,Test Hospital,215074,2025-01-01,2025-12-31,10,39.2970,-76.5929',
    '210009,Test Hospital,215037,2025-01-01,2025-12-31,30,39.2970,-76.5929',
    '210009,Test Hospital,215044,2025-01-01,2025-12-31,15,39.2970,-76.5929',
    '210009,Test Hospital,999999,2025-01-01,2025-12-31,5,39.2970,-76.5929',
    '210009,Test Hospital,21503,2025-01-01,2025-12-31,5,39.2970,-76.5929'].join('\n')
  await page.setInputFiles('input[type=file]', { name: 'test.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText(/5 valid rows/)).toBeVisible()
  await expect(page.getByText(/1 row skipped/)).toBeVisible()
  await expect(page.getByText(/must be 6 characters/)).toBeVisible()
  await expect(page.getByText('Discharges to SNFs', { exact: true })).toBeVisible()
  // total 100: low 50 (50%), mid 15, high 30, unmatched 5
  const cards = page.locator('[class*="grid-cols-5"] > div')
  await expect(cards.nth(0)).toContainText('100')
  await expect(cards.nth(1)).toContainText('30%')
  await expect(cards.nth(2)).toContainText('15%')
  await expect(cards.nth(3)).toContainText('50%')
  await expect(cards.nth(4)).toContainText('5%')
  await expect(page.getByText('not in the CMS file', { exact: true })).toBeVisible()
  await expect(page.getByText(/32 SNFs rated 4–5★/)).toBeVisible()
  await expect(page.getByText(/3,381 certified beds/)).toBeVisible()
  await shot(page, '06-flows')
  // persists across reload
  await page.reload()
  await expect(page.getByText('Discharges to SNFs', { exact: true })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Remove uploaded data' }).click()
  await expect(page.getByText('No discharge data loaded.')).toBeVisible()
})

test('methodology page lists lineage, footnotes and limitations', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'Methodology & trust' })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Footnote codes' }).click()
  await expect(page.getByText('The number of residents or resident stays is too small to report', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Column lineage' }).click()
  await expect(page.getByText('NH_ProviderInfo_Sep2026_3.csv').first()).toBeVisible()
  await page.getByRole('button', { name: 'Limitations' }).click()
  await expect(page.getByText(/No hospital→SNF discharge flow/)).toBeVisible()
  await shot(page, '07-about')
})

// ---- regression tests from VALIDATION_REPORT_03_APP ----
test('a crafted sort parameter cannot change the data (SQL injection)', async ({ page }) => {
  const payload = encodeURIComponent("provider_name; UPDATE facility_master SET overall_rating = 5, provider_name = 'TAMPERED VIA LINK' WHERE ccn = '215085'; SELECT 1 AS provider_name, 1 AS x ORDER BY x")
  await page.goto(`/explore?q=215085&sort=${payload}&dir=desc`)
  await ready(page)
  await expect(count(page)).toHaveText('1')
  const first = page.getByRole('row').nth(1)
  await expect(first).toContainText('Carroll Park Healthcare')
  await expect(first).not.toContainText('Tampered')
  await page.goto('/facility/215085')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('Carroll Park Healthcare')
})

test('fast typing in the search box loses no keystrokes', async ({ page }) => {
  await page.goto('/explore?st=MD')
  await ready(page)
  await page.getByLabel('Name, city, chain or CCN').pressSequentially('baltimore', { delay: 20 })
  await expect(count(page)).toHaveText('40', { timeout: 15_000 })   // 40 per db/snf.duckdb (name/city/chain/CCN contains BALTIMORE, state MD)
  await expect(page).toHaveURL(/q=baltimore/)
})

test('invalid URL parameters are ignored, not shown as SQL errors', async ({ page }) => {
  await page.goto('/explore?own=foo&stars=0,6,9&mi=Infinity&lat=39&lng=-76')
  await ready(page)
  await expect(count(page)).toHaveText('14,690')
  await expect(page.getByText(/Parser Error|Binder Error/)).toHaveCount(0)
})

test('flows upload rejects blank counts, exponent numbers, impossible dates and reversed periods', async ({ page }) => {
  await page.goto('/flows')
  await expect(page.getByText('No discharge data loaded.')).toBeVisible({ timeout: 90_000 })
  const csv = ['hospital_ccn,hospital_name,snf_ccn,period_start,period_end,n_discharges',
    '210009,H,215031,2025-01-01,2025-12-31,',          // blank count
    '210009,H,215074,2025-01-01,2025-12-31,1e2',       // exponent
    '210009,H,215037,2025-13-45,2025-12-31,3',         // impossible date
    '210009,H,215044,2025-12-31,2025-01-01,3',         // reversed
    '210009,H,215022,2025-01-01,2025-12-31,7'].join('\r\n')
  await page.setInputFiles('input[type=file]', { name: 'edge.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) })
  await expect(page.getByText(/1 valid row/)).toBeVisible()
  await expect(page.getByText(/4 rows skipped/)).toBeVisible()
  await expect(page.getByText(/digits only/).first()).toBeVisible()
  await expect(page.getByText(/real dates/)).toBeVisible()
  await expect(page.getByText(/is before period_start/)).toBeVisible()
  // a bad file after a good one must not bring the good one back on reload
  await page.setInputFiles('input[type=file]', { name: 'bad.csv', mimeType: 'text/csv', buffer: Buffer.from('hospital_ccn,snf_ccn\n1,2\n') })
  await expect(page.getByText(/Missing required column/)).toBeVisible()
  await page.reload()
  await expect(page.getByText('No discharge data loaded.')).toBeVisible({ timeout: 90_000 })
})

test('facility not in VBP says so instead of showing blanks; comparisons never say "0 worse"', async ({ page }) => {
  await page.goto('/facility/435092')
  await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 90_000 })
  await expect(page.getByText(/Not in the SNF Value-Based Purchasing program/)).toBeVisible()
  await expect(page.getByText(/\b0 (better|worse) than state/)).toHaveCount(0)
  await expect(page.getByText(/0\.0% (better|worse) than state/)).toHaveCount(0)
})

test('search box accepts spaces mid-phrase and commits the whole phrase', async ({ page }) => {
  await page.goto('/explore?st=MD')
  await ready(page)
  const box = page.getByLabel('Name, city, chain or CCN')
  await box.pressSequentially('glen burnie', { delay: 40 })
  await expect(box).toHaveValue('glen burnie')
  await expect(page).toHaveURL(/q=glen\+burnie|q=glen%20burnie/)
  await expect(count(page)).not.toHaveText('221', { timeout: 15_000 })
})

// ---- hospital layer ----
test('hospital page: Johns Hopkins service area and modeled quality mix match the database', async ({ page }) => {
  await page.goto('/hospital/210009')
  await expect(page.getByRole('heading', { level: 1 })).toHaveText('The Johns Hopkins Hospital', { timeout: 120_000 })
  const sentence = page.locator('p.t-lead')
  await expect(sentence).toContainText('10,834')
  await expect(sentence).toContainText('200')
  await expect(sentence).toContainText('209')
  await expect(sentence).toContainText('43%')   // 4-5★ share of modeled volume (db: 42.9)
  await expect(sentence).toContainText('19%')
  await expect(sentence).toContainText('38%')
  await expect(page.getByText('10,157').first()).toBeVisible()  // 2024 Medicare discharges
  // top ZIP row
  const firstZip = page.locator('section').filter({ hasText: 'Service area' }).locator('tbody tr').first()
  await expect(firstZip).toContainText('21213')
  await expect(firstZip).toContainText('529')
  // top modeled SNF
  const firstSnf = page.locator('section').filter({ hasText: 'SNFs in the service area' }).locator('tbody tr').first()
  await expect(firstSnf).toContainText('Complete Care at Heritage')
  await expect(firstSnf).toContainText('2.92%')
})

test('hospital search finds Hopkins and the service-area filter works in Explore', async ({ page }) => {
  await page.goto('/hospitals')
  const box = page.getByLabel('Find a hospital')
  await box.fill('johns hopkins')
  await expect(page.getByRole('link', { name: /The Johns Hopkins Hospital/ })).toBeVisible({ timeout: 120_000 })
  await page.goto('/explore?h=210009')
  await ready(page)
  await expect(count(page)).toHaveText('209')
  await expect(page.getByRole('columnheader', { name: /Modeled share/ })).toHaveAttribute('aria-sort', 'descending')
  await expect(page.getByRole('row').nth(1)).toContainText('Complete Care at Heritage')
})

test('cohorts: conditions from the URL produce the counts in the database and the link is shareable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  // MD · 4–5★ · short-stay rehospitalization ≤ 18 → 31 facilities, median 15.0 (db: 14.985)
  await page.goto('/cohorts?c=overall_rating.in.4,5&c=qm_521_adj.le.18&c=state.eq.MD')
  await expect(page.getByText('Nursing homes in cohort')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('31', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page.getByText('15.0%').first()).toBeVisible()
  await expect(page.getByText('100% good')).toBeVisible()
  await expect(page.getByText('Overall star rating is any of 4,5 · Short-stay residents rehospitalized (QM 521) at most 18 · State equals MD')).toBeVisible()
  // all-facility median for the same measure
  await expect(page.getByText('23.8%').first()).toBeVisible()
  await shot(page, '18-cohort-md')
  expect(errors).toEqual([])
})

test('cohorts: builder adds a condition, breaks down by ownership, and exports', async ({ page }) => {
  await page.goto('/cohorts')
  await expect(page.getByText('14,690', { exact: true }).first()).toBeVisible({ timeout: 120_000 })
  await page.getByRole('button', { name: 'Add condition' }).click()   // default: overall rating is any of 4,5
  await page.getByLabel('Value').fill('1,2')
  await expect(page.getByText('5,912', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  await expect(page).toHaveURL(/c=overall_rating\.in\.1%2C2/)
  await page.getByLabel('Break down by').selectOption('ownership')
  const first = page.locator('table').first().locator('tbody tr').first()
  await expect(first).toContainText('For profit - Limited Liability company')
  await expect(first).toContainText('2,532')
  // hospital-area condition: Hopkins service area ∩ 1–2★ … switch to 4–5★ to check 94
  await page.getByLabel('Value').fill('4,5')
  await page.getByRole('button', { name: 'Add condition' }).click()
  await page.getByLabel('Measure', { exact: true }).nth(1).selectOption('hospital_area')
  await page.getByLabel('Value').nth(1).fill('210009')
  await expect(page.getByText('94', { exact: true }).first()).toBeVisible({ timeout: 60_000 })
  const dl = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Export CSV' }).click()
  const text = fs.readFileSync(await (await dl).path(), 'utf8')
  expect(text.split('\n').length).toBe(98)   // 3 comment lines + header + 94 rows
  expect(text.split('\n')[1]).toContain('# Conditions: Overall star rating is any of 4,5 AND')
  expect(text.split('\n')[3]).toContain('CMS footnote')
})

test('cohorts: hostile URL values are ignored, never executed', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', e => errors.push(e.message))
  await page.goto("/cohorts?c=provider_name.contains.%27%3B%20DROP%20TABLE%20facility_master%3B--&c=qm_521_adj.ge.abc&c=nope.ge.1&c=garbage&m=ccn%3B&g=zzz")
  // the unreadable number is shown as a problem and nothing is counted until it is fixed; the unknown field and the junk item are dropped
  await expect(page.getByRole('alert').filter({ hasText: '“abc” is not a number.' })).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('Fix the highlighted condition to run this cohort.')).toBeVisible()
  await expect(page.getByText('Nursing homes in cohort')).toHaveCount(0)
  await page.getByRole('button', { name: /Remove condition Short-stay/ }).click()
  // the contains-condition is kept as a literal string → 0 rows
  await expect(page.getByText('No nursing homes meet these conditions.')).toBeVisible({ timeout: 60_000 })
  await page.goto('/cohorts?c=overall_rating.in.4,5')
  await expect(page.getByText('Nursing homes in cohort')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('No nursing homes meet these conditions.')).toHaveCount(0)
  expect(errors).toEqual([])
})

test('system picker: "Whole system" finds the Johns Hopkins family, lets you drop DC and FL, and adds the 4 Maryland hospitals', async ({ page }) => {
  await page.goto('/explore')
  await ready(page)
  await page.getByRole('radio', { name: 'System', exact: true }).click()
  await page.getByLabel('Find a hospital system').fill('johns hopkins')
  const opt = page.getByRole('option').filter({ hasText: 'The Johns Hopkins Health System Corporation' }).first()
  await expect(opt).toBeVisible({ timeout: 60_000 })
  await expect(opt).toContainText('7 hospitals · 3 states · 5 with service-area data')
  await opt.getByRole('button').click()
  const panel = page.getByTestId('system-states')
  await expect(panel).toContainText('7 hospitals in 3 states')
  await expect(panel.getByRole('button', { name: 'MD · 5' })).toHaveAttribute('aria-pressed', 'true')
  await panel.getByRole('button', { name: 'DC · 1' }).click()
  await panel.getByRole('button', { name: 'FL · 1' }).click()
  await panel.getByRole('button', { name: 'Add 4 hospitals' }).click()
  await expect(page.getByRole('status')).toContainText('added 4 hospitals; 1 in the chosen state has no service-area data and was left out')
  await expect(count(page)).toHaveText('226', { timeout: 60_000 })
  await expect(page).toHaveURL(/h=210009%2C210022%2C210029%2C210048/)
  await page.getByRole('button', { name: 'Remove all 4' }).click()
  await expect(count(page)).toHaveText('14,690')
  // holding companies are grouped: searching a holding-company alias finds the HCA family
  await page.getByLabel('Find a hospital system').fill('hca healthcare')
  const hca = page.getByRole('option').filter({ hasText: 'HCA Healthcare Inc' }).first()
  await expect(hca).toBeVisible({ timeout: 60_000 })
  await expect(hca).toContainText('156 hospitals · 18 states · 153 with service-area data')
})

test('hospital page names its PECOS owner and links to the whole system; facility page shows PECOS enrollment and ownership changes', async ({ page }) => {
  await page.goto('/hospital/210009')
  await expect(page.getByTestId('hospital-owners')).toContainText('Owned by The Johns Hopkins Health System Corporation', { timeout: 120_000 })
  const link = page.getByTestId('system-link')
  await expect(link).toContainText('Part of The Johns Hopkins Health System Corporation (7 hospitals)')
  await link.getByRole('link', { name: 'MD hospitals (4)' }).click()
  await ready(page)
  await expect(count(page)).toHaveText('226')
  await page.goto('/facility/215085')
  await expect(page.getByTestId('snapshot')).toContainText('Carroll Park Healthcare is a 2-star (poor), 140-bed for profit nursing home in Baltimore, MD. 20.2% of its short-stay residents were rehospitalized, better than the MD average of 21.0%.', { timeout: 120_000 })
  await expect(page.getByTestId('snapshot')).toContainText('CMS recorded 4 harm-or-jeopardy deficiencies across the last three inspection cycles and $306,550 in fines over the three-year penalties window')
  await expect(page.getByTestId('pecos')).toContainText('enrolled as Gwynnfalls Md Opco doing business as Carroll Park Healthcare; CMS affiliation entity Engage Healthcare; proprietary; changed ownership on 2023-08-01 (buyer Gwynnfalls Md Opco, seller Wilkens Ave Baltimore Md Opco LLC)')
})

test('no page scrolls sideways at phone width', async ({ page }) => {
  test.setTimeout(400_000)
  await page.setViewportSize({ width: 390, height: 844 })
  const urls = ['/explore?st=MD', '/explore?h=210009', '/cohorts?c=overall_rating.in.4,5&c=state.eq.MD', '/facility/215085', '/hospital/210009', '/hospitals', '/flows', '/about', '/compare']
  const bad: string[] = []
  for (const u of urls) {
    await page.goto(u)
    await page.waitForFunction(() => !document.body.innerText.includes('Loading') && document.body.innerText.length > 200, null, { timeout: 120_000 })
    await page.waitForTimeout(800)
    const over = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth)
    if (over > 0) bad.push(`${u}: +${over}px`)
  }
  expect(bad).toEqual([])
})

test('certification filter separates Medicare-certified SNFs from Medicaid-only nursing facilities', async ({ page }) => {
  await page.goto('/explore?cert=nf')
  await ready(page)
  await expect(count(page)).toHaveText('247')
  await page.getByRole('radio', { name: 'SNF (Medicare)' }).click()
  await expect(count(page)).toHaveText('14,443')
  await expect(page).toHaveURL(/cert=snf/)
  await page.goto('/explore?cert=bogus')
  await ready(page)
  await expect(count(page)).toHaveText('14,690')
})

test('services filter and panel come from the CMS-671 file', async ({ page }) => {
  await page.goto('/explore?st=MD&svc=vent')
  await ready(page)
  await expect(count(page)).toHaveText('15')
  await page.getByRole('checkbox', { name: 'Dialysis unit' }).click()
  await expect(count(page)).toHaveText('1')
  await page.getByRole('button', { name: 'MD', exact: true }).click()   // drop the state → nationwide vent + dialysis
  await expect(count(page)).toHaveText('86')
  await expect(page).toHaveURL(/svc=dialysis%2Cvent/)
  await page.goto('/facility/215085')
  const svc = page.getByTestId('services')
  await expect(svc).toContainText('None reported', { timeout: 120_000 })
  await expect(svc).toContainText('SNF/NF, Medicare & Medicaid')
  await expect(svc).toContainText('90 residents · Medicare 9% · Medicaid 58% · other 33%')
  await page.goto('/guide')
  await expect(page.getByRole('heading', { level: 2, name: 'Where a patient can go after a hospital stay' })).toBeVisible()
})
