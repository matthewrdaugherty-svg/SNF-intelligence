const { chromium } = require('@playwright/test')
const fs = require('fs')
const BASE = process.env.BASE || 'http://localhost:4180'
const SHOT = '../screenshots/'
;(async () => {
  const b = await chromium.launch(); const page = await b.newPage({ viewport: { width: 1440, height: 900 } })
  const errors = []; page.on('pageerror', e => errors.push(e.message))
  const out = {}
  const count = async () => { await page.waitForTimeout(1200); return page.locator('[data-testid=result-count]').innerText() }
  const aside = page.locator('aside[aria-label=Filters]')
  async function search(text) {
    await aside.getByRole('radio', { name: 'System' }).click()
    const inp = aside.getByRole('combobox', { name: 'Find a hospital system' }); await inp.fill(''); await inp.fill(text)
    await page.waitForSelector('#hosp-results', { timeout: 20000 }); await page.waitForTimeout(400)
    return page.locator('#hosp-results li').allInnerTexts()
  }
  const pending = async () => ({ head: await page.locator('[data-testid=system-states]').innerText().catch(() => null), chips: await page.locator('[data-testid=system-states] [role=group] button').evaluateAll(bs => bs.map(x => `${x.innerText}|${x.getAttribute('aria-pressed')}`)), add: await page.locator('[data-testid=system-states] button.btn-primary').evaluate(x => `${x.innerText}|disabled=${x.disabled}`).catch(() => null) })
  const note = () => page.locator('aside [role=status]').innerText().catch(() => null)
  await page.goto(`${BASE}/explore`); await page.waitForSelector('[data-testid=result-count]', { timeout: 120000 })
  // 1 Hopkins, all states
  out.hopkins_results = await search('johns hopkins')
  await page.screenshot({ path: SHOT + 'redteam5-explore-system-results-1440.png' })
  await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  out.hopkins_pending = await pending()
  await page.screenshot({ path: SHOT + 'redteam5-explore-system-1440.png' })
  await page.locator('[data-testid=system-states] button.btn-primary').click(); out.hopkins_all = { note: await note(), count: await count(), url: page.url() }
  await aside.getByRole('button', { name: /Remove all/ }).click(); await page.waitForTimeout(500)
  // 2 Hopkins MD only
  await search('johns hopkins'); await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  for (const st of ['DC', 'FL']) await page.locator('[data-testid=system-states] [role=group] button', { hasText: new RegExp('^' + st + ' ') }).click()
  out.hopkins_md_pending = await pending()
  await page.locator('[data-testid=system-states] button.btn-primary').click(); out.hopkins_md = { note: await note(), count: await count() }
  await aside.getByRole('button', { name: /Remove all/ }).click(); await page.waitForTimeout(500)
  // 3 HCA TX only
  out.hca_results = await search('HCA')
  await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  const chips = page.locator('[data-testid=system-states] [role=group] button')
  for (let i = 0; i < await chips.count(); i++) { const t = await chips.nth(i).innerText(); if (!t.startsWith('TX ')) await chips.nth(i).click() }
  out.hca_tx_pending = await pending()
  await page.screenshot({ path: SHOT + 'redteam5-explore-system-hca-tx-1440.png' })
  await page.locator('[data-testid=system-states] button.btn-primary').click(); out.hca_tx = { note: await note(), count: await count() }
  await aside.getByRole('button', { name: /Remove all/ }).click(); await page.waitForTimeout(500)
  // 4 small 2-state system
  out.uk_results = await search('University of Kentucky')
  await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  out.uk_pending = await pending()
  await page.locator('[data-testid=system-states] button.btn-primary').click(); out.uk_all = { note: await note(), count: await count() }
  await aside.getByRole('button', { name: /Remove all/ }).click().catch(() => {}); await aside.getByRole('button', { name: /^Remove / }).first().click().catch(() => {}); await page.waitForTimeout(500)
  await search('University of Kentucky'); await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  await page.locator('[data-testid=system-states] [role=group] button', { hasText: /^KY / }).click(); out.uk_oh_only = await pending()
  await page.locator('[data-testid=system-states]').getByRole('button', { name: 'Cancel' }).click()
  // 5 Enter picks the first result: independent systems
  for (const s of ['Providence', 'Henry Ford', 'HonorHealth', 'Memorial Hermann', 'Baylor']) {
    await aside.getByRole('radio', { name: 'System' }).click()
    const inp = aside.getByRole('combobox', { name: 'Find a hospital system' }); await inp.fill(s); await page.waitForSelector('#hosp-results', { timeout: 20000 }); await page.waitForTimeout(400)
    await inp.press('Enter'); await page.waitForTimeout(500)
    out['enter_' + s] = (await pending()).head
    await page.locator('[data-testid=system-states]').getByRole('button', { name: 'Cancel' }).click().catch(() => {})
  }
  // 6 contrast of chips + focus order
  await search('johns hopkins'); await page.locator('#hosp-results li button').first().click(); await page.waitForTimeout(300)
  await page.locator('[data-testid=system-states] [role=group] button', { hasText: /^FL / }).click()
  out.chipStyles = await page.locator('[data-testid=system-states] [role=group] button').evaluateAll(bs => bs.map(x => { const s = getComputedStyle(x); let p = x.parentElement; let bg = s.backgroundColor; return { t: x.innerText, color: s.color, bg, parentBg: getComputedStyle(x.closest('[data-testid=system-states]')).backgroundColor, fontSize: s.fontSize } }))
  await page.screenshot({ path: SHOT + 'redteam5-explore-system-chips-1440.png' })
  await aside.getByRole('radio', { name: 'System' }).focus()
  const order = []
  for (let i = 0; i < 14; i++) { await page.keyboard.press('Tab'); order.push(await page.evaluate(() => { const e = document.activeElement; const s = getComputedStyle(e); return `${e.tagName}${e.getAttribute('role') ? '[' + e.getAttribute('role') + ']' : ''} "${(e.innerText || e.getAttribute('aria-label') || e.getAttribute('placeholder') || '').slice(0, 40)}" outline=${s.outlineStyle}/${s.outlineWidth} shadow=${s.boxShadow === 'none' ? 'none' : 'yes'}` })) }
  out.focusOrder = order
  // keyboard into results list: ArrowDown from the combobox
  const inp = aside.getByRole('combobox', { name: 'Find a hospital system' }); await inp.fill('mercy'); await page.waitForSelector('#hosp-results'); await page.waitForTimeout(400); await inp.focus(); await page.keyboard.press('ArrowDown')
  out.arrowDown = await page.evaluate(() => `${document.activeElement.tagName} ${document.activeElement.getAttribute('aria-label') ?? ''} activedescendant=${document.activeElement.getAttribute('aria-activedescendant')}`)
  await page.keyboard.press('Tab'); out.tabFromInput = await page.evaluate(() => `${document.activeElement.tagName} "${(document.activeElement.innerText || '').slice(0, 50)}"`)
  out.errors = errors
  fs.writeFileSync('out_r5/picker.json', JSON.stringify(out, null, 1)); console.log(JSON.stringify(out, null, 1)); await b.close()
})()
