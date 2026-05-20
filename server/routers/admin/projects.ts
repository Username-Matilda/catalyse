import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { withProjectExtras, projectInclude, EnrichedProject } from '@/lib/work-item'
import { notifyUser } from '@/lib/notify'
import { AdminCreateProjectSchema, ReviewProjectSchema, OutcomeProjectSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'
import { ProjectStatus, TaskStatus, WorkItemType } from '@/generated/prisma/enums'

export const adminProjectsRouter = {
  create: adminProcedure.input(AdminCreateProjectSchema).handler(async ({ input, context }) => {
    const admin = context.volunteer
    const { wantToOwn, skillIds, skillRequiredMap, tasks } = input

    const project = await prisma.$transaction(async (tx) => {
      const newProject = await tx.workItem.create({
        data: {
          type: WorkItemType.PROJECT,
          title: input.title,
          description: input.description,
          status: tasks.length > 0 ? ProjectStatus.in_progress : ProjectStatus.needs_tasks,
          assigneeId: wantToOwn ? admin.id : null,
          creatorId: admin.id,
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
        await tx.workItemSkill.createMany({
          data: skillIds.map((skillId) => ({
            workItemId: newProject.id,
            skillId,
            isRequired: skillRequiredMap[skillId] !== false,
          })),
        })
      }

      if (tasks.length > 0) {
        await tx.workItem.createMany({
          data: tasks.map((t) => ({
            type: WorkItemType.TASK,
            status: TaskStatus.open,
            parentId: newProject.id,
            title: t.title,
            description: t.description ?? null,
            creatorId: admin.id,
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
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const { status, reviewNotes = null, comment = null, targetStatus } = input

      if (status === 'approved') {
        const hasOwner = project.assigneeId !== null
        const openTaskCount = await prisma.workItem.count({
          where: {
            parentId: input.id,
            type: WorkItemType.TASK,
            status: { not: TaskStatus.completed },
          },
        })
        const newStatus = openTaskCount > 0 ? ProjectStatus.in_progress : ProjectStatus.needs_tasks
        const isSeekingHelp =
          targetStatus === ProjectStatus.seeking_help ||
          targetStatus === ProjectStatus.seeking_owner
        const isSeekingOwner = targetStatus === ProjectStatus.seeking_owner && !hasOwner

        await prisma.workItem.update({
          where: { id: input.id },
          data: {
            status: newStatus,
            isSeekingHelp,
            isSeekingOwner,
            reviewNotes,
            stakeholderId: admin.id,
            reviewedById: admin.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        })

        if (comment && comment.trim()) {
          await prisma.workItemComment.create({
            data: { workItemId: input.id, authorId: admin.id, content: comment.trim() },
          })
        }

        if (project.creatorId) {
          await notifyUser(
            project.creatorId,
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
        await prisma.workItem.update({
          where: { id: input.id },
          data: {
            status: ProjectStatus.needs_discussion,
            reviewNotes,
            stakeholderId: admin.id,
            reviewedById: admin.id,
            reviewedAt: new Date(),
            updatedAt: new Date(),
          },
        })

        if (comment && comment.trim()) {
          await prisma.workItemComment.create({
            data: { workItemId: input.id, authorId: admin.id, content: comment.trim() },
          })
        }

        if (project.creatorId) {
          const feedback = comment || 'A team lead wants to chat about your proposal.'
          await notifyUser(
            project.creatorId,
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
      const project = await prisma.workItem.findFirst({
        where: { id: input.id, type: WorkItemType.PROJECT },
      })
      if (!project) throw new ORPCError('NOT_FOUND', { message: 'Project not found' })

      const { outcome, outcomeNotes = null } = input
      const isCompleted = ['successful', 'partial', 'not_completed'].includes(outcome)

      await prisma.workItem.update({
        where: { id: input.id },
        data: {
          outcome,
          outcomeNotes,
          completedAt: isCompleted ? new Date() : null,
          ...(isCompleted ? { status: ProjectStatus.completed } : {}),
          updatedAt: new Date(),
        },
      })

      if (project.assigneeId && outcomeNotes) {
        await prisma.adminNote.create({
          data: {
            volunteerId: project.assigneeId,
            authorId: admin.id,
            content: `Project '${project.title}' outcome: ${outcome}. ${outcomeNotes}`,
            category: 'reliability',
            relatedWorkItemId: input.id,
          },
        })
      }

      if (outcome === 'successful' && project.assigneeId) {
        const assigneeId = project.assigneeId
        const projectSkills = await prisma.workItemSkill.findMany({
          where: { workItemId: input.id, isRequired: true },
          select: { skillId: true },
        })
        await Promise.all(
          projectSkills.map((ps) =>
            prisma.skillEndorsement.upsert({
              where: {
                volunteerId_skillId_endorsedById: {
                  volunteerId: assigneeId,
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
                volunteerId: assigneeId,
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
    const projects = await prisma.workItem.findMany({
      where: {
        type: WorkItemType.PROJECT,
        status: { in: [ProjectStatus.pending_review, ProjectStatus.needs_discussion] },
      },
      include: projectInclude,
      orderBy: { createdAt: 'asc' },
    })
    return projects.map((p) => withProjectExtras(p as EnrichedProject))
  }),
}
