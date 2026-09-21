import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent, act, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createLocalGroup, createSkill } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import SignupPage from './page'

import { google as googleAuth } from '@/test/fakes/google'

const type = (label: string, text: string) => userEvent.type(screen.getByLabelText(label), text)
const submit = () =>
  fireEvent.submit(screen.getByLabelText('Your Name', { exact: false }).closest('form')!)

async function fillRequired(opts: { country?: boolean } = {}) {
  await type('Your Name', 'Ann Applicant')
  await type('Email', 'ann.applicant@example.com')
  await type('Password', 'a-long-password')
  await type('Confirm Password', 'a-long-password')
  await type('Your Application', 'I want to help with campaigns and policy work.')
  await type('About You', 'A biography that comfortably passes twenty characters.')
  await type('Hours per week you can give (1–40)', '5')
  if (opts.country !== false) {
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
  }
}

describe('signup with email and password', () => {
  it('fills Contact Email from the sign-up email, and says so while it is empty', async () => {
    await renderApp(<SignupPage />)
    const contact = await screen.findByLabelText('Contact Email')
    expect(contact).toBeDisabled()
    expect(contact).toHaveAttribute('placeholder', 'The email you sign up with')
    await type('Email', 'ann.applicant@example.com')
    expect(contact).toHaveValue('ann.applicant@example.com')
  })

  it('validates client-side before submitting', async () => {
    await renderApp(<SignupPage />)
    await screen.findByLabelText('Your Name')
    await type('Password', 'a-long-password')
    await type('Confirm Password', 'different')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Passwords do not match')
    await userEvent.clear(screen.getByLabelText('Confirm Password'))
    await userEvent.clear(screen.getByLabelText('Password'))
    await type('Password', 'short')
    await type('Confirm Password', 'short')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('at least 8 characters')
    await userEvent.clear(screen.getByLabelText('Confirm Password'))
    await userEvent.clear(screen.getByLabelText('Password'))
    await type('Password', 'a-long-password')
    await type('Confirm Password', 'a-long-password')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'About You must be at least 20 characters',
    )
    await type('About You', 'A biography that comfortably passes twenty characters.')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Country is required')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Availability is required')
  })

  it('submits a full application, lands on the pending screen, and can resend the confirmation', async () => {
    await createLocalGroup({ name: 'Signup Town', country: 'UK' })
    const skill = await createSkill()
    await renderApp(<SignupPage />)
    await screen.findByLabelText('Your Name')
    await fillRequired()
    await userEvent.click(await screen.findByRole('button', { name: 'Select local group' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Signup Town' }))
    await type('Discord Handle', 'ann#1')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[0])
    await type('Signal', '+44 1')
    await type('WhatsApp', '+44 2')
    await type('Contact Notes', 'DM first')
    await type('Other Skills', 'juggling')
    await userEvent.click(await screen.findByLabelText(skill.name))
    await userEvent.click(
      screen.getByLabelText('Make my profile visible in the volunteer directory'),
    )
    await userEvent.click(
      screen.getByLabelText('Share my contact info directly with project owners'),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep me in the loop about new projects' }),
    )
    await userEvent.click(screen.getByRole('option', { name: 'Send me a fortnightly digest' }))
    await userEvent.click(
      screen.getByLabelText('Allow Google Analytics to help us improve the platform'),
    )
    // Hints describe their field and are not themselves something to fill in.
    expect(screen.getByLabelText('Your Application')).toHaveAccessibleDescription(
      /Only admins read this/,
    )
    expect(screen.getByLabelText('Your Application')).toHaveAttribute(
      'placeholder',
      expect.stringContaining('e.g.'),
    )
    submit()
    await screen.findByText('Check your email')
    const done = screen.getByRole('status')
    expect(done).toHaveTextContent('ann.applicant@example.com')
    expect(done).toHaveTextContent('Open the link in that email to confirm your address.')
    expect(done).toHaveTextContent('A member of the team reviews your application.')
    const row = await prisma.volunteer.findFirstOrThrow({
      where: { email: 'ann.applicant@example.com' },
      include: { skills: true },
    })
    expect(row).toMatchObject({
      name: 'Ann Applicant',
      country: 'UK',
      localGroup: 'Signup Town',
      discordHandle: 'ann#1',
      contactPreference: 'discord',
      signalNumber: '+44 1',
      whatsappNumber: '+44 2',
      contactNotes: 'DM first',
      otherSkills: 'juggling',
      availabilityHoursPerWeek: 5,
      consentMakeProfileVisibleInDirectory: false,
      consentShareContactInfoWithProjectOwner: true,
      cookieConsentAnalytics: true,
      emailDigest: 'fortnightly',
      approvalStatus: 'pending',
    })
    expect(row.skills).toHaveLength(1)

    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    fireEvent.click(screen.getByRole('button', { name: 'Resend confirmation email' }))
    await vi.waitFor(() => expect(screen.getByText(/request another in 60s/)).toBeInTheDocument())
    for (let i = 0; i < 60; i++) act(() => vi.advanceTimersByTime(1000))
    vi.useRealTimers()
    expect(screen.getByText('Email sent! Check your inbox.')).toBeInTheDocument()
  })

  it('clears a preferred contact method when its field is emptied, and picks a city with no local group', async () => {
    await renderApp(<SignupPage />)
    await screen.findByLabelText('Your Name')
    await type('Discord Handle', 'x')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[0])
    expect(screen.getAllByLabelText('Preferred contact method')[0]).toBeChecked()
    await userEvent.clear(screen.getByLabelText('Discord Handle'))
    expect(screen.getAllByLabelText('Preferred contact method')[0]).not.toBeChecked()
    await type('Signal', 's')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[1])
    await userEvent.clear(screen.getByLabelText('Signal'))
    await type('WhatsApp', 'w')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[2])
    await userEvent.clear(screen.getByLabelText('WhatsApp'))
    await type('Email', 'e@x.y')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[3])
    await userEvent.clear(screen.getByLabelText('Email'))
    expect(
      screen
        .getAllByLabelText('Preferred contact method')
        .some((r) => (r as HTMLInputElement).checked),
    ).toBe(false)
    // Unticking "contactable" disables and greys the share option.
    await userEvent.click(
      screen.getByLabelText('Allow project owners to contact me about opportunities'),
    )
    expect(
      screen.getByLabelText('Share my contact info directly with project owners'),
    ).toBeDisabled()

    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Serbia' }))
    expect(screen.getByLabelText('City / Area')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Select local group' }))
    await userEvent.click(
      await screen.findByRole('option', { name: "None of these, I'll enter my city" }),
    )
    await type('City / Area', 'Leeds')
  })

  it('shows a server refusal, and signs straight in when approval is off', async () => {
    await createVolunteer({ email: 'taken@example.com' })
    await renderApp(<SignupPage />)
    await screen.findByLabelText('Your Name')
    await fillRequired()
    await userEvent.clear(screen.getByLabelText('Email'))
    await type('Email', 'taken@example.com')
    submit()
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')

    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: false },
    })
    await userEvent.clear(screen.getByLabelText('Email'))
    await type('Email', 'open@example.com')
    submit()
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard'))
    await prisma.platformSettings.update({
      where: { id: 1 },
      data: { requireApplicationApproval: true },
    })
  })

  it('bounces a signed-in visitor to the dashboard', async () => {
    const vol = await createVolunteer()
    await renderApp(<SignupPage />, { as: vol })
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/dashboard'))
  })
})

