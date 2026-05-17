import { z } from 'zod'
import type {
  SignupSchema,
  ChangePasswordSchema,
  ChangeEmailSchema,
  ResetPasswordSchema,
  CreateProjectSchema,
  UpdateProjectSchema,
  ProjectInterestBodySchema,
  CreateProjectTaskSchema,
  UpdateProjectTaskSchema,
  CreateProjectUpdateSchema,
  AdminCreateProjectSchema,
  ReviewProjectSchema,
  OutcomeProjectSchema,
  ApplicationActionSchema,
  CreateNoteSchema,
  UpdateNoteSchema,
  CreateSkillSchema,
  UpdateSkillSchema,
  CreateSkillCategorySchema,
  UpdateSkillCategorySchema,
  LocalGroupBodySchema,
  UpdateBugReportSchema,
  ReviewSuggestionSchema,
  InviteAdminSchema,
  PlatformSettingsSchema,
  CreateStarterTaskSchema,
  AssignStarterTaskSchema,
  ReviewStarterTaskSchema,
  CreateBugReportSchema,
  LocalGroupSuggestionBodySchema,
  UpdateVolunteerSchema,
} from './schemas'
import type { serializeProject, serializeProjectSkill } from './project'
import type { serializeVolunteer, serializeSkill, serializeEndorsement } from './auth'

// ─── Request body types ───────────────────────────────────────────────────────

export type SignupBody = z.infer<typeof SignupSchema>
export type ChangePasswordBody = z.infer<typeof ChangePasswordSchema>
export type ChangeEmailBody = z.infer<typeof ChangeEmailSchema>
export type ResetPasswordBody = z.infer<typeof ResetPasswordSchema>

export type CreateProjectBody = z.infer<typeof CreateProjectSchema>
export type UpdateProjectBody = z.infer<typeof UpdateProjectSchema>
export type ProjectInterestBody = z.infer<typeof ProjectInterestBodySchema>
export type CreateProjectTaskBody = z.infer<typeof CreateProjectTaskSchema>
export type UpdateProjectTaskBody = z.infer<typeof UpdateProjectTaskSchema>
export type CreateProjectUpdateBody = z.infer<typeof CreateProjectUpdateSchema>

export type AdminCreateProjectBody = z.infer<typeof AdminCreateProjectSchema>
export type ReviewProjectBody = z.infer<typeof ReviewProjectSchema>
export type OutcomeProjectBody = z.infer<typeof OutcomeProjectSchema>

export type ApplicationActionBody = z.infer<typeof ApplicationActionSchema>
export type CreateNoteBody = z.infer<typeof CreateNoteSchema>
export type UpdateNoteBody = z.infer<typeof UpdateNoteSchema>
export type CreateSkillBody = z.infer<typeof CreateSkillSchema>
export type UpdateSkillBody = z.infer<typeof UpdateSkillSchema>
export type CreateSkillCategoryBody = z.infer<typeof CreateSkillCategorySchema>
export type UpdateSkillCategoryBody = z.infer<typeof UpdateSkillCategorySchema>
export type LocalGroupBody = z.infer<typeof LocalGroupBodySchema>
export type UpdateBugReportBody = z.infer<typeof UpdateBugReportSchema>
export type ReviewSuggestionBody = z.infer<typeof ReviewSuggestionSchema>
export type InviteAdminBody = z.infer<typeof InviteAdminSchema>
export type PlatformSettingsBody = z.infer<typeof PlatformSettingsSchema>

export type CreateStarterTaskBody = z.infer<typeof CreateStarterTaskSchema>
export type AssignStarterTaskBody = z.infer<typeof AssignStarterTaskSchema>
export type ReviewStarterTaskBody = z.infer<typeof ReviewStarterTaskSchema>

export type CreateBugReportBody = z.infer<typeof CreateBugReportSchema>
export type LocalGroupSuggestionBody = z.infer<typeof LocalGroupSuggestionBodySchema>
export type UpdateVolunteerBody = z.infer<typeof UpdateVolunteerSchema>

// ─── Response / serializer types ─────────────────────────────────────────────

export type SerializedProject = ReturnType<typeof serializeProject>
export type SerializedProjectSkill = ReturnType<typeof serializeProjectSkill>
export type SerializedVolunteer = ReturnType<typeof serializeVolunteer>
export type SerializedSkill = ReturnType<typeof serializeSkill>
export type SerializedEndorsement = ReturnType<typeof serializeEndorsement>
