import { Browser, Locator } from '@playwright/test'
import path from 'path'
import fs from 'fs'
import { execSync } from 'child_process'
import { DemoEngine } from '../engine'
import { buildEmailClientHtml, buildTitleCardHtml } from '../html'
import { APPLICANT, DEMO_VIDEO_TITLE, BASE_URL, OUT_DIR } from '../data'
import { buildWelcomeAndConfirmHtml } from '../../lib/email'

/** Part 1: applicant signup, email verification, pending dashboard */
export async function recordApplicantFlow(
  engine: DemoEngine,
  browser: Browser,
): Promise<{ volunteerId: number; authToken: string }> {
  console.log('  Recording applicant signup flow...')

  // Phase 1: unauthenticated context for signup form — no token so app shows a clean signup page
  const signupCtx = await engine.newContext(browser)
  const signupPage = await signupCtx.newPage()
  engine.activePage = signupPage
  engine.beginPhase()

  await signupPage.setContent(buildTitleCardHtml(DEMO_VIDEO_TITLE))
  await engine.pause(2800)
  await signupPage.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await engine.pause(700)

  // addInitScript fires before first paint — eliminates the flash between old page DOM going away and the fade-in overlay being injected
  await signupPage.addInitScript(`
    (function() {
      var o = document.createElement('div');
      o.id = '__title-cover__';
      o.style.cssText = 'position:fixed;inset:0;background:#000;z-index:2147483647;pointer-events:none;transition:opacity 600ms ease;';
      document.documentElement.appendChild(o);
    })()
  `)
  await signupPage.goto(`${BASE_URL}/`)
  await engine.placeCursor()
  await signupPage.evaluate(`(function(){
    var cover = document.getElementById('__title-cover__');
    if (cover) cover.remove();
    var o=document.createElement('div');
    o.id='__demo-fadein__';
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:1;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ requestAnimationFrame(function(){ o.style.opacity='0'; setTimeout(function(){ o.remove(); },620); }); });
  })()`)
  await engine.pause(700)
  await engine.pause(1200)
  await engine.caption('Catalyse connects AI safety projects with volunteers', 2000)
  await engine.pause(500)
  await engine.showCaption('New applicants start by creating an account')
  await engine.navigateTo(`${BASE_URL}/signup`)
  await engine.pause(800)

  await engine.type(signupPage.getByLabel('Your Name'), APPLICANT.name)
  await engine.pause(300)
  await engine.type(signupPage.getByLabel('Email', { exact: true }), APPLICANT.email)
  await engine.pause(300)
  await engine.type(signupPage.getByLabel('Password', { exact: true }), APPLICANT.password)
  await engine.pause(200)
  await engine.type(signupPage.getByLabel('Confirm Password'), APPLICANT.password)
  await engine.pause(300)
  await engine.hideCaption()

  const appField = signupPage.getByLabel('Your Application')
  await engine.smoothScrollTo(appField)
  await engine.showCaption('Applicants explain why they want to join — only visible to admins')
  const appDesc = signupPage.locator('label[for="application_message"] + aside')
  if (await appDesc.isVisible({ timeout: 1000 }).catch(() => false)) {
    await engine.readText(appDesc, 240)
    await engine.pause(300)
  }
  await engine.type(appField, APPLICANT.applicationMessage, 18)
  await engine.pause(600)
  await engine.hideCaption()

  const bioField = signupPage.getByLabel('About You')
  if (await bioField.isVisible({ timeout: 2000 }).catch(() => false)) {
    await engine.smoothScrollTo(bioField)
    await engine.showCaption('The bio is shown on the public volunteer directory')
    await engine.type(bioField, APPLICANT.bio, 35)
    await engine.pause(400)
    await engine.hideCaption()
  }

  await engine.showCaption('Contact details help project owners reach out')
  await engine.type(signupPage.getByLabel('Discord Handle'), APPLICANT.discord, 45)
  await engine.pause(300)

  const contactPrefDropdown = signupPage.getByLabel('Preferred Contact Method')
  if (await contactPrefDropdown.isVisible({ timeout: 2000 }).catch(() => false)) {
    await engine.click(contactPrefDropdown)
    await engine.pause(300)
    const discordOption = signupPage.getByRole('option', { name: 'Discord' })
    if (await discordOption.isVisible({ timeout: 2000 }).catch(() => false)) {
      await engine.click(discordOption)
      await engine.pause(300)
    }
  }

  await engine.type(signupPage.getByLabel('Contact Notes'), APPLICANT.contactNotes, 40)
  await engine.pause(400)
  await engine.hideCaption()

  await engine.showCaption('Availability and location help match volunteers to local projects')
  await engine.type(signupPage.getByLabel('Hours per Week'), APPLICANT.availability, 80)
  await engine.pause(200)
  await engine.type(signupPage.getByLabel('Location'), APPLICANT.location, 45)
  await engine.pause(200)
  await engine.type(signupPage.getByLabel('Country'), APPLICANT.country, 45)
  await engine.pause(200)
  await engine.type(signupPage.getByLabel('Local Group'), APPLICANT.localGroup, 45)
  await engine.pause(300)
  await engine.hideCaption()

  await engine.showCaption('Skills help match volunteers with the right projects')
  // Wait for SkillPicker API fetch to complete
  await signupPage.locator('.skill-option').first().waitFor({ state: 'visible', timeout: 8000 }).catch(() => {})
  const wantedSkills = new Set(['Software Engineering', 'AI/ML', 'AI Safety Research', 'Writing', 'AI Governance Research', 'Technical AI Safety Expertise'])
  const allSkillLabels = await signupPage.locator('.skill-option').all()
  // Resolve each to {locator, text, y, x} then sort by page position
  const resolved = (await Promise.all(
    allSkillLabels.map(async (l) => {
      const text = (await l.textContent())?.trim() ?? ''
      if (!wantedSkills.has(text)) return null
      const box = await l.boundingBox()
      return box ? { l, text, y: box.y, x: box.x } : null
    })
  )).filter((r): r is { l: Locator; text: string; y: number; x: number } => r !== null)
  resolved.sort((a, b) => a.y - b.y || a.x - b.x)
  for (const { l } of resolved) {
    await engine.click(l)
    await engine.pause(350)
  }
  await engine.pause(300)
  await engine.hideCaption()

  const submitBtn = signupPage.getByRole('button', { name: 'Create Account' })
  await engine.smoothScrollTo(submitBtn)
  await engine.showCaption('Privacy and notification preferences round out the profile')
  const checkboxLabels = signupPage.locator('label').filter({ hasText: /Make my profile|Allow project|Share my contact/i })
  const allCheckboxLabels = await checkboxLabels.all()
  for (const label of allCheckboxLabels) {
    if (await label.isVisible({ timeout: 500 }).catch(() => false)) {
      await engine.readText(label, 220)
      await engine.pause(150)
    }
  }
  await engine.pause(600)
  await engine.hideCaption()

  // Capture the signup response to get auth token + email verification token
  const [signupResp] = await Promise.all([
    signupPage.waitForResponse(
      (r) => r.url().includes('/api/auth/signup') && r.status() === 200,
      { timeout: 15_000 },
    ),
    engine.click(submitBtn),
  ])
  const { id: volunteerId, auth_token: authToken, email_verification_token: verifyToken } =
    await signupResp.json() as { id: number; auth_token: string; email_verification_token?: string }

  if (!verifyToken) {
    throw new Error(
      'No email_verification_token returned. Ensure STUB_EMAIL=true is set in .env.local',
    )
  }

  await engine.pause(1500)

  const signupVideoPath = await signupPage.video()?.path()
  const signupPhaseEvents = engine.getPhaseEvents()
  await signupCtx.close()

  // Phase 2: show mock email client, click confirm link, then post-verification screens
  const ctx = await engine.newContext(browser, authToken)
  const page = await ctx.newPage()
  engine.activePage = page
  engine.beginPhase()

  // Navigate to a real URL first so init scripts (cursor overlay) run
  await page.goto(`${BASE_URL}/dashboard`)
  await engine.pause(300)

  // Fade out, switch to email client
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 400ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await engine.pause(500)

  const confirmUrl = `${BASE_URL}/verify-email?token=${verifyToken}`
  const emailHtml = buildWelcomeAndConfirmHtml(APPLICANT.name, confirmUrl)
  const emailClientHtml = buildEmailClientHtml(
    'Confirm your Catalyse email address',
    'noreply@pauseai.uk',
    APPLICANT.email,
    emailHtml,
  )
  await page.setContent(emailClientHtml)
  await engine.placeCursor(120, 400)
  await engine.pause(600)

  await engine.caption("Alex checks their email — there's a verification link from Catalyse", 2500)

  // Move cursor over inbox item, pause as if reading it
  const emailItem = page.locator('.email-item.selected')
  await engine.mouseMoveTo(emailItem)
  await engine.pause(800)

  await engine.showCaption('Clicking the confirmation link to verify the account')
  // Button lives inside the iframe — frameLocator gives a Locator in that frame's coordinate space
  const confirmBtn = page.frameLocator('iframe[title="email"]').locator('a.button').filter({ hasText: /Confirm Email/i }).first()
  await engine.mouseMoveTo(confirmBtn)
  await engine.pause(400)
  engine.addSound('click')
  await Promise.all([
    page.waitForURL(`**/verify-email**`, { timeout: 15_000 }),
    confirmBtn.click(),
  ])
  void engine.clickRipple()
  await engine.placeCursor()
  await engine.pause(1200)
  await engine.hideCaption()
  await engine.caption('Email confirmed — application is now under review', 2500)
  await engine.pause(1000)

  await engine.navigateTo(`${BASE_URL}/dashboard`)
  await engine.pause(1200)
  const pendingBanner = page.locator('text=Your account is pending approval').first()
  if (await pendingBanner.isVisible({ timeout: 3000 }).catch(() => false)) {
    await engine.showCaption('Pending applicants can browse the platform with restricted access')
    await engine.readText(pendingBanner, 320)
    await engine.hideCaption()
    await engine.pause(400)
  } else {
    await engine.caption('Pending applicants can browse the platform with restricted access', 2500)
    await engine.pause(800)
  }

  await engine.navigateTo(`${BASE_URL}/`)
  await engine.pause(1000)
  await engine.caption('They can browse available projects while waiting for approval', 2000)

  // Scroll slowly through the project listing
  {
    const pageHeight: number = await page.evaluate(`document.body.scrollHeight`)
    const viewportHeight: number = await page.evaluate(`window.innerHeight`)
    const maxScroll = Math.max(0, pageHeight - viewportHeight)
    const targetScroll = Math.min(maxScroll, 1200)
    const totalMs = 3000
    const steps = Math.max(1, Math.ceil(totalMs / 50))
    for (let i = 1; i <= steps; i++) {
      const t = i / steps
      const e = (1 - Math.cos(Math.PI * t)) / 2
      const y = Math.round(targetScroll * e)
      await page.evaluate(`(document.scrollingElement || document.documentElement).scrollTop = ${y}`)
      const jitterMs = 50 * (0.8 + Math.random() * 0.4)
      await new Promise((r) => setTimeout(r, jitterMs))
    }
  }
  await engine.pause(800)

  // Fade to black to bridge into the admin recording
  await page.evaluate(`(function(){
    var o=document.createElement('div');
    o.style.cssText='position:fixed;inset:0;background:#000;opacity:0;z-index:2147483645;pointer-events:none;transition:opacity 600ms ease';
    document.body.appendChild(o);
    requestAnimationFrame(function(){ o.style.opacity='1'; });
  })()`)
  await engine.pause(700)

  const videoPath = await page.video()?.path()
  const pendingPhaseEvents = engine.getPhaseEvents()
  await ctx.close()

  // Mix audio into each raw clip before concatenating
  const part1 = path.join(OUT_DIR, '01a-signup.webm')
  const part2 = path.join(OUT_DIR, '01b-pending.webm')
  if (signupVideoPath) { fs.renameSync(signupVideoPath, part1); engine.mixAudioIntoClip(part1, signupPhaseEvents) }
  if (videoPath) { fs.renameSync(videoPath, part2); engine.mixAudioIntoClip(part2, pendingPhaseEvents) }

  // Merge into final applicant video
  const concatFile = path.join(OUT_DIR, '01-concat.txt')
  fs.writeFileSync(concatFile, [part1, part2].filter(fs.existsSync).map((f) => `file '${f}'`).join('\n'))
  execSync(`ffmpeg -y -f concat -safe 0 -i "${concatFile}" -c copy "${path.join(OUT_DIR, '01-applicant.webm')}"`, { stdio: 'pipe' })

  console.log(`  Applicant video saved. Volunteer ID: ${volunteerId}`)
  return { volunteerId, authToken }
}
