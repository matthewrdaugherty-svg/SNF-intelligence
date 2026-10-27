const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
;(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const out = {}
  for (const ccn of process.argv.slice(3)) {
    const errors = []; page.removeAllListeners('pageerror'); page.on('pageerror', e => errors.push(e.message))
    await page.goto(`${BASE}/hospital/${ccn}`); await page.waitForSelector('h1', { timeout: 120000 }); await page.waitForFunction(() => /Nursing homes in the service area/.test(document.body.innerText), null, { timeout: 120000 }); await page.waitForTimeout(1500)
    const d = await page.evaluate(() => {
      const t = e => e ? e.innerText.trim() : null
      const grids = [...document.querySelectorAll('div.mt-6.grid, div.mt-3.grid')]
      const cards = grids.flatMap(g => [...g.children].map(c => ({ label: t(c.children[0]), value: t(c.children[1]), note: c.children[2] && !c.children[2].className.includes('h-1') ? t(c.children[2]) : null })))
      const sys = document.querySelector('[data-testid=system-link]')
      return { h1: t(document.querySelector('h1')), owners: t(document.querySelector('[data-testid=hospital-owners]')), system: t(sys), systemLinks: sys ? [...sys.querySelectorAll('a')].map(a => ({ text: a.innerText, href: a.getAttribute('href') })) : [], sentence: t(document.querySelector('p.mt-6')), cards, snfHdr: t([...document.querySelectorAll('section h2')].find(h => h.innerText.startsWith('Nursing homes'))) }
    })
    // follow each system link and read the Explore count
    for (const l of d.systemLinks) {
      await page.goto(`${BASE}${l.href}`); await page.waitForSelector('[data-testid=result-count]', { timeout: 120000 }); await page.waitForTimeout(800)
      l.exploreCount = await page.locator('[data-testid=result-count]').innerText(); l.exploreSub = await page.locator('[data-testid=result-count]').locator('..').innerText()
    }
    out[ccn] = { ...d, errors }; console.log(ccn, JSON.stringify({ owners: d.owners, system: d.system, links: d.systemLinks }))
  }
  fs.writeFileSync(process.argv[2], JSON.stringify(out, null, 1)); await b.close()
})()
