'use client'

import { useState } from 'react'
import { apiRequest, ApiError } from '@/lib/api'

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
    <div className="modal-overlay" onClick={handleClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Report an Issue"
        className="modal"
        style={{ maxWidth: 500 }}
        onClick={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2>Report an Issue</h2>
          <button className="modal-close" onClick={handleClose} aria-label="Close">×</button>
        </div>
        <div className="modal-body">
          {success ? (
            <div style={{ textAlign: 'center', padding: '20px 0' }}>
              <h3 role="heading">Thank you!</h3>
              <p>Your report has been submitted.</p>
              <button className="btn btn-primary" onClick={handleClose}>Close</button>
            </div>
          ) : (
            <form onSubmit={handleSubmit}>
              {error && <div className="toast toast-error" style={{ marginBottom: 16 }}>{error}</div>}

              <div className="form-group">
                <label>Category</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
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
                      <span
                        className="category-btn"
                        style={category === cat ? { borderColor: 'var(--primary)', background: 'var(--accent)' } : {}}
                      >
                        {cat}
                      </span>
                    </label>
                  ))}
                </div>
              </div>

              <div className="form-group">
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

              <div className="form-group">
                <label htmlFor="bug-description" className="required">Details</label>
                <textarea
                  id="bug-description"
                  value={description}
                  onChange={e => setDescription(e.target.value)}
                  required
                  placeholder="Describe the issue or feature request"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bug-email">Your Email (optional)</label>
                <input
                  id="bug-email"
                  type="email"
                  value={email}
                  onChange={e => setEmail(e.target.value)}
                  placeholder="so we can follow up"
                />
              </div>

              <div className="form-group">
                <label htmlFor="bug-severity">How urgent is this?</label>
                <select id="bug-severity" value={severity} onChange={e => setSeverity(e.target.value)}>
                  <option value="low">Low — minor inconvenience</option>
                  <option value="medium">Medium — affects workflow</option>
                  <option value="high">High — blocking</option>
                </select>
              </div>

              <div style={{ display: 'flex', gap: 12, justifyContent: 'flex-end' }}>
                <button type="button" className="btn btn-ghost" onClick={handleClose}>Cancel</button>
                <button type="submit" className="btn btn-primary" disabled={submitting}>
                  {submitting ? 'Sending…' : 'Submit'}
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  )
}
