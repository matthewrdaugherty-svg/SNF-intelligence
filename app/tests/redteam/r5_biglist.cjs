const { chromium } = require('@playwright/test')
const BASE = process.env.BASE || 'http://localhost:4180'
;(async () => {
  const b = await chromium.launch(); const page = await b.newPage()
  const errs = []; page.on('pageerror', e => errs.push(e.message))
  await page.goto(`${BASE}/cohorts?c=overall_rating.in.5`); await page.waitForFunction(() => /rows · sorted by/.test(document.body.innerText), null, { timeout: 120000 })
  const lists = {
    stars20000: 'c=' + encodeURIComponent('overall_rating.in.' + Array(4000).fill('1,2,3,4,5').join(',')),
    hosp3000: 'c=' + encodeURIComponent('hospital_area.in.' + Array(3000).fill('210009').join(',')),
    hosp3000distinct: 'c=' + encodeURIComponent('hospital_area.in.' + Array.from({ length: 3000 }, (_, i) => String(100000 + i)).join(',')),
    conds500: Array.from({ length: 500 }, (_, i) => 'c=' + encodeURIComponent(`qm_521_adj.ge.${i % 10}`)).join('&'),
  }
  for (const [k, qs] of Object.entries(lists)) {
    const t0 = Date.now()
    await page.evaluate(q => { history.pushState({}, '', '/cohorts?' + q); dispatchEvent(new PopStateEvent('popstate')) }, qs)
    await page.waitForTimeout(300)
    await page.waitForFunction(() => /rows · sorted by|could not be run|No facilities meet/.test(document.body.innerText), null, { timeout: 120000 })
    await page.waitForTimeout(1500)
    const r = await page.evaluate(() => ({ n: document.querySelector('div.mt-3.grid > div')?.children[1]?.innerText, rows: document.querySelectorAll('select[aria-label="Measure"]').length, desc: (document.querySelector('section div.text-xs.text-ink-3.mt-2')?.innerText ?? '').slice(0, 120), descLen: (document.querySelector('section div.text-xs.text-ink-3.mt-2')?.innerText ?? '').length, err: document.body.innerText.match(/could not be run[^\n]*\n?[^\n]*/)?.[0] ?? null, urlLen: location.search.length }))
    console.log(k, Date.now() - t0, 'ms', JSON.stringify(r))
  }
  console.log('pageerrors', errs)
  await b.close()
})()
