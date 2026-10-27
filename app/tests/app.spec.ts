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
  await expect(row).toContainText('fn 9')
  await expect(row).not.toContainText('0.0%')
})

test('radius around a pin filters and sorts by distance', async ({ page }) => {
  await page.goto('/explore?lat=39.2904&lng=-76.6122&mi=15&place=Baltimore')
  await ready(page)
  await expect(count(page)).toHaveText('77')
  await expect(page.getByRole('button', { name: 'Miles', exact: true })).toHaveAttribute('aria-sort', 'ascending')
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
  const canvas = await page.locator('.maplibregl-canvas').count()
  expect(canvas).toBe(1)
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
  await expect(page.getByText('Discharges to SNFs')).toBeVisible()
  // total 100: low 50 (50%), mid 15, high 30, unmatched 5
  const cards = page.locator('.grid-cols-5 > div')
  await expect(cards.nth(0)).toContainText('100')
  await expect(cards.nth(1)).toContainText('30%')
  await expect(cards.nth(2)).toContainText('15%')
  await expect(cards.nth(3)).toContainText('50%')
  await expect(cards.nth(4)).toContainText('5%')
  await expect(page.getByText('not in CMS file')).toBeVisible()
  await expect(page.getByText(/32 facilities rated 4–5★/)).toBeVisible()
  await expect(page.getByText(/3,381 certified beds/)).toBeVisible()
  await shot(page, '06-flows')
  // persists across reload
  await page.reload()
  await expect(page.getByText('Discharges to SNFs')).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Remove uploaded data' }).click()
  await expect(page.getByText('No discharge data loaded.')).toBeVisible()
})

test('methodology page lists lineage, footnotes and limitations', async ({ page }) => {
  await page.goto('/about')
  await expect(page.getByRole('heading', { name: 'Methodology & trust' })).toBeVisible({ timeout: 90_000 })
  await page.getByRole('button', { name: 'Footnote codes' }).click()
  await expect(page.getByText('The number of residents or resident stays is too small to report', { exact: false })).toBeVisible()
  await page.getByRole('button', { name: 'Column lineage' }).click()
  await expect(page.getByText('4pq5-n9py_2026-09-30_NH_ProviderInfo_Sep2026_3.csv').first()).toBeVisible()
  await page.getByRole('button', { name: 'Limitations' }).click()
  await expect(page.getByText(/No hospital→SNF discharge flow/)).toBeVisible()
  await shot(page, '07-about')
})
