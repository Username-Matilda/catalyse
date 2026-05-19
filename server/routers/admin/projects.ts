import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/project'
import { notifyVolunteer } from '@/lib/notify'
import { AdminCreateProjectSchema, ReviewProjectSchema, OutcomeProjectSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'

export const adminProjectsRouter = {
  create: adminProcedure.input(AdminCreateProjectSchema).handler(async ({ input, context }) => {
    const admin = context.volunteer
    const { wantToOwn, skillIds, skillRequiredMap, tasks } = input

    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.project.create({
        data: {
          title: input.title,
          description: input.description,
          status: tasks.length > 0 ? 'in_progress' : 'needs_tasks',
          ownerId: wantToOwn ? admin.id : null,
          proposedById: admin.id,
          isOrgProposed: true,
          projectType: input.projectType ?? null,
          estimatedDuration: input.estimatedDuration ?? null,
          timeCommitmentHoursPerWeek: input.timeCommitmentHoursPerWeek ?? null,
          urgency: input.urgency ?? 'medium',
          collaborationLink: input.collaborationLink ?? null,
          country: input.country ?? null,
          localGroup: input.localGroup ?? null,
          isSeekingHelp: input.isSeekingHelp !== false,
          isSeekingOwner: input.isSeekingOwner === true,
        },
      })

      if (skillIds.length > 0) {
        await tx.projectSkill.createMany({
          data: skillIds.map((skillId) => ({
            projectId: newProject.id,
            skillId,
            isRequired: skillRequiredMap[skillId] !== false,
          })),
        })
      }

      if (tasks.length > 0) {
        await tx.projectTask.createMany({
          data: tasks.map((t) => ({
            projectId: newProject.id,
            title: t.title,
            description: t.description ?? null,
            createdById: admin.id,
          })),
        })
      }

      return newProject
    })

    return { id: project.id, message: 'Org project created' }
  }),

  review: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(ReviewProjectSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const project = await prisma.project.findUnique({ where: { id: input.id } })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const { status, reviewNotes = null, feedbackToProposer = null, targetStatus } = input

      if (status === 'approved') {
        const hasOwner = project.ownerId !== null
        const openTaskCount = await prisma.projectTask.count({
          where: { projectId: input.id, status: { not: 'done' } },
        })
        const newStatus = openTaskCount > 0 ? 'in_progress' : 'needs_tasks'
        const isSeekingHelp = targetStatus === 'seeking_help' || targetStatus === 'seeking_owner'
        const isSeekingOwner = targetStatus === 'seeking_owner' && !hasOwner

        await prisma.project.update({
          where: { id: input.id },
          data: {
            status: newStatus,
            isSeekingHelp,
            isSeekingOwner,
            reviewNotes,
            reviewedById: admin.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        })

        if (project.proposedById) {
          await notifyVolunteer(
            project.proposedById,
            'project_approved',
            `Your project '${project.title}' has been approved!`,
            "It's now visible to other volunteers.",
            `/projects/${input.id}`,
            {
              message:
                'Great news! Your project has been approved and is now visible to all volunteers.',
              projectTitle: project.title,
              projectId: input.id,
            },
          )
        }
      } else {
        await prisma.project.update({
          where: { id: input.id },
          data: {
            status: 'needs_discussion',
            reviewNotes,
            feedbackToProposer,
            reviewedById: admin.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        })

        if (project.proposedById) {
          const feedback = feedbackToProposer || 'A team lead wants to chat about your proposal.'
          await notifyVolunteer(
            project.proposedById,
            'project_needs_discussion',
            `Let's discuss your project '${project.title}'`,
            feedback,
            `/projects/${input.id}`,
            {
              message:
                'A team lead would like to discuss your project proposal before it goes live.',
              projectTitle: project.title,
              projectId: input.id,
              extraHtml: `<div style="padding: 12px; background: #f7fafc; border-radius: 8px; margin: 16px 0;"><strong>Feedback:</strong> ${feedback}</div>`,
            },
          )
        }
      }

      return { message: `Project marked as ${status}` }
    }),

  setOutcome: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(OutcomeProjectSchema))
    .handler(async ({ input, context }) => {
      const admin = context.volunteer
      const project = await prisma.project.findUnique({ where: { id: input.id } })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const { outcome, outcomeNotes = null } = input
      const isCompleted = ['successful', 'partial', 'not_completed'].includes(outcome)

      await prisma.project.update({
        where: { id: input.id },
        data: {
          outcome,
          outcomeNotes,
          completedAt: isCompleted ? new Date() : null,
          ...(isCompleted ? { status: 'completed' } : {}),
          updatedAt: new Date(),
        },
      })

      if (project.ownerId && outcomeNotes) {
        await prisma.adminNote.create({
          data: {
            volunteerId: project.ownerId,
            authorId: admin.id,
            content: `Project '${project.title}' outcome: ${outcome}. ${outcomeNotes}`,
            category: 'reliability',
            relatedProjectId: input.id,
          },
        })
      }

      if (outcome === 'successful' && project.ownerId) {
        const projectSkills = await prisma.projectSkill.findMany({
          where: { projectId: input.id, isRequired: true },
          select: { skillId: true },
        })
        await Promise.all(
          projectSkills.map((ps) =>
            prisma.skillEndorsement.upsert({
              where: {
                volunteerId_skillId_endorsedById: {
                  volunteerId: project.ownerId!,
                  skillId: ps.skillId,
                  endorsedById: admin.id,
                },
              },
              update: {
                rating: 'verified',
                source: 'project_outcome',
                sourceId: input.id,
                notes: `Successfully delivered: ${project.title}`,
              },
              create: {
                volunteerId: project.ownerId!,
                skillId: ps.skillId,
                endorsedById: admin.id,
                source: 'project_outcome',
                sourceId: input.id,
                rating: 'verified',
                notes: `Successfully delivered: ${project.title}`,
              },
            }),
          ),
        )
      }

      return { message: `Project outcome recorded as ${outcome}` }
    }),

  triage: adminProcedure.handler(async () => {
    const projects = await prisma.project.findMany({
      where: { status: { in: ['pending_review', 'needs_discussion'] } },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => withProjectExtras(p as EnrichedProject))
  }),
}
