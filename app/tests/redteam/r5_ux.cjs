const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
const SHOT = '../screenshots/'
const measure = () => {
  const vw = innerWidth, out = { vw, docScroll: document.documentElement.scrollWidth, overflowers: [], clipped: [], tinyText: [] }
  const scrollParent = el => { for (let p = el.parentElement; p; p = p.parentElement) { const s = getComputedStyle(p); if (/(auto|scroll|hidden)/.test(s.overflowX) && p !== document.body && p !== document.documentElement) return p } return null }
  for (const el of document.querySelectorAll('body *')) {
    const r = el.getBoundingClientRect(); if (!r.width || !r.height) continue
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue
    if (r.right > vw + 1 && !scrollParent(el)) out.overflowers.push(`${el.tagName}.${(el.className?.baseVal ?? el.className ?? '').toString().slice(0, 40)} "${(el.innerText || '').slice(0, 30)}" right=${Math.round(r.right)}`)
    if (el.children.length === 0 && el.innerText && el.scrollWidth > el.clientWidth + 1 && (s.textOverflow === 'ellipsis' || s.overflow === 'hidden')) out.clipped.push(`"${el.innerText.slice(0, 60)}" ${el.clientWidth}/${el.scrollWidth}`)
  }
  out.overflowers = out.overflowers.slice(0, 15); out.clipped = out.clipped.slice(0, 25)
  return out
}
;(async () => {
  const b = await chromium.launch(); const res = {}
  for (const w of [1440, 1024, 390]) {
    const page = await b.newPage({ viewport: { width: w, height: w === 390 ? 844 : 900 }, deviceScaleFactor: w === 390 ? 2 : 1 })
    // cohorts: a cohort with overlapping histogram labels + several conditions
    await page.goto(`${BASE}/cohorts?c=qm_521_adj.between.15_20&c=state.eq.MD&c=hospital_area.in.210009%2C210022&g=chain`); await page.waitForFunction(() => /rows · sorted by/.test(document.body.innerText), null, { timeout: 120000 }); await page.waitForTimeout(800)
    res[`cohorts-${w}`] = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOT}redteam5-cohorts-${w}.png`, fullPage: true })
    const svg = page.locator('svg[role=img]'); if (await svg.count()) await svg.screenshot({ path: `${SHOT}redteam5-cohorts-histogram-${w}.png` })
    // facility
    await page.goto(`${BASE}/facility/215085`); await page.waitForSelector('[data-testid=snapshot]', { timeout: 120000 }); await page.waitForTimeout(800)
    res[`facility-${w}`] = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOT}redteam5-facility-215085-${w}.png`, fullPage: true })
    // explore, filters open, System mode with a pending system
    await page.goto(`${BASE}/explore`); await page.waitForSelector('[data-testid=result-count]', { timeout: 120000 })
    if (w === 390) await page.getByRole('button', { name: 'Filters' }).click()
    const aside = page.locator('aside[aria-label=Filters]')
    await aside.getByRole('radio', { name: 'System' }).click()
    await aside.getByRole('combobox', { name: 'Find a hospital system' }).fill('HCA'); await page.waitForSelector('#hosp-results'); await page.waitForTimeout(500)
    res[`explore-results-${w}`] = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOT}redteam5-explore-system-results-${w}.png` })
    await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(400)
    res[`explore-pending-${w}`] = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOT}redteam5-explore-system-${w}.png` })
    await page.locator('[data-testid=system-states] button.btn-primary').click(); await page.waitForTimeout(1500)
    res[`explore-added-${w}`] = await page.evaluate(measure)
    await page.screenshot({ path: `${SHOT}redteam5-explore-system-added-${w}.png` })
    await page.close()
  }
  fs.writeFileSync('out_r5/ux.json', JSON.stringify(res, null, 1)); console.log(JSON.stringify(res, null, 1)); await b.close()
})()
