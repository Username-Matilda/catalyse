import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, fireEvent, cleanup } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createLocalGroup, createSkill, TEST_PASSWORD } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import { anon } from '@/test/rpc'
import SettingsPage from './page'

vi.setConfig({ testTimeout: 30_000 })
const me = (id: number) => prisma.volunteer.findUniqueOrThrow({ where: { id } })

describe('settings — profile tab', () => {
  it('loads the profile, edits every field and saves', async () => {
    await createLocalGroup({ name: 'Settings Town', country: 'UK' })
    const skill = await createSkill()
    const vol = await createVolunteer({
      name: 'Sam Settings',
      location: 'Somewhere',
      country: null,
      contactPreference: 'email',
    })
    await renderApp(<SettingsPage />, { as: vol, url: '/settings' })
    const name = await screen.findByLabelText('Your Name')
    expect(name).toHaveValue('Sam Settings')
    expect(screen.getByLabelText('City / Area')).toHaveValue('Somewhere')
    await userEvent.clear(name)
    await userEvent.type(name, 'Samantha')
    await userEvent.type(screen.getByLabelText('About You'), ' plus more')
    await userEvent.type(screen.getByLabelText('Discord Handle'), 'sam#1')
    await userEvent.type(screen.getByLabelText('Signal'), '+1')
    await userEvent.type(screen.getByLabelText('WhatsApp'), '+2')
    await userEvent.click(screen.getByRole('button', { name: 'Preferred Contact Method' }))
    await userEvent.click(screen.getByRole('option', { name: 'Discord' }))
    await userEvent.type(screen.getByLabelText('Contact Notes'), 'evenings')
    await userEvent.type(screen.getByLabelText('Hours per Week'), '4')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select local group' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Settings Town' }))
    expect(screen.queryByLabelText('City / Area')).toBeNull()
    await userEvent.type(screen.getByLabelText('Other Skills'), 'juggling')
    await userEvent.click(await screen.findByLabelText(skill.name))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await screen.findByText('Profile updated!')
    const row = await me(vol.id)
    expect(row).toMatchObject({
      name: 'Samantha',
      discordHandle: 'sam#1',
      signalNumber: '+1',
      whatsappNumber: '+2',
      contactPreference: 'discord',
      contactNotes: 'evenings',
      availabilityHoursPerWeek: 4,
      country: 'UK',
      localGroup: 'Settings Town',
      otherSkills: 'juggling',
    })
    expect(
      await prisma.volunteerSkill.count({ where: { volunteerId: vol.id, skillId: skill.id } }),
    ).toBe(1)

    // "None of these" reveals the city input; a failed save is reported.
    await userEvent.click(screen.getByRole('button', { name: 'Select local group' }))
    await userEvent.click(
      await screen.findByRole('option', { name: "None of these, I'll enter my city" }),
    )
    await userEvent.type(screen.getByLabelText('City / Area'), 'Leeds')
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Serbia' }))
    expect(screen.getByLabelText('City / Area')).toBeInTheDocument()
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await screen.findByText('Unauthorized')
  })

  it('lets a needs-info applicant update and resubmit their application', async () => {
    const vol = await createVolunteer({
      approvalStatus: 'needs_info',
      applicationMessage: 'short',
      applicationApplicantNotes: 'Please add more detail',
    })
    await renderApp(<SettingsPage />, { as: vol, url: '/settings?tab=profile' })
    await screen.findByText('Please add more detail')
    const box = await screen.findByLabelText('Your Application')
    await waitFor(() => expect(box).toHaveValue('short'))
    expect(screen.getByRole('button', { name: 'Resubmit for Review' })).toBeDisabled()
    await userEvent.type(box, ' but now a much longer application message')
    await userEvent.click(screen.getByRole('button', { name: 'Resubmit for Review' }))
    await screen.findByText('Application resubmitted for review')
    await waitFor(async () => expect((await me(vol.id)).approvalStatus).toBe('under_review'))
    await screen.findByText(/has been resubmitted and is awaiting review/)
  })

  it('reports a failed application save and resubmit', async () => {
    const vol = await createVolunteer({
      approvalStatus: 'needs_info',
      applicationMessage: 'An application message long enough',
    })
    await renderApp(<SettingsPage />, { as: vol, url: '/settings' })
    const button = await screen.findByRole('button', { name: 'Resubmit for Review' })
    await waitFor(() => expect(button).toBeEnabled())
    await prisma.volunteer.update({ where: { id: vol.id }, data: { approvalStatus: 'approved' } })
    await userEvent.click(button)
    await screen.findByText('Cannot resubmit a approved application')
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(button)
    await screen.findByText('Unauthorized')
  })
})

