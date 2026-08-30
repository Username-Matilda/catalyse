import { test, expect } from '../fixtures'
import { adminCreateProjectViaApi } from '../actions/projects'
import { fake } from '../fake'

// Prev/Next on the directory pages runs through the shared useUrlParam / useSetParam
// hook in lib/hooks/url-filters.ts. A stale-closure bug there rebuilt the page setter
// on every URL change, so the "reset to page 1 on filter change" effect re-fired after
// each pagination click and snapped the list straight back to page 1 — you could never
// leave page 1. This proves Next actually advances and Previous comes back. The
// volunteers directory is driven by the very same hook.
test.describe('Directory pagination', () => {
  test('Projects directory Next and Previous move between pages', async ({
    volunteer,
    baseUrl,
  }) => {
    test.slow()

    // PAGE_SIZE is 50, so 51 marker-tagged projects is exactly two pages once the list
    // is filtered down to them.
    const marker = `PGN${Date.now().toString(36)}`
    const TOTAL = 51
    // Serial, not parallel: each create is a multi-row write and the worker DB is SQLite,
    // which throws on concurrent writers.
    for (let n = 0; n < TOTAL; n++) {
      await adminCreateProjectViaApi(
        baseUrl,
        `${marker} ${String(n).padStart(2, '0')} ${fake.projectTitle()}`,
        'Directory pagination fixture project',
      )
    }

    const page = volunteer.page
    // A status filter switches the list into its flat, paginated view; q narrows it to
    // exactly the 51 projects created above.
    await page.goto(`${baseUrl}/projects?status=ready&q=${marker}`)
    await expect(page.getByRole('heading', { name: 'Projects', exact: true })).toBeVisible({
      timeout: 10_000,
    })

    const markerLinks = page.getByRole('link').filter({ hasText: marker })

    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 15_000 })
    await expect(markerLinks).toHaveCount(50)

    await page.getByRole('button', { name: 'Next' }).click()

    await expect(page).toHaveURL(/[?&]page=2(&|$)/, { timeout: 10_000 })
    await expect(page.getByText('Page 2 of 2')).toBeVisible({ timeout: 10_000 })
    await expect(markerLinks).toHaveCount(1)

    await page.getByRole('button', { name: 'Previous' }).click()

    await expect(page.getByText('Page 1 of 2')).toBeVisible({ timeout: 10_000 })
    await expect(page).not.toHaveURL(/[?&]page=/, { timeout: 10_000 })
    await expect(markerLinks).toHaveCount(50)
  })
})
