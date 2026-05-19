'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { client } from '@/lib/client'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

export default function SignupPage() {
  const router = useRouter()
  const { user, loading, setToken } = useAuth()
  const [error, setError] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [googleClientId, setGoogleClientId] = useState('')
  const [googleStub, setGoogleStub] = useState(false)
  const [skills, setSkills] = useState<SelectedSkill[]>([])

  // Form fields
  const [applicationPending, setApplicationPending] = useState(false)
  const [googlePendingToken, setGooglePendingToken] = useState<string | null>(null)
  const [googleApplicationStep, setGoogleApplicationStep] = useState(false)
  const [googleApplicationMessage, setGoogleApplicationMessage] = useState('')
  const [googleApplicationSubmitting, setGoogleApplicationSubmitting] = useState(false)
  const [resendSent, setResendSent] = useState(false)
  const [resendCooldown, setResendCooldown] = useState(0)
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
  const [applicationMessage, setApplicationMessage] = useState('')
  const [consentVisible, setConsentVisible] = useState(true)
  const [consentContact, setConsentContact] = useState(true)
  const [shareDirectly, setShareDirectly] = useState(false)
  const [emailDigest, setEmailDigest] = useState('match')

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  // Restore pending Google application from sessionStorage (survives refresh)
  useEffect(() => {
    const pending = sessionStorage.getItem('google_pending_token')
    if (pending) {
      // Can't use lazy initializers here because this effect also fires
      // the concurrent apiRequest to prefetch the volunteer name. Splitting
      // them would read sessionStorage twice with no benefit.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGooglePendingToken(pending)
      setGoogleApplicationStep(true)
      client.auth
        .me()
        .then((vol) => {
          if (vol.name) setName(vol.name)
        })
        .catch(() => {})
    }
  }, [])

  // Persist/clear pending token in sessionStorage
  useEffect(() => {
    if (googleApplicationStep && googlePendingToken) {
      sessionStorage.setItem('google_pending_token', googlePendingToken)
    } else {
      sessionStorage.removeItem('google_pending_token')
    }
  }, [googleApplicationStep, googlePendingToken])

  // Warn before leaving while application form is open
  useEffect(() => {
    if (!googleApplicationStep) return
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault()
      e.returnValue = ''
    }
    window.addEventListener('beforeunload', handler)
    return () => window.removeEventListener('beforeunload', handler)
  }, [googleApplicationStep])

  useEffect(() => {
    if (resendCooldown <= 0) return
    const t = setTimeout(() => setResendCooldown((c) => c - 1), 1000)
    return () => clearTimeout(t)
  }, [resendCooldown])

  async function handleResend() {
    await fetch('/api/auth/resend-verification', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email }),
    })
    setResendSent(true)
    setResendCooldown(60)
  }

  useEffect(() => {
    client.auth
      .googleClientId()
      .then((d) => {
        setGoogleClientId(d.clientId)
        if (d.stub) setGoogleStub(true)
      })
      .catch(() => {})
  }, [])

  const handleGoogleResponse = useCallback(
    (response: { credential: string }) => {
      client.auth
        .google({ credential: response.credential })
        .then(async (data) => {
          if (data.isPending) {
            setGooglePendingToken(data.token)
            if (data.name) setName(data.name)
            setGoogleApplicationStep(true)
          } else {
            await setToken(data.token)
            router.push('/dashboard')
          }
        })
        .catch((err) => setError(err instanceof Error ? err.message : 'Google sign-up failed'))
    },
    [setToken, router],
  )

  function handleGoogleStub() {
    client.auth
      .google({ stub: true })
      .then(async (data) => {
        if (data.isPending) {
          setGooglePendingToken(data.token)
          if (data.name) setName(data.name)
          setGoogleApplicationStep(true)
        } else {
          await setToken(data.token)
          router.push('/dashboard')
        }
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'Google stub failed'))
  }

  async function handleGoogleApplicationSubmit(e: FormEvent) {
    e.preventDefault()
    if (!googlePendingToken) return
    setGoogleApplicationSubmitting(true)
    try {
      await client.volunteers.updateMe({
        name,
        applicationMessage: googleApplicationMessage,
        bio: bio || undefined,
        discordHandle: discord || undefined,
        signalNumber: signal || undefined,
        whatsappNumber: whatsapp || undefined,
        contactPreference: contactPref || undefined,
        contactNotes: contactNotes || undefined,
        availabilityHoursPerWeek: availability ? Number(availability) : undefined,
        location: location || undefined,
        country: country || undefined,
        localGroup: localGroup || undefined,
        otherSkills: otherSkills || undefined,
        skillIds: skills.map((s) => s.skillId),
        consentMakeProfileVisibleInDirectory: consentVisible,
        consentContactableByProjectOwners: consentContact,
        consentShareContactInfoWithProjectOwner: shareDirectly,
        emailDigest,
      })
      sessionStorage.removeItem('google_pending_token')
      setGoogleApplicationStep(false)
      setApplicationPending(true)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit application')
    } finally {
      setGoogleApplicationSubmitting(false)
    }
  }

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
    const btnEl = document.getElementById('g_signup_btn')
    const btnWidth = Math.min(400, Math.max(200, btnEl?.offsetWidth ?? 350))
    win.google.accounts.id.renderButton(btnEl, {
      theme: 'outline',
      size: 'large',
      width: btnWidth,
      text: 'sign_up_with',
    })
  }, [googleClientId, handleGoogleResponse])

  useEffect(() => {
    initGoogleButton()
  }, [initGoogleButton])

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setError('')

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
      const data = await client.auth.signup({
        name,
        email: email.trim(),
        password,
        applicationMessage: applicationMessage || undefined,
        bio: bio || undefined,
        discordHandle: discord || undefined,
        signalNumber: signal || undefined,
        whatsappNumber: whatsapp || undefined,
        contactPreference: contactPref || undefined,
        contactNotes: contactNotes || undefined,
        availabilityHoursPerWeek: availability ? Number(availability) : undefined,
        location: location || undefined,
        country: country || undefined,
        localGroup: localGroup || undefined,
        otherSkills: otherSkills || undefined,
        skillIds: skills.map((s) => s.skillId),
        consentMakeProfileVisibleInDirectory: consentVisible,
        consentContactableByProjectOwners: consentContact,
        consentShareContactInfoWithProjectOwner: shareDirectly,
        emailDigest,
      })
      if (data.pending) {
        setApplicationPending(true)
      } else {
        await setToken(data.token)
        router.push('/dashboard')
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
      setSubmitting(false)
    }
  }

  if (loading) return null

  if (googleApplicationStep) {
    return (
      <>
        {googleClientId && (
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onLoad={initGoogleButton}
          />
        )}
        <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
          <div className="max-w-2xl mx-auto">
            <h1>Complete your application</h1>
            <p className="text-text-light mb-6">
              Your Google account is verified. Fill in your details to apply.
            </p>
            {error && (
              <div
                role="alert"
                className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]"
              >
                {error}
              </div>
            )}
            <form
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              onSubmit={handleGoogleApplicationSubmit}
            >
              <div className="mb-5">
                <label htmlFor="g_name" className="required">
                  Your Name
                </label>
                <input
                  type="text"
                  id="g_name"
                  required
                  placeholder="How should we call you?"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label htmlFor="g_applicationMessage" className="required">
                  Your Application
                </label>
                <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm text-text-light">
                  Tell us about your relationship to PauseAI, why you are excited about the mission,
                  and how you would like to contribute. This is reviewed by admins only and is not
                  shown on your public profile.
                </aside>
                <textarea
                  id="g_applicationMessage"
                  required
                  rows={6}
                  placeholder="Your connection to PauseAI, motivation, and how you'd like to contribute…"
                  value={googleApplicationMessage}
                  onChange={(e) => setGoogleApplicationMessage(e.target.value)}
                />
              </div>

              <div className="mb-5">
                <label htmlFor="g_bio">About You</label>
                <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm text-text-light">
                  Shown to other volunteers in the directory if you choose to make your profile
                  visible. Tell us about your background and what brings you to PauseAI.
                </aside>
                <textarea
                  id="g_bio"
                  placeholder="Your background and what brings you to PauseAI…"
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
                  <label htmlFor="g_discord">Discord Handle</label>
                  <input
                    type="text"
                    id="g_discord"
                    placeholder="username#1234"
                    value={discord}
                    onChange={(e) => setDiscord(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="g_signal">Signal</label>
                  <input
                    type="text"
                    id="g_signal"
                    placeholder="+44…"
                    value={signal}
                    onChange={(e) => setSignal(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="g_whatsapp">WhatsApp</label>
                  <input
                    type="text"
                    id="g_whatsapp"
                    placeholder="+44…"
                    value={whatsapp}
                    onChange={(e) => setWhatsapp(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <FilterDropdown
                    id="g_contactPreference"
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
                <label htmlFor="g_contactNotes">Contact Notes</label>
                <input
                  type="text"
                  id="g_contactNotes"
                  placeholder="e.g., Best to DM me on Discord first"
                  value={contactNotes}
                  onChange={(e) => setContactNotes(e.target.value)}
                />
              </div>

              <h3 style={{ marginTop: 24 }}>Availability</h3>
              <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
                <div className="mb-5">
                  <label htmlFor="g_availability">Hours per Week</label>
                  <input
                    type="number"
                    id="g_availability"
                    min={1}
                    max={40}
                    placeholder="e.g., 5"
                    value={availability}
                    onChange={(e) => setAvailability(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="g_location">Location</label>
                  <input
                    type="text"
                    id="g_location"
                    placeholder="e.g., London, UK"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="g_country">Country</label>
                  <input
                    type="text"
                    id="g_country"
                    placeholder="e.g., United Kingdom"
                    value={country}
                    onChange={(e) => setCountry(e.target.value)}
                  />
                </div>
                <div className="mb-5">
                  <label htmlFor="g_localGroup">Local Group</label>
                  <input
                    type="text"
                    id="g_localGroup"
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
                <label htmlFor="g_otherSkills">Other Skills</label>
                <input
                  type="text"
                  id="g_otherSkills"
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
                  id="g_emailDigest"
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
                <Button type="submit" className="w-full" disabled={googleApplicationSubmitting}>
                  {googleApplicationSubmitting ? 'Submitting…' : 'Submit Application'}
                </Button>
              </div>
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

  if (applicationPending) {
    const isGoogleSignup = !!googlePendingToken
    return (
      <main className="w-full max-w-350 mx-auto px-6 py-5 pb-15">
        <div className="max-w-2xl mx-auto">
          <div className="bg-surface rounded-xl shadow p-8 text-center">
            {isGoogleSignup ? (
              <>
                <h1>Application submitted</h1>
                <p className="text-text-light mt-4 mb-6">
                  Thanks for applying! Our team will review your application and you&#39;ll hear
                  from us by email soon.
                </p>
              </>
            ) : (
              <>
                <h1>Check your email</h1>
                <p className="text-text-light mt-4 mb-6">
                  We&#39;ve sent a confirmation link to your email address. Please click it to
                  confirm your email and activate your pending access.
                </p>
                <p className="text-text-light mb-4">
                  Once confirmed, your application will be reviewed by our team. You&#39;ll be able
                  to browse projects while you wait.
                </p>
                <div className="mt-6 pt-6 border-t border-border">
                  {resendSent ? (
                    <p className="text-text-light text-sm">
                      {resendCooldown > 0
                        ? `Email sent! You can request another in ${resendCooldown}s.`
                        : 'Email sent! Check your inbox.'}
                    </p>
                  ) : (
                    <p className="text-text-light text-sm">
                      Didn&#39;t receive it?{' '}
                      <button
                        onClick={handleResend}
                        disabled={resendCooldown > 0}
                        className="underline disabled:opacity-50 disabled:cursor-not-allowed"
                      >
                        Resend confirmation email
                      </button>
                    </p>
                  )}
                </div>
              </>
            )}
            <p className="text-text-light text-sm mt-4">
              Questions? Contact{' '}
              <a href="mailto:uk@pauseai.info" className="underline">
                uk@pauseai.info
              </a>
            </p>
          </div>
        </div>
      </main>
    )
  }

  return (
    <>
      {googleClientId && (
        <Script
          src="https://accounts.google.com/gsi/client"
          strategy="afterInteractive"
          onLoad={initGoogleButton}
        />
      )}
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

          {(googleClientId || googleStub) && (
            <>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center">
                <p className="text-text-light mb-4">Quick sign up with your Google account:</p>
                {googleClientId && <div id="g_signup_btn" className="flex justify-center" />}
                {googleStub && (
                  <button
                    type="button"
                    onClick={handleGoogleStub}
                    className="inline-flex items-center gap-2 border border-border rounded px-4 py-2 text-sm font-medium text-text-light hover:bg-accent transition-colors"
                  >
                    <span>G</span> Sign up with Google (dev stub)
                  </button>
                )}
              </div>
              <div style={{ display: 'flex', alignItems: 'center', margin: '16px 0', gap: 16 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                <span className="text-text-light text-sm">or sign up with email</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
              </div>
            </>
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
                onChange={(e) => setName(e.target.value)}
              />
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
                onChange={(e) => setEmail(e.target.value)}
              />
              <p className="text-sm text-text-light mt-1">
                Used for login and notifications. Not shown publicly — see contact settings below.
              </p>
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
                onChange={(e) => setPassword(e.target.value)}
              />
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
              <label htmlFor="applicationMessage" className="required">
                Your Application
              </label>
              <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm text-text-light">
                Tell us about your relationship to PauseAI, why you are excited about the mission,
                and how you would like to contribute. This is reviewed by admins only and is not
                shown on your public profile.
              </aside>
              <textarea
                id="applicationMessage"
                name="applicationMessage"
                required
                rows={6}
                placeholder="Your connection to PauseAI, motivation, and how you'd like to contribute…"
                value={applicationMessage}
                onChange={(e) => setApplicationMessage(e.target.value)}
              />
            </div>

            <div className="mb-5">
              <label htmlFor="bio">About You</label>
              <aside className="bg-brand-bg border border-brand-border rounded-lg px-4 py-3 mb-2 text-sm text-text-light">
                Shown to other volunteers in the directory if you choose to make your profile
                visible. Tell us about your background and what brings you to PauseAI.
              </aside>
              <textarea
                id="bio"
                name="bio"
                placeholder="Your background and what brings you to PauseAI…"
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
                  name="discordHandle"
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
                  name="signalNumber"
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
                  name="whatsappNumber"
                  placeholder="+44…"
                  value={whatsapp}
                  onChange={(e) => setWhatsapp(e.target.value)}
                />
              </div>
              <div className="mb-5">
                <FilterDropdown
                  id="contactPreference"
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
              <label htmlFor="contactNotes">Contact Notes</label>
              <input
                type="text"
                id="contactNotes"
                name="contactNotes"
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
                  name="availabilityHoursPerWeek"
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
                <label htmlFor="localGroup">Local Group</label>
                <input
                  type="text"
                  id="localGroup"
                  name="localGroup"
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
              <label htmlFor="otherSkills">Other Skills</label>
              <input
                type="text"
                id="otherSkills"
                name="otherSkills"
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
                id="emailDigest"
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
