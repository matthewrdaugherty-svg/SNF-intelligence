// Red team: dump every value rendered on /facility/<ccn> for the 8 sampled CCNs; compare_facility.py checks them against db/snf.duckdb.
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out')
const picked: Record<string, string> = JSON.parse(fs.readFileSync(path.join(OUT, 'picked.json'), 'utf8'))
for (const ccn of Object.keys(picked)) {
  test(`dump facility ${ccn}`, async ({ page }) => {
    const errors: string[] = []
    page.on('pageerror', e => errors.push(e.message))
    await page.goto(`/facility/${ccn}`)
    await expect(page.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 120_000 })
    await expect(page.getByText(/Data as of 2026/)).toBeVisible()
    await page.waitForTimeout(500)
    const dump = await page.evaluate(() => {
      const t = (e: Element | null) => (e as HTMLElement | null)?.innerText.trim() ?? null
      const h1 = document.querySelector('h1')!
      const head = h1.parentElement!
      const subs = [...head.querySelectorAll(':scope > div.text-sm')].map(t)
      const flags = [...head.querySelectorAll(':scope > div.flex span')].map(t)
      const cards = [...document.querySelectorAll('div.mt-6.grid.grid-cols-4 > div')].map(c => ({ label: t(c.children[0]), body: t(c.children[1]), fnTitle: c.querySelector('[title]:not(span.inline-flex)')?.getAttribute('title') ?? null }))
      const measures: Record<string, { cells: (string | null)[]; fnTitle: string | null }> = {}
      document.querySelectorAll('[data-testid^="measure-"]').forEach(r => {
        const k = r.getAttribute('data-testid')!.slice(8)
        const fnEl = r.children[1].querySelector('span.cursor-help')
        measures[k] = { cells: [...r.children].map(t), fnTitle: fnEl?.getAttribute('title') ?? null }
      })
      const sections = [...document.querySelectorAll('section')].map(s => ({ h2: t(s.querySelector('h2')), text: t(s) }))
      const enf = [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.startsWith('Inspections'))!
      const grid2 = enf.querySelector('div.grid.grid-cols-2')!
      const penHeader = t(grid2.children[0].children[0])
      const penRows = [...grid2.children[0].querySelectorAll('tr')].map(tr => [...tr.querySelectorAll('td')].map(t))
      const citHeader = t(grid2.children[1].children[0])
      const citRows = [...grid2.children[1].querySelectorAll('div.py-1\\.5')].map(d => ({ meta: [...d.children[0].querySelectorAll('span')].map(t), desc: t(d.children[1]) }))
      const ownSec = [...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.textContent?.startsWith('Ownership'))!
      const ownIntro = t(ownSec.querySelector('p'))
      const ownGroups = [...ownSec.querySelectorAll('div.grid > div')].map(g => ({ role: t(g.children[0]), people: [...g.children].slice(1).map(t) }))
      return { h1: t(h1), subs, flags, cards, measures, penHeader, penRows, citHeader, citRows, ownIntro, ownGroups, sectionTitles: sections.map(s => s.h2) }
    })
    fs.writeFileSync(path.join(OUT, `facility_${ccn}.json`), JSON.stringify({ ...dump, errors }, null, 1))
    await page.screenshot({ path: path.resolve(HERE, `../screenshots/redteam-facility-${ccn}.png`), fullPage: true })
  })
}
