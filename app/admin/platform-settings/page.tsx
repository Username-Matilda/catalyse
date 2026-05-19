'use client'

import { useRequireSuperAdmin } from '@/lib/hooks/auth'
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { orpc } from '@/lib/orpc'
import { useToast } from '@/lib/toast'
import Toggle from '@/components/Toggle'

export default function PlatformSettingsPage() {
  const { user, loading } = useRequireSuperAdmin()
  const showToast = useToast()
  const queryClient = useQueryClient()

  const { data: settings, isLoading: loadingData } = useQuery({
    ...orpc.admin.platformSettings.get.queryOptions(),
    enabled: !!user?.isSuperAdmin,
  })

  const updateMutation = useMutation({
    ...orpc.admin.platformSettings.update.mutationOptions(),
    onSuccess: () => {
      showToast('Settings saved', 'success')
      void queryClient.invalidateQueries({ queryKey: orpc.admin.platformSettings.get.key() })
    },
    onError: () => showToast('Failed to save settings', 'error'),
  })

  if (loading || loadingData || !user?.isSuperAdmin) return null

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold mb-6">Platform Settings</h1>

      <div className="border border-brand-border rounded-lg p-6">
        <div className="flex items-center justify-between gap-6 mb-3">
          <h2 className="text-lg font-semibold m-0!">Application Approval</h2>
          <Toggle
            checked={settings?.requireApplicationApproval ?? true}
            disabled={updateMutation.isPending}
            onChange={(e) =>
              updateMutation.mutate({ requireApplicationApproval: e.target.checked })
            }
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
