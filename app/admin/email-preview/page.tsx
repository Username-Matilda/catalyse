'use client'

import { useRef, useState } from 'react'
import { useRequireAdmin } from '@/lib/hooks/auth'
import { useQueries } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'

type Param = string | number | boolean

const EMAIL_TYPES: { value: string; label: string; params: Record<string, Param> }[] = [
  {
    value: 'email-confirmation',
    label: 'Email Confirmation',
    params: { name: 'Alex', confirm_token: 'sample-token-abc123' },
  },
  {
    value: 'application-received',
    label: 'Application Received',
    params: { name: 'Alex' },
  },
  {
    value: 'application-approved',
    label: 'Application Approved',
    params: { name: 'Alex' },
  },
  {
    value: 'application-rejected',
    label: 'Application Rejected',
    params: { name: 'Alex' },
  },
  {
    value: 'pending-applications-summary',
    label: 'Pending Applications Summary',
    params: { count: 3 },
  },
  {
    value: 'password-reset',
    label: 'Password Reset',
    params: { name: 'Alex', reset_token: 'sample-token-abc123' },
  },
  {
    value: 'admin-invite',
    label: 'Admin Invite',
    params: { invited_by: 'Jamie Smith', invite_token: 'sample-token-abc123' },
  },
  {
    value: 'welcome',
    label: 'Welcome',
    params: { name: 'Alex' },
  },
  {
    value: 'project-notification',
    label: 'Project Notification',
    params: {
      name: 'Alex',
      subject: 'Your project has been approved',
      message:
        'Great news — your project AI Safety Explainer Series has been reviewed and approved.',
      project_id: 1,
    },
  },
  {
    value: 'local-group-suggestion-accepted',
    label: 'Local Group Suggestion (Accepted)',
    params: { name: 'Alex', action: 'accepted', groupName: 'London' },
  },
  {
    value: 'local-group-suggestion-merge',
    label: 'Local Group Suggestion (Merge)',
    params: {
      name: 'Alex',
      action: 'merge',
      groupName: 'London',
      adminNotes: 'Merged with existing South London group.',
    },
  },
  {
    value: 'local-group-suggestion-on-hold',
    label: 'Local Group Suggestion (On Hold)',
    params: {
      name: 'Alex',
      action: 'on_hold',
      groupName: 'London',
      adminNotes: 'We need a bit more time to assess this one.',
    },
  },
  {
    value: 'local-group-suggestion-declined',
    label: 'Local Group Suggestion (Declined)',
    params: {
      name: 'Alex',
      action: 'declined',
      groupName: 'London',
      adminNotes: 'We already have good coverage in this area.',
    },
  },
  {
    value: 'relay-message',
    label: 'Relay Message',
    params: {
      to_name: 'Alex',
      from_name: 'Jamie Smith',
      subject: 'Collaboration on AI Safety Explainer Series',
      project_title: 'AI Safety Explainer Series',
    },
  },
  {
    value: 'digest-match',
    label: 'Digest (Skill Match)',
    params: { name: 'Alex', is_match: true, projects: '3 sample projects' },
  },
  {
    value: 'digest-general',
    label: 'Digest (General)',
    params: { name: 'Alex', is_match: false, projects: '3 sample projects' },
  },
  {
    value: 'task-nudge',
    label: 'Task Nudge',
    params: {
      name: 'Alex',
      task_title: 'Write fundraising copy',
      project_title: 'Climate Action Newsletter',
      days_inactive: 14,
      activity_phrase: 'you were assigned this task',
      last_activity_date: '16 April 2026',
    },
  },
  {
    value: 'task-final-warning',
    label: 'Task Final Warning',
    params: {
      name: 'Alex',
      task_title: 'Write fundraising copy',
      project_title: 'Climate Action Newsletter',
      days_inactive: 21,
      activity_phrase: 'you last updated this task',
      last_activity_date: '9 April 2026',
      surrender_date: '7 May 2026',
    },
  },
  {
    value: 'task-surrendered-owner',
    label: 'Task Surrendered (Owner)',
    params: {
      owner_name: 'Jordan',
      volunteer_name: 'Alex Johnson',
      task_title: 'Write fundraising copy',
      project_title: 'Climate Action Newsletter',
    },
  },
  {
    value: 'task-surrendered-assignee',
    label: 'Task Surrendered (Assignee)',
    params: {
      name: 'Alex',
      task_title: 'Write fundraising copy',
      project_title: 'Climate Action Newsletter',
    },
  },
]

