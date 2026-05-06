'use client'

import { useState } from 'react'
import { apiRequest, ApiError } from '@/lib/api'
import Button from '@/components/Button'

interface BugReportDialogProps {
  isOpen: boolean
  onClose: () => void
}

const CATEGORIES = ['Bug', 'Feature', 'UX Issue'] as const
type Category = typeof CATEGORIES[number]

export default function BugReportDialog({ isOpen, onClose }: BugReportDialogProps) {
  const [category, setCategory] = useState<Category>('Bug')
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
        body: JSON.stringify({ category, title, description, email: email || undefined, severity }),
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
          <h2>Report an Issue</h2>
          <Button variant="ghost" icon onClick={handleClose} aria-label="Close">×</Button>
        </div>
        <div className="p-6">
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h3 role="heading">Thank you!</h3>
              <p>Your report has been submitted.</p>
              <Button onClick={handleClose}>Close</Button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {/* [test hook] toast-error class used as test selector */}
              {error && <div className="toast-error flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]">{error}</div>}

              <div className="mb-5">
                <label>Category</label>
                <div className="flex gap-2 flex-wrap">
                  {CATEGORIES.map(cat => (
                    <label key={cat} style={{ flex: 1, minWidth: 100 }}>
                      <input
                        type="radio"
                        name="category"
                        value={cat}
                        checked={category === cat}
                        onChange={() => setCategory(cat)}
                        style={{ display: 'none' }}
                      />
                      {/* [test hook] category-btn class used as test selector */}
                      <span
                        className={`category-btn block p-3 text-center border-2 border-brand-border rounded-lg cursor-pointer transition-all hover:border-primary hover:bg-accent${category === cat ? ' border-primary! bg-accent!' : ''}`}
                      >
                        {cat}
                      </span>
                    </label>
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
                  placeholder="Describe the issue or feature request"
                />
              </div>

              <div className="mb-5">
                <label htmlFor="bug-email">Your Email (optional)</label>
                <input
                  id="bug-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="so we can follow up"
                />
              </div>

              <div className="mb-5">
                <label htmlFor="bug-severity">How urgent is this?</label>
                <select id="bug-severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                  <option value="low">Low — minor inconvenience</option>
                  <option value="medium">Medium — affects workflow</option>
                  <option value="high">High — blocking</option>
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
