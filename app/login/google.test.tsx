import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, act } from '@testing-library/react'
import { createVolunteer } from '@/test/factories'
import { renderApp } from '@/test/render'
import { navigation } from '@/test/next-navigation'
import LoginPage from './page'

vi.mock('next/script', () => ({ default: () => null }))
// Google's token verification is a network round trip to their JWKS endpoint.
vi.mock('@/lib/google-auth', () => ({ verifyGoogleToken: vi.fn(async () => null) }))
import { verifyGoogleToken } from '@/lib/google-auth'

type GoogleCallback = (r: { credential: string }) => void

function installGoogle() {
  let callback: GoogleCallback | undefined
  const google = {
    accounts: {
      id: {
        initialize: vi.fn((c: { callback: GoogleCallback }) => {
          callback = c.callback
        }),
        renderButton: vi.fn(),
      },
    },
  }
  Object.assign(window, { google })
  return { google, signIn: (credential: string) => act(() => callback!({ credential })) }
}

describe('login with Google', () => {
  it('renders the button once the client id is known and handles each outcome', async () => {
    const { google, signIn } = installGoogle()
    await renderApp(<LoginPage />)
    await waitFor(() => expect(google.accounts.id.renderButton).toHaveBeenCalled())
    expect(document.getElementById('g_signin_btn')).toBeInTheDocument()

    // Unknown credential → error.
    await signIn('bad')
    expect(await screen.findByRole('alert')).toHaveTextContent('Invalid Google token')

    // New account → handed to the signup form with the pending auth stashed.
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({ email: 'new@example.com', name: 'New' })
    await signIn('fresh')
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/signup'))
    expect(JSON.parse(sessionStorage.getItem('google_pending_auth')!)).toMatchObject({
      credential: 'fresh',
      email: 'new@example.com',
      name: 'New',
    })

    // Existing account → signed in.
    const vol = await createVolunteer({ email: 'existing@example.com' })
    vi.mocked(verifyGoogleToken).mockResolvedValueOnce({ email: vol.email!, name: vol.name })
    await signIn('known')
    await waitFor(() => expect(navigation.push).toHaveBeenCalledWith('/dashboard'))
    expect(localStorage.getItem('authToken')).toBeTruthy()
  })

  it('does nothing when the Google library has not loaded', async () => {
    Object.assign(window, { google: undefined })
    await renderApp(<LoginPage />)
    await screen.findByLabelText('Email')
    expect(document.getElementById('g_signin_btn')).toBeInTheDocument()
  })
})
