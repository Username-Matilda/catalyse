'use client'

import { useState, useEffect, useCallback, FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import Script from 'next/script'
import { useQuery, useMutation } from '@tanstack/react-query'
import Button from '@/components/Button'
import FilterDropdown, { useFilterOptions } from '@/components/FilterDropdown'
import Radio from '@/components/Radio'
import SkillPicker from '@/components/SkillPicker'
import { useAuth } from '@/lib/auth-context'
import { orpc } from '@/lib/orpc'
import {
  COUNTRY_OPTIONS,
  NO_LOCAL_GROUP,
  buildLocalGroupOptionsForCountry,
  type LocalGroupOption,
} from '@/lib/filter-options'

interface SelectedSkill {
  skillId: number
  proficiencyLevel: string
}

// Holds the verified Google identity between the initial "Sign up with Google" click
// and the application form submission. No volunteer row exists yet at this point — it's
// only created once completeGoogleSignup succeeds, so an abandoned application never
// leaves a blank ghost row in the admin queue.
interface PendingGoogleAuth {
  credential?: string
  stub?: boolean
  name: string
  email: string
}

// Reads plain text/textarea fields from the actual submitted DOM via FormData
// rather than React state, so browser/password-manager autofill that sets
// input.value without firing a React-visible change event can't silently
// submit empty optional fields (autofill bypasses onChange, but never bypasses
// what's actually in the DOM at submit time).
function textField(formData: FormData, key: string): string | undefined {
  const value = formData.get(key)
  return typeof value === 'string' && value !== '' ? value : undefined
}

type ContactMethod = 'email' | 'discord' | 'signal' | 'whatsapp'

function PreferredRadio({
  method,
  contactPref,
  onPrefChange,
  disabled,
}: {
  method: ContactMethod
  contactPref: string
  onPrefChange: (v: ContactMethod) => void
  disabled?: boolean
}) {
  return (
    <div className={`mt-1 text-sm ${disabled ? 'opacity-50' : ''}`}>
      <Radio
        name="contactPreference"
        checked={contactPref === method}
        disabled={disabled}
        onChange={() => onPrefChange(method)}
      >
        <span className="text-text-light">Preferred contact method</span>
      </Radio>
    </div>
  )
}

/** Guidance for a field, styled so it can't be mistaken for text already typed into one. */
function FieldHint({ id, children }: { id: string; children: React.ReactNode }) {
  return (
    <p
      id={id}
      className="flex gap-2 rounded-md bg-accent/50 px-3 py-2 mb-2 text-sm text-text-light"
    >
      <span aria-hidden="true">ℹ</span>
      <span>{children}</span>
    </p>
  )
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
  const [pendingGoogleAuth, setPendingGoogleAuth] = useState<PendingGoogleAuth | null>(null)
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
  const [contactPref, setContactPref] = useState<ContactMethod | ''>('')
  const [contactNotes, setContactNotes] = useState('')
  const [availability, setAvailability] = useState('')
  const [location, setLocation] = useState('')
  const [countryValue, setCountryValue] = useState('')
  const [localGroupValue, setLocalGroupValue] = useState('')
  const [otherSkills, setOtherSkills] = useState('')
  const [applicationMessage, setApplicationMessage] = useState('')
  const [consentVisible, setConsentVisible] = useState(true)
  const [consentContact, setConsentContact] = useState(true)
  const [shareDirectly, setShareDirectly] = useState(false)
  const [consentAnalytics, setConsentAnalytics] = useState(false)
  const {
    value: emailDigest,
    onChange: setEmailDigest,
    options: emailDigestOptions,
  } = useFilterOptions(
    [
      { value: 'none', label: "Don't email me" },
      { value: 'match', label: 'Email me when a project matches my skills' },
      { value: 'fortnightly', label: 'Send me a fortnightly digest' },
    ],
    'match',
  )

  useEffect(() => {
    if (!loading && user) router.replace('/dashboard')
  }, [user, loading, router])

  const { data: localGroupsData } = useQuery(orpc.localGroups.list.queryOptions({ input: {} }))
  const allLocalGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  // Restore pending Google application from sessionStorage (survives refresh)
  useEffect(() => {
    const stored = sessionStorage.getItem('google_pending_auth')
    if (stored) {
      try {
        const parsed = JSON.parse(stored) as PendingGoogleAuth
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setPendingGoogleAuth(parsed)
        setName(parsed.name)
        setGoogleApplicationStep(true)
      } catch {
        sessionStorage.removeItem('google_pending_auth')
      }
    }
  }, [])

  // Persist/clear pending Google identity in sessionStorage
  useEffect(() => {
    if (googleApplicationStep && pendingGoogleAuth) {
      sessionStorage.setItem('google_pending_auth', JSON.stringify(pendingGoogleAuth))
    } else {
      sessionStorage.removeItem('google_pending_auth')
    }
  }, [googleApplicationStep, pendingGoogleAuth])

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

  const { data: googleClientIdData } = useQuery({
    ...orpc.auth.googleClientId.queryOptions(),
    staleTime: Infinity,
  })
  useEffect(() => {
    if (googleClientIdData) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setGoogleClientId(googleClientIdData.clientId)
      if (googleClientIdData.stub) setGoogleStub(true)
    }
  }, [googleClientIdData])

  const resendMutation = useMutation({ ...orpc.auth.resendVerification.mutationOptions() })
  const googleAuthMutation = useMutation({
    ...orpc.auth.google.mutationOptions(),
    onSuccess: async (data, variables) => {
      if (data.isPending) {
        setPendingGoogleAuth({
          credential: variables.credential,
          stub: variables.stub,
          name: data.name,
          email: data.email,
        })
        setName(data.name)
        setGoogleApplicationStep(true)
      } else if (data.token) {
        await setToken(data.token)
        router.push('/dashboard')
      }
    },
    onError: (err) => setError(err instanceof Error ? err.message : 'Google sign-up failed'),
  })
  const completeGoogleSignupMutation = useMutation({
    ...orpc.auth.completeGoogleSignup.mutationOptions(),
  })
  const signupMutation = useMutation({ ...orpc.auth.signup.mutationOptions() })

  async function handleResend() {
    await resendMutation.mutateAsync({ email }).catch(() => {})
    setResendSent(true)
    setResendCooldown(60)
  }

  const handleGoogleResponse = useCallback(
    (response: { credential: string }) => {
      googleAuthMutation.mutate({ credential: response.credential })
    },
    [googleAuthMutation],
  )

  function handleGoogleStub() {
    googleAuthMutation.mutate(
      { stub: true },
      {
        onError: (err) => setError(err instanceof Error ? err.message : 'Google stub failed'),
      },
    )
  }

  const localGroupOptions = countryValue
    ? buildLocalGroupOptionsForCountry(countryValue, allLocalGroups)
    : []
  const hasLocalGroups = localGroupOptions.some((o) => o.value && o.value !== NO_LOCAL_GROUP)
  const showCityInput = localGroupValue === NO_LOCAL_GROUP || (!!countryValue && !hasLocalGroups)

  function handleCountryChange(value: string) {
    setCountryValue(value)
    setLocalGroupValue('')
  }

  async function handleGoogleApplicationSubmit(
    e: FormEvent<HTMLFormElement>,
    googleAuth: PendingGoogleAuth,
  ) {
    e.preventDefault()
    const formData = new FormData(e.currentTarget)

    const bioValue = textField(formData, 'bio')
    if (!bioValue || bioValue.trim().length < 20) {
      setError('About You must be at least 20 characters')
      return
    }
    if (!countryValue) {
      setError('Country is required')
      return
    }
    const availabilityValue = textField(formData, 'availabilityHoursPerWeek')
    if (!availabilityValue) {
      setError('Availability is required')
      return
    }

    setGoogleApplicationSubmitting(true)
    try {
      const data = await completeGoogleSignupMutation.mutateAsync({
        credential: googleAuth.credential,
        stub: googleAuth.stub,
        applicationMessage: formData.get('applicationMessage') as string,
        bio: bioValue,
        discordHandle: textField(formData, 'discordHandle'),
        signalNumber: textField(formData, 'signalNumber'),
        whatsappNumber: textField(formData, 'whatsappNumber'),
        contactPreference: contactPref || undefined,
        contactNotes: textField(formData, 'contactNotes'),
        availabilityHoursPerWeek: Number(availabilityValue),
        location: textField(formData, 'location'),
        country: countryValue,
        localGroup:
          localGroupValue && localGroupValue !== NO_LOCAL_GROUP ? localGroupValue : undefined,
        otherSkills: textField(formData, 'otherSkills'),
        skillIds: skills.map((s) => s.skillId),
        consentMakeProfileVisibleInDirectory: consentVisible,
        consentContactableByProjectOwners: consentContact,
        consentShareContactInfoWithProjectOwner: shareDirectly,
        cookieConsentAnalytics: consentAnalytics,
        emailDigest,
      })
      sessionStorage.removeItem('google_pending_auth')
      setGoogleApplicationStep(false)
      if (data.pending) {
        setApplicationPending(true)
      } else if (data.token) {
        await setToken(data.token)
        router.push('/dashboard')
      }
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

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault()
    setError('')

    const formData = new FormData(e.currentTarget)
    const password = formData.get('password') as string
    const passwordConfirmValue = formData.get('password_confirm') as string

    if (password !== passwordConfirmValue) {
      setError('Passwords do not match')
      return
    }
    if (password.length < 8) {
      setError('Password must be at least 8 characters')
      return
    }

    const bioValue = textField(formData, 'bio')
    if (!bioValue || bioValue.trim().length < 20) {
      setError('About You must be at least 20 characters')
      return
    }
    if (!countryValue) {
      setError('Country is required')
      return
    }
    const availabilityValue = textField(formData, 'availabilityHoursPerWeek')
    if (!availabilityValue) {
      setError('Availability is required')
      return
    }

    setSubmitting(true)
    try {
      const data = await signupMutation.mutateAsync({
        name: formData.get('name') as string,
        email: (formData.get('email') as string).trim(),
        password,
        applicationMessage: formData.get('applicationMessage') as string,
        bio: bioValue,
        discordHandle: textField(formData, 'discordHandle'),
        signalNumber: textField(formData, 'signalNumber'),
        whatsappNumber: textField(formData, 'whatsappNumber'),
        contactPreference: contactPref || undefined,
        contactNotes: textField(formData, 'contactNotes'),
        availabilityHoursPerWeek: Number(availabilityValue),
        location: textField(formData, 'location'),
        country: countryValue,
        localGroup:
          localGroupValue && localGroupValue !== NO_LOCAL_GROUP ? localGroupValue : undefined,
        otherSkills: textField(formData, 'otherSkills'),
        skillIds: skills.map((s) => s.skillId),
        consentMakeProfileVisibleInDirectory: consentVisible,
        consentContactableByProjectOwners: consentContact,
        consentShareContactInfoWithProjectOwner: shareDirectly,
        cookieConsentAnalytics: consentAnalytics,
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

  // Everything both sign-up routes ask after the account details. A plain function rather
  // than a component, so its inputs keep focus across the page's re-renders; `prefix` keeps
  // the two forms' element ids apart.
  function applicationFields({
    prefix,
    application,
    onApplicationChange,
    contactEmail,
  }: {
    prefix: string
    application: string
    onApplicationChange: (value: string) => void
    contactEmail: string
  }) {
    const contactField = (
      method: 'discord' | 'signal' | 'whatsapp',
      label: string,
      name: string,
      value: string,
      setValue: (v: string) => void,
      placeholder: string,
      autoComplete: string,
    ) => (
      <div className="mb-5">
        <label htmlFor={`${prefix}${method}`}>{label}</label>
        <input
          type="text"
          id={`${prefix}${method}`}
          name={name}
          autoComplete={autoComplete}
          placeholder={placeholder}
          value={value}
          onChange={(e) => {
            setValue(e.target.value)
            if (e.target.value.trim() === '' && contactPref === method) setContactPref('')
          }}
        />
        <PreferredRadio
          method={method}
          contactPref={contactPref}
          onPrefChange={setContactPref}
          disabled={value.trim() === ''}
        />
      </div>
    )
    return (
      <>
        <div className="mb-5">
          <label htmlFor={`${prefix}applicationMessage`} className="required">
            Your Application
          </label>
          <FieldHint id={`${prefix}applicationMessage-hint`}>
            Tell us your connection to PauseAI (if you&apos;re already in the WhatsApp or Discord,
            how we know you), why the mission matters to you, and how you&apos;d like to help. Only
            admins read this; it isn&apos;t on your public profile.
          </FieldHint>
          <textarea
            id={`${prefix}applicationMessage`}
            name="applicationMessage"
            autoComplete="off"
            required
            minLength={20}
            rows={6}
            aria-describedby={`${prefix}applicationMessage-hint`}
            placeholder="e.g. I joined the Discord in March and would like to help run local events…"
            value={application}
            onChange={(e) => onApplicationChange(e.target.value)}
          />
        </div>

        <div className="mb-5">
          <label htmlFor={`${prefix}bio`} className="required">
            About You
          </label>
          <FieldHint id={`${prefix}bio-hint`}>
            Shown to other volunteers in the directory if you choose to make your profile visible.
            Tell us about your background and what brings you to PauseAI.
          </FieldHint>
          <textarea
            id={`${prefix}bio`}
            name="bio"
            autoComplete="off"
            required
            minLength={20}
            aria-describedby={`${prefix}bio-hint`}
            placeholder="Your background and what brings you to PauseAI…"
            value={bio}
            onChange={(e) => setBio(e.target.value)}
          />
        </div>

        <h3 className="mt-6">Contact Preferences</h3>
        <p className="text-sm text-text-light mt-1 mb-4">
          Add ways for project owners to reach you. All optional.
        </p>

        <div className="grid grid-cols-[repeat(auto-fit,minmax(300px,1fr))] gap-5">
          {contactField(
            'discord',
            'Discord Handle',
            'discordHandle',
            discord,
            setDiscord,
            'username#1234',
            'off',
          )}
          {contactField('signal', 'Signal', 'signalNumber', signal, setSignal, '+44…', 'tel')}
          {contactField(
            'whatsapp',
            'WhatsApp',
            'whatsappNumber',
            whatsapp,
            setWhatsapp,
            '+44…',
            'tel',
          )}
          <div className="mb-5">
            <label htmlFor={`${prefix}email_display`}>Contact Email</label>
            <input
              type="text"
              id={`${prefix}email_display`}
              value={contactEmail}
              placeholder="The email you sign up with"
              disabled
            />
            <PreferredRadio
              method="email"
              contactPref={contactPref}
              onPrefChange={setContactPref}
              disabled={contactEmail.trim() === ''}
            />
          </div>
        </div>

        <div className="mb-5">
          <label htmlFor={`${prefix}contactNotes`}>Contact Notes</label>
          <input
            type="text"
            id={`${prefix}contactNotes`}
            name="contactNotes"
            autoComplete="off"
            placeholder="e.g., Best to DM me on Discord first"
            value={contactNotes}
            onChange={(e) => setContactNotes(e.target.value)}
          />
        </div>

        <h3 className="mt-6">Availability</h3>
        <div className="mb-5">
          <label htmlFor={`${prefix}availability`} className="required">
            Hours per week you can give (1–40)
          </label>
          <input
            type="number"
            id={`${prefix}availability`}
            name="availabilityHoursPerWeek"
            autoComplete="off"
            required
            min={1}
            max={40}
            placeholder="e.g., 5"
            value={availability}
            onChange={(e) => setAvailability(e.target.value)}
          />
          <p className="text-sm text-text-light mt-1">
            A rough guess is fine, and you can change it later.
          </p>
        </div>
        <div className="mb-5">
          <FilterDropdown
            id={`${prefix}locationCountry`}
            label="Country"
            ariaLabel="Select country"
            value={countryValue}
            options={COUNTRY_OPTIONS}
            onChange={handleCountryChange}
            searchable
            required
          />
        </div>
        {countryValue && hasLocalGroups && (
          <div className="mb-5">
            <FilterDropdown
              id={`${prefix}locationGroup`}
              label="Local Group"
              ariaLabel="Select local group"
              value={localGroupValue}
              options={localGroupOptions}
              onChange={setLocalGroupValue}
              searchable
            />
          </div>
        )}
        {showCityInput && (
          <div className="mb-5">
            <label htmlFor={`${prefix}location`}>City / Area</label>
            <input
              type="text"
              id={`${prefix}location`}
              name="location"
              autoComplete="address-level2"
              value={location}
              onChange={(e) => setLocation(e.target.value)}
            />
          </div>
        )}

        <h3 className="mt-6">Your Skills</h3>
        <p className="text-sm text-text-light mt-1 mb-3">
          Select skills you can contribute. This helps match you with projects.
        </p>
        <SkillPicker value={skills} onChange={setSkills} />

        <div className="mb-5 mt-4">
          <label htmlFor={`${prefix}otherSkills`}>Other Skills</label>
          <input
            type="text"
            id={`${prefix}otherSkills`}
            name="otherSkills"
            autoComplete="off"
            placeholder="Any skills not listed above…"
            value={otherSkills}
            onChange={(e) => setOtherSkills(e.target.value)}
          />
        </div>

        <div className="mt-6">
          <h3>Privacy &amp; Consent</h3>
          <div className="flex flex-col gap-2">
            <label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={consentVisible}
                onChange={(e) => setConsentVisible(e.target.checked)}
              />
              Make my profile visible in the volunteer directory
            </label>
            <label className="flex items-center gap-2 font-normal">
              <input
                type="checkbox"
                checked={consentContact}
                onChange={(e) => setConsentContact(e.target.checked)}
              />
              Allow project owners to contact me about opportunities
            </label>
            <label
              className={`flex items-center gap-2 font-normal ml-6 ${consentContact ? 'opacity-100' : 'opacity-50'}`}
            >
              <input
                type="checkbox"
                checked={shareDirectly}
                disabled={!consentContact}
                onChange={(e) => setShareDirectly(e.target.checked)}
              />
              Share my contact info directly with project owners
            </label>
            <label className="flex items-center gap-2 font-normal mt-2">
              <input
                type="checkbox"
                id={`${prefix}consent_analytics`}
                checked={consentAnalytics}
                onChange={(e) => setConsentAnalytics(e.target.checked)}
              />
              Allow Google Analytics to help us improve the platform
            </label>
          </div>
          <p className="text-sm text-text-light mt-3">
            You can change these settings or delete your account at any time.{' '}
            <Link href="/privacy" target="_blank">
              Read our privacy policy
            </Link>
          </p>
        </div>

        <h3 className="mt-6">Email Notifications</h3>
        <div className="mb-5">
          <FilterDropdown
            id={`${prefix}emailDigest`}
            label="Keep me in the loop about new projects"
            ariaLabel="Keep me in the loop about new projects"
            value={emailDigest}
            options={emailDigestOptions}
            onChange={setEmailDigest}
          />
        </div>
      </>
    )
  }

  if (loading) return null

  if (googleApplicationStep && pendingGoogleAuth) {
    return (
      <>
        {googleClientId && (
          <Script
            src="https://accounts.google.com/gsi/client"
            strategy="afterInteractive"
            onLoad={initGoogleButton}
          />
        )}
        <main className="container py-5 pb-15">
          <div className="max-w-2xl mx-auto">
            <h1>Complete your application</h1>
            <p className="text-text-light mb-6">
              Your Google account is verified. Fill in your details to apply.
            </p>
            {error && (
              <div
                role="alert"
                className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-600"
              >
                {error}
              </div>
            )}
            <form
              className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word"
              onSubmit={(e) => handleGoogleApplicationSubmit(e, pendingGoogleAuth)}
            >
              <div className="mb-5">
                <label htmlFor="g_name">Your Name</label>
                <input type="text" id="g_name" value={name} disabled />
                <p className="text-sm text-text-light mt-1">
                  From your Google account. To use a different name, change it on your Google
                  account or update it later in your profile settings.
                </p>
              </div>

              {applicationFields({
                prefix: 'g_',
                application: googleApplicationMessage,
                onApplicationChange: setGoogleApplicationMessage,
                contactEmail: pendingGoogleAuth.email ?? '',
              })}

              <div className="mt-3">
                <Button type="submit" className="w-full" disabled={googleApplicationSubmitting}>
                  {googleApplicationSubmitting ? 'Submitting…' : 'Submit Application'}
                </Button>
              </div>
            </form>

            <p className="text-center text-sm text-text-light mt-6">
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
    const isGoogleSignup = !!pendingGoogleAuth
    return (
      <main className="container py-5 pb-15">
        <div className="max-w-2xl mx-auto">
          {/* role="status" so a screen reader announces that the form went through. */}
          <div role="status" className="bg-surface rounded-xl shadow p-8 text-center">
            {isGoogleSignup ? (
              <>
                <h1>Application submitted</h1>
                <p className="text-text-light mt-4 mb-2">Thanks for applying! What happens next:</p>
                <ol className="list-decimal pl-5 text-left text-text-light inline-block mb-6">
                  <li>A member of the team reviews your application.</li>
                  <li>We email you when it&#39;s approved, and you can pick your first task.</li>
                </ol>
              </>
            ) : (
              <>
                <h1>Check your email</h1>
                <p className="text-text-light mt-4 mb-2">
                  Thanks for applying! We&#39;ve sent a confirmation link to {email}. What happens
                  next:
                </p>
                <ol className="list-decimal pl-5 text-left text-text-light inline-block mb-4">
                  <li>Open the link in that email to confirm your address.</li>
                  <li>A member of the team reviews your application.</li>
                  <li>We email you when it&#39;s approved, and you can pick your first task.</li>
                </ol>
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
      <main className="container py-5 pb-15">
        <div className="max-w-2xl mx-auto">
          <h1>Join Catalyse</h1>
          <p className="text-text-light mb-6">
            Connect with PauseAI projects and fellow volunteers.
          </p>

          {error && (
            <div
              role="alert"
              className="flex items-center gap-3 p-4 rounded-lg mb-4 bg-red-100 text-red-800 border border-red-300 dark:bg-red-900 dark:text-red-300 dark:border-red-600"
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
              <div className="flex items-center my-4 gap-4">
                <hr className="flex-1 border-none border-t border-brand-border" />
                <span className="text-text-light text-sm">or sign up with email</span>
                <hr className="flex-1 border-none border-t border-brand-border" />
              </div>
            </>
          )}

          <form
            method="post"
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
                autoComplete="name"
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
                autoComplete="email"
                required
                placeholder="you@example.com"
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value)
                  if (e.target.value.trim() === '' && contactPref === 'email') setContactPref('')
                }}
              />
              <p className="text-sm text-text-light mt-1">
                Used for login and notifications. Not shown publicly: see contact settings below.
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
                autoComplete="new-password"
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
                autoComplete="new-password"
                required
                minLength={8}
                placeholder="Type your password again"
                value={passwordConfirm}
                onChange={(e) => setPasswordConfirm(e.target.value)}
              />
            </div>

            {applicationFields({
              prefix: '',
              application: applicationMessage,
              onApplicationChange: setApplicationMessage,
              contactEmail: email,
            })}

            <div className="mt-3">
              <Button type="submit" className="w-full" disabled={submitting}>
                {submitting ? 'Creating account…' : 'Create Account'}
              </Button>
            </div>

            <p className="text-center text-text-light mt-4">
              Already have an account? <Link href="/login">Login</Link>
            </p>
          </form>

          <p className="text-center text-sm text-text-light mt-6">
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