function AutoIframe({ html }: { html: string }) {
  const ref = useRef<HTMLIFrameElement>(null)
  const [height, setHeight] = useState(400)

  function resize() {
    const doc = ref.current?.contentDocument
    if (doc?.body) setHeight(doc.body.scrollHeight + 32)
  }

  return (
    <iframe
      ref={ref}
      srcDoc={html}
      onLoad={resize}
      style={{ width: '100%', height, border: 'none', display: 'block' }}
      title="Email preview"
    />
  )
}

function EmailRow({
  type,
  preview,
}: {
  type: (typeof EMAIL_TYPES)[number]
  preview: { subject: string; html: string } | undefined
}) {
  const openInNewTab = () => {
    const blob = new Blob([preview?.html ?? ''], { type: 'text/html' })
    window.open(URL.createObjectURL(blob), '_blank')
  }

  return (
    <section style={{ borderBottom: '1px solid #e2e8f0', padding: '32px 0' }}>
      <div style={{ display: 'flex', alignItems: 'baseline', gap: 12, marginBottom: 16 }}>
        <h2 style={{ margin: 0, fontSize: 18, color: '#1A202C' }}>{type.label}</h2>
        <button
          onClick={openInNewTab}
          style={{
            background: 'none',
            border: 'none',
            color: '#FF9416',
            cursor: 'pointer',
            fontSize: 13,
            padding: 0,
          }}
        >
          Open in new tab ↗
        </button>
      </div>
      <div
        style={{ display: 'grid', gridTemplateColumns: '300px 1fr', gap: 32, alignItems: 'start' }}
      >
        <div>
          <p
            style={{
              fontSize: 11,
              fontWeight: 600,
              color: '#718096',
              textTransform: 'uppercase',
              letterSpacing: '0.05em',
              margin: '0 0 8px',
            }}
          >
            Parameters
          </p>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <tbody>
              {Object.entries(type.params).map(([key, val]) => (
                <tr key={key}>
                  <td
                    style={{
                      padding: '4px 8px 4px 0',
                      color: '#718096',
                      whiteSpace: 'nowrap',
                      verticalAlign: 'top',
                    }}
                  >
                    {key}
                  </td>
                  <td style={{ padding: '4px 0', color: '#2D3748', wordBreak: 'break-word' }}>
                    {typeof val === 'boolean' ? (val ? 'true' : 'false') : String(val)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div>
          {preview?.subject && (
            <p style={{ fontSize: 13, color: '#718096', margin: '0 0 8px', fontStyle: 'italic' }}>
              Subject: <strong style={{ color: '#2D3748' }}>{preview.subject}</strong>
            </p>
          )}
          <div
            style={{
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              overflow: 'hidden',
              background: '#fff',
            }}
          >
            {preview?.html ? (
              <AutoIframe html={preview.html} />
            ) : (
              <p style={{ padding: 16, color: '#718096', margin: 0 }}>Loading…</p>
            )}
          </div>
        </div>
      </div>
    </section>
  )
}

export default function EmailPreviewPage() {
  const { user, loading } = useRequireAdmin()

  const results = useQueries({
    queries: EMAIL_TYPES.map((t) => ({
      ...orpc.admin.emailPreview.preview.queryOptions({ input: { type: t.value } }),
      enabled: !!user?.isAdmin,
    })),
  })

  if (loading || !user?.isAdmin) return null

  return (
    <>
      <main style={{ width: '100%', maxWidth: 1280, margin: '0 auto', padding: '32px 24px 64px' }}>
        <h1 style={{ marginBottom: 4 }}>Email Previews</h1>
        <p style={{ color: '#718096', marginBottom: 0 }}>
          All transactional emails rendered with sample data.
        </p>
        {EMAIL_TYPES.map((t, i) => (
          <EmailRow key={t.value} type={t} preview={results[i].data} />
        ))}
      </main>
    </>
  )
}
