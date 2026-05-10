'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import Header from '@/components/Header'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest, ApiError } from '@/lib/api'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

export default function SignupPage() {
  const router = useRouter()
  const { user, loading, setToken } = useAuth()
  const [error, setError] = useState('')
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({})
  const [submitting, setSubmitting] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [skills, setSkills] = useState<SelectedSkill[]>([])

  // Form fields
  const [name, setName] = useState('')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [passwordConfirm, setPasswordConfirm] = useState('')
  const [bio, setBio] = useState('')
  const [discord, setDiscord] = useState('')
  const [signal, setSignal] = useState('')
  const [whatsapp, setWhatsapp] = useState('')
  const [contactPref, setContactPref] = useState('')
  const [contactNotes, setContactNotes] = useState('')
  const [availability, setAvailability] = useState('')
  const [location, setLocation] = useState('')
  const [country, setCountry] = useState('')
  const [localGroup, setLocalGroup] = useState('')
  const [otherSkills, setOtherSkills] = useState('')
  const [consentVisible, setConsentVisible] = useState(true)
  const [consentContact, setConsentContact] = useState(true)
  const [shareDirectly, setShareDirectly] = useState(false)
  const [emailDigest, setEmailDigest] = useState('match')

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  useEffect(() => {
    apiRequest<{ client_id: string }>('/api/auth/google-client-id')
      .then((d) => setGoogleClientId(d.client_id))
      .catch(() => {})
  }, [])

  const handleGoogleResponse = useCallback(
    (response: { credential: string }) => {
      apiRequest<{ auth_token: string }>('/api/auth/google', {
        method: 'POST',
        body: JSON.stringify({ credential: response.credential }),
      })
        .then(async (data) => {
          await setToken(data.auth_token)
          router.push('/dashboard')
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-up failed'))
    },
    [setToken, router],
  )

  const initGoogleButton = useCallback(() => {
    const win = window as Window &
      typeof globalThis & {
        google?: {
          accounts: {
            id: {
              initialize: (c: unknown) => void
              renderButton: (el: Element | null, opts: unknown) => void
            }
          }
        }
      }
    if (!win.google?.accounts?.id || !googleClientId) return
    win.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse })
    win.google.accounts.id.renderButton(document.getElementById('g_signup_btn'), {
      theme: 'outline',
      size: 'large',
      width: 350,
      text: 'sign_up_with',
    })
  }, [googleClientId, handleGoogleResponse])

  useEffect(() => {
    initGoogleButton()
  }, [initGoogleButton])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')
    setFieldErrors({})

    if (password !== passwordConfirm) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    setSubmitting(true)
    try {
      const data = await apiRequest<{ auth_token: string }>('/api/auth/signup', {
        method: 'POST',
        body: JSON.stringify({
          name,
          email: email.trim(),
          password,
          bio: bio || undefined,
          discord_handle: discord || undefined,
          signal_number: signal || undefined,
          whatsapp_number: whatsapp || undefined,
          contact_preference: contactPref || undefined,
          contact_notes: contactNotes || undefined,
          availability_hours_per_week: availability ? Number(availability) : undefined,
          location: location || undefined,
          country: country || undefined,
          local_group: localGroup || undefined,
          other_skills: otherSkills || undefined,
          skill_ids: skills.map((s) => s.skillId),
          consent_make_profile_visible_in_directory: consentVisible,
          consent_contactable_by_project_owners: consentContact,
          consent_share_contact_info_with_project_owner: shareDirectly,
          email_digest: emailDigest,
        }),
      })
      await setToken(data.auth_token)
      router.push('/dashboard')
    } catch (err: unknown) {
      if (err instanceof ApiError && err.fieldErrors && Object.keys(err.fieldErrors).length > 0) {
        setFieldErrors(err.fieldErrors)
      } else {
        setError(err instanceof Error ? err.message : 'Signup failed')
      }
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <>
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogleButton}
        />
      )}
      <Header />
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="max-w-2xl mx-auto">
          <h1>Join Catalyse</h1>
          <p className="text-text-light mb-6">
            Connect with PauseAI UK projects and fellow volunteers.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
            >
              {error}
            </div>
          )}

          {googleClientId && (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
              <p className="text-text-light mb-4">Quick sign up with your Google account:</p>
              <div id="g_signup_btn" />
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: 16 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                <span className="text-text-light text-sm">or sign up with email</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
              </div>
            </div>
          )}

          <form
            className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
            onSubmit={handleSubmit}
          >
            <div className="mb-5">
              <label htmlFor="name" className="required">
                Your Name
              </label>
              <input
                type="text"
                id="name"
                name="name"
                required
                placeholder="How should we call you?"
                value={name}
                onChange={(e) => {
                  setName(e.target.value)
                  if (fieldErrors.name) setFieldErrors((f) => ({ ...f, name: '' }))
                }}
                aria-invalid={fieldErrors.name ? true : undefined}
              />
              {fieldErrors.name && (
                <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
                  {fieldErrors.name}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor="email" className="required">
                Email
              </label>
              <input
                type="email"
                id="email"
                name="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (fieldErrors.email) setFieldErrors((f) => ({ ...f, email: '' }))
                }}
                aria-invalid={fieldErrors.email ? true : undefined}
              />
              {fieldErrors.email ? (
                <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
                  {fieldErrors.email}
                </p>
              ) : (
                <p className="text-sm text-text-light mt-1">
                  Used for login and notifications. Never shared publicly.
                </p>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor="password" className="required">
                Password
              </label>
              <input
                type="password"
                id="password"
                name="password"
                required
                minLength={8}
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value)
                  if (fieldErrors.password) setFieldErrors((f) => ({ ...f, password: '' }))
                }}
                aria-invalid={fieldErrors.password ? true : undefined}
              />
              {fieldErrors.password && (
                <p className="text-sm mt-1" style={{ color: 'var(--error)' }}>
                  {fieldErrors.password}
                </p>
              )}
            </div>

            <div className="mb-5">
              <label htmlFor="password_confirm" className="required">
                Confirm Password
              </label>
              <input
                type="password"
                id="password_confirm"
                name="password_confirm"
                required
                minLength={8}
                placeholder="Type your password again"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>

            <div className="mb-5">
              <label htmlFor="bio">About You</label>
              <textarea
                id="bio"
                name="bio"
                placeholder="Tell us a bit about yourself, your background, and what brings you to PauseAI…"
                value={bio}
                onChange={(e) => setBio(e.target.value)}
              />
            </div>

            <h3 style={{ marginTop: 24 }}>Contact Preferences</h3>
            <p className="text-sm text-text-light mt-1 mb-4">
              Add ways for project owners to reach you. All optional.
            </p>

            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
              <div className="mb-5">
                <label htmlFor="discord">Discord Handle</label>
                <input
                  type="text"
                  id="discord"
                  name="discord_handle"
                  placeholder="username#1234"
                  value={discord}
                  onChange={(e) => setDiscord(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="signal">Signal</label>
                <input
                  type="text"
                  id="signal"
                  name="signal_number"
                  placeholder="+44…"
                  value={signal}
                  onChange={(e) => setSignal(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="whatsapp">WhatsApp</label>
                <input
                  type="text"
                  id="whatsapp"
                  name="whatsapp_number"
                  placeholder="+44…"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <FilterDropdown
                  id="contact_preference"
                  label="Preferred Contact Method"
                  ariaLabel="Preferred Contact Method"
                  value={contactPref}
                  options={[
                    { value: '', label: 'Select…' },
                    { value: 'email', label: 'Email' },
                    { value: 'discord', label: 'Discord' },
                    { value: 'signal', label: 'Signal' },
                    { value: 'whatsapp', label: 'WhatsApp' },
                  ]}
                  onChange={(v) => setContactPref(v)}
                />
              </div>
            </div>

            <div className="mb-5">
              <label htmlFor="contact_notes">Contact Notes</label>
              <input
                type="text"
                id="contact_notes"
                name="contact_notes"
                placeholder="e.g., Best to DM me on Discord first"
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
              />
            </div>

            <h3 style={{ marginTop: 24 }}>Availability</h3>
            <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
              <div className="mb-5">
                <label htmlFor="availability">Hours per Week</label>
                <input
                  type="number"
                  id="availability"
                  name="availability_hours_per_week"
                  min={1}
                  max={40}
                  placeholder="e.g., 5"
                  value={availability}
                  onChange={(e) => setAvailability(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="location">Location</label>
                <input
                  type="text"
                  id="location"
                  name="location"
                  placeholder="e.g., London, UK"
                  value={location}
                  onChange={(e) => setLocation(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="country">Country</label>
                <input
                  type="text"
                  id="country"
                  name="country"
                  placeholder="e.g., United Kingdom"
                  value={country}
                  onChange={(e) => setCountry(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <label htmlFor="local_group">Local Group</label>
                <input
                  type="text"
                  id="local_group"
                  name="local_group"
                  placeholder="e.g., London"
                  value={localGroup}
                  onChange={(e) => setLocalGroup(e.target.value)}
                />
              </div>
            </div>

            <h3 style={{ marginTop: 24 }}>Your Skills</h3>
            <p className="text-sm text-text-light mt-1" style={{ marginBottom: 12 }}>
              Select skills you can contribute. This helps match you with projects.
            </p>
            <SkillPicker value={skills} onChange={setSkills} />

            <div className="mb-5" style={{ marginTop: 16 }}>
              <label htmlFor="other_skills">Other Skills</label>
              <input
                type="text"
                id="other_skills"
                name="other_skills"
                placeholder="Any skills not listed above…"
                value={otherSkills}
                onChange={(e) => setOtherSkills(e.target.value)}
              />
            </div>

            <div style={{ marginTop: 24 }}>
              <h3>Privacy &amp; Consent</h3>
              <div className="flex flex-col gap-2">
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={consentVisible}
                    onChange={(e) => setConsentVisible(e.target.checked)}
                  />
                  Make my profile visible in the volunteer directory
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    checked={consentContact}
                    onChange={(e) => setConsentContact(e.target.checked)}
                  />
                  Allow project owners to contact me about opportunities
                </label>
                <label
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: 8,
                    fontWeight: 400,
                    marginLeft: 24,
                    opacity: consentContact ? 1 : 0.5,
                  }}
                >
                  <input
                    type="checkbox"
                    checked={shareDirectly}
                    disabled={!consentContact}
                    onChange={(e) => setShareDirectly(e.target.checked)}
                  />
                  Share my contact info directly with project owners
                </label>
              </div>
              <p className="text-sm text-text-light mt-1" style={{ marginTop: 12 }}>
                You can change these settings or delete your account at any time.{' '}
                <Link href="/privacy" target="_blank">
                  Read our privacy policy
                </Link>
              </p>
            </div>

            <h3 style={{ marginTop: 24 }}>Email Notifications</h3>
            <div className="mb-5">
              <FilterDropdown
                id="email_digest"
                label="Keep me in the loop about new projects"
                ariaLabel="Keep me in the loop about new projects"
                value={emailDigest}
                options={[
                  { value: 'none', label: "Don't email me" },
                  { value: 'match', label: 'Email me when a project matches my skills' },
                  { value: 'fortnightly', label: 'Send me a fortnightly digest' },
                ]}
                onChange={(v) => setEmailDigest(v)}
              />
            </div>

            <div style={{ marginTop: 12 }}>
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create Account'}
              </Button>
            </div>

            <p className="text-center text-text-light" style={{ marginTop: 16 }}>
              Already have an account? <Link href="/login">Login</Link>
            </p>
          </form>

          <p className="text-center text-sm text-text-light" style={{ marginTop: 24 }}>
            <Link href="/privacy" className="text-text-light">
              Privacy Policy
            </Link>
            {' · '}
            <a href="mailto:matilda@pauseai.info" className="text-text-light">
              Contact Support
            </a>
          </p>
        </div>
      </main>
    </>
  )
}
