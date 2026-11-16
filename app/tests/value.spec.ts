// The Value page against an independent replica (scripts/verify/value_indep.py -> tests/value_expected.json).
// The replica is pandas with no SQL shared with the app; if the app's queries or arithmetic drift, these fail.
import { test, expect, type Page } from '@playwright/test'
import path from 'node:path'
import fs from 'node:fs'

const X = JSON.parse(fs.readFileSync(path.resolve('tests/value_expected.json'), 'utf8'))
const SHOTS = path.resolve('tests/screenshots'); fs.mkdirSync(SHOTS, { recursive: true })
const pmpm = (n: number) => `$${n.toFixed(2)}`
const money = (n: number) => { const a = Math.abs(n); return a >= 1e9 ? `$${(n / 1e9).toFixed(2)}B` : a >= 1e6 ? `$${(n / 1e6).toFixed(1)}M` : a >= 1e4 ? `$${Math.round(n / 1e3).toLocaleString('en-US')}K` : `$${Math.round(n).toLocaleString('en-US')}` }
const totals = (p: Page) => p.locator('[data-testid=levers] tr[data-lever=total]')
const cell = (p: Page, lever: string, col: number) => p.locator(`[data-testid=levers] tr[data-lever=${lever}] td`).nth(col)
async function clean(p: Page) { await expect(p.locator('main')).not.toContainText('NaN'); await expect(p.locator('main')).not.toContainText('undefined'); await expect(p.locator('main')).not.toContainText('Infinity') }

test('value: payer tab matches the replica for a parent organization in a metro area', async ({ page }) => {
  const errors: string[] = []; page.on('pageerror', e => errors.push(e.message))
  const e = X.payer_baltimore_united
  await page.goto('/value?geo=12580&payer=united')
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.base.totalPmpm), { timeout: 120_000 })
  for (const [i, c] of ['min', 'base', 'stretch'].entries()) await expect(totals(page).locator(`td[data-case=${c}]`)).toHaveText(pmpm(e.cases[c].totalPmpm)), void i
  for (const k of ['readm', 'home', 'los', 'irf', 'ltch', 'ipdays', 'um']) for (const [i, c] of ['min', 'base', 'stretch'].entries()) await expect(cell(page, k, i + 1)).toHaveText(pmpm(e.cases[c].pmpm[k]))
  await expect(page.getByTestId('payer-result')).toContainText(`${Math.round(e.members).toLocaleString('en-US')} members of UnitedHealth Group, Inc.`)
  await expect(page.getByTestId('payer-result')).toContainText(money(e.cases.base.totalPerYear))
  // plan revenue: benchmark at the plan's own star tiers, CMS's average bid, rebate by star rating.
  // The risk score defaults to the one CMS published for these plans (tagged and footnoted); 1.0 and the user's own are one click away.
  const usd0 = (n: number) => `$${Math.round(n).toLocaleString('en-US')}`
  const R = e.rev
  await expect(page.getByTestId('risk-tag')).toHaveText('CMS-published, 2024 †')
  await expect(page.getByTestId('risk-footnote')).toContainText("The risk score is CMS's, not this tool's")
  await expect(page.getByTestId('bench-revenue')).toHaveText(usd0(R.bench * R.risk24))
  await expect(page.getByTestId('cms-payment')).toHaveText(usd0(R.payment1 * R.risk24))
  await expect(page.getByTestId('plan-revenue')).toContainText(`${R.stars.toFixed(2)}★`)
  // the revenue share is like for like: 2024-price savings over what CMS paid these plans in 2024, then that share applied to the 2027 payment
  const share24 = e.cases.base.totalPmpm / (R.base24 + R.rebate24)
  await expect(page.getByTestId('like-for-like')).toHaveText(`${(100 * share24).toFixed(2)}%`)
  await expect(page.getByTestId('carried')).toHaveText(pmpm(share24 * R.payment1 * R.risk24))
  await expect(page.getByTestId('pay-check')).toContainText(`${usd0(R.base24 + R.rebate24)} per member per month`)
  await expect(page.getByTestId('mlr-check')).toContainText(`${(100 * R.mlr23).toFixed(1)}%`)
  await expect(page.getByTestId('mlr-check')).toContainText('no figure on this page is calculated from it')
  await expect(page.getByTestId('trend')).toContainText('MA level used')
  await page.getByRole('radio', { name: '1.0', exact: true }).click()
  await expect(page.getByTestId('risk-tag')).toHaveText('Set to 1.0')
  await expect(page.getByTestId('risk-footnote')).toHaveCount(0)
  await expect(page.getByTestId('bench-revenue')).toHaveText(usd0(R.bench))
  await expect(page.getByTestId('cms-payment')).toHaveText(usd0(R.payment1))
  await page.getByRole('radio', { name: 'Your own' }).click()
  await page.getByLabel('Your own risk score').fill('1.25')
  await expect(page.getByTestId('risk-tag')).toHaveText('Your number')
  await expect(page.getByTestId('bench-revenue')).toHaveText(usd0(R.bench * 1.25))
  await page.getByRole('radio', { name: `CMS 2024: ${R.risk24.toFixed(2)}` }).click()
  // the plan's 2024 bid position is carried to today's average, never used as it stood in 2024
  await page.getByTestId('use-implied-bid').click()
  const nat24 = JSON.parse(fs.readFileSync(path.resolve('public/data/meta.json'), 'utf8')).underwriting.plan_payment.implied_bid_ratio
  const rho = Math.round(1000 * Math.min(1, Math.max(0.5, R.bidRatio + (R.impliedBid - nat24)))) / 1000
  await expect(page.getByTestId('cms-payment')).toHaveText(usd0(R.risk24 * (rho * R.bench + (1 - rho) * R.sBr)))
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.base.totalPmpm))   // revenue settings never change the savings
  await page.goto('/value?geo=12580&payer=united')
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.base.totalPmpm), { timeout: 120_000 })
  // the stretch case, then the unmanaged baseline
  await page.getByRole('radio', { name: 'Stretch' }).click()
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.stretch.totalPmpm))
  await expect(page).toHaveURL(/pc=stretch/)
  await page.getByRole('radio', { name: 'Unmanaged' }).click()
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(X.payer_baltimore_united_unmanaged.cases.stretch.totalPmpm))
  await clean(page)
  expect(errors).toEqual([])
})

