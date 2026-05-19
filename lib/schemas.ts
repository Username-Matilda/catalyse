import { z } from 'zod'

// ─── Auth ────────────────────────────────────────────────────────────────────

export const SignupSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  email: z.string().email('A valid email address is required'),
  password: z
    .string()
    .min(8, 'Password must be at least 8 characters')
    .max(128, 'Password must be no more than 128 characters'),
  applicationMessage: z.string().optional().nullable(),
  bio: z.string().optional().nullable(),
  discordHandle: z.string().optional().nullable(),
  signalNumber: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  contactPreference: z.string().optional().nullable(),
  contactNotes: z.string().optional().nullable(),
  availabilityHoursPerWeek: z.number().int().optional().nullable(),
  location: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  localGroup: z.string().optional().nullable(),
  otherSkills: z.string().optional().nullable(),
  consentMakeProfileVisibleInDirectory: z.boolean().optional(),
  consentContactableByProjectOwners: z.boolean().optional(),
  consentShareContactInfoWithProjectOwner: z.boolean().optional(),
  emailDigest: z.string().optional(),
  skillIds: z.array(z.number().int()).optional(),
})

export const ChangePasswordSchema = z.object({
  currentPassword: z.string().min(1, 'Current password is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be no more than 128 characters'),
})

export const ChangeEmailSchema = z.object({
  newEmail: z.string().min(1, 'New email is required'),
  password: z.string().min(1, 'Password is required'),
})

export const ResetPasswordSchema = z.object({
  token: z.string().min(1, 'Token is required'),
  newPassword: z
    .string()
    .min(8, 'New password must be at least 8 characters')
    .max(128, 'New password must be no more than 128 characters'),
})

// ─── Projects ─────────────────────────────────────────────────────────────────

const TaskInputSchema = z.object({
  title: z.string().min(1),
  description: z.string().optional(),
})

export const CreateProjectSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  tasks: z.array(TaskInputSchema).optional().default([]),
  wantToOwn: z.boolean().optional().default(false),
  skillIds: z.array(z.number().int()).optional().default([]),
  skillRequiredMap: z.record(z.string(), z.boolean()).optional().default({}),
  projectType: z.string().optional().nullable(),
  estimatedDuration: z.string().optional().nullable(),
  timeCommitmentHoursPerWeek: z.number().int().optional().nullable(),
  urgency: z.string().optional().nullable(),
  collaborationLink: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  localGroup: z.string().optional().nullable(),
  isSeekingHelp: z.boolean().optional(),
  isSeekingOwner: z.boolean().optional(),
})

export const UpdateProjectSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  status: z.string().optional(),
  projectType: z.string().optional().nullable(),
  estimatedDuration: z.string().optional().nullable(),
  timeCommitmentHoursPerWeek: z.number().int().optional().nullable(),
  urgency: z.string().optional().nullable(),
  collaborationLink: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  localGroup: z.string().optional().nullable(),
  outcome: z.string().optional().nullable(),
  outcomeNotes: z.string().optional().nullable(),
  isSeekingHelp: z.boolean().optional(),
  isSeekingOwner: z.boolean().optional(),
  ownerId: z.number().int().optional().nullable(),
  skillIds: z.array(z.number().int()).optional(),
  skillRequiredMap: z.record(z.string(), z.boolean()).optional(),
})

export const ProjectInterestBodySchema = z.object({
  interestType: z.enum(['want_to_contribute', 'want_to_own'], {
    error: 'Invalid interestType',
  }),
  message: z.string().optional().nullable(),
})

export const CreateProjectTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().optional().nullable(),
})

export const UpdateProjectTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional().nullable(),
  status: z.string().optional(),
  assignedToId: z.number().int().optional().nullable(),
})

export const CreateProjectUpdateSchema = z.object({
  content: z.string().min(1, 'Content is required'),
})

// ─── Admin: projects ──────────────────────────────────────────────────────────

export const AdminCreateProjectSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  tasks: z.array(TaskInputSchema).optional().default([]),
  wantToOwn: z.boolean().optional().default(false),
  skillIds: z.array(z.number().int()).optional().default([]),
  skillRequiredMap: z.record(z.string(), z.boolean()).optional().default({}),
  projectType: z.string().optional().nullable(),
  estimatedDuration: z.string().optional().nullable(),
  timeCommitmentHoursPerWeek: z.number().int().optional().nullable(),
  urgency: z.string().optional().nullable(),
  collaborationLink: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  localGroup: z.string().optional().nullable(),
  isSeekingHelp: z.boolean().optional(),
  isSeekingOwner: z.boolean().optional(),
})

export const ReviewProjectSchema = z.object({
  status: z.enum(['approved', 'needs_discussion'], {
    error: 'Status must be approved or needs_discussion',
  }),
  reviewNotes: z.string().optional().nullable(),
  feedbackToProposer: z.string().optional().nullable(),
  targetStatus: z.string().optional().default('seeking_owner'),
})

export const OutcomeProjectSchema = z.object({
  outcome: z.enum(['successful', 'partial', 'not_completed', 'ongoing'], {
    error: 'Invalid outcome',
  }),
  outcomeNotes: z.string().optional().nullable(),
})

// ─── Admin: applications ──────────────────────────────────────────────────────

