'use client'

import { useState } from 'react'
import { apiRequest, ApiError } from '@/lib/api'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'

interface BugReportDialogProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORIES = [
  { value: 'bug',     label: 'Bug' },
  { value: 'feature', label: 'Feature' },
  { value: 'ux',      label: 'UX Issue' },
] as const
type Category = typeof CATEGORIES[number]['value']

export default function BugReportDialog({ isOpen, onClose }: BugReportDialogProps) {
  const { user } = useAuth()
  const [category, setCategory] = useState<Category>('bug')
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [email, setEmail] = useState('')
  const [severity, setSeverity] = useState('medium')
  const [submitting, setSubmitting] = useState(false)
  const [success, setSuccess] = useState(false)
  const [error, setError] = useState('')

  function reset() {
    setCategory('Bug')
    setTitle('')
    setDescription('')
    setEmail('')
    setSeverity('medium')
    setSuccess(false)
    setError('')
  }

  function handleClose() {
    reset()
    onClose()
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    setError('')
    try {
      await apiRequest('/api/bug-reports', {
        method: 'POST',
        body: JSON.stringify({ category, title, description, email: user?.email ?? (email || undefined), severity }),
      })
      setSuccess(true)
    } catch (err) {
      setError(err instanceof ApiError ? err.message : 'Something went wrong')
    } finally {
      setSubmitting(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 bg-[rgba(29,53,87,0.5)] flex items-center justify-center z-1000 p-5" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report an Issue"
        className="bg-surface rounded-xl shadow-lg max-w-125 w-full max-h-[90vh] overflow-y-auto"
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-5 border-b border-brand-border flex justify-between items-center">
          <h2 className="mb-0">Report an Issue</h2>
          <Button variant="ghost" icon onClick={handleClose} aria-label="Close">×</Button>
        </div>
        <div className="p-6">
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h3 role="heading">Thank you!</h3>
              <p>Your feedback has been submitted.</p>
              <Button onClick={handleClose}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* [test hook] toast-error class used as test selector */}
              {error && <div className="toast-error flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]">{error}</div>}

              <div className="mb-5">
                <label>What type of feedback?</label>
                <div className="flex gap-2 flex-wrap">
                  {/* [test hook] category-btn class used as test selector */}
                  {CATEGORIES.map(cat => (
                    <Button
                      key={cat.value}
                      type="button"
                      variant="ghost"
                      active={category === cat.value}
                      className="category-btn flex-1"
                      onClick={() => setCategory(cat.value)}
                    >
                      {cat.label}
                    </Button>
                  ))}
                </div>
              </div>

              <div className="mb-5">
                <label htmlFor="bug-title" className="required">Title</label>
                <input
                  id="bug-title"
                  type="text"
                  value={title}
                  onChange={e => setTitle(e.target.value)}
                  required
                  placeholder="Brief summary"
                />
              </div>

              <div className="mb-5">
                <label htmlFor="bug-description" className="required">Details</label>
                <textarea
                  id="bug-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  placeholder={{
                    bug:     'What happened? What did you expect?',
                    feature: 'What would you like to be able to do?',
                    ux:      'What felt confusing or frustrating?',
                  }[category]}
                />
              </div>

              {!user && (
                <div className="mb-5">
                  <label htmlFor="bug-email">Your Email (optional)</label>
                  <input
                    id="bug-email"
                    type="email"
                    value={email}
                    onChange={e => setEmail(e.target.value)}
                    placeholder="In case we need to follow up"
                  />
                </div>
              )}

              <div className="mb-5">
                <label htmlFor="bug-severity">How urgent is this?</label>
                <select id="bug-severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                  <option value="low">Low — minor inconvenience</option>
                  <option value="medium">Medium — affects workflow</option>
                  <option value="high">High — blocking</option>
                  <option value="critical">Critical — site is broken</option>
                </select>
              </div>

              <div className="flex gap-3 justify-end">
                <Button type="button" variant="ghost" onClick={handleClose}>Cancel</Button>
                <Button type="submit" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Submit Report'}
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
