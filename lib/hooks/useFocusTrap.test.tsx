import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useFocusTrap } from './useFocusTrap'

function Dialog({ open, empty = false }: { open: boolean; empty?: boolean }) {
  const ref = useFocusTrap(open)
  return (
    <div ref={ref} data-testid="dialog">
      {!empty && (
        <>
          <button>first</button>
          <button>last</button>
        </>
      )}
    </div>
  )
}

describe('useFocusTrap', () => {
  it('focuses the first element, wraps Tab in both directions, and restores focus on close', async () => {
    const user = userEvent.setup()
    const { rerender } = render(
      <>
        <button>trigger</button>
        <Dialog open={false} />
      </>,
    )
    screen.getByText('trigger').focus()
    rerender(
      <>
        <button>trigger</button>
        <Dialog open />
      </>,
    )
    expect(screen.getByText('first')).toHaveFocus()
    await user.tab({ shift: true })
    expect(screen.getByText('last')).toHaveFocus()
    await user.tab()
    expect(screen.getByText('first')).toHaveFocus()
    // A non-Tab key and a Tab from the middle are left alone.
    await user.keyboard('{Enter}')
    screen.getByText('last').focus()
    await user.tab({ shift: true })
    expect(screen.getByText('first')).toHaveFocus()
    rerender(
      <>
        <button>trigger</button>
        <Dialog open={false} />
      </>,
    )
    expect(screen.getByText('trigger')).toHaveFocus()
  })

  it('tolerates a container with nothing focusable', async () => {
    const user = userEvent.setup()
    render(<Dialog open empty />)
    await user.tab()
    expect(document.body).toHaveFocus()
  })
})
