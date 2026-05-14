import { FilterOption } from '@/components/FilterDropdown'

export interface LocalGroupOption {
  name: string
  country: string
}

export const BASE_LOCATION_OPTIONS: FilterOption[] = [
  { value: '', label: 'Any country' },
  { value: 'Remote', label: 'Remote' },
  { value: 'Australia', label: 'Australia' },
  // { value: 'Austria', label: 'Austria' },
  { value: 'Belgium', label: 'Belgium' },
  // { value: 'Brazil', label: 'Brazil' },
  { value: 'Canada', label: 'Canada' },
  { value: 'Czech Republic', label: 'Czech Republic' },
  // { value: 'Denmark', label: 'Denmark' },
  // { value: 'Finland', label: 'Finland' },
  { value: 'France', label: 'France' },
  { value: 'Germany', label: 'Germany' },
  // { value: 'India', label: 'India' },
  // { value: 'Ireland', label: 'Ireland' },
  { value: 'Italy', label: 'Italy' },
  // { value: 'Japan', label: 'Japan' },
  { value: 'Kenya', label: 'Kenya' },
  // { value: 'Mexico', label: 'Mexico' },
  { value: 'Netherlands', label: 'Netherlands' },
  // { value: 'New Zealand', label: 'New Zealand' },
  { value: 'Nigeria', label: 'Nigeria' },
  // { value: 'Norway', label: 'Norway' },
  { value: 'Poland', label: 'Poland' },
  // { value: 'Portugal', label: 'Portugal' },
  { value: 'Romania', label: 'Romania' },
  { value: 'Serbia', label: 'Serbia' },
  // { value: 'Singapore', label: 'Singapore' },
  // { value: 'South Korea', label: 'South Korea' },
  { value: 'Spain', label: 'Spain' },
  { value: 'Sweden', label: 'Sweden' },
  // { value: 'Switzerland', label: 'Switzerland' },
  { value: 'UK', label: 'UK' },
  // { value: 'US', label: 'US' },
  { value: 'Other', label: 'Other' },
]

export function buildLocationOptions(groups: LocalGroupOption[]): FilterOption[] {
  const result: FilterOption[] = []
  for (const option of BASE_LOCATION_OPTIONS) {
    result.push(option)
    if (!option.indent && option.value) {
      const countryGroups = groups.filter((g) => g.country === option.value)
      for (const g of countryGroups) {
        result.push({ value: `${option.value}:${g.name}`, label: `${option.value} - ${g.name}`, indent: true })
      }
    }
  }
  return result
}

export const COUNTRY_OPTIONS: FilterOption[] = [
  { value: '', label: 'Select…' },
  ...BASE_LOCATION_OPTIONS.filter((o) => o.value !== '' && !o.indent),
]
