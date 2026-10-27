// Which Stat-card notes/values are cut by the fixed-height layout (line-clamp-2 / nowrap), per width.
const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
;(async () => {
  const b = await chromium.launch(); const res = {}
  const pages = ['/facility/215085', '/facility/015463', '/facility/035106', '/hospital/210009', '/cohorts?c=qm_521_adj.between.15_20&c=state.eq.MD']
  for (const w of [1440, 1024, 390]) {
    const page = await b.newPage({ viewport: { width: w, height: 900 } })
    for (const u of pages) {
      await page.goto(BASE + u); await page.waitForFunction(() => /Data as of 2026|rows · sorted by|Nursing homes in the service area/.test(document.body.innerText), null, { timeout: 120000 }); await page.waitForTimeout(1200)
      res[`${w} ${u}`] = await page.evaluate(() => [...document.querySelectorAll('div.rounded-\\[10px\\].p-4.flex.flex-col')].map(c => {
        const [lab, val, note] = [c.children[0], c.children[1], c.children[2]]
        const cut = e => e && (e.scrollHeight > e.clientHeight + 1 || e.scrollWidth > e.clientWidth + 1)
        return { label: lab.innerText, labelCut: cut(lab), valueCut: cut(val), noteCut: cut(note), note: note?.innerText }
      }).filter(x => x.labelCut || x.valueCut || x.noteCut))
    }
    if (w === 390) { await page.goto(BASE + '/facility/215085'); await page.waitForSelector('[data-testid=snapshot]'); await page.waitForTimeout(800); await page.locator('div.mt-3.grid').first().screenshot({ path: '../screenshots/redteam5-facility-215085-cards-390.png' }) }
    await page.close()
  }
  fs.writeFileSync('out_r5/cardclip.json', JSON.stringify(res, null, 1))
  for (const [k, v] of Object.entries(res)) for (const x of v) console.log(k, '|', x.label, '| cut:', x.labelCut ? 'label ' : '', x.valueCut ? 'VALUE ' : '', x.noteCut ? 'note' : '', '|', x.note?.replace(/\n/g, ' '))
  await b.close()
})()