test('value: payer tab for all Medicare Advantage in the United States, and an edited assumption', async ({ page }) => {
  const e = X.payer_us_all
  await page.goto('/value')
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.base.totalPmpm), { timeout: 120_000 })
  await expect(page.getByTestId('payer-baseline')).toContainText('Medicare Advantage here')
  await expect(page.getByTestId('bench-revenue')).toHaveText(`$${Math.round(e.rev.bench * e.rev.risk24).toLocaleString('en-US')}`)
  await expect(page.getByTestId('bonus-gap')).toContainText(`$${((e.rev.bench5 - e.rev.bench) * e.rev.risk24).toFixed(2)}`)
  await expect(page.getByTestId('routing-evidence')).toBeVisible()
  // doubling the readmission assumption doubles that lever and nothing else; the page marks the case as edited
  await page.getByLabel('Readmission rate, points removed').fill('2')
  await expect(page.getByText('Edited', { exact: true })).toBeVisible()
  await expect(cell(page, 'readm', 4)).toHaveText(pmpm(2 * e.cases.base.pmpm.readm))
  await expect(totals(page).locator('td[data-case=yours]')).toHaveText(pmpm(e.cases.base.totalPmpm + e.cases.base.pmpm.readm))
  await expect(page).toHaveURL(/pa=readmPts%3A2/)
  // reference figures are the user's own, drawn on the scale and kept in the link; nothing is built in
  await expect(page.getByTestId('ref-mark')).toHaveCount(0)
  await page.getByLabel('Reference figures, dollars per member per month').fill('11, 15, 20')
  await expect(page.getByTestId('ref-mark')).toHaveCount(3)
  await expect(page).toHaveURL(/ref=11%2C15%2C20/)
  await expect(page.getByTestId('per-100k')).toContainText('Right level of care')
  // picking a case clears the edit
  await page.getByRole('radio', { name: 'Base' }).click()
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(e.cases.base.totalPmpm))
  await page.screenshot({ path: path.join(SHOTS, '30-value-payer.png'), fullPage: true })
  // a state by name, and a second parent organization
  await page.goto('/value?geo=ST-MD&payer=humana')
  await expect(page.getByTestId('payer-pmpm')).toHaveText(pmpm(X.payer_md_humana.cases.base.totalPmpm), { timeout: 120_000 })
  await expect(page.getByTestId('payer-result')).toContainText('in Maryland')
  // a name that matches nothing is explained, not zero-filled
  await page.goto('/value?geo=12580&payer=zzzznotaplan')
  await expect(page.getByText('No Medicare Advantage enrollment matches.')).toBeVisible({ timeout: 120_000 })
  // characters that are not in any parent name are dropped: "%" is an empty filter (all plans), never a wildcard, and a quote cannot reach the query
  await page.goto('/value?geo=12580&payer=' + encodeURIComponent("%' OR 1=1 --"))
  await expect(page.getByText('No Medicare Advantage enrollment matches.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/value?geo=12580&payer=%25')
  await expect(page.getByTestId('payer-result')).toContainText('all Medicare Advantage plans', { timeout: 120_000 })
  // an unknown market and a market with no published baseline are explained
  await page.goto('/value?geo=99999')
  await expect(page.getByText('That market is not in the data.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/value?geo=ST-PR')
  await expect(page.getByText('No baseline for this market.')).toBeVisible({ timeout: 120_000 })
  await page.goto('/value?geo=ST-PR&tab=hospital')
  await expect(page.getByTestId('no-placements')).toBeVisible({ timeout: 120_000 })
  await clean(page)
})

