import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'
import Linkify from './Linkify'

const renderText = (text: string | null) =>
  render(
    <p data-testid="out">
      <Linkify text={text} />
    </p>,
  )

describe('Linkify', () => {
  it('turns http and https URLs into links that open safely in a new tab', () => {
    renderText('Brief at https://example.org/brief?a=1&b=2 and HTTP://old.example.com too')
    const links = screen.getAllByRole('link')
    expect(links.map((a) => a.getAttribute('href'))).toEqual([
      'https://example.org/brief?a=1&b=2',
      'HTTP://old.example.com',
    ])
    for (const link of links) {
      expect(link).toHaveAttribute('target', '_blank')
      expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    }
    expect(screen.getByTestId('out')).toHaveTextContent(
      'Brief at https://example.org/brief?a=1&b=2 and HTTP://old.example.com too',
    )
  })

  it('leaves sentence punctuation after a URL outside the link', () => {
    renderText('See (https://example.org/doc). Then https://example.org/x, done!')
    expect(screen.getAllByRole('link').map((a) => a.getAttribute('href'))).toEqual([
      'https://example.org/doc',
      'https://example.org/x',
    ])
    expect(screen.getByTestId('out')).toHaveTextContent(
      'See (https://example.org/doc). Then https://example.org/x, done!',
    )
  })

  it('never links a hostile or incomplete scheme', () => {
    renderText(
      'javascript:alert(1) data:text/html,<b>x</b> JAVASCRIPT://example.org/%0aalert(1) https:// http://)',
    )
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByTestId('out')).toHaveTextContent('javascript:alert(1)')
  })

  it('links only the http URL inside a hostile string', () => {
    renderText('javascript:open("https://example.org")')
    expect(screen.getByRole('link')).toHaveAttribute('href', 'https://example.org')
  })

  it('leaves text without URLs unchanged', () => {
    renderText('No links here')
    expect(screen.queryByRole('link')).toBeNull()
    expect(screen.getByTestId('out')).toHaveTextContent('No links here')
  })

  it('renders nothing for a missing description', () => {
    renderText(null)
    expect(screen.getByTestId('out')).toBeEmptyDOMElement()
  })
})
