import { z } from 'zod'
import { prisma } from '@/lib/prisma'
import { adminProcedure } from '../../procedures'
import { InterestStatus } from '@/generated/prisma/enums'

export const adminInterestsRouter = {
  list: adminProcedure
    .input(z.object({ status: z.nativeEnum(InterestStatus).optional() }))
    .handler(async ({ input }) => {
      const interests = await prisma.projectInterest.findMany({
        where: input.status ? { status: input.status } : {},
        include: {
          project: {
            select: {
              title: true,
              status: true,
              owner: { select: { name: true } },
            },
          },
          volunteer: {
            select: {
              name: true,
              email: true,
              skills: {
                include: { skill: { include: { category: true } } },
              },
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      })

      return interests.map((i) => ({
        id: i.id,
        volunteerId: i.volunteerId,
        projectId: i.projectId,
        interestType: i.interestType,
        message: i.message,
        status: i.status,
        responseMessage: i.responseMessage,
        createdAt: i.createdAt,
        respondedAt: i.respondedAt,
        projectTitle: i.project.title,
        projectStatus: i.project.status,
        volunteerName: i.volunteer.name,
        volunteerEmail: i.volunteer.email,
        ownerName: i.project.owner?.name ?? null,
        volunteerSkills: i.volunteer.skills.map((vs) => ({
          id: vs.skill.id,
          categoryId: vs.skill.categoryId,
          name: vs.skill.name,
          description: vs.skill.description,
          sortOrder: vs.skill.sortOrder,
          createdAt: vs.skill.createdAt,
          categoryName: vs.skill.category.name,
          proficiencyLevel: vs.proficiencyLevel,
        })),
      }))
    }),
}
