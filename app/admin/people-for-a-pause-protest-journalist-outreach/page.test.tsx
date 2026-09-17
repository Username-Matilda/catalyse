import { describe, it, expect, vi } from 'vitest'
import { screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createAdmin } from '@/test/factories'
import { renderApp } from '@/test/render'
import AdminJournalistOutreachPage from './page'

const button = (name: string | RegExp) => screen.getByRole('button', { name })
const statCard = (label: string) => screen.getByText(label, { selector: 'div' }).parentElement!

describe('admin journalist outreach', () => {
  it('previews and imports pasted or uploaded CSV', async () => {
    const admin = await createAdmin()
    await prisma.experimentalJournalist.create({
      data: {
        firstName: 'Existing',
        lastName: 'One',
        email: 'old@x.com',
        organisation: 'P',
        leaning: 'DEMOCRAT',
      },
    })
    await renderApp(<AdminJournalistOutreachPage />, { as: admin })
    await waitFor(() => expect(statCard('Available')).toHaveTextContent('1'))
    expect(
      screen.getByText('First name, Last name, Email, Organisation, Leaning'),
    ).toBeInTheDocument()

    const csv = screen.getByLabelText('CSV')
    const oldLayout = 'name,email,publication,leaning\nBad,nope,P,R'
    await userEvent.upload(
      screen.getByLabelText('Upload CSV file'),
      new File([oldLayout], 'j.csv', { type: 'text/csv' }),
    )
    await waitFor(() => expect(csv).toHaveValue(oldLayout))
    await userEvent.click(button('Preview'))
    expect(await screen.findByRole('alert')).toHaveTextContent(
      'Missing required columns: First name, Last name, Organisation',
    )
    expect(button('Import 0')).toBeDisabled()

    const HEADER = 'First name,Last name,Email,Organisation,Leaning{enter}'
    await userEvent.clear(csv)
    await userEvent.type(csv, `${HEADER}Bad,Row,nope,P,R`)
    await userEvent.click(button('Preview'))
    expect(await screen.findByText('1 invalid')).toBeInTheDocument()
    expect(screen.getByText(/Line 2: Invalid email/)).toBeInTheDocument()
    expect(screen.queryByText(/Missing required column/)).not.toBeInTheDocument()

    await userEvent.clear(csv)
    expect(screen.queryByText('1 invalid')).not.toBeInTheDocument()
    await userEvent.type(
      csv,
      `${HEADER}Jane,Doe,jane@x.com,Planet,R{enter}Old,One,old@x.com,P,D{enter}Jane,Two,jane@x.com,P,D`,
    )
    await userEvent.click(button('Preview'))
    expect(await screen.findByText('1 new')).toBeInTheDocument()
    expect(screen.getByText('Jane Doe <jane@x.com> · Planet · REPUBLICAN')).toBeInTheDocument()
    expect(screen.getByText('1 to update')).toBeInTheDocument()
    expect(screen.getByText(/old@x\.com:.*firstName "Existing" → "Old"/)).toBeInTheDocument()
    expect(screen.getByText('1 skipped')).toBeInTheDocument()
    expect(screen.getByText('Line 4: jane@x.com (Repeated in this import)')).toBeInTheDocument()

    await userEvent.click(button('Import 1, update 1'))
    expect(await screen.findByText('Imported 1 new, updated 1')).toBeInTheDocument()
    expect(csv).toHaveValue('')
    await waitFor(() => expect(statCard('Available')).toHaveTextContent('2'))

    await userEvent.type(csv, `${HEADER}Sam,Lee,sam@x.com,P,D{enter}Kim,Park,kim@x.com,P,R`)
    await userEvent.click(button('Preview'))
    await userEvent.click(await screen.findByRole('button', { name: 'Import 2' }))
    expect(await screen.findByText('Imported 2 new')).toBeInTheDocument()
  })

  it('filters, resets, deletes and exports journalists', async () => {
    const admin = await createAdmin()
    const p = await prisma.experimentalOutreachParticipant.create({
      data: { email: 'vol@example.com' },
    })
    const base = { lastName: 'Doe', organisation: 'Planet', leaning: 'REPUBLICAN' as const }
    await prisma.experimentalJournalist.create({
      data: { ...base, firstName: 'Avail', email: 'a@x.com', skipCount: 2, priorityTier: 2 },
    })
    await prisma.experimentalJournalist.create({
      data: {
        ...base,
        firstName: 'Held',
        email: 'h@x.com',
        claimedById: p.id,
        claimedAt: new Date(),
      },
    })
    await prisma.experimentalJournalist.create({
      data: {
        ...base,
        firstName: 'Sent',
        email: 's@x.com',
        leaning: 'DEMOCRAT',
        leaningConfidence: 'LOW',
        sentLeaning: 'REPUBLICAN',
        contactedById: p.id,
        contactedAt: new Date(),
      },
    })
    await prisma.experimentalJournalist.create({
      data: { ...base, firstName: 'Orphan', email: 'o@x.com', contactedAt: new Date() },
    })
    await renderApp(<AdminJournalistOutreachPage />, { as: admin })
    const table = await screen.findByRole('table')
    const row = (name: string) => within(table).getByText(`${name} Doe`).closest('tr')!

    expect(row('Avail')).toHaveTextContent('Skipped 2×')
    expect(row('Avail')).toHaveTextContent('a@x.com · Planet · Tier 2')
    expect(row('Held')).toHaveTextContent(/claimed.*vol@example\.com.*since/)
    expect(row('Sent')).toHaveTextContent(/^Sent.*Dlowsent as R.*contacted.*vol@example\.com/)
    expect(row('Orphan')).toHaveTextContent('deleted participant')
    expect(statCard('Volunteers who sent')).toHaveTextContent('1')

    await userEvent.click(button('Claimed'))
    expect(within(screen.getByRole('table')).getAllByRole('row')).toHaveLength(2)
    await userEvent.click(button('Available'))
    expect(screen.getByRole('table')).toHaveTextContent('Avail')
    await userEvent.click(button('All'))

    await userEvent.click(within(row('Sent')).getByRole('button', { name: 'Reset' }))
    await waitFor(() =>
      expect(within(row('Sent')).queryByRole('button', { name: 'Reset' })).toBeNull(),
    )

    await userEvent.click(within(row('Sent')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Cancel' }),
    )
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    await userEvent.click(within(row('Sent')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    )
    await waitFor(() => expect(screen.getByRole('table')).not.toHaveTextContent('s@x.com'))

    // Deleting a journalist someone else already removed surfaces the server error.
    await prisma.experimentalJournalist.delete({ where: { email: 'o@x.com' } })
    await userEvent.click(within(row('Orphan')).getByRole('button', { name: 'Delete' }))
    await userEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Delete' }),
    )
    expect(await screen.findByRole('alert')).toBeInTheDocument()

    const createObjectURL = vi.fn(() => 'blob:csv')
    const revokeObjectURL = vi.fn()
    Object.assign(URL, { createObjectURL, revokeObjectURL })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    await userEvent.click(button('Export CSV'))
    await waitFor(() => expect(click).toHaveBeenCalled())
    expect(revokeObjectURL).toHaveBeenCalledWith('blob:csv')
    click.mockRestore()

    await userEvent.click(within(row('Held')).getByRole('button', { name: 'Reset' }))
    await userEvent.click(button('Claimed'))
    expect(await screen.findByText('No journalists here.')).toBeInTheDocument()
  })
})
