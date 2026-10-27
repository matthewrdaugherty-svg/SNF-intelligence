const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
;(async () => {
  const b = await chromium.launch(); const ctx = await b.newContext({ acceptDownloads: true }); const page = await ctx.newPage()
  for (const [k, qs] of Object.entries({ hopkins: 'c=hospital_area.in.210009&m=qrp_004_ppr_pd_rsrr', unrated: 'c=overall_rating.blank.' })) {
    await page.goto(`${BASE}/cohorts?${qs}`); await page.waitForFunction(() => /rows · sorted by/.test(document.body.innerText), null, { timeout: 120000 }); await page.waitForTimeout(500)
    const [dl] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Export CSV' }).click()])
    const p = `out_r5/cohort_${k}.csv`; await dl.saveAs(p); console.log(k, dl.suggestedFilename(), fs.statSync(p).size)
  }
  await b.close()
})()
