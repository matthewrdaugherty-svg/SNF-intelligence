import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
test('page with a missing file', async ({ page }) => {
  const which = process.env.MISSING ?? 'x'
  await page.goto('/facility/215085'); await page.waitForTimeout(12000)
  await page.screenshot({ path: path.resolve(HERE, `../screenshots/redteam-missing-${which}.png`) })
  fs.writeFileSync(path.join(HERE, 'out', `missing_${which}.txt`), await page.locator('body').innerText())
})
