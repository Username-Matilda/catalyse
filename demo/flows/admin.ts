import { Browser } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { DemoEngine } from '../engine'
import { apiSignup, apiVerifyEmail } from '../api'
import { REJECT_APPLICANT, ADMIN_EMAIL, ADMIN_PASSWORD, BASE_URL, OUT_DIR } from '../data'

/** Part 2: admin reviews, approves one applicant and rejects another */
export async function recordAdminFlow(engine: DemoEngine, browser: Browser): Promise<void> {
  console.log('  Setting up second applicant to reject...')

  const { email_verification_token: rejectVerifyToken } = await apiSignup(
    REJECT_APPLICANT.name,
    REJECT_APPLICANT.email,
    REJECT_APPLICANT.password,
    REJECT_APPLICANT.applicationMessage,
  )
  if (rejectVerifyToken) await apiVerifyEmail(rejectVerifyToken)

  console.log('  Recording admin review flow...')

  const ctx = await engine.newContext(browser) // no auth token — admin logs in via the form
  const page = await ctx.newPage()
  engine.activePage = page

  engine.beginPhase()
  await page.goto(`${BASE_URL}/login`)
  await engine.placeCursor()
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.id='__demo-fadein__';
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:1;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ o.style.opacity='0'; setTimeout(function(){ o.remove(); },620); }); });
  })()`)
  await engine.pause(700)

  await engine.showCaption('An admin logs in to review new applications')
  await engine.type(page.getByLabel('Email', { exact: true }), ADMIN_EMAIL)
  await engine.pause(200)
  await engine.type(page.getByLabel('Password'), ADMIN_PASSWORD)
  await engine.hideCaption()
  await engine.pause(300)
  await engine.click(page.getByRole('button', { name: 'Login' }))
  await page.waitForURL(`${BASE_URL}/dashboard`, { timeout: 15_000 })
  await engine.placeCursor()
  await engine.pause(800)

  // Open user menu dropdown and click Manage Applications
  await engine.showCaption('The admin section is accessible from the user menu')
  const userMenuBtn = page.locator('.xl\\:flex button').first()
  await engine.click(userMenuBtn)
  await engine.pause(400)
  await engine.click(page.getByRole('link', { name: 'Manage Applications' }))
  await engine.hideCaption()
  await engine.pause(1200)
  await engine.caption('Admins see all pending applications in one place', 2500)
  await page.evaluate(() => window.scrollTo({ top: 200, behavior: 'smooth' }))
  await engine.pause(1200)

  // ── Alex Chen: approve ──────────────────────────────────────────────────────
  const alexCard = page.getByRole('article').filter({ hasText: 'Alex Chen' }).first()
  if (await alexCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await engine.smoothScrollTo(alexCard)
    await engine.pause(400)

    const startReviewBtn = alexCard.getByRole('button', { name: 'Start Review' })
    if (await startReviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await engine.showCaption('Start Review claims the application and opens the detail view')
      await engine.click(startReviewBtn)
      await page.waitForURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
      await engine.placeCursor()
      await engine.pause(800)
      await engine.hideCaption()
    }
  }

  // On the detail page — scroll to read the application message
  await engine.caption('The detail view shows the full application — message, bio, skills, contact', 2500)
  const alexAppMsg = page.locator('h2').filter({ hasText: /Application message/i }).locator('+ p')
  if (await alexAppMsg.isVisible({ timeout: 2000 }).catch(() => false)) {
    await engine.readText(alexAppMsg, 220)
    await engine.pause(400)
  }

  // Fill notes inline before approving
  const adminNotesField = page.getByPlaceholder('Notes visible only to admins…')
  if (await adminNotesField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.showCaption('Admin notes are private — useful for tracking reasoning behind decisions')
    await engine.type(
      adminNotesField,
      'Strong application — ML background, two years following the org, clear on the mission.',
      40,
    )
    await engine.pause(600)
    await engine.hideCaption()
  }

  const approveBtn = page.getByRole('button', { name: 'Approve' }).first()
  if (await approveBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.click(approveBtn)
    await engine.pause(500)
    const confirmApproveBtn = page.getByRole('dialog').getByRole('button', { name: 'Approve' })
    await engine.click(confirmApproveBtn)
    await page.waitForURL(/\/admin\/applications$/, { timeout: 10_000 })
    await engine.pause(800)
    await engine.caption('Approval triggers a welcome email to the applicant', 2500)
    await engine.pause(800)
  }

  // ── Jordan Smith: reject ─────────────────────────────────────────────────────
  const jordanCard = page.getByRole('article').filter({ hasText: 'Jordan Smith' }).first()
  if (await jordanCard.isVisible({ timeout: 5000 }).catch(() => false)) {
    await engine.smoothScrollTo(jordanCard)
    await engine.pause(400)

    const jordanStartReviewBtn = jordanCard.getByRole('button', { name: 'Start Review' })
    if (await jordanStartReviewBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await engine.showCaption("Starting a review claims the application so other admins know it's taken")
      await engine.click(jordanStartReviewBtn)
      await engine.pause(1200)
      await engine.hideCaption()
    }

    await engine.showCaption("Applications that don't align with the mission can be rejected")
    const jordanAppMsg = jordanCard.locator('h4').filter({ hasText: /Application/i }).locator('+ p')
    if (await jordanAppMsg.isVisible({ timeout: 1000 }).catch(() => false)) {
      await engine.readText(jordanAppMsg, 220)
    }
    await engine.pause(400)
    await engine.hideCaption()

    const jordanStartBtn = jordanCard.getByRole('button', { name: 'Start Review' })
    if (await jordanStartBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
      await engine.click(jordanStartBtn)
      await page.waitForURL(/\/admin\/applications\/\d+/, { timeout: 10_000 })
      await engine.placeCursor()
      await engine.pause(800)
    }
  }

  // Fill notes on Jordan's detail page
  const rejectAdminNotes = page.getByPlaceholder('Notes visible only to admins…')
  if (await rejectAdminNotes.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.showCaption('Internal notes are only visible to admins — useful for future reference')
    await engine.type(
      rejectAdminNotes,
      'Application appears commercially motivated rather than mission-driven. Self-promotion red flags.',
      40,
    )
    await engine.pause(500)
    await engine.hideCaption()
  }

  const applicantMsgField = page.getByPlaceholder('Optional message to applicant…')
  if (await applicantMsgField.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.showCaption('A personal message is included in the rejection email')
    await engine.type(
      applicantMsgField,
      "Thank you for applying. After careful review, we don't think this is the right fit at this time.",
      35,
    )
    await engine.pause(600)
    await engine.hideCaption()
  }

  const rejectBtn = page.getByRole('button', { name: 'Reject' }).first()
  if (await rejectBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.click(rejectBtn)
    await engine.pause(500)
    const confirmRejectBtn = page.getByRole('dialog').getByRole('button', { name: 'Reject' })
    await engine.click(confirmRejectBtn)
    await page.waitForURL(/\/admin\/applications$/, { timeout: 10_000 })
    await engine.pause(800)
    await engine.caption('Rejected applicants are notified by email with the custom message', 2500)
    await engine.pause(800)
  }

  const filterBtn = page.getByLabel('Filter applications', { exact: true })
  if (await filterBtn.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.showCaption('Filter to see approved applications')
    await engine.click(filterBtn)
    await engine.pause(400)
    await engine.click(page.getByRole('option', { name: 'Approved' }))
    await engine.pause(2000)
    await engine.hideCaption()

    await engine.showCaption('Rejected applications are anonymised after 7 days')
    await engine.click(filterBtn)
    await engine.pause(400)
    await engine.click(page.getByRole('option', { name: 'Rejected', exact: true }))
    await engine.pause(2000)
    await engine.hideCaption()
  }

  await engine.pause(1200)
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 800ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await engine.pause(1000)

  const adminPhaseEvents = engine.getPhaseEvents()
  const videoPath = await page.video()?.path()
  await ctx.close()
  if (videoPath) {
    const adminClipPath = path.join(OUT_DIR, '02-admin.webm')
    fs.renameSync(videoPath, adminClipPath)
    engine.mixAudioIntoClip(adminClipPath, adminPhaseEvents)
  }
  console.log('  Admin video saved.')
}
