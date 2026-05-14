'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { useAuth } from '@/lib/auth-context'
import { apiRequest, ApiError } from '@/lib/api'
import { COUNTRY_OPTIONS } from '@/lib/filter-options'
import { useToast } from '@/lib/toast'

const SUGGESTION_COUNTRIES = COUNTRY_OPTIONS.filter(
  (o) => o.value && o.value !== 'Remote' && o.value !== 'Other',
)

interface Suggestion {
  id: number
  name: string
  country: string
  status: string
  admin_notes: string | null
  created_at: string
  merged_into: { id: number; name: string } | null
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending Review',
  accepted: 'Accepted',
  on_hold: 'Under Review',
  declined: 'Declined',
}

const STATUS_CLASSES: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300',
  accepted: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300',
  on_hold: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-300',
  declined: 'bg-gray-100 text-gray-600 dark:bg-gray-800/50 dark:text-gray-400',
}

export default function SuggestLocalGroupPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()

  const [country, setCountry] = useState('')
  const [name, setName] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})

  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [loadingSuggestions, setLoadingSuggestions] = useState(true)

  useEffect(() => {
    if (!loading && !user) router.replace('/login')
  }, [user, loading, router])

  useEffect(() => {
    if (!user) return
    apiRequest<{ suggestions: Suggestion[] }>('/api/local-group-suggestions')
      .then((data) => setSuggestions(data.suggestions))
      .catch(() => {})
      .finally(() => setLoadingSuggestions(false))
  }, [user])

  function clearFieldError(field: string) {
    setFieldErrors((prev) => {
      if (!prev[field]) return prev
      const next = { ...prev }
      delete next[field]
      return next
    })
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      const result = await apiRequest<Suggestion>('/api/local-group-suggestions', {
        method: 'POST',
        body: JSON.stringify({ name: name.trim(), country }),
      })
      setSuggestions((prev) => [result, ...prev])
      setCountry('')
      setName('')
      showToast('Suggestion submitted!', 'success')
    } catch (err) {
      if (err instanceof ApiError && err.fieldErrors) {
        setFieldErrors(err.fieldErrors)
      } else {
        showToast(err instanceof Error ? err.message : 'Failed to submit suggestion', 'error')
      }
    } finally {
      setSubmitting(false)
    }
  }

  if (loading || !user) return null

  return (
    <>
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <h1>Suggest a Local Group</h1>
        <p className="text-text-light mb-6">
          Don&apos;t see your local group listed? Suggest it here and an admin will review it.
        </p>

        <div className="max-w-xl">
          <form onSubmit={handleSubmit} className="bg-surface rounded-xl shadow p-6 mb-8">
            <div className="mb-5">
              <FilterDropdown
                id="country"
                label="Country"
                ariaLabel="Select country"
                value={country}
                options={SUGGESTION_COUNTRIES}
                onChange={(v) => {
                  setCountry(v)
                  clearFieldError('country')
                }}
              />
              {fieldErrors.country && (
                <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
                  {fieldErrors.country}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor="name">Local Group Name</label>
              <input
                id="name"
                type="text"
                placeholder="e.g., Bristol, Edinburgh, Birmingham"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  clearFieldError('name')
                }}
                aria-invalid={!!fieldErrors.name || undefined}
              />
              {fieldErrors.name ? (
                <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
                  {fieldErrors.name}
                </p>
              ) : (
                <p className="text-sm text-text-light mt-1">
                  Enter the city, region, or area name for the local group.
                </p>
              )}
            </div>

            <Button type="submit" disabled={submitting || !country || !name.trim()}>
              {submitting ? 'Submitting…' : 'Submit Suggestion'}
            </Button>
          </form>

          {!loadingSuggestions && suggestions.length > 0 && (
            <div>
              <h2 className="text-lg font-semibold mb-4">Your Previous Suggestions</h2>
              <div className="space-y-3">
                {suggestions.map((s) => (
                  <article
                    key={s.id}
                    className="bg-surface rounded-xl shadow px-5 py-4 flex items-start justify-between gap-4"
                  >
                    <div>
                      <p className="font-semibold m-0">
                        {s.country} — {s.name}
                        {s.merged_into && (
                          <span className="text-text-light font-normal text-sm">
                            {' '}(merged into {s.merged_into.name})
                          </span>
                        )}
                      </p>
                      <p className="text-xs text-text-light m-0 mt-1">
                        Submitted{' '}
                        {new Date(s.created_at).toLocaleDateString('en-GB', {
                          day: 'numeric',
                          month: 'short',
                          year: 'numeric',
                        })}
                      </p>
                      {s.admin_notes && (
                        <p className="text-sm text-text-light mt-2 mb-0 italic">{s.admin_notes}</p>
                      )}
                    </div>
                    <span
                      className={`text-xs px-2 py-1 rounded-full font-medium whitespace-nowrap ${STATUS_CLASSES[s.status] ?? ''}`}
                    >
                      {STATUS_LABELS[s.status] ?? s.status}
                    </span>
                  </article>
                ))}
              </div>
            </div>
          )}
        </div>
      </main>
    </>
  )
}
