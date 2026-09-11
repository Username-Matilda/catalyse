'use client'

import { use } from 'react'
import Link from 'next/link'
import ProjectPorting from '@/components/ProjectPorting'
import { useRequireApproved } from '@/lib/hooks/auth'

/**
 * A linkable home for the export/import round trip. The same flow is available as a modal from
 * the project sidebar; this page keeps it addressable, which is what `_meta.docs` on every
 * export points at.
 */
export default function ProjectImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const projectId = parseInt(idParam, 10)
  const { user, loading } = useRequireApproved()

  if (loading || !user) return null

  return (
    <main className="container py-5 pb-15">
      <h1 role="heading">Export and import</h1>
      <p className="text-text-light mb-4">
        Take the project out as a file, edit it, and put it back. You&apos;ll see exactly what would
        change before anything is written.{' '}
        <Link href={`/projects/${projectId}`}>Back to project</Link>
      </p>

      <ProjectPorting projectId={projectId} />
    </main>
  )
}
