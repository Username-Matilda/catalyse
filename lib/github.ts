import { env } from '@/lib/env'

type CreateGithubIssueInput = {
  title: string
  description: string
  category: string | null
  severity: string | null
  pageUrl: string | null
}

/**
 * Creates a GitHub issue from non-PII bug report fields. No-ops (returns null)
 * when GITHUB_TOKEN isn't configured — the platform ships without GitHub sync
 * until an admin sets one up.
 */
export async function createGithubIssue(input: CreateGithubIssueInput): Promise<string | null> {
  if (!env.GITHUB_TOKEN) return null

  const bodyLines = [
    input.description,
    '',
    `**Category:** ${input.category ?? 'bug'}`,
    `**Severity:** ${input.severity ?? 'medium'}`,
    input.pageUrl ? `**Page:** ${input.pageUrl}` : null,
    '',
    '_Filed automatically from a bug report submitted on the platform._',
  ].filter((line) => line !== null)

  try {
    const res = await fetch(`https://api.github.com/repos/${env.GITHUB_REPO}/issues`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${env.GITHUB_TOKEN}`,
        Accept: 'application/vnd.github+json',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        title: input.title,
        body: bodyLines.join('\n'),
        labels: [input.category ?? 'bug'],
      }),
    })

    if (!res.ok) {
      console.error('[GITHUB ISSUE ERROR]', res.status, await res.text())
      return null
    }

    const issue = (await res.json()) as { html_url: string }
    return issue.html_url
  } catch (e) {
    console.error('[GITHUB ISSUE ERROR]', e)
    return null
  }
}
