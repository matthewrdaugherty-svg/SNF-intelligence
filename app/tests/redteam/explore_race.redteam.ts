import { test, expect, type Page } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out')
const cnt = (p: Page) => p.getByTestId('result-count')
test('UI clicks combo', async ({ page }) => {
  const log: Record<string, unknown> = {}
  await page.goto('/explore'); await expect(cnt(page)).toBeVisible({ timeout: 120_000 })
  const panel = page.getByRole('complementary', { name: 'Filters' })
  await panel.getByRole('button', { name: 'CA', exact: true }).click(); await page.waitForTimeout(800); log.ca = await cnt(page).innerText()
  await panel.getByRole('group', { name: 'Overall star rating' }).getByRole('button', { name: '4' }).click()
  await panel.getByRole('group', { name: 'Overall star rating' }).getByRole('button', { name: '5' }).click(); await page.waitForTimeout(800); log.ca45 = await cnt(page).innerText()
  await panel.getByLabel('Non profit').click(); await page.waitForTimeout(800); log.ca45np = await cnt(page).innerText()
  await panel.getByLabel('Minimum beds').fill('50'); await panel.getByLabel('Maximum beds').fill('120'); await page.waitForTimeout(1500)
  log.final = await cnt(page).innerText(); log.url = page.url()
  await page.screenshot({ path: path.resolve(HERE, '../screenshots/redteam-explore-ui-combo-1440.png') })
  fs.writeFileSync(path.join(OUT, 'explore_ui_combo.json'), JSON.stringify(log, null, 1))
})
for (const delay of [0, 15, 60, 150]) test(`fast typing delay ${delay}`, async ({ page }) => {
  await page.goto('/explore'); await expect(cnt(page)).toBeVisible({ timeout: 120_000 })
  const box = page.getByPlaceholder('e.g. Genesis, Baltimore, 215…')
  await box.pressSequentially('baltimore', { delay })
  await page.waitForTimeout(3000)
  const r = { delay, final: await cnt(page).innerText(), box: await box.inputValue(), url: page.url() }
  fs.writeFileSync(path.join(OUT, `typing_${delay}.json`), JSON.stringify(r))
})
test('rapid state toggles', async ({ page }) => {
  await page.goto('/explore'); await expect(cnt(page)).toBeVisible({ timeout: 120_000 })
  const panel = page.getByRole('complementary', { name: 'Filters' })
  for (const s of ['TX', 'CA', 'NY', 'TX', 'FL', 'CA']) await panel.getByRole('button', { name: s, exact: true }).click()
  await page.waitForTimeout(3000)
  fs.writeFileSync(path.join(OUT, 'rapid_states.json'), JSON.stringify({ final: await cnt(page).innerText(), url: page.url() }))
})