describe('settings — account tab', () => {
  it('changes email and password, signs out other sessions, and deletes the account', async () => {
    const vol = await createVolunteer({ email: 'settings@example.com' })
    await createVolunteer({ email: 'taken@example.com' })
    const otherSession = (
      await anon().auth.login({ email: 'settings@example.com', password: TEST_PASSWORD })
    ).token
    await renderApp(<SettingsPage />, { as: vol, url: '/settings?tab=account' })
    await userEvent.type(await screen.findByLabelText('New Email Address'), 'taken@example.com')
    await userEvent.type(screen.getByLabelText('Your Password'), TEST_PASSWORD)
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }))
    await screen.findByText(/already registered to another account/)
    await userEvent.clear(screen.getByLabelText('New Email Address'))
    await userEvent.type(screen.getByLabelText('New Email Address'), 'fresh@example.com')
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }))
    await screen.findByText(/Email changed/)
    expect((await me(vol.id)).email).toBe('fresh@example.com')

    await userEvent.type(screen.getByLabelText('Current Password'), TEST_PASSWORD)
    await userEvent.type(screen.getByLabelText('New Password'), 'another-long-one')
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'mismatch')
    fireEvent.submit(screen.getByLabelText('New Password').closest('form')!)
    await screen.findByText('New passwords do not match')
    await userEvent.clear(screen.getByLabelText('Confirm New Password'))
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'another-long-one')
    fireEvent.submit(screen.getByLabelText('New Password').closest('form')!)
    await screen.findByText('Password changed successfully')
    expect(localStorage.getItem('authToken')).toBeTruthy()

    await userEvent.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))
    await screen.findByText('Signed out of all other sessions')
    expect(await prisma.session.count({ where: { volunteerId: vol.id } })).toBe(1)
    void otherSession

    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))
    await userEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))
    await userEvent.type(screen.getByLabelText('Enter your password'), 'another-long-one')
    await userEvent.type(screen.getByLabelText('Confirm your password'), 'different')
    fireEvent.submit(screen.getByLabelText('Enter your password').closest('form')!)
    await screen.findByText('Passwords do not match')
    await userEvent.clear(screen.getByLabelText('Confirm your password'))
    await userEvent.type(screen.getByLabelText('Confirm your password'), 'wrong-password')
    await userEvent.clear(screen.getByLabelText('Enter your password'))
    await userEvent.type(screen.getByLabelText('Enter your password'), 'wrong-password')
    fireEvent.submit(screen.getByLabelText('Enter your password').closest('form')!)
    await screen.findByText('Password is incorrect')
    await userEvent.clear(screen.getByLabelText('Enter your password'))
    await userEvent.clear(screen.getByLabelText('Confirm your password'))
    await userEvent.type(screen.getByLabelText('Enter your password'), 'another-long-one')
    await userEvent.type(screen.getByLabelText('Confirm your password'), 'another-long-one')
    fireEvent.submit(screen.getByLabelText('Enter your password').closest('form')!)
    await screen.findByText(/account has been deleted/)
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/login'), { timeout: 3000 })
    expect((await me(vol.id)).deletedAt).not.toBeNull()
  })

  it('handles a passwordless (Google) account, and reports failures', async () => {
    const vol = await createVolunteer({ passwordHash: null })
    await renderApp(<SettingsPage />, { as: vol, url: '/settings?tab=account' })
    await userEvent.type(await screen.findByLabelText('New Email Address'), 'x@example.com')
    await userEvent.type(screen.getByLabelText('Your Password'), 'anything')
    await userEvent.click(screen.getByRole('button', { name: 'Change Email' }))
    await screen.findByText(/without a password/)
    await userEvent.type(screen.getByLabelText('Current Password'), 'anything')
    await userEvent.type(screen.getByLabelText('New Password'), 'another-long-one')
    await userEvent.type(screen.getByLabelText('Confirm New Password'), 'another-long-one')
    fireEvent.submit(screen.getByLabelText('New Password').closest('form')!)
    await screen.findByText('Current password is incorrect')
    await userEvent.click(screen.getByRole('button', { name: /Delete/ }))
    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'nope')
    fireEvent.submit(screen.getByPlaceholderText('DELETE').closest('form')!)
    await screen.findByText('Please type DELETE to confirm')
    await userEvent.clear(screen.getByPlaceholderText('DELETE'))
    await userEvent.type(screen.getByPlaceholderText('DELETE'), 'DELETE')
    vi.spyOn(prisma.deletionRequest, 'create').mockRejectedValueOnce(new Error('db down') as never)
    fireEvent.submit(screen.getByPlaceholderText('DELETE').closest('form')!)
    await screen.findByText(/db down|Account deletion failed|INTERNAL/i)
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Log out of all other sessions' }))
    await screen.findByText('Unauthorized')
  })
})

describe('settings — notifications and privacy tabs', () => {
  it('saves notification and consent preferences, and exports data', async () => {
    const vol = await createVolunteer({ consentContactableByProjectOwners: true })
    URL.createObjectURL = vi.fn(() => 'blob:x')
    URL.revokeObjectURL = vi.fn()
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await renderApp(<SettingsPage />, { as: vol, url: '/settings?tab=notifications' })
    await userEvent.click(
      await screen.findByRole('button', { name: 'Keep me in the loop about new projects' }),
    )
    await userEvent.click(screen.getByRole('option', { name: 'Send me a fortnightly digest' }))
    await userEvent.click(screen.getByLabelText(/remote/i))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await screen.findByText('Profile updated!')
    expect(await me(vol.id)).toMatchObject({
      emailDigest: 'fortnightly',
      notifyRemoteProjects: true,
    })

    await userEvent.click(screen.getByRole('tab', { name: 'Privacy & Data' }))
    await userEvent.click(screen.getByLabelText(/visible in the volunteer directory/i))
    await userEvent.click(screen.getByLabelText(/Share my contact/i))
    await userEvent.click(screen.getByLabelText(/contact me about/i))
    await userEvent.click(screen.getByRole('button', { name: 'Save Changes' }))
    await waitFor(() => expect(screen.getAllByText('Profile updated!')).toHaveLength(2))
    expect(await me(vol.id)).toMatchObject({
      consentMakeProfileVisibleInDirectory: false,
      consentContactableByProjectOwners: false,
      consentShareContactInfoWithProjectOwner: true,
    })
    await userEvent.click(screen.getByRole('button', { name: 'Download My Data' }))
    await screen.findByText('Data exported successfully!')
    expect(click).toHaveBeenCalled()
    click.mockRestore()
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Download My Data' }))
    await screen.findByText('Unauthorized')
    cleanup()
    await renderApp(<SettingsPage />, { as: vol, url: '/settings?tab=nonsense' })
    expect(await screen.findByRole('tab', { name: 'Profile' })).toHaveAttribute(
      'aria-selected',
      'true',
    )
  })
})
