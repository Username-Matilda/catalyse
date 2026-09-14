import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CookieConsentProvider, useCookieConsent } from './cookie-consent-context'
import { LocationModalProvider, useLocationModal } from './location-modal-context'
import { ToastProvider, useToast } from './toast'

describe('CookieConsentProvider', () => {
  function Probe() {
    const { bannerVisible, setBannerVisible } = useCookieConsent()
    return <button onClick={() => setBannerVisible(!bannerVisible)}>{String(bannerVisible)}</button>
  }
  it('toggles banner visibility, and is a no-op default outside the provider', async () => {
    render(
      <CookieConsentProvider>
        <Probe />
      </CookieConsentProvider>,
    )
    await userEvent.click(screen.getByText('false'))
    expect(screen.getByText('true')).toBeInTheDocument()
    render(<Probe />)
    await userEvent.click(screen.getAllByText('false')[0])
    expect(screen.getAllByText('false')).toHaveLength(1)
  })
})

describe('LocationModalProvider', () => {
  function Probe() {
    const { open, show, hide } = useLocationModal()
    return (
      <>
        <span>{open ? 'open' : 'closed'}</span>
        <button onClick={hide}>hide</button>
        <button onClick={show}>show</button>
      </>
    )
  }
  it('starts open and can be hidden and shown', async () => {
    render(
      <LocationModalProvider>
        <Probe />
      </LocationModalProvider>,
    )
    expect(screen.getByText('open')).toBeInTheDocument()
    await userEvent.click(screen.getByText('hide'))
    expect(screen.getByText('closed')).toBeInTheDocument()
    await userEvent.click(screen.getByText('show'))
    expect(screen.getByText('open')).toBeInTheDocument()
  })
  it('throws outside the provider', () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    expect(() => render(<Probe />)).toThrow('useLocationModal must be used within')
  })
})

describe('ToastProvider', () => {
  function Probe() {
    const toast = useToast()
    return (
      <>
        <button onClick={() => toast('Saved', 'success')}>success</button>
        <button onClick={() => toast('Plain')}>info</button>
      </>
    )
  }
  it('shows, animates in, and auto-dismisses toasts; the default context is inert', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      render(
        <ToastProvider>
          <Probe />
        </ToastProvider>,
      )
      fireEvent.click(screen.getByText('success'))
      fireEvent.click(screen.getByText('info'))
      expect(screen.getAllByRole('alert')).toHaveLength(2)
      expect(screen.getByText('Saved').closest('[role=alert]')).toHaveClass('opacity-0')
      act(() => vi.advanceTimersByTime(20))
      expect(screen.getByText('Saved').closest('[role=alert]')).toHaveClass('opacity-100')
      fireEvent.click(screen.getAllByLabelText('Dismiss')[1])
      act(() => vi.advanceTimersByTime(4300))
      expect(screen.queryAllByRole('alert')).toHaveLength(0)
    } finally {
      vi.useRealTimers()
    }
    render(<Probe />)
    await userEvent.click(screen.getAllByText('info')[1])
    expect(screen.queryAllByRole('alert')).toHaveLength(0)
  })
})
