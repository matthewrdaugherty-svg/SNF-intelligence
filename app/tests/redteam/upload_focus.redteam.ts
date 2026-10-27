import { test } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
test('upload control focus visible?', async ({ page }) => {
  await page.goto('/flows'); await page.waitForTimeout(5000)
  await page.locator('input[type=file]').focus()
  const r = await page.evaluate(() => { const i = document.querySelector('input[type=file]')!; const l = i.closest('label')!; const a = getComputedStyle(i), b = getComputedStyle(l); return { inputOutline: a.outlineStyle + ' ' + a.outlineWidth, inputSize: (i as HTMLElement).getBoundingClientRect().width, labelOutline: b.outlineStyle, labelShadow: b.boxShadow } })
  fs.writeFileSync(path.join(HERE, 'out', 'upload_focus.json'), JSON.stringify(r))
  await page.locator('label:has(input[type=file])').screenshot({ path: path.resolve(HERE, '../screenshots/redteam-v11-upload-focus.png') })
})
