import { BASE_URL } from './data'

interface SignupOptions {
  applicationMessage?: string
  bio?: string
  discordHandle?: string
  signalNumber?: string
  whatsappNumber?: string
  contactPreference?: string
  contactNotes?: string
  availabilityHoursPerWeek?: string
  location?: string
  country?: string
  localGroup?: string
  otherSkills?: string
  consentMakeProfileVisible?: boolean
  consentContactableByProjectOwners?: boolean
  consentShareContactInfo?: boolean
  emailDigest?: boolean
  skillIds?: number[]
}

export async function apiSignup(
  name: string,
  email: string,
  password: string,
  opts: SignupOptions = {},
): Promise<{ id: number; auth_token: string; email_verification_token?: string }> {
  const resp = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      application_message: opts.applicationMessage,
      bio: opts.bio,
      discord_handle: opts.discordHandle,
      signal_number: opts.signalNumber,
      whatsapp_number: opts.whatsappNumber,
      contact_preference: opts.contactPreference,
      contact_notes: opts.contactNotes,
      availability_hours_per_week: opts.availabilityHoursPerWeek,
      location: opts.location,
      country: opts.country,
      local_group: opts.localGroup,
      other_skills: opts.otherSkills,
      consent_make_profile_visible_in_directory: opts.consentMakeProfileVisible ?? true,
      consent_contactable_by_project_owners: opts.consentContactableByProjectOwners ?? true,
      consent_share_contact_info_with_project_owner: opts.consentShareContactInfo,
      email_digest: opts.emailDigest,
      skill_ids: opts.skillIds,
    }),
  })
  if (!resp.ok) throw new Error(`Signup failed for ${email}: ${await resp.text()}`)
  return resp.json()
}

export async function apiVerifyEmail(token: string): Promise<void> {
  await fetch(`${BASE_URL}/api/auth/verify-email`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ token }),
  })
}
