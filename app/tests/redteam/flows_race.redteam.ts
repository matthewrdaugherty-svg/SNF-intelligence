import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const FL = path.resolve(HERE, 'flows')
for (const gap of [0, 100, 2000]) test(`good then bad upload, gap ${gap} ms, then reload`, async ({ page }) => {
  await page.goto('/flows'); await expect(page.getByText('No discharge data loaded.')).toBeVisible({ timeout: 120_000 })
  await page.locator('input[type=file]').setInputFiles(path.join(FL, 'a_wellformed.csv'))
  if (gap) await page.waitForTimeout(gap)
  await page.locator('input[type=file]').setInputFiles(path.join(FL, 'c1_missing_column.csv'))
  await page.waitForTimeout(3000)
  const before = { ls: await page.evaluate(() => localStorage.getItem('snf.flows.csv')?.length ?? null), hospitalShown: await page.getByRole('combobox', { name: 'Hospital' }).isVisible() }
  await page.reload(); await page.waitForTimeout(6000)
  const after = { restored: await page.getByText(/previous upload/).isVisible(), empty: await page.getByText('No discharge data loaded.').isVisible() }
  fs.writeFileSync(path.join(HERE, 'out', `flows_race_${gap}.json`), JSON.stringify({ gap, before, after }))
})
