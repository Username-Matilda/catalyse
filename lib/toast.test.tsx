import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, act } from '@testing-library/react'
import { ToastProvider, useToast } from './toast'

function Shower({ message }: { message: string }) {
  const toast = useToast()
  return <button onClick={() => toast(message, 'error')}>show</button>
}

afterEach(() => vi.restoreAllMocks())

describe('toast', () => {
  it('shows every toast raised in the same millisecond, and dismisses them independently', async () => {
    vi.spyOn(Date, 'now').mockReturnValue(1_000)
    render(
      <ToastProvider>
        <Shower message="Same message" />
      </ToastProvider>,
    )
    const button = screen.getByRole('button', { name: 'show' })
    act(() => {
      button.click()
      button.click()
    })
    expect(screen.getAllByText('Same message')).toHaveLength(2)

    act(() => screen.getAllByRole('button', { name: 'Dismiss' })[0].click())
    await vi.waitFor(() => expect(screen.getAllByText('Same message')).toHaveLength(1))
  })
})
