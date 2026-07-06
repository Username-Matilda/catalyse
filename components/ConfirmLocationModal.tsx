'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Modal from '@/components/ui/Modal'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import { buildLocationOptions, type LocalGroupOption } from '@/lib/filter-options'
import { useAuth } from '@/lib/auth-context'
import { orpc } from '@/lib/orpc'

export default function ConfirmLocationModal() {
  const { user, refreshUser } = useAuth()
  const [dismissed, setDismissed] = useState(false)
  const [location, setLocation] = useState(user?.location ?? '')
  const [locationValue, setLocationValue] = useState(
    user?.country ? `${user.country}${user.localGroup ? `:${user.localGroup}` : ''}` : '',
  )
  const [initialized, setInitialized] = useState(false)

  const { data: localGroupsData } = useQuery({
    ...orpc.localGroups.list.queryOptions({ input: {} }),
    enabled: !!user && !user.locationConfirmedAt,
  })
  const allLocalGroups: LocalGroupOption[] = localGroupsData?.groups ?? []

  const updateMutation = useMutation({
    ...orpc.volunteers.updateMe.mutationOptions(),
    onSuccess: async () => {
      await refreshUser()
    },
  })

  const shouldShow = !!user && !user.locationConfirmedAt && !dismissed

  useEffect(() => {
    if (!shouldShow || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    setLocation(user!.location ?? '')
    setLocationValue(
      user!.country ? `${user!.country}${user!.localGroup ? `:${user!.localGroup}` : ''}` : '',
    )
  }, [shouldShow, initialized, user])

  function handleSubmit() {
    const [country, localGroup] = locationValue.split(':')
    updateMutation.mutate({
      location: location.trim() || null,
      country: country || null,
      localGroup: localGroup || null,
    })
  }

  return (
    <Modal
      id="confirm-location"
      title="Confirm your location"
      isOpen={shouldShow}
      onClose={() => setDismissed(true)}
    >
      <p className="text-text-light mb-4">
        Help us match you with nearby projects and local groups &mdash; confirm your country and, if
        you have one, your local group.
      </p>
      <div className="mb-4">
        <FilterDropdown
          id="confirm-location-value"
          label="Country/Group"
          ariaLabel="Select country/group"
          value={locationValue}
          options={buildLocationOptions(allLocalGroups)}
          onChange={setLocationValue}
          searchable
        />
      </div>
      <div className="mb-5">
        <label htmlFor="confirm-location-city">City / Area</label>
        <input
          type="text"
          id="confirm-location-city"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Shoreditch"
        />
      </div>
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving…' : 'Confirm'}
        </Button>
        <Button variant="secondary" onClick={() => setDismissed(true)}>
          Ask me later
        </Button>
      </div>
    </Modal>
  )
}
