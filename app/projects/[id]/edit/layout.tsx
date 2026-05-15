import type { Metadata } from 'next'
import { prisma } from '@/lib/prisma'

export async function generateMetadata({
  params,
}: {
  params: Promise<{ id: string }>
}): Promise<Metadata> {
  const { id } = await params
  const project = await prisma.project.findUnique({
    where: { id: parseInt(id) },
    select: { title: true },
  })
  return { title: project ? `Edit ${project.title}` : 'Edit Project' }
}

export default function Layout({ children }: { children: React.ReactNode }) {
  return <>{children}</>
}
