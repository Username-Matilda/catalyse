'use client'

import { useCallback, useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useAuth } from '@/lib/auth-context'
import { client } from '@/lib/client'
import { useToast } from '@/lib/toast'
import Toggle from '@/components/Toggle'

interface PlatformSettings {
  requireApplicationApproval: boolean
}

export default function PlatformSettingsPage() {
  const router = useRouter()
  const { user, loading } = useAuth()
  const showToast = useToast()
  const [settings, setSettings] = useState<PlatformSettings | null>(null)
  const [loadingData, setLoadingData] = useState(true)
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    if (!loading && !user) router.push('/login')
    if (!loading && user && !user.isSuperAdmin) router.push('/')
  }, [user, loading, router])

  const loadSettings = useCallback(async () => {
    try {
      const data = await client.admin.platformSettings.get()
      setSettings(data as unknown as PlatformSettings)
    } catch {
      showToast('Failed to load settings', 'error')
    } finally {
      setLoadingData(false)
    }
  }, [showToast])

  useEffect(() => {
    // loadSettings is async; setState calls inside it are deferred past the
    // await boundary. The rule can't trace async call graphs so flags this as a
    // false positive.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (user?.isSuperAdmin) loadSettings()
  }, [user, loadSettings])

  async function handleToggle(value: boolean) {
    if (!settings) return
    setSaving(true)
    try {
      const updated = await client.admin.platformSettings.update({
        requireApplicationApproval: value,
      })
      setSettings(updated as unknown as PlatformSettings)
      showToast('Settings saved', 'success')
    } catch {
      showToast('Failed to save settings', 'error')
    } finally {
      setSaving(false)
    }
  }

  if (loading || loadingData || !user?.isSuperAdmin) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Platform Settings</h1>

      <div className="border border-brand-border rounded-lg p-6">
        <div className="flex items-center justify-between gap-6 mb-3">
          <h2 className="text-lg font-semibold m-0!">Application Approval</h2>
          <Toggle
            checked={settings?.requireApplicationApproval ?? true}
            disabled={saving}
            onChange={(e) => handleToggle(e.target.checked)}
          />
        </div>
        <p className="text-[var(--text-light)] text-sm">
          When enabled, new volunteers must be reviewed and approved by an admin before gaining
          access. When disabled, volunteers are automatically approved after verifying their email.
        </p>
      </div>
    </div>
  )
}
