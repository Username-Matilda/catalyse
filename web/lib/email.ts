import { Resend } from 'resend'

const RESEND_API_KEY = process.env.RESEND_API_KEY
const FROM_EMAIL = process.env.FROM_EMAIL || 'Catalyse <noreply@catalyse.pauseai.uk>'
const APP_URL = process.env.APP_URL || 'http://localhost:8001'
const STUB_EMAIL = ['1', 'true', 'yes'].includes((process.env.STUB_EMAIL || '').toLowerCase())

const resend = RESEND_API_KEY ? new Resend(RESEND_API_KEY) : null

export function isEmailConfigured(): boolean {
  return STUB_EMAIL || Boolean(RESEND_API_KEY)
}

export function isRealEmailSending(): boolean {
  return Boolean(RESEND_API_KEY) && !STUB_EMAIL
}

async function sendEmail(to: string, subject: string, html: string, replyTo?: string): Promise<boolean> {
  if (STUB_EMAIL) {
    console.log(`[EMAIL STUB] Would send to ${to}: ${subject}`)
    return true
  }
  if (!resend) {
    console.log(`[EMAIL NOT CONFIGURED] Would send to ${to}: ${subject}`)
    return false
  }
  try {
    const payload: Parameters<typeof resend.emails.send>[0] = {
      from: FROM_EMAIL,
      to: [to],
      subject,
      html,
    }
    if (replyTo) payload.replyTo = replyTo
    const { error } = await resend.emails.send(payload)
    if (error) {
      console.error(`[EMAIL ERROR] ${error.message}`)
      return false
    }
    return true
  } catch (err) {
    console.error('[EMAIL ERROR]', err)
    return false
  }
}

const baseStyle = `
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }
  .container { max-width: 500px; margin: 0 auto; padding: 20px; }
  .button { display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
`

export async function sendPasswordResetEmail(to: string, resetToken: string, name = 'there'): Promise<boolean> {
  const resetUrl = `${APP_URL}/static/reset-password.html?token=${resetToken}`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
<body><div class="container">
  <h2>Reset Your Password</h2>
  <p>Hi ${name},</p>
  <p>We received a request to reset your password for your Catalyse account. Click the button below to choose a new password:</p>
  <p style="text-align: center; margin: 32px 0;"><a href="${resetUrl}" class="button">Reset Password</a></p>
  <p>This link will expire in <strong>1 hour</strong>.</p>
  <p>If you didn't request this, you can safely ignore this email. Your password won't be changed.</p>
  <div class="footer">
    <p>Catalyse - PauseAI UK Volunteer Platform</p>
    <p style="font-size: 12px;">If the button doesn't work, copy this link:<br>${resetUrl}</p>
  </div>
</div></body></html>`
  return sendEmail(to, 'Reset your Catalyse password', html)
}

export async function sendAdminInviteEmail(to: string, inviteToken: string, invitedBy: string): Promise<boolean> {
  const inviteUrl = `${APP_URL}/static/accept-invite.html?token=${inviteToken}`
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
<body><div class="container">
  <h2>You're Invited to be a Catalyse Admin</h2>
  <p>Hi!</p>
  <p><strong>${invitedBy}</strong> has invited you to become an admin on Catalyse, the PauseAI UK volunteer coordination platform.</p>
  <ul>
    <li>Review and approve volunteer-proposed projects</li>
    <li>Manage skills and starter tasks</li>
    <li>View volunteer profiles and add notes</li>
    <li>Invite other admins</li>
  </ul>
  <p style="text-align: center; margin: 32px 0;"><a href="${inviteUrl}" class="button">Accept Invitation</a></p>
  <p>This invitation expires in <strong>7 days</strong>.</p>
  <p>You'll need to sign up or log in with this email address to accept.</p>
  <div class="footer">
    <p>Catalyse - PauseAI UK Volunteer Platform</p>
    <p style="font-size: 12px;">If the button doesn't work, copy this link:<br>${inviteUrl}</p>
  </div>
</div></body></html>`
  return sendEmail(to, `${invitedBy} invited you to be a Catalyse admin`, html)
}

