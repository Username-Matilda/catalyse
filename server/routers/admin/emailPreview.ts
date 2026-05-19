import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import {
  buildWelcomeAndConfirmHtml,
  buildApplicationReceivedHtml,
  buildApplicationApprovedHtml,
  buildApplicationRejectedHtml,
  buildPendingApplicationsSummaryHtml,
  buildPasswordResetHtml,
  buildAdminInviteHtml,
  buildWelcomeHtml,
  buildProjectNotificationHtml,
  buildLocalGroupSuggestionHtml,
  buildRelayMessageHtml,
  buildDigestHtml,
  buildTaskNudgeHtml,
  buildTaskFinalWarningHtml,
  buildTaskSurrenderedOwnerHtml,
  buildTaskSurrenderedAssigneeHtml,
} from '@/lib/email'
import { adminProcedure } from '../../procedures'

const APP_URL = process.env.APP_URL!

const SAMPLE_PROJECTS = [
  {
    id: 1,
    title: 'AI Safety Explainer Series',
    description:
      'Creating accessible explainer content about AI safety concepts for a general audience.',
    skill_names: ['Writing', 'Research'],
    match_percent: 92,
  },
  {
    id: 2,
    title: 'Volunteer Coordination Tool',
    description:
      'Building a lightweight tool to help coordinate volunteers across PauseAI chapters.',
    skill_names: ['TypeScript', 'React'],
    match_percent: 78,
  },
  {
    id: 3,
    title: 'Policy Brief: Compute Governance',
    description:
      'Researching and writing a policy brief on international compute governance frameworks.',
    skill_names: ['Policy', 'Research'],
  },
]

const EMAIL_TYPES = [
  'welcome-google',
  'welcome-and-confirm',
  'application-received',
  'application-approved',
  'application-rejected',
  'pending-applications-summary',
  'password-reset',
  'admin-invite',
  'project-notification',
  'local-group-suggestion-accepted',
  'local-group-suggestion-merge',
  'local-group-suggestion-on-hold',
  'local-group-suggestion-declined',
  'relay-message',
  'digest-match',
  'digest-general',
  'task-nudge',
  'task-final-warning',
  'task-surrendered-owner',
  'task-surrendered-assignee',
]

function buildPreview(type: string): { subject: string; html: string } | null {
  switch (type) {
    case 'welcome-google':
      return { subject: 'Welcome to Catalyse!', html: buildWelcomeHtml('Alex', APP_URL) }
    case 'welcome-and-confirm':
      return {
        subject: 'Welcome to Catalyse — please confirm your email',
        html: buildWelcomeAndConfirmHtml(
          'Alex',
          `${APP_URL}/verify-email?token=sample-token-abc123`,
        ),
      }
    case 'application-received':
      return {
        subject: 'Your Catalyse application has been received',
        html: buildApplicationReceivedHtml('Alex'),
      }
    case 'application-approved':
      return {
        subject: 'Your Catalyse application has been approved',
        html: buildApplicationApprovedHtml('Alex', APP_URL),
      }
    case 'application-rejected':
      return {
        subject: 'Update on your Catalyse application',
        html: buildApplicationRejectedHtml(
          'Alex',
          'Unfortunately your application did not meet our current requirements.',
        ),
      }
    case 'pending-applications-summary':
      return {
        subject: '3 pending applications on Catalyse',
        html: buildPendingApplicationsSummaryHtml(3, APP_URL),
      }
    case 'password-reset':
      return {
        subject: 'Reset your Catalyse password',
        html: buildPasswordResetHtml(`${APP_URL}/reset-password?token=sample-token-abc123`, 'Alex'),
      }
    case 'admin-invite':
      return {
        subject: 'Jamie Smith invited you to be a Catalyse admin',
        html: buildAdminInviteHtml(
          `${APP_URL}/accept-invite?token=sample-token-abc123`,
          'Jamie Smith',
        ),
      }
    case 'project-notification':
      return {
        subject: 'Your project has been approved',
        html: buildProjectNotificationHtml(
          'Alex',
          'Your project has been approved',
          'Great news — your project AI Safety Explainer Series has been reviewed and approved.',
          1,
          APP_URL,
        ),
      }
    case 'local-group-suggestion-accepted':
      return {
        subject: 'Your local group suggestion "London" was accepted',
        html: buildLocalGroupSuggestionHtml('Alex', 'accepted', 'London'),
      }
    case 'local-group-suggestion-merge':
      return {
        subject: 'Your local group suggestion "London" has been merged',
        html: buildLocalGroupSuggestionHtml('Alex', 'merge', 'London', 'Merged with South London.'),
      }
    case 'local-group-suggestion-on-hold':
      return {
        subject: 'Your local group suggestion "London" is under review',
        html: buildLocalGroupSuggestionHtml(
          'Alex',
          'on_hold',
          'London',
          'We need a bit more time to assess this one.',
        ),
      }
    case 'local-group-suggestion-declined':
      return {
        subject: 'Update on your local group suggestion "London"',
        html: buildLocalGroupSuggestionHtml(
          'Alex',
          'declined',
          'London',
          'We already have good coverage in this area.',
        ),
      }
    case 'relay-message':
      return {
        subject: '[Catalyse] Collaboration on AI Safety Explainer Series',
        html: buildRelayMessageHtml(
          'Alex',
          'Jamie Smith',
          'Collaboration on AI Safety Explainer Series',
          'Hi Alex,\n\nI came across your profile and think your writing skills would be a great fit.\n\nThanks,\nJamie',
          'AI Safety Explainer Series',
        ),
      }
    case 'digest-match':
      return {
        subject: 'New projects matching your skills',
        html: buildDigestHtml('Alex', APP_URL, SAMPLE_PROJECTS, true),
      }
    case 'digest-general':
      return {
        subject: "What's new on Catalyse",
        html: buildDigestHtml('Alex', APP_URL, SAMPLE_PROJECTS, false),
      }
    case 'task-nudge':
      return {
        subject: "How's it going with Write fundraising copy?",
        html: buildTaskNudgeHtml(
          'Alex',
          'Write fundraising copy',
          'Climate Action Newsletter',
          1,
          42,
          14,
          'you were assigned this task',
          '16 April 2026',
        ),
      }
    case 'task-final-warning':
      return {
        subject: 'A quick nudge about Write fundraising copy',
        html: buildTaskFinalWarningHtml(
          'Alex',
          'Write fundraising copy',
          'Climate Action Newsletter',
          1,
          42,
          21,
          'you last updated this task',
          '9 April 2026',
          '7 May 2026',
        ),
      }
    case 'task-surrendered-owner':
      return {
        subject: 'Task unassigned due to inactivity: Write fundraising copy',
        html: buildTaskSurrenderedOwnerHtml(
          'Jordan',
          'Alex Johnson',
          'Write fundraising copy',
          'Climate Action Newsletter',
          1,
        ),
      }
    case 'task-surrendered-assignee':
      return {
        subject: 'Update on your task: Write fundraising copy',
        html: buildTaskSurrenderedAssigneeHtml(
          'Alex',
          'Write fundraising copy',
          'Climate Action Newsletter',
          1,
        ),
      }
    default:
      return null
  }
}

export const adminEmailPreviewRouter = {
  types: adminProcedure.handler(async () => ({ types: EMAIL_TYPES })),

  preview: adminProcedure.input(z.object({ type: z.string() })).handler(async ({ input }) => {
    const preview = buildPreview(input.type)
    if (!preview) throw new ORPCError('NOT_FOUND', { message: 'Unknown email type' })
    return { subject: preview.subject, html: preview.html }
  }),
}
