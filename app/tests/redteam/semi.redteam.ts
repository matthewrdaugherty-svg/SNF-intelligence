import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
test('semicolon in hospital_ccn', async ({ page }) => {
  const errs: string[] = []; page.on('pageerror', e => errs.push(e.message))
  await page.goto('/flows'); await page.waitForTimeout(5000)
  await page.locator('input[type=file]').setInputFiles(path.join(HERE, 'flows', 'd_semicolon.csv')); await page.waitForTimeout(3000)
  fs.writeFileSync(path.join(HERE, 'out', 'semicolon.json'), JSON.stringify({ errs, main: (await page.locator('main').innerText()).slice(0, 1500) }))
  await page.screenshot({ path: path.resolve(HERE, '../screenshots/redteam-v11-flows-semicolon.png'), fullPage: true })
})