export async function sendWelcomeEmail(to: string, name: string): Promise<boolean> {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
<body><div class="container">
  <h2>Welcome to Catalyse!</h2>
  <p>Hi ${name},</p>
  <p>Thanks for joining the PauseAI UK volunteer community! We're excited to have you.</p>
  <ul>
    <li><strong>Browse projects</strong> - Find opportunities that match your skills</li>
    <li><strong>Complete your profile</strong> - Help project owners find you</li>
    <li><strong>Express interest</strong> - Let project owners know you want to help</li>
  </ul>
  <p style="text-align: center; margin: 32px 0;"><a href="${APP_URL}" class="button">Explore Projects</a></p>
  <div class="footer"><p>Catalyse - PauseAI UK Volunteer Platform</p></div>
</div></body></html>`
  return sendEmail(to, 'Welcome to Catalyse!', html)
}

export async function sendProjectNotificationEmail(
  to: string, name: string, subject: string,
  message: string, projectTitle: string,
  projectId: number, extraHtml = ''
): Promise<boolean> {
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>${baseStyle}</style></head>
<body><div class="container">
  <h2>${subject}</h2>
  <p>Hi ${name},</p>
  <p>${message}</p>
  ${extraHtml}
  <p style="text-align: center; margin: 32px 0;">
    <a href="${APP_URL}/static/project.html?id=${projectId}" class="button">View Project</a>
  </p>
  <div class="footer">
    <p>Catalyse - PauseAI Volunteer Platform</p>
    <p style="font-size: 12px;"><a href="${APP_URL}/static/profile.html">Manage notification preferences</a></p>
  </div>
</div></body></html>`
  return sendEmail(to, subject, html)
}

export async function sendRelayMessage(
  to: string, toName: string, fromName: string, fromEmail: string,
  subject: string, message: string, projectTitle?: string
): Promise<boolean> {
  const projectContext = projectTitle ? ` about the project <strong>${projectTitle}</strong>` : ''
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  ${baseStyle}
  .message-box { background: #f7fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 16px; margin: 16px 0; white-space: pre-wrap; }
  </style></head>
<body><div class="container">
  <h2>Message from ${fromName}</h2>
  <p>Hi ${toName},</p>
  <p><strong>${fromName}</strong> has sent you a message via Catalyse${projectContext}:</p>
  <div class="message-box">
    <p style="font-weight: 500; margin-bottom: 8px;">${subject}</p>
    <p>${message}</p>
  </div>
  <p>You can reply directly to this email to respond to ${fromName}.</p>
  <div class="footer">
    <p>Catalyse - PauseAI UK Volunteer Platform</p>
    <p style="font-size: 12px;">This message was sent via the Catalyse platform. If you no longer wish to receive messages,
    update your contact preferences in your <a href="${APP_URL}/static/profile.html">profile settings</a>.</p>
  </div>
</div></body></html>`
  return sendEmail(to, `[Catalyse] ${subject}`, html, fromEmail)
}

export async function sendDigestEmail(
  to: string, name: string,
  projects: Array<{ id: number; title: string; description?: string; skill_names?: string[]; match_percent?: number }>,
  isMatch = false
): Promise<boolean> {
  if (!projects.length) return false
  const matchIntro = isMatch ? 'Here are new projects that match your skills:' : "Here's what's new on Catalyse:"
  const projectHtml = projects.map(p => {
    const skillsHtml = (p.skill_names || []).slice(0, 5).join(', ')
    const matchBadge = p.match_percent
      ? ` <span style="background: #D1FAE5; color: #065F46; padding: 2px 8px; border-radius: 10px; font-size: 12px;">${p.match_percent}% match</span>`
      : ''
    const desc = p.description || ''
    return `<div style="padding: 16px; margin-bottom: 12px; background: #f7fafc; border-radius: 8px; border-left: 4px solid #FF9416;">
      <a href="${APP_URL}/static/project.html?id=${p.id}" style="font-weight: bold; color: #1A202C; text-decoration: none; font-size: 16px;">${p.title}</a>${matchBadge}
      <p style="color: #4A5568; margin: 8px 0 4px 0; font-size: 14px;">${desc.slice(0, 150)}${desc.length > 150 ? '...' : ''}</p>
      ${skillsHtml ? `<p style="font-size: 12px; color: #718096;">Skills: ${skillsHtml}</p>` : ''}
    </div>`
  }).join('')
  const html = `<!DOCTYPE html><html><head><meta charset="utf-8"><style>
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #1a202c; }
  .container { max-width: 600px; margin: 0 auto; padding: 20px; }
  .button { display: inline-block; background: #FF9416; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold; }
  .footer { margin-top: 32px; padding-top: 16px; border-top: 1px solid #e2e8f0; font-size: 14px; color: #718096; }
  </style></head>
<body><div class="container">
  <h2 style="color: #FF9416;">Catalyse Project Update</h2>
  <p>Hi ${name},</p>
  <p>${matchIntro}</p>
  ${projectHtml}
  <p style="text-align: center; margin: 32px 0;"><a href="${APP_URL}" class="button">Browse All Projects</a></p>
  <div class="footer">
    <p>Catalyse - PauseAI Volunteer Platform</p>
    <p style="font-size: 12px;">You're receiving this because you opted in to project notifications.
    <a href="${APP_URL}/static/profile.html">Change your preferences</a> at any time.</p>
  </div>
</div></body></html>`
  const subject = isMatch ? 'New projects matching your skills' : "What's new on Catalyse"
  return sendEmail(to, subject, html)
}
