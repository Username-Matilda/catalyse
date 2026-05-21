import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { notifyUser } from '@/lib/notify'
import { canViewWorkItem, canPostComment } from '@/lib/work-item'
import { publicProcedure, authedProcedure } from '../procedures'
import { InterestStatus, WorkItemType } from '@/generated/prisma/enums'

const WORK_ITEM_SELECT = {
  id: true,
  type: true,
  status: true,
  title: true,
  parentId: true,
  creatorId: true,
  assigneeId: true,
} as const

type LoadedWorkItem = {
  id: number
  type: string
  status: string
  title: string
  parentId: number | null
  creatorId: number | null
  assigneeId: number | null
}

async function loadWithParent(id: number) {
  const item = (await prisma.workItem.findUnique({
    where: { id },
    select: WORK_ITEM_SELECT,
  })) as LoadedWorkItem | null
  if (!item) return null
  const parent =
    item.type === WorkItemType.TASK && item.parentId
      ? ((await prisma.workItem.findUnique({
          where: { id: item.parentId },
          select: WORK_ITEM_SELECT,
        })) as LoadedWorkItem | null)
      : null
  return { item, parent }
}

function commentLink(item: LoadedWorkItem): string {
  if (item.type === WorkItemType.PROJECT) return `/projects/${item.id}`
  if (item.type === WorkItemType.TASK && item.parentId) return `/projects/${item.parentId}`
  return '/dashboard'
}

// Whether `viewer` may post on this item. Resolves the accepted-helper lookup
// for PROJECT/TASK. Returns false for anonymous viewers.
async function resolveCanPost(
  item: LoadedWorkItem,
  parent: LoadedWorkItem | null,
  viewer: { id: number; isAdmin: boolean } | null,
): Promise<boolean> {
  if (!viewer) return false
  let isAcceptedHelper = false
  if (!viewer.isAdmin) {
    const projectId = item.type === WorkItemType.TASK ? item.parentId : item.id
    if (projectId) {
      const interest = await prisma.workItemInterest.findFirst({
        where: { workItemId: projectId, volunteerId: viewer.id, status: InterestStatus.accepted },
        select: { id: true },
      })
      isAcceptedHelper = Boolean(interest)
    }
  }
  return canPostComment(item, viewer, { parent, isAcceptedHelper })
}

export const workItemCommentsRouter = {
  list: publicProcedure
    .input(z.object({ workItemId: z.number().int() }))
    .handler(async ({ input, context }) => {
      const loaded = await loadWithParent(input.workItemId)
      if (!loaded) throw new ORPCError('NOT_FOUND', { message: 'Work item not found' })

      const viewer = context.volunteer
        ? { id: context.volunteer.id, isAdmin: Boolean(context.volunteer.isAdmin) }
        : null
      if (!canViewWorkItem(loaded.item, viewer, loaded.parent)) {
        throw new ORPCError('NOT_FOUND', { message: 'Work item not found' })
      }

      const comments = await prisma.workItemComment.findMany({
        where: { workItemId: input.workItemId },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'asc' },
      })
      const canPost = await resolveCanPost(loaded.item, loaded.parent, viewer)
      return {
        canPost,
        comments: comments.map((c) => ({
          id: c.id,
          workItemId: c.workItemId,
          authorId: c.authorId,
          authorName: c.author?.name ?? null,
          content: c.content,
          createdAt: c.createdAt,
        })),
      }
    }),

  add: authedProcedure
    .input(z.object({ workItemId: z.number().int(), content: z.string().min(1) }))
    .handler(async ({ input, context }) => {
      const volunteer = context.volunteer
      const loaded = await loadWithParent(input.workItemId)
      if (!loaded) throw new ORPCError('NOT_FOUND', { message: 'Work item not found' })

      const viewer = { id: volunteer.id, isAdmin: Boolean(volunteer.isAdmin) }
      if (!(await resolveCanPost(loaded.item, loaded.parent, viewer))) {
        throw new ORPCError('FORBIDDEN', { message: 'Not authorized to comment here' })
      }

      const comment = await prisma.workItemComment.create({
        data: {
          workItemId: input.workItemId,
          authorId: volunteer.id,
          content: input.content.trim(),
        },
      })

      // Notify the other participants (in-app only).
      const recipientIds = new Set<number>()
      for (const id of [
        loaded.item.creatorId,
        loaded.item.assigneeId,
        loaded.parent?.assigneeId ?? null,
      ]) {
        if (id && id !== volunteer.id) recipientIds.add(id)
      }
      const link = commentLink(loaded.item)
      for (const rid of recipientIds) {
        await notifyUser(
          rid,
          'work_item_comment',
          `New comment on "${loaded.item.title}"`,
          input.content.slice(0, 200),
          link,
        )
      }

      return { id: comment.id, message: 'Comment added' }
    }),
}
