// Red team round 5: load /cohorts with each query string in scenarios file, dump everything rendered. Usage: node r5_cohort_dump.cjs <scenarios.json> <out.json>
const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
;(async () => {
  const scen = JSON.parse(fs.readFileSync(process.argv[2], 'utf8'))
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true })
  const out = {}
  for (const [name, qs] of Object.entries(scen)) {
    const page = await ctx.newPage()
    const errors = [], consoleErr = []
    page.on('pageerror', e => errors.push(e.message))
    page.on('console', m => { if (m.type() === 'error' || m.type() === 'warning') consoleErr.push(m.text().slice(0, 300)) })
    const t0 = Date.now()
    try {
      await page.goto(`${BASE}/cohorts?${qs}`, { timeout: 120000 })
      await page.waitForFunction(() => { const t = document.body.innerText; return /rows · sorted by|could not be run|No facilities meet/.test(t) }, null, { timeout: 120000 })
      await page.waitForTimeout(400)
      const d = await page.evaluate(() => {
        const t = e => e ? e.innerText.trim() : null
        const cards = [...document.querySelectorAll('div.mt-3.grid > div')].map(c => ({ label: t(c.children[0]), value: t(c.children[1]), note: c.children[2] && !c.children[2].className.includes('h-1') ? t(c.children[2]) : null, tone: [...c.querySelectorAll('div.h-1')].map(x => x.style.background)[0] ?? null }))
        const secs = [...document.querySelectorAll('section')]
        const condSec = secs[0]
        const desc = t(condSec.querySelector('div.text-xs.text-ink-3.mt-2'))
        const nRows = condSec.querySelectorAll('select[aria-label="Measure"]').length
        const inputs = [...condSec.querySelectorAll('div.flex.flex-wrap')].map(r => [...r.querySelectorAll('select,input')].map(x => x.value))
        const grpSec = secs.find(s => /^By /.test(s.querySelector('h2')?.innerText ?? ''))
        const groups = grpSec ? [...grpSec.querySelectorAll('tbody tr')].map(tr => [...tr.querySelectorAll('td')].map(t)) : null
        const svg = document.querySelector('svg[role=img]')
        const hist = svg ? { texts: [...svg.querySelectorAll('text')].map(x => { const b = x.getBBox(); return { s: x.textContent, x: b.x, y: b.y, w: b.width, h: b.height } }), vb: svg.getAttribute('viewBox'), bars: svg.querySelectorAll('rect').length } : null
        const facSec = secs.find(s => s.querySelector('h2')?.innerText === 'Facilities')
        const facHdr = facSec ? t(facSec.querySelector('span.text-xs')) : null
        const metric = document.querySelector('select[aria-label="Focus measure"]')?.value ?? null
        const groupBy = document.querySelector('select[aria-label="Break down by"]')?.value ?? null
        const empty = [...document.querySelectorAll('div.p-8')].map(t)
        return { url: location.search, desc, nRows, inputs, cards, groups, hist, facHdr, metric, groupBy, empty, h2: secs.map(s => t(s.querySelector('h2'))) }
      })
      out[name] = { qs, ms: Date.now() - t0, ...d, errors, consoleErr }
    } catch (e) { out[name] = { qs, fail: String(e).slice(0, 400), errors, consoleErr, body: (await page.evaluate(() => document.body.innerText).catch(() => '')).slice(0, 800) } }
    process.stdout.write(`${name}: ${out[name].fail ? 'FAIL' : out[name].cards?.[0]?.value} (${Date.now() - t0} ms)\n`)
    await page.close()
  }
  fs.writeFileSync(process.argv[3], JSON.stringify(out, null, 1))
  await browser.close()
})()
