const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
const ccns = process.argv.slice(3)
;(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const out = {}
  for (const ccn of ccns) {
    const errors = []; page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${BASE}/facility/${ccn}`); await page.waitForSelector('[data-testid=snapshot]', { timeout: 120000 }); await page.waitForFunction(() => /Data as of 2026/.test(document.body.innerText)); await page.waitForTimeout(600)
    // open every "How this is calculated"
    for (const btn of await page.getByRole('button', { name: 'How this is calculated' }).all()) await btn.click()
    await page.waitForTimeout(200)
    const d = await page.evaluate(() => {
      const t = e => e ? e.innerText.trim() : null
      const grids = [...document.querySelectorAll('div.mt-5.grid, div.mt-3.grid')]
      const starCards = [...grids[0].children].map(c => ({ label: t(c.children[0]), body: t(c.children[1]), avg: t(c.children[2]) }))
      const statCards = [...grids[1].children].map(c => ({ label: t(c.children[0]), value: t(c.children[1]), note: c.children[2] && !c.children[2].className.includes('h-1') ? t(c.children[2]) : null, tone: c.querySelector('div.h-1')?.style.background ?? null, how: t(c.querySelector('div.border-t')), source: t(c.querySelector('div.mt-auto span')) }))
      const m = {}; document.querySelectorAll('[data-testid^="measure-"]').forEach(r => { m[r.getAttribute('data-testid').slice(8)] = [...r.children].map(t) })
      return { h1: t(document.querySelector('h1')), snapshot: t(document.querySelector('[data-testid=snapshot]')), pecos: t(document.querySelector('[data-testid=pecos]')), ownIntro: t([...document.querySelectorAll('section')].find(s => s.querySelector('h2')?.innerText.startsWith('Ownership'))?.querySelector('p')), starCards, statCards, m521: m['qm_521_adj'], mStaff: m['reported_total_nurse_staffing_hours_per_resident_per_day'], m004: m['qrp_004_ppr_pd_rsrr'], mFines: m['pen_total_fines_usd'] }
    })
    out[ccn] = { ...d, errors }
    await page.screenshot({ path: `../screenshots/redteam5-facility-${ccn}-1440.png`, fullPage: false })
    console.log(ccn, 'ok', errors)
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1)); await b.close()
})()
