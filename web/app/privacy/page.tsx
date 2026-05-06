'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import Header from '@/components/Header'
import Button from '@/components/Button'
import { useAuth } from '@/lib/auth-context'
import { apiRequest } from '@/lib/api'

export default function PrivacyPage() {
  const { user, loading } = useAuth()
  const [exporting, setExporting] = useState(false)
  const [message, setMessage] = useState<{ text: string; type: 'success' | 'error' } | null>(null)


  useEffect(() => {
    // no redirect — page is public
  }, [])

  async function handleExport() {
    setExporting(true)
    setMessage(null)
    try {
      const data = await apiRequest<unknown>('/api/privacy/export')
      const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' })
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      a.download = `catalyse-data-export-${new Date().toISOString().split('T')[0]}.json`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      setMessage({ text: 'Data exported successfully!', type: 'success' })
    } catch (err: unknown) {
      setMessage({ text: err instanceof Error ? err.message : 'Export failed', type: 'error' })
    } finally {
      setExporting(false)
    }
  }

  if (loading) return null

  return (
    <>
      <Header />
      <main className="max-w-350 mx-auto px-6 py-5 pb-15">
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h1>Privacy &amp; Data</h1>
          <p className="text-text-light mb-6">
            Manage your data and privacy settings. We&apos;re committed to respecting your rights under GDPR.
          </p>

          {message && (
            <div
              role="alert"
              className={`flex items-center gap-3 p-4 rounded-lg mb-4 ${
                message.type === 'success'
                  ? 'bg-[#D1FAE5] text-[#065F46] border border-[#6EE7B7] dark:bg-[#064E3B] dark:text-[#6EE7B7] dark:border-[#059669]'
                  : 'bg-[#FEE2E2] text-[#991B1B] border border-[#FCA5A5] dark:bg-[#7F1D1D] dark:text-[#FCA5A5] dark:border-[#DC2626]'
              }`}
            >
              {message.text}
            </div>
          )}

          {user && (
            <>
              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word mb-6">
                <h2>Export Your Data</h2>
                <p className="text-text-light mb-4">
                  Download all your data in JSON format. This includes your profile, skills, project interests, and messages.
                </p>
                <Button variant="secondary" onClick={handleExport} disabled={exporting}>
                  {exporting ? 'Preparing…' : 'Download My Data'}
                </Button>
              </div>

              <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word mb-6" style={{ borderColor: 'var(--warning)' }}>
                <h2>Delete Your Account</h2>
                <p className="text-text-light mb-4">
                  Permanently delete your account and all associated data. This action cannot be undone.
                </p>
                <Button href="/settings" variant="secondary">
                  Go to Account Settings to Delete
                </Button>
              </div>
            </>
          )}

          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word mb-6">
            <h2>Our Data Practices</h2>

            <h4>What we collect</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li>Information you provide (name, email, bio, contact details)</li>
              <li>Skills and availability you share</li>
              <li>Projects you propose or express interest in</li>
              <li>Bug reports and feedback you submit</li>
              <li>Admin notes about your volunteering activity (visible to admins only)</li>
            </ul>

            <h4>Legal basis for processing</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li><strong>Consent</strong> — for sharing your profile with other volunteers and allowing project owners to contact you (you can withdraw consent at any time via your profile settings)</li>
              <li><strong>Legitimate interest</strong> — for operating the platform, matching volunteers with projects, and platform administration</li>
              <li><strong>Contract performance</strong> — for providing you the service you signed up for</li>
            </ul>

            <h4>How we use it</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li>To match you with relevant projects based on your skills</li>
              <li>To enable project owners to contact you (with your consent)</li>
              <li>To send you transactional emails (password resets, admin invites, welcome emails)</li>
              <li>To relay messages between volunteers via email</li>
              <li>To send you notifications about your projects and interests</li>
              <li>To send automated inactivity reminders and manage task assignments to keep projects moving</li>
              <li>For platform administration and volunteer coordination</li>
            </ul>

            <h4>What we don&apos;t do</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li>We never sell your data</li>
              <li>We don&apos;t share your contact info without your consent</li>
              <li>We don&apos;t use your data for profiling or to make decisions that have legal or significant effects on you</li>
            </ul>

            <h4>Third-party data processors</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li><strong>Railway</strong> (hosting) — our application and database are hosted on Railway&apos;s cloud infrastructure. Data may be processed in the United States.</li>
              <li><strong>Resend</strong> (email delivery) — used to send transactional emails and relay messages between volunteers.</li>
              <li><strong>Backblaze B2</strong> (encrypted backups) — daily encrypted backups retained for 30 days in an EU data centre.</li>
              <li><strong>Google Analytics</strong> (usage analytics) — anonymised page view data. Only loaded with your consent via the cookie banner.</li>
              <li><strong>Google Sign-In</strong> (authentication) — if you choose to sign in with Google, Google shares your name and email with us.</li>
            </ul>

            <h4>Data retention</h4>
            <ul className="text-text-light mb-4" style={{ paddingLeft: 20 }}>
              <li>Active accounts: data is kept as long as your account is active</li>
              <li>Deleted accounts: personal data is anonymised immediately upon deletion</li>
              <li>Database backups: retained for 30 days, then automatically deleted</li>
              <li>Password reset tokens expire after 1 hour; admin invite tokens after 7 days</li>
            </ul>

            <h4>Security</h4>
            <p className="text-text-light">
              Passwords are hashed using PBKDF2-SHA256 with random salts. All data is transmitted over HTTPS.
              Database backups are encrypted at rest.
            </p>
          </div>

          <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word mb-6">
            <h2>Your GDPR Rights</h2>
            <p className="text-text-light mb-4">
              Under GDPR and the UK Data Protection Act 2018, you have the right to:
            </p>
            <ul className="text-text-light" style={{ paddingLeft: 20 }}>
              <li><strong>Access</strong> (Article 15) — Download all your data using the export feature above</li>
              <li><strong>Rectification</strong> (Article 16) — Update your profile at any time</li>
              <li><strong>Erasure</strong> (Article 17) — Delete your account and all personal data</li>
              <li><strong>Restrict processing</strong> (Article 18) — Contact us to limit how we use your data</li>
              <li><strong>Portability</strong> (Article 20) — Export your data in a machine-readable format (JSON)</li>
              <li><strong>Object</strong> (Article 21) — Contact us to opt out of specific processing</li>
              <li><strong>Withdraw consent</strong> (Article 7) — Update your privacy settings or delete your account at any time</li>
            </ul>
            <p className="text-text-light" style={{ marginTop: 16 }}>
              <strong>Data Controller:</strong> Safe AI Alliance Ltd (trading as PauseAI UK / Catalyse)<br />
              <strong>Contact:</strong> <a href="mailto:matilda@pauseai.info">matilda@pauseai.info</a>
            </p>
            <p className="text-text-light" style={{ marginTop: 12 }}>
              If you are not satisfied with how we handle your data, you have the right to lodge a complaint with the{' '}
              <strong>Information Commissioner&apos;s Office (ICO)</strong> at{' '}
              <a href="https://ico.org.uk/make-a-complaint/" target="_blank" rel="noopener noreferrer">ico.org.uk</a>.
            </p>
          </div>

          {!user && (
            <div className="bg-surface rounded-xl shadow p-6 mb-4 overflow-hidden wrap-break-word text-center mb-6">
              <p className="text-text-light">
                <Link href="/login">Log in</Link> to export your data or manage your account.
              </p>
            </div>
          )}

          <p className="text-center" style={{ marginTop: 24 }}>
            <Link href="/profile">&larr; Back to Profile</Link>
          </p>
        </div>
      </main>
    </>
  )
}
