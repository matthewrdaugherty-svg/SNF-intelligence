// Red team: on-screen Explore count for each URL scenario; expected counts come from expected_counts.py (independent SQL).
import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
const OUT = path.resolve(HERE, 'out')
const SC: Record<string, string> = JSON.parse(fs.readFileSync(path.join(HERE, 'scenarios.json'), 'utf8'))
test('explore counts per scenario', async ({ page }) => {
  const res: Record<string, { count: string | null; error: string | null; pageErrors: string[] }> = {}
  const pageErrors: string[] = []
  page.on('pageerror', e => pageErrors.push(e.message))
  await page.goto('/explore'); await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 120_000 })
  for (const [name, qs] of Object.entries(SC)) {
    pageErrors.length = 0
    await page.goto('/explore' + (qs ? '?' + qs : ''))
    const cnt = page.getByTestId('result-count'), err = page.getByText('The query failed.')
    await expect(cnt.or(err)).toBeVisible({ timeout: 120_000 })
    await page.waitForTimeout(300)
    res[name] = { count: (await cnt.isVisible()) ? await cnt.innerText() : null, error: (await err.isVisible()) ? await page.locator('div.p-8').innerText() : null, pageErrors: [...pageErrors] }
    if (name === 'q_injection') await page.screenshot({ path: path.resolve(HERE, '../screenshots/redteam-explore-injection.png') })
    if (name === 'invalid_own') await page.screenshot({ path: path.resolve(HERE, '../screenshots/redteam-explore-invalid-own.png') })
  }
  // after the injection attempt the table must still exist
  await page.goto('/explore'); await expect(page.getByTestId('result-count')).toHaveText('14,690')
  fs.writeFileSync(path.join(OUT, 'explore_counts.json'), JSON.stringify(res, null, 1))
})
