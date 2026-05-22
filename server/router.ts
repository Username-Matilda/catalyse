import { authRouter } from './routers/auth'
import { skillsRouter } from './routers/skills'
import { projectsRouter } from './routers/projects'
import { volunteersRouter } from './routers/volunteers'
import { dashboardRouter } from './routers/dashboard'
import { notificationsRouter } from './routers/notifications'
import { messagesRouter } from './routers/messages'
import { bugReportsRouter } from './routers/bugReports'
import { localGroupsRouter } from './routers/localGroups'
import { localGroupSuggestionsRouter } from './routers/localGroupSuggestions'
import { starterTasksRouter } from './routers/starterTasks'
import { workItemCommentsRouter } from './routers/workItemComments'
import { myRouter } from './routers/my'
import { privacyRouter } from './routers/privacy'
import { contactRouter } from './routers/contact'
import { adminApplicationsRouter } from './routers/admin/applications'
import { adminVolunteersRouter } from './routers/admin/volunteers'
import { adminNotesRouter } from './routers/admin/notes'
import { adminProjectsRouter } from './routers/admin/projects'
import { adminSkillsRouter } from './routers/admin/skills'
import { adminSkillCategoriesRouter } from './routers/admin/skillCategories'
import { adminLocalGroupsRouter } from './routers/admin/localGroups'
import { adminBugReportsRouter } from './routers/admin/bugReports'
import { adminAdminsRouter } from './routers/admin/admins'
import { adminPlatformSettingsRouter } from './routers/admin/platformSettings'
import { adminStatsRouter } from './routers/admin/stats'
import { adminTriageRouter } from './routers/admin/triage'
import { adminInterestsRouter } from './routers/admin/interests'
import { adminEmailPreviewRouter } from './routers/admin/emailPreview'
import { adminRejectedApplicationsRouter } from './routers/admin/rejectedApplications'
import { versionRouter } from './routers/version'

export const appRouter = {
  auth: authRouter,
  skills: skillsRouter,
  projects: projectsRouter,
  volunteers: volunteersRouter,
  dashboard: dashboardRouter,
  notifications: notificationsRouter,
  messages: messagesRouter,
  bugReports: bugReportsRouter,
  localGroups: localGroupsRouter,
  localGroupSuggestions: localGroupSuggestionsRouter,
  starterTasks: starterTasksRouter,
  workItemComments: workItemCommentsRouter,
  my: myRouter,
  privacy: privacyRouter,
  contact: contactRouter,
  version: versionRouter,
  admin: {
    applications: adminApplicationsRouter,
    volunteers: adminVolunteersRouter,
    notes: adminNotesRouter,
    projects: adminProjectsRouter,
    skills: adminSkillsRouter,
    skillCategories: adminSkillCategoriesRouter,
    localGroups: adminLocalGroupsRouter,
    bugReports: adminBugReportsRouter,
    admins: adminAdminsRouter,
    platformSettings: adminPlatformSettingsRouter,
    stats: adminStatsRouter,
    triage: adminTriageRouter,
    interests: adminInterestsRouter,
    emailPreview: adminEmailPreviewRouter,
    rejectedApplications: adminRejectedApplicationsRouter,
  },
}

export type AppRouter = typeof appRouter
