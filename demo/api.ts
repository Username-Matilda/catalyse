import { BASE_URL } from './data'

export async function apiSignup(
  name: string,
  email: string,
  password: string,
  applicationMessage?: string,
): Promise<{ id: number; auth_token: string; email_verification_token?: string }> {
  const resp = await fetch(`${BASE_URL}/api/auth/signup`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      name,
      email,
      password,
      application_message: applicationMessage,
      consent_make_profile_visible_in_directory: true,
      consent_contactable_by_project_owners: true,
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
