import { z } from 'zod'
import { ProjectStatus } from '@/generated/prisma/enums'
import {
  AdminInviteSchema,
  AdminNoteSchema,
  BugReportSchema,
  LocalGroupSchema,
  LocalGroupSuggestionSchema,
  ProjectSchema,
  ProjectTaskSchema,
  ProjectUpdateSchema,
  SkillSchema,
  SkillCategorySchema,
  StarterTaskSchema,
  VolunteerSchema,
} from '@/generated/zod'

const BASE_OMIT = { id: true, createdAt: true, updatedAt: true } as const

// ─── Auth ────────────────────────────────────────────────────────────────────

export const SignupSchema = VolunteerSchema.pick({
  name: true,
  bio: true,
  discordHandle: true,
  signalNumber: true,
  whatsappNumber: true,
  contactPreference: true,
  contactNotes: true,
  availabilityHoursPerWeek: true,
  location: true,
  country: true,
  localGroup: true,
  otherSkills: true,
  consentMakeProfileVisibleInDirectory: true,
  consentContactableByProjectOwners: true,
  consentShareContactInfoWithProjectOwner: true,
  emailDigest: true,
  applicationMessage: true,
})
  .partial({
    bio: true,
    discordHandle: true,
    signalNumber: true,
    whatsappNumber: true,
    contactPreference: true,
    contactNotes: true,
    availabilityHoursPerWeek: true,
    location: true,
    country: true,
    localGroup: true,
    otherSkills: true,
    consentMakeProfileVisibleInDirectory: true,
    consentContactableByProjectOwners: true,
    consentShareContactInfoWithProjectOwner: true,
    emailDigest: true,
    applicationMessage: true,
  })
  .extend({
    // email is nullable on Volunteer (Google OAuth accounts have none), but required at signup
    email: z.string().email('A valid email address is required'),
    password: z
      .string()
      .min(8, 'Password must be at least 8 characters')
      .max(128, 'Password must be no more than 128 characters'),
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

export const CreateProjectSchema = ProjectSchema.pick({
  title: true,
  description: true,
  projectType: true,
  estimatedDuration: true,
  timeCommitmentHoursPerWeek: true,
  urgency: true,
  collaborationLink: true,
  country: true,
  localGroup: true,
  isSeekingHelp: true,
  isSeekingOwner: true,
}).extend({
  tasks: z.array(TaskInputSchema).optional().default([]),
  wantToOwn: z.boolean().optional().default(false),
  skillIds: z.array(z.number().int()).optional().default([]),
  skillRequiredMap: z.record(z.string(), z.boolean()).optional().default({}),
})

export const UpdateProjectSchema = ProjectSchema.omit({
  ...BASE_OMIT,
  proposedById: true,
  isOrgProposed: true,
  reviewNotes: true,
  reviewedById: true,
  reviewedAt: true,
  feedbackToProposer: true,
  completedAt: true,
})
  .partial()
  .extend({
    skillIds: z.array(z.number().int()).optional(),
    skillRequiredMap: z.record(z.string(), z.boolean()).optional(),
  })

export const ProjectInterestBodySchema = z.object({
  interestType: z.enum(['want_to_contribute', 'want_to_own'], {
    error: 'Invalid interestType',
  }),
  message: z.string().optional().nullable(),
})

export const CreateProjectTaskSchema = ProjectTaskSchema.pick({
  title: true,
  description: true,
}).partial({ description: true })

export const UpdateProjectTaskSchema = ProjectTaskSchema.pick({
  title: true,
  description: true,
  status: true,
  assignedToId: true,
}).partial()

export const CreateProjectUpdateSchema = ProjectUpdateSchema.pick({
  content: true,
})

// ─── Admin: projects ──────────────────────────────────────────────────────────

export const AdminCreateProjectSchema = ProjectSchema.pick({
  title: true,
  description: true,
  projectType: true,
  estimatedDuration: true,
  timeCommitmentHoursPerWeek: true,
  urgency: true,
  collaborationLink: true,
  country: true,
  localGroup: true,
  isSeekingHelp: true,
  isSeekingOwner: true,
}).extend({
  tasks: z.array(TaskInputSchema).optional().default([]),
  wantToOwn: z.boolean().optional().default(false),
  skillIds: z.array(z.number().int()).optional().default([]),
  skillRequiredMap: z.record(z.string(), z.boolean()).optional().default({}),
})

export const ReviewProjectSchema = z.object({
  status: z.enum(['approved', 'needs_discussion'], {
    error: 'Status must be approved or needs_discussion',
  }),
  reviewNotes: z.string().optional().nullable(),
  feedbackToProposer: z.string().optional().nullable(),
  targetStatus: z.enum([ProjectStatus.seeking_help, ProjectStatus.seeking_owner]).optional().default(ProjectStatus.seeking_owner),
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

export const CreateNoteSchema = AdminNoteSchema.pick({
  content: true,
  category: true,
  relatedProjectId: true,
}).partial({ category: true, relatedProjectId: true })

export const UpdateNoteSchema = AdminNoteSchema.pick({
  content: true,
  category: true,
}).partial()

// ─── Admin: skills ────────────────────────────────────────────────────────────

export const CreateSkillSchema = SkillSchema.pick({
  name: true,
  categoryId: true,
  description: true,
  sortOrder: true,
}).partial({ description: true, sortOrder: true })

export const UpdateSkillSchema = SkillSchema.pick({
  name: true,
  description: true,
  sortOrder: true,
  categoryId: true,
}).partial()

// ─── Admin: skill categories ──────────────────────────────────────────────────

export const CreateSkillCategorySchema = SkillCategorySchema.pick({
  name: true,
  description: true,
  sortOrder: true,
}).partial({ description: true, sortOrder: true })

export const UpdateSkillCategorySchema = SkillCategorySchema.pick({
  name: true,
  description: true,
  sortOrder: true,
}).partial()

// ─── Admin: local groups ──────────────────────────────────────────────────────

export const LocalGroupBodySchema = LocalGroupSchema.pick({
  name: true,
  country: true,
})

// ─── Admin: bug reports ───────────────────────────────────────────────────────

export const UpdateBugReportSchema = BugReportSchema.pick({
  status: true,
  resolutionNotes: true,
}).partial()

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

export const InviteAdminSchema = AdminInviteSchema.pick({
  email: true,
})

// ─── Admin: platform settings ─────────────────────────────────────────────────

export const PlatformSettingsSchema = z.object({
  requireApplicationApproval: z.boolean({
    message: 'requireApplicationApproval must be a boolean',
  }),
})

// ─── Starter tasks ────────────────────────────────────────────────────────────

export const CreateStarterTaskSchema = StarterTaskSchema.pick({
  title: true,
  description: true,
  skillId: true,
  projectId: true,
  estimatedHours: true,
}).partial({ skillId: true, projectId: true, estimatedHours: true })

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

export const CreateBugReportSchema = BugReportSchema.pick({
  title: true,
  description: true,
  pageUrl: true,
  category: true,
  severity: true,
  reporterEmail: true,
}).partial({ pageUrl: true, category: true, severity: true, reporterEmail: true })

// ─── Local group suggestions ──────────────────────────────────────────────────

export const LocalGroupSuggestionBodySchema = LocalGroupSuggestionSchema.pick({
  name: true,
  country: true,
})

// ─── Volunteer profile ────────────────────────────────────────────────────────

export const UpdateVolunteerSchema = VolunteerSchema.omit({
  ...BASE_OMIT,
  email: true,
  isAdmin: true,
  approvalStatus: true,
  applicationAdminNotes: true,
  applicationApplicantNotes: true,
  consentGivenAt: true,
  rejectedAt: true,
  reviewerId: true,
  emailConfirmed: true,
  deletedAt: true,
})
  .partial()
  .extend({
    skillIds: z.array(z.number().int()).optional(),
  })
