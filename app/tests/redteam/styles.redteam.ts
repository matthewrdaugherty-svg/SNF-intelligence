import { test, expect } from '@playwright/test'
import fs from 'node:fs'
import path from 'node:path'
const HERE = path.dirname(new URL(import.meta.url).pathname)
test('computed styles of utility-styled buttons', async ({ page }) => {
  await page.goto('/explore?st=MD'); await expect(page.getByTestId('result-count')).toBeVisible({ timeout: 120_000 })
  const r = await page.evaluate(() => {
    const pick = (e: Element | null) => { if (!e) return null; const s = getComputedStyle(e); return { cls: (e as HTMLElement).className, color: s.color, bg: s.backgroundColor, fontSize: s.fontSize, fontWeight: s.fontWeight } }
    const btns = [...document.querySelectorAll('button')]
    return {
      mdChipSelected: pick(btns.find(b => b.textContent === 'MD') ?? null),
      akChip: pick(btns.find(b => b.textContent === 'AK') ?? null),
      sortHeaderActive: pick(btns.find(b => b.getAttribute('aria-sort') === 'ascending') ?? null),
      sortHeaderInactive: pick(btns.find(b => b.textContent?.startsWith('City')) ?? null),
      clearBtn: pick(btns.find(b => b.textContent?.startsWith('Clear')) ?? null),
      star5: pick(btns.find(b => b.textContent === '5') ?? null),
      searchInput: pick(document.querySelector('input.control')),
      bodyFont: getComputedStyle(document.body).fontFamily,
    }
  })
  fs.writeFileSync(path.join(HERE, 'out', 'styles.json'), JSON.stringify(r, null, 1))
  await page.getByRole('button', { name: 'MD', exact: true }).screenshot({ path: path.resolve(HERE, '../screenshots/redteam-selected-state-chip.png') })
})