export const ApplicationActionSchema = z.object({
  action: z.enum(['start_review', 'approve', 'reject', 'update_notes'], {
    error: 'action must be "start_review", "approve", "reject", or "update_notes"',
  }),
  adminNotes: z.string().optional().nullable(),
  applicantNotes: z.string().optional().nullable(),
})

// ─── Admin: notes ─────────────────────────────────────────────────────────────

export const CreateNoteSchema = z.object({
  content: z.string().min(1, 'Content is required'),
  category: z.string().optional(),
  relatedProjectId: z.number().int().optional().nullable(),
})

export const UpdateNoteSchema = z.object({
  content: z.string().optional(),
  category: z.string().optional(),
})

// ─── Admin: skills ────────────────────────────────────────────────────────────

export const CreateSkillSchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  categoryId: z.number().int({ message: 'categoryId is required' }),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().nullable(),
})

export const UpdateSkillSchema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
  categoryId: z.number().int().optional(),
})

// ─── Admin: skill categories ──────────────────────────────────────────────────

export const CreateSkillCategorySchema = z.object({
  name: z.string().min(1, 'Name is required').max(100, 'Name must be at most 100 characters'),
  description: z.string().optional().nullable(),
  sortOrder: z.number().int().optional().nullable(),
})

export const UpdateSkillCategorySchema = z.object({
  name: z.string().optional(),
  description: z.string().optional().nullable(),
  sortOrder: z.number().optional(),
})

// ─── Admin: local groups ──────────────────────────────────────────────────────

export const LocalGroupBodySchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  country: z.string().min(1, 'Country is required'),
})

// ─── Admin: bug reports ───────────────────────────────────────────────────────

export const UpdateBugReportSchema = z.object({
  status: z.string().optional(),
  resolutionNotes: z.string().optional().nullable(),
})

// ─── Admin: local group suggestions ──────────────────────────────────────────

export const ReviewSuggestionSchema = z.object({
  action: z.enum(['accept', 'merge', 'on_hold', 'decline'], {
    error: 'Invalid action',
  }),
  adminNotes: z.string().optional().nullable(),
  name: z.string().optional(),
  country: z.string().optional(),
  mergedIntoId: z.number().int().optional().nullable(),
})

// ─── Admin: invite ────────────────────────────────────────────────────────────

export const InviteAdminSchema = z.object({
  email: z.string().email('A valid email address is required'),
})

// ─── Admin: platform settings ─────────────────────────────────────────────────

export const PlatformSettingsSchema = z.object({
  requireApplicationApproval: z.boolean({
    message: 'requireApplicationApproval must be a boolean',
  }),
})

// ─── Starter tasks ────────────────────────────────────────────────────────────

export const CreateStarterTaskSchema = z.object({
  title: z.string().min(1, 'Title is required'),
  description: z.string().min(1, 'Description is required'),
  skillId: z.number().int().optional().nullable(),
  projectId: z.number().int().optional().nullable(),
  estimatedHours: z.number().optional().nullable(),
})

export const AssignStarterTaskSchema = z.object({
  volunteerId: z.number().int({ message: 'volunteerId is required' }),
})

export const ReviewStarterTaskSchema = z.object({
  reviewRating: z.enum(['excellent', 'good', 'needs_improvement'], {
    error: 'reviewRating must be excellent, good, or needs_improvement',
  }),
  reviewNotes: z.string().optional().nullable(),
  feedbackToVolunteer: z.string().optional().nullable(),
})

// ─── Bug reports ──────────────────────────────────────────────────────────────

export const CreateBugReportSchema = z.object({
  title: z.string().min(1, 'Title is required').max(300, 'Title must be 300 characters or fewer'),
  description: z.string().min(10, 'Description must be at least 10 characters'),
  pageUrl: z.string().optional().nullable(),
  category: z.string().optional(),
  severity: z.string().optional(),
  reporterEmail: z.string().optional().nullable(),
})

// ─── Local group suggestions ──────────────────────────────────────────────────

export const LocalGroupSuggestionBodySchema = z.object({
  name: z.string().min(1, 'Group name is required'),
  country: z.string().min(1, 'Country is required'),
})

// ─── Volunteer profile ────────────────────────────────────────────────────────

export const UpdateVolunteerSchema = z.object({
  name: z.string().optional(),
  bio: z.string().optional().nullable(),
  discordHandle: z.string().optional().nullable(),
  signalNumber: z.string().optional().nullable(),
  whatsappNumber: z.string().optional().nullable(),
  contactPreference: z.string().optional().nullable(),
  contactNotes: z.string().optional().nullable(),
  availabilityHoursPerWeek: z.number().int().optional().nullable(),
  location: z.string().optional().nullable(),
  country: z.string().optional().nullable(),
  localGroup: z.string().optional().nullable(),
  otherSkills: z.string().optional().nullable(),
  emailDigest: z.string().optional(),
  applicationMessage: z.string().optional().nullable(),
  consentMakeProfileVisibleInDirectory: z.boolean().optional(),
  consentContactableByProjectOwners: z.boolean().optional(),
  consentShareContactInfoWithProjectOwner: z.boolean().optional(),
  cookieConsentAnalytics: z.boolean().nullable().optional(),
  skillIds: z.array(z.number().int()).optional(),
})
