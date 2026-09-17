import { describe, it, expect, vi } from 'vitest'
import { render, screen, act, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useUrlParam, useUrlSearchInput } from './url-filters'

function ParamProbe() {
  const [status, setStatus] = useUrlParam('status')
  return (
    <>
      <span data-testid="status">{status}</span>
      <button onClick={() => setStatus('ready')}>set</button>
      <button onClick={() => setStatus('')}>clear</button>
    </>
  )
}

function SearchProbe() {
  const [input, setInput, urlValue] = useUrlSearchInput('q', 50)
  return (
    <>
      <input value={input} onChange={(e) => setInput(e.target.value)} />
      <span data-testid="url">{urlValue}</span>
    </>
  )
}

describe('useUrlParam', () => {
  it('reads from and writes to the URL query string', async () => {
    window.history.replaceState(null, '', '/projects?page=2')
    render(<ParamProbe />)
    expect(screen.getByTestId('status')).toHaveTextContent('')
    await userEvent.click(screen.getByText('set'))
    expect(screen.getByTestId('status')).toHaveTextContent('ready')
    expect(window.location.search).toBe('?page=2&status=ready')
    await userEvent.click(screen.getByText('clear'))
    expect(window.location.search).toBe('?page=2')
    // Removing the last param leaves a bare pathname.
    window.history.replaceState(null, '', '/projects?status=x')
    await userEvent.click(screen.getByText('clear'))
    expect(window.location.href).toMatch(/\/projects$/)
  })
})

describe('useUrlSearchInput', () => {
  it('debounces typing into the URL, and clears the key when emptied', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      window.history.replaceState(null, '', '/volunteers')
      render(<SearchProbe />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'ann' } })
      expect(screen.getByTestId('url')).toHaveTextContent('')
      act(() => vi.advanceTimersByTime(60))
      expect(window.location.search).toBe('?q=ann')
      expect(screen.getByTestId('url')).toHaveTextContent('ann')
      fireEvent.change(screen.getByRole('textbox'), { target: { value: '' } })
      act(() => vi.advanceTimersByTime(60))
      expect(window.location.search).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })

  it('does not write once the page has navigated away', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'] })
    try {
      window.history.replaceState(null, '', '/volunteers')
      render(<SearchProbe />)
      fireEvent.change(screen.getByRole('textbox'), { target: { value: 'x' } })
      // Simulate a route change that commits before the debounce fires, without the
      // hook re-rendering (its pathname is still /volunteers): bypass the patched
      // replaceState so no subscriber is notified.
      History.prototype.replaceState.call(window.history, null, '', '/projects/3')
      act(() => vi.advanceTimersByTime(60))
      expect(window.location.search).toBe('')
    } finally {
      vi.useRealTimers()
    }
  })
})
