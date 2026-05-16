import { Page } from '@playwright/test'
import { DemoEngine } from './engine'
import { buildEmailClientHtml } from './html'

export async function showEmailClient(
  engine: DemoEngine,
  page: Page,
  opts: { subject: string; from: string; to: string; bodyHtml: string },
): Promise<void> {
  await engine.fadeOut(400)
  const html = buildEmailClientHtml(opts.subject, opts.from, opts.to, opts.bodyHtml)
  await page.setContent(html)
  await engine.placeCursor(120, 400)
  await engine.pause(600)
}
