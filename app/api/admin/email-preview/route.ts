import { NextRequest, NextResponse } from 'next/server'
import { requireAdmin } from '@/lib/auth'
import {
  buildPasswordResetHtml,
  buildAdminInviteHtml,
  buildWelcomeHtml,
  buildProjectNotificationHtml,
  buildRelayMessageHtml,
  buildDigestHtml,
  buildTaskNudgeHtml,
  buildTaskFinalWarningHtml,
  buildTaskSurrenderedOwnerHtml,
  buildTaskSurrenderedAssigneeHtml,
} from '@/lib/email'

const APP_URL = process.env.APP_URL || 'http://localhost:3000'

const SAMPLE_PROJECTS = [
  { id: 1, title: 'AI Safety Explainer Series', description: 'Creating accessible explainer content about AI safety concepts for a general audience.', skill_names: ['Writing', 'Research'], match_percent: 92 },
  { id: 2, title: 'Volunteer Coordination Tool', description: 'Building a lightweight tool to help coordinate volunteers across PauseAI chapters.', skill_names: ['TypeScript', 'React'], match_percent: 78 },
  { id: 3, title: 'Policy Brief: Compute Governance', description: 'Researching and writing a policy brief on international compute governance frameworks.', skill_names: ['Policy', 'Research'] },
]

function buildPreview(type: string): { subject: string; html: string } | null {
  switch (type) {
    case 'password-reset':
      return { subject: 'Reset your Catalyse password', html: buildPasswordResetHtml(`${APP_URL}/reset-password?token=sample-token-abc123`, 'Alex') }
    case 'admin-invite':
      return { subject: 'Jamie Smith invited you to be a Catalyse admin', html: buildAdminInviteHtml(`${APP_URL}/accept-invite?token=sample-token-abc123`, 'Jamie Smith') }
    case 'welcome':
      return { subject: 'Welcome to Catalyse!', html: buildWelcomeHtml('Alex', APP_URL) }
    case 'project-notification':
      return {
        subject: 'Your project has been approved',
        html: buildProjectNotificationHtml(
          'Alex', 'Your project has been approved', 'Great news — your project AI Safety Explainer Series has been reviewed and approved.',
          1, APP_URL
        ),
      }
    case 'relay-message':
      return {
        subject: '[Catalyse] Collaboration on AI Safety Explainer Series',
        html: buildRelayMessageHtml(
          'Alex', 'Jamie Smith', 'Collaboration on AI Safety Explainer Series',
          "Hi Alex,\n\nI came across your profile and think your writing skills would be a great fit for our project. Would you be interested in jumping on a call this week?\n\nThanks,\nJamie",
          APP_URL, 'AI Safety Explainer Series'
        ),
      }
    case 'digest-match':
      return { subject: 'New projects matching your skills', html: buildDigestHtml('Alex', APP_URL, SAMPLE_PROJECTS, true) }
    case 'digest-general':
      return { subject: "What's new on Catalyse", html: buildDigestHtml('Alex', APP_URL, SAMPLE_PROJECTS, false) }
    case 'task-nudge':
      return { subject: "How's it going with Write fundraising copy?", html: buildTaskNudgeHtml('Alex', 'Write fundraising copy', 'Climate Action Newsletter', 1, 42, 14, 'you were assigned this task', '16 April 2026') }
    case 'task-final-warning':
      return { subject: 'A quick nudge about Write fundraising copy', html: buildTaskFinalWarningHtml('Alex', 'Write fundraising copy', 'Climate Action Newsletter', 1, 42, 21, 'you last updated this task', '9 April 2026', '7 May 2026') }
    case 'task-surrendered-owner':
      return { subject: 'Task unassigned due to inactivity: Write fundraising copy', html: buildTaskSurrenderedOwnerHtml('Jordan', 'Alex Johnson', 'Write fundraising copy', 'Climate Action Newsletter', 1) }
    case 'task-surrendered-assignee':
      return { subject: 'Update on your task: Write fundraising copy', html: buildTaskSurrenderedAssigneeHtml('Alex', 'Write fundraising copy', 'Climate Action Newsletter', 1) }
    default:
      return null
  }
}

export async function GET(request: NextRequest) {
  const { error } = await requireAdmin(request.headers.get('authorization'))
  if (error) return error

  const type = request.nextUrl.searchParams.get('type')
  if (!type) {
    return NextResponse.json({
      types: ['password-reset', 'admin-invite', 'welcome', 'project-notification', 'relay-message', 'digest-match', 'digest-general', 'task-nudge', 'task-final-warning', 'task-surrendered-owner', 'task-surrendered-assignee'],
    })
  }

  const preview = buildPreview(type)
  if (!preview) return NextResponse.json({ error: 'Unknown email type' }, { status: 404 })

  const { subject, html } = preview
  return NextResponse.json({ subject, html })
}
