// Red team: Discharge flows upload, math dump, persistence and removal. flows_check.py recomputes everything from db/snf.duckdb.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out'), FL = path.resolve(HERE, 'flows')
const SHOT = (n: string) => path.resolve(HERE, `../screenshots/redteam-${n}.png`)
async function dump(p: Page) {
  return p.evaluate(() => {
    const t = (e: Element | null | undefined) => (e as HTMLElement | null)?.innerText.trim() ?? null
    const main = document.querySelector('main')!
    const status = t([...main.querySelectorAll('div.mt-3.text-sm')][0])
    const cards = [...main.querySelectorAll('div.mt-4.grid.gap-3 > div')].map(d => [...d.children].map(t))
    const weighted = t([...main.querySelectorAll('div.mt-3.text-sm.text-ink-2')][0])
    const tables = [...main.querySelectorAll('table')].map(tb => [...tb.querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td,th')].map(t)))
    const hospitalSel = (main.querySelector('select') as HTMLSelectElement | null)
    const altText = t([...main.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.includes('near this hospital'))?.querySelector('div.text-sm.text-ink-2'))
    return { status, cards, weighted, tables, altText, hospital: hospitalSel?.value ?? null, options: hospitalSel ? [...hospitalSel.options].map(o => o.text) : [], ls: localStorage.getItem('snf.flows.csv')?.length ?? null, body: t(main) }
  })
}
async function open(p: Page) { await p.goto('/flows'); await expect(p.getByRole('heading', { name: 'Discharge flows' })).toBeVisible({ timeout: 120_000 }) }
async function upload(p: Page, f: string) { await p.locator('input[type=file]').setInputFiles(path.join(FL, f)); await p.waitForTimeout(2500) }
const R: Record<string, unknown> = {}
test('flows suite', async ({ page }) => {
  const errs: string[] = []; page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()) })
  await open(page)
  await upload(page, 'a_wellformed.csv'); R.a_jhh_15 = await dump(page); await page.screenshot({ path: SHOT('flows-a-1440'), fullPage: true })
  const slider = page.getByRole('slider', { name: 'Radius in miles' })
  await slider.focus(); for (let i = 0; i < 10; i++) await page.keyboard.press('ArrowLeft'); await page.waitForTimeout(1500)
  R.a_jhh_5 = await dump(page)
  await page.getByRole('combobox', { name: 'Hospital' }).selectOption('050600'); await page.waitForTimeout(1500)
  R.a_lac = await dump(page)
  // persistence
  await page.reload(); await expect(page.getByRole('heading', { name: 'Discharge flows' })).toBeVisible({ timeout: 120_000 }); await page.waitForTimeout(3000)
  R.a_after_reload = await dump(page)
  // remove
  await page.getByRole('button', { name: 'Remove uploaded data' }).click(); await page.waitForTimeout(1000)
  R.a_after_remove = await dump(page)
  await page.reload(); await expect(page.getByRole('heading', { name: 'Discharge flows' })).toBeVisible({ timeout: 120_000 }); await page.waitForTimeout(2500)
  R.a_after_remove_reload = await dump(page)
  for (const f of ['b_edge.csv', 'c1_missing_column.csv', 'c2_bad_rows.csv', 'c3_impossible_date.csv', 'c4_number_forms.csv']) {
    errs.length = 0
    await open(page); await page.evaluate(() => localStorage.removeItem('snf.flows.csv')); await open(page)
    await upload(page, f); R[f] = { ...(await dump(page)), pageErrors: [...errs] }
    await page.screenshot({ path: SHOT('flows-' + f.replace('.csv', '')), fullPage: true })
  }
  // a valid upload followed by an all-invalid upload: what stays in localStorage / on reload?
  await open(page); await upload(page, 'a_wellformed.csv'); await upload(page, 'c1_missing_column.csv')
  R.bad_after_good = await dump(page)
  await page.reload(); await expect(page.getByRole('heading', { name: 'Discharge flows' })).toBeVisible({ timeout: 120_000 }); await page.waitForTimeout(3000)
  R.bad_after_good_reload = await dump(page)
  fs.writeFileSync(path.join(OUT, 'flows.json'), JSON.stringify(R, null, 1))
})
