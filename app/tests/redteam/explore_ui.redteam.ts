// Red team: Explore UI interactions, NULL sorting, CSV export, column persistence, race on fast typing, ORDER BY injection.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out')
const SHOT = (n: string) => path.resolve(HERE, `../screenshots/redteam-${n}.png`)
const cnt = (p: Page) => p.getByTestId('result-count')
async function ready(p: Page) { await expect(cnt(p)).toBeVisible({ timeout: 120_000 }) }
async function csv(p: Page, name: string) {
  const [dl] = await Promise.all([p.waitForEvent('download'), p.getByRole('button', { name: 'Export CSV' }).click()])
  const f = path.join(OUT, name); await dl.saveAs(f); return fs.readFileSync(f, 'utf8')
}
const log: Record<string, unknown> = {}

test('UI clicks produce the same counts as URL filters', async ({ page }) => {
  await page.goto('/explore'); await ready(page)
  const panel = page.getByRole('complementary', { name: 'Filters' })
  await panel.getByRole('button', { name: 'CA', exact: true }).click()
  await panel.getByRole('group', { name: 'Overall star rating' }).getByRole('button', { name: '4' }).click()
  await panel.getByRole('group', { name: 'Overall star rating' }).getByRole('button', { name: '5' }).click()
  await panel.getByLabel('Non profit').check()
  await panel.getByLabel('Minimum beds').fill('50')
  await panel.getByLabel('Maximum beds').fill('120')
  await expect(cnt(page)).toHaveText('45')
  log.uiComboUrl = page.url()
  await page.screenshot({ path: SHOT('explore-ui-combo-1440') })
  // clear
  await panel.getByRole('button', { name: /^Clear/ }).click()
  await expect(cnt(page)).toHaveText('14,690')
  // flags
  await panel.getByLabel('Special focus facility or candidate').check()
  await expect(cnt(page)).toHaveText('527')
  await panel.getByLabel('Abuse icon').check()
  log.sffAbuse = await cnt(page).innerText()
})

test('fast typing: final count matches final query (no stale result wins)', async ({ page }) => {
  await page.goto('/explore'); await ready(page)
  const box = page.getByPlaceholder('e.g. Genesis, Baltimore, 215…')
  await box.pressSequentially('baltimore', { delay: 15 })
  await page.waitForTimeout(3000)
  log.fastTyping = { final: await cnt(page).innerText(), url: page.url() }
  await expect(cnt(page)).toHaveText('41')
  // rapid state toggles
  const panel = page.getByRole('complementary', { name: 'Filters' })
  await box.fill('')
  for (const s of ['TX', 'CA', 'NY', 'TX', 'FL', 'CA']) await panel.getByRole('button', { name: s, exact: true }).click()
  await page.waitForTimeout(3000)
  log.rapidStates = { final: await cnt(page).innerText(), url: page.url() }   // expect NY+FL
})

test('NULLS LAST in both directions, via exported CSV order', async ({ page }) => {
  for (const dir of ['asc', 'desc']) {
    await page.goto(`/explore?st=MD&sort=qm_521_adj&dir=${dir}`); await ready(page)
    const text = await csv(page, `sort_${dir}.csv`)
    const lines = text.replace(/^﻿/, '').split('\n'); const hdr = lines[0].split(',')
    const i = hdr.findIndex(h => h.includes('rehospitalized'))
    const vals = lines.slice(1).map(l => l.split(',')[i])
    const firstNull = vals.findIndex(v => v === ''), lastVal = vals.map(v => v !== '').lastIndexOf(true)
    const nums = vals.filter(v => v !== '').map(Number)
    const sorted = [...nums].sort((a, b) => dir === 'asc' ? a - b : b - a)
    log[`sort_${dir}`] = { n: vals.length, firstNull, lastNonNull: lastVal, nullsLast: firstNull === -1 || firstNull > lastVal, ordered: JSON.stringify(nums) === JSON.stringify(sorted), head: vals.slice(0, 3), tail: vals.slice(-3) }
  }
})

test('column picker persists across reload; CSV keeps leading zeros and blanks', async ({ page }) => {
  await page.goto('/explore?st=PR'); await ready(page)
  await page.getByRole('button', { name: /^Columns/ }).click()
  const dlg = page.getByRole('dialog', { name: 'Choose columns' })
  await dlg.getByLabel('ZIP').check(); await dlg.getByLabel('County').check()
  await page.screenshot({ path: SHOT('explore-column-picker') })
  // Escape should close a dialog (HIG); record whether it does
  await page.keyboard.press('Escape'); await page.waitForTimeout(200)
  log.pickerClosesOnEscape = !(await dlg.isVisible())
  if (await dlg.isVisible()) await dlg.getByRole('button', { name: 'Done' }).click()
  await page.reload(); await ready(page)
  const headers = await page.getByRole('row').first().innerText()
  log.persistedHeaders = headers
  expect(headers).toContain('ZIP')
  const text = await csv(page, 'pr_export.csv')
  log.prCsvHead = text.split('\n').slice(0, 4)
  await page.goto('/explore?q=235324'); await ready(page)
  log.suppressedCsv = (await csv(page, 'suppressed.csv')).split('\n').slice(0, 2)
  log.localStorage = await page.evaluate(() => localStorage.getItem('snf.explore.cols'))
})

test('radius: on-screen miles vs python haversine', async ({ page }) => {
  await page.goto('/explore?lat=39.2904&lng=-76.6122&mi=40&place=Baltimore&q=21508'); await ready(page)
  const text = await csv(page, 'radius.csv')
  log.radiusCsv = text.split('\n').slice(0, 15)
})

test('ORDER BY injection through ?sort= in a shared link', async ({ page }) => {
  const payload = "provider_name; UPDATE facility_master SET overall_rating = 5, provider_name = 'TAMPERED VIA LINK' WHERE ccn = '215085'; SELECT 1 AS provider_name, 1 AS x ORDER BY x"
  await page.goto('/explore?q=215085&sort=' + encodeURIComponent(payload)); await page.waitForTimeout(8000)
  log.injectionScreen = await page.locator('main').innerText()
  await page.screenshot({ path: SHOT('explore-sort-injection') })
  // navigate in-app (no reload) to the facility
  await page.goto('/explore?q=215085'); // reload resets DB: control
  await ready(page)
  log.afterReload = await page.getByRole('row').nth(1).innerText()
})

test('ORDER BY injection then in-app navigation (same DB instance)', async ({ page }) => {
  const payload = "provider_name; UPDATE facility_master SET overall_rating = 5, provider_name = 'TAMPERED VIA LINK' WHERE ccn = '215085'; SELECT 1 AS provider_name, 1 AS x ORDER BY x"
  await page.goto('/explore?q=215085&sort=' + encodeURIComponent(payload)); await page.waitForTimeout(8000)
  // client-side nav: click Explore in the header twice to reset sort param
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Map' }).click()
  await page.waitForTimeout(1500)
  await page.getByRole('navigation', { name: 'Main' }).getByRole('link', { name: 'Explore' }).click()
  await page.getByPlaceholder('e.g. Genesis, Baltimore, 215…').fill('215085')
  await page.waitForTimeout(2000)
  log.inAppAfterInjection = await page.locator('main').innerText()
  await page.screenshot({ path: SHOT('explore-after-sort-injection') })
})

test.afterAll(() => { fs.writeFileSync(path.join(OUT, 'explore_ui.json'), JSON.stringify(log, null, 1)) })