test('value: hospital tab matches the replica for one hospital and for a market', async ({ page }) => {
  const e = X.hospital_390133
  await page.goto('/value?tab=hospital&h=390133')
  await expect(page.getByTestId('hospital-total')).toHaveText(money(e.cases.base.total), { timeout: 120_000 })
  for (const k of ['days', 'hrrp', 'vbp', 'readm', 'labor']) for (const [i, c] of ['min', 'base', 'stretch'].entries()) await expect(cell(page, k, i + 1)).toHaveText(money(e.cases[c].levers[k]))
  await expect(page.getByTestId('hospital-result')).toContainText(`${Math.round(e.placements).toLocaleString('en-US')} SNF-bound discharges`)
  await expect(page.getByTestId('hospital-baseline')).toContainText(money(e.hrrpPenalty))
  await page.screenshot({ path: path.join(SHOTS, '31-value-hospital.png'), fullPage: true })
  // a whole market: Maryland hospitals are exempt from the readmission penalty, and the page says so instead of showing $0 as a result
  const m = X.hospital_baltimore
  await page.goto('/value?tab=hospital&geo=12580')
  await expect(page.getByTestId('hospital-total')).toHaveText(money(m.cases.base.total), { timeout: 120_000 })
  await expect(page.getByTestId('hospital-result')).toContainText('exempt: not in the CMS penalty table')
  await expect(page.getByTestId('hospital-baseline')).toContainText(`${m.nUnusable} of the ${m.n} have no usable`)
  await clean(page)
})

test('value: SNF tab matches the replica, and refuses an implausible cost report', async ({ page }) => {
  const e = X.snf_one
  await page.goto(`/value?tab=snf&geo=12580&snf=${e.ccn}`)
  await expect(page.getByTestId('snf-total')).toHaveText(money(e.cases.base.total), { timeout: 120_000 })
  for (const k of ['fill', 'intake']) for (const [i, c] of ['min', 'base', 'stretch'].entries()) await expect(cell(page, k, i + 1)).toHaveText(money(e.cases[c].levers[k]))
  await expect(page.getByTestId('snf-result')).toContainText(e.medicaidDaysCarried.toFixed(1))
  const m = X.snf_baltimore
  await page.goto('/value?tab=snf&geo=12580&tier=all')
  await expect(page.getByTestId('snf-total')).toHaveText(money(m.cases.base.total), { timeout: 120_000 })
  await expect(page.getByTestId('snf-zero-sum')).toContainText('Read with care')
  // the default is the 4-5-star set
  await page.goto('/value?tab=snf&geo=12580')
  await expect(page.getByTestId('snf-total')).toHaveText(money(X.snf_baltimore_high.cases.base.total), { timeout: 120_000 })
  await expect(page.getByTestId('snf-zero-sum')).not.toContainText('Read with care')
  await expect(page.getByTestId('snf-market')).toBeVisible()
  await page.screenshot({ path: path.join(SHOTS, '32-value-snf.png'), fullPage: true })
  await page.goto(`/value?tab=snf&geo=12580&snf=${X.snf_refused.ccn}`)
  await expect(page.getByText('No cost report for this selection.')).toBeVisible({ timeout: 120_000 })
  await expect(page.getByText('times patient revenue')).toBeVisible()
  await clean(page)
})

test('value: market search finds a metro area and a state, and the tab is in the URL', async ({ page }) => {
  await page.goto('/value')
  await expect(page.getByTestId('payer-pmpm')).toBeVisible({ timeout: 120_000 })
  await page.getByLabel('Find a market').fill('baltimore')
  await page.getByRole('option').filter({ hasText: 'Baltimore-Columbia-Towson, MD' }).click()
  await expect(page).toHaveURL(/geo=12580/)
  await page.getByLabel('Find a market').fill('maryland')
  await expect(page.getByRole('option').first()).toContainText('Maryland (whole state)')
  await page.getByRole('radio', { name: 'Hospital', exact: true }).first().click()
  await expect(page).toHaveURL(/tab=hospital/)
  await expect(page.getByTestId('hospital-result')).toBeVisible({ timeout: 120_000 })
})
