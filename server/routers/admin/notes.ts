import { z } from 'zod'
import { ORPCError } from '@orpc/server'
import { prisma } from '@/lib/prisma'
import { CreateNoteSchema, UpdateNoteSchema } from '@/lib/schemas'
import { adminProcedure } from '../../procedures'

export const adminNotesRouter = {
  listForVolunteer: adminProcedure
    .input(z.object({ volunteerId: z.number().int() }))
    .handler(async ({ input }) => {
      const notes = await prisma.adminNote.findMany({
        where: { volunteerId: input.volunteerId },
        include: { author: { select: { name: true } } },
        orderBy: { createdAt: 'desc' },
      })
      return notes.map((n) => ({
        id: n.id,
        volunteerId: n.volunteerId,
        authorId: n.authorId,
        content: n.content,
        category: n.category,
        relatedProjectId: n.relatedProjectId,
        createdAt: n.createdAt,
        updatedAt: n.updatedAt,
        authorName: n.author.name,
      }))
    }),

  create: adminProcedure
    .input(z.object({ volunteerId: z.number().int() }).merge(CreateNoteSchema))
    .handler(async ({ input, context }) => {
      const target = await prisma.volunteer.findUnique({
        where: { id: input.volunteerId },
        select: { id: true },
      })
      if (!target) throw new ORPCError('NOT_FOUND', { message: 'Volunteer not found' })

      const note = await prisma.adminNote.create({
        data: {
          volunteerId: input.volunteerId,
          authorId: context.volunteer.id,
          content: input.content.trim(),
          category: input.category ?? 'general',
          relatedProjectId: input.relatedProjectId ?? null,
        },
      })
      return { id: note.id, message: 'Note added' }
    }),

  update: adminProcedure
    .input(z.object({ id: z.number().int() }).merge(UpdateNoteSchema))
    .handler(async ({ input }) => {
      const note = await prisma.adminNote.findUnique({ where: { id: input.id } })
      if (!note) throw new ORPCError('NOT_FOUND', { message: 'Note not found' })

      const data: Record<string, unknown> = { updatedAt: new Date() }
      if (input.content !== undefined) data.content = input.content
      if (input.category !== undefined) data.category = input.category

      await prisma.adminNote.update({ where: { id: input.id }, data })
      return { message: 'Note updated' }
    }),

  delete: adminProcedure.input(z.object({ id: z.number().int() })).handler(async ({ input }) => {
    try {
      await prisma.adminNote.delete({ where: { id: input.id } })
    } catch {
      throw new ORPCError('NOT_FOUND', { message: 'Note not found' })
    }
    return { message: 'Note deleted' }
  }),
}
