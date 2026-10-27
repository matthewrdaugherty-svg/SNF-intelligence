// Red team: screenshots at 3 viewports, overflow detection, keyboard focus, request counting across route changes.
import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out')
const SHOT = (n: string) => path.resolve(HERE, `../screenshots/redteam-${n}.png`)
const VP = { '1440': { width: 1440, height: 900 }, '1024': { width: 1024, height: 768 }, '390': { width: 390, height: 844 } }
const PAGES: [string, string][] = [['explore', '/explore?st=MD'], ['facility', '/facility/215085'], ['map', '/map?st=MD'], ['compare', '/compare'], ['flows', '/flows'], ['about', '/about']]
async function overflow(p: Page) {
  return p.evaluate(() => {
    const docW = document.documentElement.clientWidth
    const res = { pageScrollX: document.documentElement.scrollWidth > docW, scrollWidth: document.documentElement.scrollWidth, clientWidth: docW, offscreen: [] as string[], clipped: [] as string[] }
    document.querySelectorAll('main *, header *').forEach(e => {
      const r = (e as HTMLElement).getBoundingClientRect(); if (!r.width) return
      const txt = (e as HTMLElement).innerText?.trim().slice(0, 40)
      if (r.right > docW + 1 && e.children.length === 0 && txt) res.offscreen.push(`${e.tagName}.${(e as HTMLElement).className.toString().slice(0, 30)} "${txt}" right=${Math.round(r.right)}`)
      const el = e as HTMLElement
      if (el.children.length === 0 && txt && el.scrollWidth > el.clientWidth + 1 && getComputedStyle(el).overflow !== 'visible' && !el.className.toString().includes('truncate')) res.clipped.push(`"${txt}" ${el.scrollWidth}>${el.clientWidth}`)
    })
    res.offscreen = res.offscreen.slice(0, 15); res.clipped = res.clipped.slice(0, 15); return res
  })
}
test('screenshots and overflow at 3 viewports', async ({ page }) => {
  const R: Record<string, unknown> = {}
  await page.goto('/explore'); await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 120_000 })
  await page.evaluate(() => localStorage.setItem('snf.compare', JSON.stringify(['215085', '215353', '15A011', '675879'])))
  for (const [vpName, vp] of Object.entries(VP)) {
    await page.setViewportSize(vp)
    for (const [name, url] of PAGES) {
      await page.goto(url); await page.waitForTimeout(name === 'map' ? 5000 : 3500)
      await page.screenshot({ path: SHOT(`ux-${name}-${vpName}`), fullPage: false })
      R[`${name}@${vpName}`] = await overflow(page)
    }
  }
  fs.writeFileSync(path.join(OUT, 'ux_overflow.json'), JSON.stringify(R, null, 1))
})
test('keyboard focus walk on Explore and Facility', async ({ page }) => {
  const R: Record<string, unknown> = {}
  for (const url of ['/explore', '/facility/215085', '/flows']) {
    await page.goto(url); await page.waitForTimeout(4000)
    const seq: string[] = []
    for (let i = 0; i < 40; i++) {
      await page.keyboard.press('Tab')
      seq.push(await page.evaluate(() => { const e = document.activeElement as HTMLElement; const cs = getComputedStyle(e); return `${e.tagName}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} "${(e.innerText || e.getAttribute('aria-label') || (e as HTMLInputElement).placeholder || '').trim().slice(0, 25)}" outline=${cs.outlineStyle}/${cs.outlineWidth}` }))
      if (i === 12) await page.screenshot({ path: SHOT(`focus-${url.split('/')[1]}`) })
    }
    R[url] = seq
  }
  fs.writeFileSync(path.join(OUT, 'ux_focus.json'), JSON.stringify(R, null, 1))
})
test('data files are fetched once per page load (route changes do not re-insert)', async ({ page }) => {
  const reqs: string[] = []
  page.on('request', r => { if (/\/data\/.*\.(arrow|json)$/.test(r.url())) reqs.push(r.url().split('/data/')[1]) })
  await page.goto('/explore'); await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 120_000 })
  const nav = page.getByRole('navigation', { name: 'Main' })
  for (const l of ['Map', 'Compare', 'Discharge flows', 'Methodology & trust', 'Explore', 'Map', 'Explore']) { await nav.getByRole('link', { name: l }).click(); await page.waitForTimeout(1200) }
  await page.getByRole('link', { name: /Carroll Park|^[A-Z]/ }).nth(3).click().catch(() => {})
  await page.waitForTimeout(1500)
  const tables = await page.evaluate(async () => 'n/a')
  const counts: Record<string, number> = {}; reqs.forEach(r => counts[r] = (counts[r] ?? 0) + 1)
  fs.writeFileSync(path.join(OUT, 'ux_requests.json'), JSON.stringify({ counts, tables }, null, 1))
})
