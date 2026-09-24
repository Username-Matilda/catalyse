import {
  test,
  expect,
  getAlert,
  approveVolunteer,
  confirmVolunteerEmail,
  dismissCookieConsentScript,
} from '../fixtures'
import { adminCreateProjectViaApi, transferProjectOwnership } from '../actions/projects'
import { fake } from '../fake'
import { createApiClient } from '../client'
import { goToInbox } from '../actions/dashboard'

test.describe('Messaging', () => {
  test('Volunteer sends a contact message to another volunteer', async ({
    adminPage,
    volunteer,
    browser,
    baseUrl,
  }) => {
    const subject = fake.messageSubject()
    const body = fake.messageBody()

    const projectId = await adminCreateProjectViaApi(
      baseUrl,
      fake.projectTitle(),
      'Project for contact test',
    )
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    const sender = fake.person()
    const senderSignupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: sender.name,
        email: sender.email,
        password: 'testpassword1',
        bio: 'e2e test bio, at least twenty characters long',
        country: 'UK',
        availabilityHoursPerWeek: 5,
        applicationMessage: 'e2e test application message',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    if (senderSignupResult.status !== 200)
      throw new Error(`Sender signup failed: ${JSON.stringify(senderSignupResult.body)}`)
    const { id: senderId, token: senderToken, emailVerificationToken } = senderSignupResult.body
    // A project page is closed to an unconfirmed email.
    if (emailVerificationToken) await confirmVolunteerEmail(baseUrl, emailVerificationToken)
    await approveVolunteer(baseUrl, senderId, senderToken)
    const senderCtx = await browser.newContext()
    await senderCtx.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, senderToken)
    await senderCtx.addInitScript(dismissCookieConsentScript)
    const senderPage = await senderCtx.newPage()

    try {
      await senderPage.goto(`${baseUrl}/projects/${projectId}`)
      await expect(senderPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })

      await senderPage.getByRole('button', { name: 'Contact Owner' }).click()

      // The recipient has consent_share_contact_info_with_project_owner = false (default), so the relay
      // form appears instead of direct contact details.
      const dialog = senderPage.getByRole('dialog')
      await expect(dialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 })

      await dialog.getByLabel('Subject').fill(subject)
      await dialog.getByLabel('Message').fill(body)
      await dialog.getByRole('button', { name: 'Send Message' }).click()

      await expect(getAlert(senderPage)).toContainText('Message sent', { timeout: 10_000 })
    } finally {
      await senderCtx.close()
    }
  })

  test('Recipient sees a message notification', async ({
    adminPage,
    volunteer,
    browser,
    baseUrl,
  }) => {
    test.setTimeout(60_000)
    const subject = fake.messageSubject()

    const projectId = await adminCreateProjectViaApi(
      baseUrl,
      fake.projectTitle(),
      'Project for notification test',
    )
    await transferProjectOwnership(baseUrl, adminPage, projectId, volunteer.name)

    // Confirm the recipient starts with no unread messages.
    const messagesFilter = volunteer.page
      .getByRole('group', { name: 'Show' })
      .getByRole('button', { name: /^Messages/ })
    await goToInbox(baseUrl, volunteer.page)
    await expect(messagesFilter).toHaveText('Messages')

    // Sender sends the message.
    const sender = fake.person()
    const senderSignupResult = await createApiClient(baseUrl).auth.signup({
      body: {
        name: sender.name,
        email: sender.email,
        password: 'testpassword1',
        bio: 'e2e test bio, at least twenty characters long',
        country: 'UK',
        availabilityHoursPerWeek: 5,
        applicationMessage: 'e2e test application message',
        consentMakeProfileVisibleInDirectory: true,
        consentContactableByProjectOwners: true,
      },
    })
    if (senderSignupResult.status !== 200)
      throw new Error(`Sender signup failed: ${JSON.stringify(senderSignupResult.body)}`)
    const { id: senderId, token: senderToken, emailVerificationToken } = senderSignupResult.body
    // A project page is closed to an unconfirmed email.
    if (emailVerificationToken) await confirmVolunteerEmail(baseUrl, emailVerificationToken)
    await approveVolunteer(baseUrl, senderId, senderToken)
    const senderCtx = await browser.newContext()
    await senderCtx.addInitScript((token: string) => {
      localStorage.setItem('authToken', token)
    }, senderToken)
    await senderCtx.addInitScript(dismissCookieConsentScript)
    const senderPage = await senderCtx.newPage()

    try {
      await senderPage.goto(`${baseUrl}/projects/${projectId}`)
      await expect(senderPage.getByRole('heading', { level: 1 })).toBeVisible({ timeout: 10_000 })
      await senderPage.getByRole('button', { name: 'Contact Owner' }).click()
      const dialog = senderPage.getByRole('dialog')
      await expect(dialog.getByLabel('Subject')).toBeVisible({ timeout: 10_000 })
      await dialog.getByLabel('Subject').fill(subject)
      await dialog.getByLabel('Message').fill('Notification test body')
      await dialog.getByRole('button', { name: 'Send Message' }).click()
      await expect(getAlert(senderPage)).toContainText('Message sent', { timeout: 10_000 })
    } finally {
      await senderCtx.close()
    }

    // Recipient opens the Inbox again: one unread message.
    await goToInbox(baseUrl, volunteer.page)
    await expect(messagesFilter).toHaveText('Messages1', { timeout: 10_000 })

    await expect(volunteer.page.getByText(/Message from /)).toBeVisible({ timeout: 10_000 })
    await expect(volunteer.page.getByText(subject)).toBeVisible({ timeout: 10_000 })
    const viewLink = volunteer.page
      .getByRole('listitem')
      .filter({ hasText: subject })
      .getByRole('link', { name: 'Open' })
    await expect(viewLink).toHaveAttribute('href', `/projects/${projectId}`)
    await viewLink.click()
    await expect(volunteer.page).toHaveURL(`${baseUrl}/projects/${projectId}`)
  })

  test.skip('Both parties see the message in their history', async () => {
    // Not possible: the /api/messages endpoint exists, but no messages inbox,
    // history view, or tab has been built in the frontend. A real user has no
    // way to browse sent or received messages through the UI.
  })

  test.skip('Volunteer marks a message as read', async () => {
    // Not possible: the /api/messages/{id}/read endpoint exists, but there is no
    // per-message read/unread UI in the frontend. The dashboard "Mark all as read"
    // button marks notifications as read (notifications table), not contact messages
    // (contact_messages.read_at), so there is no user-visible action that fulfils
    // this scenario.
  })
})
