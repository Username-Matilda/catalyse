import { describe, it, expect, vi } from 'vitest'
import { render, screen, waitFor, fireEvent } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { prisma } from '@/lib/prisma'
import { createVolunteer, createProject, createTask } from '@/test/factories'
import { renderApp } from '@/test/render'
import { clientAs } from '@/test/rpc'
import CommentThread from './CommentThread'
import BugReportCommentThread from './BugReportCommentThread'
import CommentThreadView from './CommentThreadView'
import Footer from './Footer'
import AiEditingHelp from './AiEditingHelp'
import { ToastProvider } from '@/lib/toast'

describe('CommentThreadView', () => {
  const comments = [
    { id: 1, content: 'First', authorName: 'Ann', createdAt: new Date('2026-01-01T10:00:00Z') },
    { id: 2, content: 'Second', authorName: null, createdAt: null },
  ]

  it('renders loading, empty and populated states', () => {
    const { rerender } = render(
      <CommentThreadView
        comments={[]}
        canPost={false}
        isPending
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    expect(screen.getByText('Loading comments…')).toBeInTheDocument()
    rerender(
      <CommentThreadView
        comments={[]}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
        emptyText="Nothing"
      />,
    )
    expect(screen.getByText('Nothing')).toBeInTheDocument()
    expect(screen.queryByRole('textbox')).toBeNull()
    rerender(
      <CommentThreadView
        comments={comments}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    expect(screen.getByText('Unknown ·')).toBeInTheDocument()
    expect(screen.getByText(/Ann · 1 January 2026/)).toBeInTheDocument()
  })

  it('submits trimmed content and clears on success, copies permalinks', async () => {
    const onSubmit = vi.fn(async (c: string) => c !== 'fail')
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(
      <ToastProvider>
        <CommentThreadView
          comments={comments}
          canPost
          isPending={false}
          isSubmitting={false}
          onSubmit={onSubmit}
          placeholder="Say something"
        />
      </ToastProvider>,
    )
    const box = screen.getByLabelText('Add a comment')
    expect(box).toHaveAttribute('placeholder', 'Say something')
    expect(screen.getByRole('button', { name: 'Post Comment' })).toBeDisabled()
    fireEvent.change(box, { target: { value: '  hello  ' } })
    fireEvent.submit(box.closest('form')!)
    expect(onSubmit).toHaveBeenCalledWith('hello')
    await waitFor(() => expect(box).toHaveValue(''))
    fireEvent.change(box, { target: { value: 'fail' } })
    fireEvent.submit(box.closest('form')!)
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(2))
    expect(box).toHaveValue('fail')
    // Whitespace-only is ignored.
    fireEvent.change(box, { target: { value: '   ' } })
    fireEvent.submit(box.closest('form')!)
    expect(onSubmit).toHaveBeenCalledTimes(2)

    await userEvent.click(screen.getAllByLabelText('Copy link to this comment')[0])
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('#comment-1'))
    expect(await screen.findByText('Link copied!')).toBeInTheDocument()
    writeText.mockRejectedValueOnce(new Error('denied'))
    await userEvent.click(screen.getAllByLabelText('Copy link to this comment')[1])
    expect(await screen.findByText('Could not copy the link')).toBeInTheDocument()
  })

  it('scrolls to and highlights a permalinked comment once', () => {
    vi.useFakeTimers({ toFake: ['setTimeout'] })
    window.history.replaceState(null, '', '/x#comment-2')
    const scrollIntoView = vi.fn()
    Element.prototype.scrollIntoView = scrollIntoView
    const { rerender } = render(
      <CommentThreadView
        comments={[]}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    rerender(
      <CommentThreadView
        comments={comments}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    expect(scrollIntoView).toHaveBeenCalled()
    expect(document.getElementById('comment-2')).toHaveClass('ring-2')
    vi.advanceTimersByTime(2000)
    expect(document.getElementById('comment-2')).not.toHaveClass('ring-2')
    rerender(
      <CommentThreadView
        comments={[...comments]}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
    vi.useRealTimers()
    // A hash for a comment that is not in the list, and a non-comment hash, do nothing.
    window.history.replaceState(null, '', '/x#comment-99')
    render(
      <CommentThreadView
        comments={comments}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    window.history.replaceState(null, '', '/x#other')
    render(
      <CommentThreadView
        comments={comments}
        canPost={false}
        isPending={false}
        isSubmitting={false}
        onSubmit={async () => true}
      />,
    )
    expect(scrollIntoView).toHaveBeenCalledTimes(1)
  })

  it('shows the posting state', () => {
    render(
      <CommentThreadView
        comments={[]}
        canPost
        isPending={false}
        isSubmitting
        onSubmit={async () => true}
      />,
    )
    expect(screen.getByRole('button', { name: 'Posting…' })).toBeDisabled()
  })
})

describe('CommentThread / BugReportCommentThread', () => {
  it('load and post work-item comments through the API', async () => {
    const owner = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    const task = await createTask(project.id)
    await renderApp(<CommentThread workItemId={task.id} emptyText="Quiet here" />, { as: owner })
    expect(await screen.findByText('Quiet here')).toBeInTheDocument()
    const box = await screen.findByLabelText('Add a comment')
    await userEvent.type(box, 'A comment')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect(await screen.findByText('Comment added')).toBeInTheDocument()
    await waitFor(() => expect(screen.getByText('A comment')).toBeInTheDocument())
    expect(await prisma.workItemComment.count({ where: { workItemId: task.id } })).toBe(1)
  })

  it('surfaces a failed post as an error toast', async () => {
    const owner = await createVolunteer()
    const stranger = await createVolunteer()
    const project = await createProject({ assigneeId: owner.id, status: 'in_progress' })
    // The stranger can view the project but not post; render as the owner then swap the
    // stored session so the mutation is refused server-side.
    await renderApp(<CommentThread workItemId={project.id} />, { as: owner })
    const box = await screen.findByLabelText('Add a comment')
    const { createSession } = await import('@/lib/auth')
    localStorage.setItem('authToken', await createSession(stranger.id))
    await userEvent.type(box, 'Nope')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect(await screen.findByText('Not authorized to comment here')).toBeInTheDocument()
    expect(box).toHaveValue('Nope')
  })

  it('load and post bug report comments', async () => {
    const reporter = await createVolunteer()
    const { id } = await clientAs(reporter).bugReports.create({
      title: 'B',
      description: 'Ten characters at least',
    })
    await renderApp(<BugReportCommentThread bugReportId={id} placeholder="Reply" />, {
      as: reporter,
    })
    const box = await screen.findByPlaceholderText('Reply')
    await userEvent.type(box, 'Thanks')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    await waitFor(() => expect(screen.getByText('Thanks')).toBeInTheDocument())
    await userEvent.type(box, 'Again')
    localStorage.setItem('authToken', 'stale')
    await userEvent.click(screen.getByRole('button', { name: 'Post Comment' }))
    expect(await screen.findByText('Unauthorized')).toBeInTheDocument()
  })
})

describe('Footer', () => {
  it('shows the version and PR link when deployed, plain links otherwise', async () => {
    await renderApp(<Footer />)
    expect(screen.getByRole('link', { name: 'Privacy & Data' })).toHaveAttribute('href', '/privacy')
    await waitFor(() => expect(screen.queryByText(/PR #/)).toBeNull())
  })
})

describe('AiEditingHelp', () => {
  it('copies the guide, toggles the full text, and opens it when the clipboard is refused', async () => {
    const writeText = vi.fn(async () => {})
    Object.assign(navigator, { clipboard: { writeText } })
    render(<AiEditingHelp />)
    await userEvent.click(screen.getByRole('button', { name: 'Copy instructions' }))
    expect(writeText).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Copied' })).toBeInTheDocument()
    await waitFor(() =>
      expect(screen.getByRole('button', { name: 'Copy instructions' })).toBeInTheDocument(),
    )
    await userEvent.click(screen.getByRole('button', { name: 'Read' }))
    expect(screen.getByRole('button', { name: 'Hide' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Hide' }))
    writeText.mockRejectedValueOnce(new Error('denied'))
    await userEvent.click(screen.getByRole('button', { name: 'Copy instructions' }))
    expect(await screen.findByRole('button', { name: 'Hide' })).toBeInTheDocument()
  })
})
