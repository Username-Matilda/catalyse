'use client'

import { useEffect, useState } from 'react'
import { useQuery, useMutation } from '@tanstack/react-query'
import Modal from '@/components/ui/Modal'
import Button from '@/components/Button'
import FilterDropdown from '@/components/FilterDropdown'
import {
  BASE_LOCATION_OPTIONS,
  COUNTRY_OPTIONS,
  NO_LOCAL_GROUP,
  buildLocalGroupOptionsForCountry,
  type LocalGroupOption,
} from '@/lib/filter-options'
import { useAuth } from '@/lib/auth-context'
import { useLocationModal } from '@/lib/location-modal-context'
import { orpc } from '@/lib/orpc'

export default function ConfirmLocationModal() {
  const { user, refreshUser } = useAuth()
  const { open, hide } = useLocationModal()
  const [location, setLocation] = useState(user?.location ?? '')
  const [countryValue, setCountryValue] = useState(user?.country ?? '')
  const [localGroupValue, setLocalGroupValue] = useState(user?.localGroup ?? '')
  const [initialized, setInitialized] = useState(false)

  const hasValidCountry =
    !!user?.country && BASE_LOCATION_OPTIONS.some((o) => o.value === user.country)
  const effectiveCountry = hasValidCountry ? user!.country! : countryValue
  const showCityInput = localGroupValue === NO_LOCAL_GROUP

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

  const shouldShow = !!user && !user.locationConfirmedAt && open

  useEffect(() => {
    if (!shouldShow || initialized) return
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setInitialized(true)
    setLocation(user!.location ?? '')
    setCountryValue(user!.country ?? '')
    setLocalGroupValue(user!.localGroup ?? '')
  }, [shouldShow, initialized, user])

  function handleCountryChange(value: string) {
    setCountryValue(value)
    setLocalGroupValue('')
  }

  function handleSubmit() {
    updateMutation.mutate({
      location: location.trim() || null,
      country: effectiveCountry || null,
      localGroup: localGroupValue && localGroupValue !== NO_LOCAL_GROUP ? localGroupValue : null,
    })
  }

  return (
    <Modal id="confirm-location" title="Confirm your location" isOpen={shouldShow} onClose={hide}>
      <p className="text-text-light mb-4">
        Help us match you with nearby projects and local groups.
      </p>
      {!hasValidCountry && (
        <div className="mb-4">
          <FilterDropdown
            id="confirm-location-country"
            label="Country"
            ariaLabel="Select country"
            value={countryValue}
            options={COUNTRY_OPTIONS}
            onChange={handleCountryChange}
            searchable
          />
        </div>
      )}
      {effectiveCountry && (
        <div className="mb-4">
          <FilterDropdown
            id="confirm-location-group"
            label={hasValidCountry ? `Local group (${effectiveCountry})` : 'Local group'}
            ariaLabel="Select local group"
            value={localGroupValue}
            options={buildLocalGroupOptionsForCountry(effectiveCountry, allLocalGroups)}
            onChange={setLocalGroupValue}
            searchable
          />
        </div>
      )}
      {showCityInput && (
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
      )}
      <div className="flex items-center gap-3">
        <Button onClick={handleSubmit} disabled={updateMutation.isPending}>
          {updateMutation.isPending ? 'Saving…' : 'Confirm'}
        </Button>
        <Button variant="secondary" onClick={hide}>
          Ask me later
        </Button>
      </div>
    </Modal>
  )
}
