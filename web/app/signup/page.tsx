'use client'

import { useState, useEffect, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import Header from '@/components/Header'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

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
      .then(d => setGoogleClientId(d.client_id))
      .catch(() => {})
  }, [])

  useEffect(() => {
    if (!googleClientId) return
    const win = window as Window & typeof globalThis & { google?: { accounts: { id: { initialize: (c: unknown) => void; renderButton: (el: Element | null, opts: unknown) => void } } } }
    if (!win.google?.accounts?.id) return
    win.google.accounts.id.initialize({ client_id: googleClientId, callback: handleGoogleResponse })
    win.google.accounts.id.renderButton(document.getElementById('g_signup_btn'), { theme: 'outline', size: 'large', width: 350, text: 'sign_up_with' })
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [googleClientId])

  function handleGoogleResponse(response: { credential: string }) {
    apiRequest<{ auth_token: string }>('/api/auth/google', {
      method: 'POST',
      body: JSON.stringify({ credential: response.credential }),
    })
      .then(async data => {
        await setToken(data.auth_token)
        router.push('/dashboard')
      })
      .catch(err => setError(err instanceof Error ? err.message : 'Google sign-up failed'))
  }

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
          skill_ids: skills.map(s => s.skillId),
          consent_profile_visible: consentVisible,
          consent_contact_by_owners: consentContact,
          share_contact_directly: shareDirectly,
          email_digest: emailDigest,
        }),
      })
      await setToken(data.auth_token)
      router.push('/dashboard')
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Signup failed')
      setSubmitting(false)
    }
  }

  if (loading) return null

  return (
    <>
      {googleClientId && <Script src="https://accounts.google.com/gsi/client" strategy="afterInteractive" />}
      <Header />
      <main className="container page">
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h1>Join Catalyse</h1>
          <p style={{ color: 'var(--text-light)', marginBottom: 24 }}>
            Connect with PauseAI UK projects and fellow volunteers.
          </p>

          {error && (
            <div role="alert" className="message error" style={{ marginBottom: 16 }}>
              {error}
            </div>
          )}

          {googleClientId && (
            <div className="card" style={{ textAlign: 'center', marginBottom: 16 }}>
              <p style={{ color: 'var(--text-light)', marginBottom: 16 }}>Quick sign up with your Google account:</p>
              <div id="g_signup_btn" />
              <div style={{ display: 'flex', alignItems: 'center', margin: '20px 0', gap: 16 }}>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
                <span style={{ color: 'var(--text-light)', fontSize: '0.875rem' }}>or sign up with email</span>
                <hr style={{ flex: 1, border: 'none', borderTop: '1px solid var(--border)' }} />
              </div>
            </div>
          )}

          <form className="card" onSubmit={handleSubmit}>
            <div className="form-group">
              <label htmlFor="name" className="required">Your Name</label>
              <input type="text" id="name" name="name" required placeholder="How should we call you?" value={name} onChange={e => setName(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="email" className="required">Email</label>
              <input type="email" id="email" name="email" required placeholder="you@example.com" value={email} onChange={e => setEmail(e.target.value)} />
              <p className="form-hint">Used for login and notifications. Never shared publicly.</p>
            </div>

            <div className="form-group">
              <label htmlFor="password" className="required">Password</label>
              <input type="password" id="password" name="password" required minLength={8} placeholder="At least 8 characters" value={password} onChange={e => setPassword(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="password_confirm" className="required">Confirm Password</label>
              <input type="password" id="password_confirm" name="password_confirm" required minLength={8} placeholder="Type your password again" value={passwordConfirm} onChange={e => setPasswordConfirm(e.target.value)} />
            </div>

            <div className="form-group">
              <label htmlFor="bio">About You</label>
              <textarea id="bio" name="bio" placeholder="Tell us a bit about yourself, your background, and what brings you to PauseAI…" value={bio} onChange={e => setBio(e.target.value)} />
            </div>

            <h3 style={{ marginTop: 24 }}>Contact Preferences</h3>
            <p className="form-hint" style={{ marginBottom: 16 }}>Add ways for project owners to reach you. All optional.</p>

            <div className="grid grid-2">
              <div className="form-group">
                <label htmlFor="discord">Discord Handle</label>
                <input type="text" id="discord" name="discord_handle" placeholder="username#1234" value={discord} onChange={e => setDiscord(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="signal">Signal</label>
                <input type="text" id="signal" name="signal_number" placeholder="+44…" value={signal} onChange={e => setSignal(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="whatsapp">WhatsApp</label>
                <input type="text" id="whatsapp" name="whatsapp_number" placeholder="+44…" value={whatsapp} onChange={e => setWhatsapp(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="contact_preference">Preferred Contact Method</label>
                <select id="contact_preference" name="contact_preference" value={contactPref} onChange={e => setContactPref(e.target.value)}>
                  <option value="">Select…</option>
                  <option value="email">Email</option>
                  <option value="discord">Discord</option>
                  <option value="signal">Signal</option>
                  <option value="whatsapp">WhatsApp</option>
                </select>
              </div>
            </div>

            <div className="form-group">
              <label htmlFor="contact_notes">Contact Notes</label>
              <input type="text" id="contact_notes" name="contact_notes" placeholder="e.g., Best to DM me on Discord first" value={contactNotes} onChange={e => setContactNotes(e.target.value)} />
            </div>

            <h3 style={{ marginTop: 24 }}>Availability</h3>
            <div className="grid grid-2">
              <div className="form-group">
                <label htmlFor="availability">Hours per Week</label>
                <input type="number" id="availability" name="availability_hours_per_week" min={1} max={40} placeholder="e.g., 5" value={availability} onChange={e => setAvailability(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="location">Location</label>
                <input type="text" id="location" name="location" placeholder="e.g., London, UK" value={location} onChange={e => setLocation(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="country">Country</label>
                <input type="text" id="country" name="country" placeholder="e.g., United Kingdom" value={country} onChange={e => setCountry(e.target.value)} />
              </div>
              <div className="form-group">
                <label htmlFor="local_group">Local Group</label>
                <input type="text" id="local_group" name="local_group" placeholder="e.g., London" value={localGroup} onChange={e => setLocalGroup(e.target.value)} />
              </div>
            </div>

            <h3 style={{ marginTop: 24 }}>Your Skills</h3>
            <p className="form-hint" style={{ marginBottom: 12 }}>Select skills you can contribute. This helps match you with projects.</p>
            <SkillPicker value={skills} onChange={setSkills} />

            <div className="form-group" style={{ marginTop: 16 }}>
              <label htmlFor="other_skills">Other Skills</label>
              <input type="text" id="other_skills" name="other_skills" placeholder="Any skills not listed above…" value={otherSkills} onChange={e => setOtherSkills(e.target.value)} />
            </div>

            <div style={{ marginTop: 24 }}>
              <h3>Privacy &amp; Consent</h3>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={consentVisible} onChange={e => setConsentVisible(e.target.checked)} />
                  Make my profile visible to other volunteers
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={consentContact} onChange={e => setConsentContact(e.target.checked)} />
                  Allow project owners to contact me about opportunities
                </label>
                <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 400 }}>
                  <input type="checkbox" checked={shareDirectly} onChange={e => setShareDirectly(e.target.checked)} />
                  Share my contact info directly (otherwise use contact form)
                </label>
              </div>
              <p className="form-hint" style={{ marginTop: 12 }}>
                You can change these settings or delete your account at any time.{' '}
                <Link href="/privacy" target="_blank">Read our privacy policy</Link>
              </p>
            </div>

            <h3 style={{ marginTop: 24 }}>Email Notifications</h3>
            <div className="form-group">
              <label htmlFor="email_digest">Keep me in the loop about new projects</label>
              <select id="email_digest" name="email_digest" value={emailDigest} onChange={e => setEmailDigest(e.target.value)}>
                <option value="none">Don&apos;t email me</option>
                <option value="match">Email me when a project matches my skills</option>
                <option value="fortnightly">Send me a fortnightly digest</option>
              </select>
            </div>

            <div style={{ marginTop: 12 }}>
              <button type="submit" className="btn btn-primary" style={{ width: '100%' }} disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create Account'}
              </button>
            </div>

            <p style={{ textAlign: 'center', marginTop: 16, color: 'var(--text-light)' }}>
              Already have an account? <Link href="/login">Login</Link>
            </p>
          </form>

          <p style={{ textAlign: 'center', marginTop: 24, fontSize: '0.875rem', color: 'var(--text-light)' }}>
            <Link href="/privacy" style={{ color: 'var(--text-light)' }}>Privacy Policy</Link>
            {' · '}
            <a href="mailto:matilda@pauseai.info" style={{ color: 'var(--text-light)' }}>Contact Support</a>
          </p>
        </div>
      </main>
    </>
  )
}
