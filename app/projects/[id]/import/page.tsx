'use client'

import { use, useMemo, useRef, useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import Button from '@/components/Button'
import Modal from '@/components/ui/Modal'
import ProjectImportDiff from '@/components/ProjectImportDiff'
import { useRequireApproved } from '@/lib/hooks/auth'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'

export default function ProjectImportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: idParam } = use(params)
  const projectId = parseInt(idParam, 10)
  const { user, loading } = useRequireApproved()
  const router = useRouter()
  const showToast = useToast()
  const queryClient = useQueryClient()
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [fileText, setFileText] = useState<string | null>(null)
  const [sourceName, setSourceName] = useState<string | null>(null)
  const [pasteText, setPasteText] = useState('')
  const [dragActive, setDragActive] = useState(false)
  const [confirmedDeleteIds, setConfirmedDeleteIds] = useState<Set<number>>(new Set())
  const [showConfirm, setShowConfirm] = useState(false)

  const previewMutation = useMutation(orpc.projects.previewImport.mutationOptions())
  const applyMutation = useMutation({
    ...orpc.projects.applyImport.mutationOptions(),
    onSuccess: (res) => {
      setShowConfirm(false)
      void queryClient.invalidateQueries({ queryKey: orpc.projects.getById.key() })
      void queryClient.invalidateQueries({ queryKey: orpc.projects.listTasks.key() })
      showToast(
        `Imported: ${res.created} created, ${res.updated} changed, ${res.deleted} deleted`,
        'success',
      )
      router.push(`/projects/${projectId}`)
    },
    onError: (err: unknown) => {
      setShowConfirm(false)
      showToast(err instanceof Error ? err.message : 'Import failed', 'error')
    },
  })

  const diff = previewMutation.data ?? null

  function runPreview(text: string, name: string) {
    setFileText(text)
    setSourceName(name)
    setConfirmedDeleteIds(new Set())
    previewMutation.mutate({ projectId, file: text })
  }

  async function acceptFile(file: File) {
    if (file.size > 2_000_000) {
      showToast('That file is too large to be a project export', 'error')
      return
    }
    const text = await file.text()
    setPasteText('')
    runPreview(text, file.name)
  }

  async function onFileChosen(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (file) await acceptFile(file)
  }

  async function onDrop(e: React.DragEvent) {
    e.preventDefault()
    setDragActive(false)
    const file = e.dataTransfer.files?.[0]
    if (file) await acceptFile(file)
  }

  function toggleDelete(id: number) {
    setConfirmedDeleteIds((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const willApplyChange = useMemo(() => {
    if (!diff) return false
    const nonDeleteChange =
      diff.project.op === 'update' ||
      diff.tasks.some((t) => t.op === 'create' || t.op === 'update') ||
      diff.dependencies.some((d) => d.op !== 'noop')
    const deleteIds = new Set(
      diff.tasks.filter((t) => t.op === 'delete').map((t) => t.identity.id!),
    )
    const willDelete = [...confirmedDeleteIds].some((id) => deleteIds.has(id))
    return nonDeleteChange || willDelete
  }, [diff, confirmedDeleteIds])

  const canConfirm =
    !!diff && !!fileText && diff.errors.length === 0 && willApplyChange && !applyMutation.isPending

  if (loading || !user) return null

  return (
    <main className="container py-5 pb-15">
      <h1 role="heading">Import project changes</h1>
      <p className="text-text-light mb-4">
        Load a project export file. You&apos;ll see exactly what would change before anything is
        written. <Link href={`/projects/${projectId}`}>Back to project</Link>
      </p>

      <div className="bg-surface rounded-xl shadow p-6 mb-4">
        <div
          onDragOver={(e) => {
            e.preventDefault()
            setDragActive(true)
          }}
          onDragLeave={() => setDragActive(false)}
          onDrop={onDrop}
          onClick={() => fileInputRef.current?.click()}
          className={`flex flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed p-8 text-center cursor-pointer transition-colors ${
            dragActive
              ? 'border-primary bg-primary/10'
              : 'border-brand-border hover:border-secondary'
          }`}
        >
          <p className="m-0 font-medium">Drag a project export file here</p>
          <p className="m-0 text-sm text-text-light">or click to choose a .json file</p>
          <input
            id="import-file"
            ref={fileInputRef}
            type="file"
            accept="application/json,.json,application/octet-stream"
            aria-label="Export file"
            className="hidden"
            onChange={onFileChosen}
          />
        </div>

        <div className="mt-4">
          <label htmlFor="import-paste" className="mb-1 block font-medium">
            …or paste the file contents
          </label>
          <textarea
            id="import-paste"
            aria-label="Paste export JSON"
            rows={5}
            className="w-full font-mono text-sm"
            placeholder='{ "project": { … }, "tasks": [ … ] }'
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
          />
          <div className="mt-2">
            <Button
              variant="secondary"
              size="sm"
              disabled={!pasteText.trim() || previewMutation.isPending}
              onClick={() => runPreview(pasteText, 'pasted text')}
            >
              Preview pasted JSON
            </Button>
          </div>
        </div>

        {sourceName && <p className="mt-3 text-sm text-text-light">Loaded from: {sourceName}</p>}
      </div>

      {previewMutation.isPending && <p className="text-text-light">Computing diff…</p>}
      {previewMutation.isError && (
        <p className="text-error">
          {previewMutation.error instanceof Error
            ? previewMutation.error.message
            : 'Could not read that file'}
        </p>
      )}

      {diff && (
        <div className="bg-surface rounded-xl shadow p-6 mb-4">
          <ProjectImportDiff
            diff={diff}
            confirmedDeleteIds={confirmedDeleteIds}
            onToggleDelete={toggleDelete}
          />

          <div className="flex gap-2 mt-6">
            <Button
              onClick={() => setShowConfirm(true)}
              disabled={!canConfirm}
              title={
                diff.errors.length > 0
                  ? 'Fix the errors in the file first'
                  : !willApplyChange
                    ? 'Nothing to apply — no changes, and no deletions ticked'
                    : undefined
              }
            >
              Confirm import
            </Button>
            <Button variant="ghost" href={`/projects/${projectId}`}>
              Cancel
            </Button>
          </div>
        </div>
      )}

      <Modal
        id="confirm-import"
        title="Apply these changes?"
        isOpen={showConfirm}
        onClose={() => setShowConfirm(false)}
      >
        <p className="mb-4 text-sm">
          This applies every change shown, in one step. It cannot be undone automatically.
        </p>
        <div className="flex gap-2">
          <Button
            onClick={() => {
              if (!diff || !fileText) return
              applyMutation.mutate({
                projectId,
                file: fileText,
                expectedHash: diff.meta.currentHash,
                confirmedDeleteIds: [...confirmedDeleteIds],
              })
            }}
            disabled={applyMutation.isPending}
          >
            {applyMutation.isPending ? 'Applying…' : 'Apply changes'}
          </Button>
          <Button variant="ghost" onClick={() => setShowConfirm(false)}>
            Cancel
          </Button>
        </div>
      </Modal>
    </main>
  )
}