describe('signup with Google', () => {
  function installGoogle() {
    let callback: ((r: { credential: string }) => void) | undefined
    const google = {
      accounts: {
        id: {
          initialize: vi.fn((c: { callback: typeof callback }) => {
            callback = c.callback
          }),
          renderButton: vi.fn(),
        },
      },
    }
    Object.assign(window, { google })
    return { google, signIn: (credential: string) => act(() => callback!({ credential })) }
  }

  it('the dev stub opens the application form; a bad credential errors; a known one signs in', async () => {
    const { google, signIn } = installGoogle()
    await renderApp(<SignupPage />)
    await waitFor(() => expect(google.accounts.id.renderButton).toHaveBeenCalled())
    await signIn('bad')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Google token')
    const existing = await createVolunteer({ email: 'g-existing@example.com' })
    googleAuth.accept('known', { email: existing.email!, name: existing.name })
    await signIn('known')
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard'))

    cleanup()
    localStorage.clear()
    await renderApp(<SignupPage />)
    vi.spyOn(prisma.volunteer, 'findFirst').mockRejectedValueOnce(new Error('db') as never)
    await userEvent.click(await screen.findByRole('button', { name: /dev stub/ }))
    await screen.findByRole('alert')
    await userEvent.click(await screen.findByRole('button', { name: /dev stub/ }))
    await screen.findByText('Complete your application')
    expect(screen.getByLabelText('Your Name')).toHaveValue('Stub User')
    expect(JSON.parse(sessionStorage.getItem('google_pending_auth')!)).toMatchObject({
      stub: true,
      email: 'stub@example.com',
    })
    Object.assign(window, { google: undefined })
  })

  it('validates and submits the Google application form (restored from storage)', async () => {
    sessionStorage.setItem(
      'google_pending_auth',
      JSON.stringify({ stub: true, name: 'Stub User', email: 'stub@example.com' }),
    )
    await createLocalGroup({ name: 'Google Town', country: 'UK' })
    const gSkill = await createSkill()
    await renderApp(<SignupPage />)
    await screen.findByText('Complete your application')
    const form = () => screen.getByLabelText('Your Name').closest('form')!
    fireEvent.submit(form())
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'About You must be at least 20 characters',
    )
    await type('About You', 'A biography that comfortably passes twenty characters.')
    fireEvent.submit(form())
    expect(await screen.findByRole('alert')).toHaveTextContent('Country is required')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    fireEvent.submit(form())
    expect(await screen.findByRole('alert')).toHaveTextContent('Availability is required')
    await type('Hours per week you can give (1–40)', '3')
    await type('Your Application', 'I want to help with campaigns and policy work.')
    await userEvent.click(await screen.findByRole('button', { name: 'Select local group' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Google Town' }))
    await type('Discord Handle', 'g#1')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[0])
    await userEvent.clear(screen.getByLabelText('Discord Handle'))
    await type('Signal', 's')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[1])
    await userEvent.clear(screen.getByLabelText('Signal'))
    await type('WhatsApp', 'w')
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[2])
    await userEvent.clear(screen.getByLabelText('WhatsApp'))
    await userEvent.click(screen.getAllByLabelText('Preferred contact method')[3])
    await userEvent.click(await screen.findByLabelText(gSkill.name))
    // Leaving mid-application is guarded.
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    await type('Contact Notes', 'n')
    await type('Other Skills', 'o')
    await userEvent.click(
      screen.getByLabelText('Make my profile visible in the volunteer directory'),
    )
    await userEvent.click(
      screen.getByLabelText('Allow project owners to contact me about opportunities'),
    )
    await userEvent.click(
      screen.getByLabelText('Allow project owners to contact me about opportunities'),
    )
    await userEvent.click(
      screen.getByLabelText('Share my contact info directly with project owners'),
    )
    await userEvent.click(
      screen.getByRole('button', { name: 'Keep me in the loop about new projects' }),
    )
    await userEvent.click(screen.getByRole('option', { name: "Don't email me" }))
    await userEvent.click(
      screen.getByLabelText('Allow Google Analytics to help us improve the platform'),
    )
    fireEvent.submit(form())
    await screen.findByText('Application submitted')
    expect(screen.getByRole('status')).toHaveTextContent(
      'A member of the team reviews your application.',
    )
    const row = await prisma.volunteer.findFirstOrThrow({ where: { email: 'stub@example.com' } })
    expect(row).toMatchObject({
      name: 'Stub User',
      cookieConsentAnalytics: true,
      localGroup: 'Google Town',
      contactPreference: 'email',
      contactNotes: 'n',
      emailDigest: 'none',
      consentShareContactInfoWithProjectOwner: true,
    })
    expect(sessionStorage.getItem('google_pending_auth')).toBeNull()
  })

  it('reports a refused Google application, signs in directly when bootstrapped, and ignores corrupt storage', async () => {
    sessionStorage.setItem(
      'google_pending_auth',
      JSON.stringify({ stub: true, name: 'Stub User', email: 'stub@example.com' }),
    )
    if (!(await prisma.volunteer.findFirst({ where: { email: 'stub@example.com' } })))
      await createVolunteer({ email: 'stub@example.com' })
    await renderApp(<SignupPage />)
    await screen.findByText('Complete your application')
    await type('About You', 'A biography that comfortably passes twenty characters.')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    await userEvent.click(await screen.findByRole('button', { name: 'Select local group' }))
    await userEvent.click(
      await screen.findByRole('option', { name: "None of these, I'll enter my city" }),
    )
    await type('City / Area', 'Leeds')
    await type('Hours per week you can give (1–40)', '3')
    await type('Your Application', 'I want to help with campaigns and policy work.')
    fireEvent.submit(screen.getByLabelText('Your Name').closest('form')!)
    expect(await screen.findByRole('alert')).toHaveTextContent('Email already registered')

    cleanup()
    sessionStorage.setItem(
      'google_pending_auth',
      JSON.stringify({ credential: 'boot', name: 'Boot', email: 'admin12@example.com' }),
    )
    googleAuth.accept('boot', { email: 'admin12@example.com', name: 'Boot' })
    await renderApp(<SignupPage />)
    await screen.findByText('Complete your application')
    await type('About You', 'A biography that comfortably passes twenty characters.')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    await type('Hours per week you can give (1–40)', '3')
    await type('Your Application', 'I want to help with campaigns and policy work.')
    fireEvent.submit(screen.getByLabelText('Your Name').closest('form')!)
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard'))

    cleanup()
    sessionStorage.setItem('google_pending_auth', '{not json')
    await renderApp(<SignupPage />)
    await screen.findByLabelText('Your Name')
    expect(sessionStorage.getItem('google_pending_auth')).toBeNull()
  })
})
