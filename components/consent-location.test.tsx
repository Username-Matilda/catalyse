import { describe, it, expect } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createLocalGroup } from '@/test/factories'
import { renderApp } from '@/test/render'
import CookieConsentBanner from './CookieConsentBanner'
import VolunteerSelect from './VolunteerSelect'
import ConfirmLocationModal from './ConfirmLocationModal'
import { CookieConsentProvider, useCookieConsent } from '@/lib/cookie-consent-context'
import { LocationModalProvider } from '@/lib/location-modal-context'

function BannerFlag() {
  const { bannerVisible } = useCookieConsent()
  return <span data-testid="flag">{String(bannerVisible)}</span>
}

describe('CookieConsentBanner', () => {
  it('asks once for anonymous visitors and stores the answer', async () => {
    await renderApp(
      <CookieConsentProvider>
        <CookieConsentBanner />
        <BannerFlag />
      </CookieConsentProvider>,
    )
    expect(await screen.findByText('Decline')).toBeInTheDocument()
    expect(screen.getByTestId('flag')).toHaveTextContent('true')
    await userEvent.click(screen.getByText('Decline'))
    expect(localStorage.getItem('cookieConsent')).toBe('false')
    expect(screen.queryByText('Decline')).toBeNull()
    expect(screen.getByTestId('flag')).toHaveTextContent('false')
    // A stored answer is respected on the next visit.
    await renderApp(
      <CookieConsentProvider>
        <CookieConsentBanner />
      </CookieConsentProvider>,
    )
    await waitFor(() => expect(screen.queryByText('Accept')).toBeNull())
  })

  it("uses and updates the signed-in volunteer's stored choice, loading GA when accepted", async () => {
    const Banner = CookieConsentBanner
    const decided = await createVolunteer({ cookieConsentAnalytics: true })
    await renderApp(
      <CookieConsentProvider>
        <Banner />
      </CookieConsentProvider>,
      { as: decided },
    )
    expect(await screen.findByTestId('ga-init')).toBeInTheDocument()
    expect(screen.queryByText('Accept')).toBeNull()

    expect(localStorage.getItem('cookieConsent')).toBe('true')

    localStorage.removeItem('cookieConsent')
    const undecided = await createVolunteer({ cookieConsentAnalytics: null })
    await renderApp(
      <CookieConsentProvider>
        <Banner />
      </CookieConsentProvider>,
      { as: undecided },
    )
    await userEvent.click(await screen.findByText('Accept'))
    await waitFor(async () =>
      expect(
        (await prisma.volunteer.findUniqueOrThrow({ where: { id: undecided.id } }))
          .cookieConsentAnalytics,
      ).toBe(true),
    )
  })

  it("keeps an account's Decline on the device, over an older answer to the banner", async () => {
    localStorage.setItem('cookieConsent', 'true')
    const declined = await createVolunteer({ cookieConsentAnalytics: false })
    await renderApp(
      <CookieConsentProvider>
        <CookieConsentBanner />
      </CookieConsentProvider>,
      { as: declined },
    )
    await waitFor(() => expect(localStorage.getItem('cookieConsent')).toBe('false'))
    expect(screen.queryByTestId('ga-init')).toBeNull()
    expect(screen.queryByText('Decline')).toBeNull()
  })

  it('says so when the choice cannot be saved to the account, and keeps it on the device', async () => {
    const undecided = await createVolunteer({ cookieConsentAnalytics: null })
    await renderApp(
      <CookieConsentProvider>
        <CookieConsentBanner />
      </CookieConsentProvider>,
      { as: undecided },
    )
    const decline = await screen.findByText('Decline')
    await prisma.volunteer.update({ where: { id: undecided.id }, data: { deletedAt: new Date() } })
    await userEvent.click(decline)
    await screen.findByText(/couldn't be saved to your account/)
    expect(localStorage.getItem('cookieConsent')).toBe('false')
    expect(screen.queryByText('Accept')).toBeNull()
  })
})

describe('VolunteerSelect', () => {
  it('searches volunteers server-side and remembers the picked option', async () => {
    const me = await createVolunteer()
    const ann = await createVolunteer({
      name: 'Annabelle Zed',
      country: 'UK',
      localGroup: 'Leeds',
      bio: 'Loves zebrafish and long walks',
    })
    await createVolunteer({ name: 'Bartholomew Zed', country: 'US' })
    function Host() {
      const [value, setValue] = useState('')
      return (
        <>
          <VolunteerSelect
            id="vs"
            label="Volunteer"
            ariaLabel="Volunteer"
            value={value}
            onChange={setValue}
          />
          <span data-testid="v">{value}</span>
        </>
      )
    }
    await renderApp(<Host />, { as: me })
    await userEvent.click(screen.getByRole('button', { name: 'Volunteer' }))
    expect(await screen.findByRole('option', { name: 'Annabelle Zed' })).toBeInTheDocument()
    expect(screen.getByText('Leeds, UK')).toBeInTheDocument()
    // The client-side filter matches names only; the server search also matches bios, so a
    // bio word first empties the list and then, once the debounced fetch lands, refills it.
    await userEvent.type(screen.getByRole('searchbox'), 'zebrafish')
    expect(screen.getByText('No results')).toBeInTheDocument()
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.type(screen.getByRole('searchbox'), 'Bartholomew')
    // Let the debounce elapse so the server-side search actually runs.
    await new Promise((r) => setTimeout(r, 400))
    await waitFor(
      () => expect(screen.queryByRole('option', { name: 'Annabelle Zed' })).toBeNull(),
      { timeout: 3000 },
    )
    await userEvent.clear(screen.getByRole('searchbox'))
    await userEvent.click(
      await screen.findByRole('option', { name: 'Annabelle Zed' }, { timeout: 3000 }),
    )
    expect(screen.getByTestId('v')).toHaveTextContent(String(ann.id))
    // Searching away from the selected volunteer keeps their name on the trigger and in the list.
    await userEvent.click(screen.getByRole('button', { name: 'Volunteer' }))
    await userEvent.type(screen.getByRole('searchbox'), 'Bartholomew')
    await waitFor(() => expect(screen.getAllByRole('option')).toHaveLength(1), { timeout: 3000 })
    await userEvent.clear(screen.getByRole('searchbox'))
    expect(screen.getByRole('option', { name: 'Annabelle Zed' })).toBeInTheDocument()
  })

  it('does nothing when disabled', async () => {
    const me = await createVolunteer()
    await renderApp(
      <VolunteerSelect
        id="vs"
        label="V"
        ariaLabel="V"
        value=""
        onChange={() => {}}
        enabled={false}
        placeholder="Pick"
      />,
      { as: me },
    )
    await userEvent.click(screen.getByRole('button', { name: 'V' }))
    expect(screen.getAllByRole('option')).toHaveLength(1)
  })
})

describe('ConfirmLocationModal', () => {
  const mount = (as: Awaited<ReturnType<typeof createVolunteer>>) =>
    renderApp(
      <LocationModalProvider>
        <ConfirmLocationModal />
      </LocationModalProvider>,
      { as },
    )

  it('stays hidden for confirmed users, and can be postponed', async () => {
    const confirmed = await createVolunteer({ locationConfirmedAt: new Date() })
    await mount(confirmed)
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
    const fresh = await createVolunteer({ locationConfirmedAt: null, country: null })
    await mount(fresh)
    expect(await screen.findByRole('dialog')).toBeInTheDocument()
    await userEvent.click(screen.getByText('Ask me later'))
    expect(screen.queryByRole('dialog')).toBeNull()
  })

  it('collects country, local group or city, and saves', async () => {
    await createLocalGroup({ name: 'Testtown', country: 'UK' })
    const fresh = await createVolunteer({
      locationConfirmedAt: null,
      country: null,
      location: 'Somewhere',
    })
    await mount(fresh)
    await screen.findByRole('dialog')
    // No country yet → nothing but the country picker.
    expect(screen.queryByLabelText('City / Area')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Select country' }))
    await userEvent.click(await screen.findByRole('option', { name: 'United Kingdom' }))
    await userEvent.click(screen.getByRole('button', { name: 'Select local group' }))
    await userEvent.click(await screen.findByRole('option', { name: 'Testtown' }))
    expect(screen.queryByLabelText('City / Area')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () => {
      const row = await prisma.volunteer.findUniqueOrThrow({ where: { id: fresh.id } })
      expect(row).toMatchObject({ country: 'UK', localGroup: 'Testtown', location: 'Somewhere' })
      expect(row.locationConfirmedAt).not.toBeNull()
    })
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull())
  })

  it('handles a known country with no groups, and the "none of these" choice', async () => {
    await createLocalGroup({ name: 'Berlin', country: 'Germany' })
    const noGroups = await createVolunteer({
      locationConfirmedAt: null,
      country: 'Spain',
      location: null,
    })
    await mount(noGroups)
    await screen.findByRole('dialog')
    expect(screen.queryByRole('button', { name: 'Select country' })).toBeNull()
    await userEvent.type(await screen.findByLabelText('City / Area'), '  Madrid ')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () =>
      expect(
        await prisma.volunteer.findUniqueOrThrow({ where: { id: noGroups.id } }),
      ).toMatchObject({ country: 'Spain', location: 'Madrid', localGroup: null }),
    )

    const german = await createVolunteer({
      locationConfirmedAt: null,
      country: 'Germany',
      localGroup: 'Berlin',
    })
    await mount(german)
    await screen.findByRole('dialog')
    await userEvent.click(await screen.findByRole('button', { name: 'Select local group' }))
    await userEvent.click(
      await screen.findByRole('option', { name: "None of these, I'll enter my city" }),
    )
    await userEvent.type(screen.getByLabelText('City / Area'), 'Hamburg')
    await userEvent.click(screen.getByRole('button', { name: 'Confirm' }))
    await waitFor(async () =>
      expect(await prisma.volunteer.findUniqueOrThrow({ where: { id: german.id } })).toMatchObject({
        localGroup: null,
        location: 'Hamburg',
      }),
    )
  })
})
void act
