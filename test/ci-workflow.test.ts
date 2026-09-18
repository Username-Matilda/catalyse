import { describe, it, expect } from 'vitest'
import fs from 'node:fs'
import path from 'node:path'
import { parse } from 'yaml'

/**
 * Project-specific rules for the GitHub Actions workflows, alongside the generic security
 * audit zizmor runs in CI. Fork PRs run these workflows with a read-only token and no
 * repository secrets, so the workflows must never need either — and nothing they start may
 * reach past the runner. The rules here are the ones a generic tool can't know: which hosts
 * are ours, that a credential-shaped variable must hold a dummy, that no secret is ever wired
 * in at all, and that no event beyond a plain push/PR can start a job.
 */

const WORKFLOW_DIR = path.join(__dirname, '..', '.github', 'workflows')
const ALLOWED_TRIGGERS = ['push', 'pull_request']
const LOCAL_HOSTS = ['localhost', '127.0.0.1']
const CREDENTIAL_NAME = /(KEY|TOKEN|SECRET|PASSWORD|PASS|CREDENTIALS?)$/i

type Yaml = Record<string, unknown>

const workflows = fs
  .readdirSync(WORKFLOW_DIR)
  .filter((f) => /\.ya?ml$/.test(f))
  .map((file) => ({
    file,
    doc: parse(fs.readFileSync(path.join(WORKFLOW_DIR, file), 'utf8')) as Yaml,
  }))

/** Every string value in the tree, with the key path it was found under. */
function strings(node: unknown, at: string[] = []): { at: string; value: string }[] {
  if (typeof node === 'string') return [{ at: at.join('.'), value: node }]
  if (Array.isArray(node)) return node.flatMap((n, i) => strings(n, [...at, String(i)]))
  if (node && typeof node === 'object')
    return Object.entries(node).flatMap(([k, v]) => strings(v, [...at, k]))
  return []
}

/** Every `env` map in the tree (workflow, job and step level), flattened to entries. */
function envEntries(
  node: unknown,
  at: string[] = [],
): { at: string; name: string; value: string }[] {
  if (!node || typeof node !== 'object') return []
  if (Array.isArray(node)) return node.flatMap((n, i) => envEntries(n, [...at, String(i)]))
  return Object.entries(node).flatMap(([k, v]) => {
    if (k === 'env' && v && typeof v === 'object' && !Array.isArray(v))
      return Object.entries(v).map(([name, value]) => ({
        at: [...at, k].join('.'),
        name,
        value: String(value),
      }))
    return envEntries(v, [...at, k])
  })
}

function jobs(doc: Yaml): [string, Yaml][] {
  return Object.entries((doc.jobs ?? {}) as Record<string, Yaml>)
}

describe.each(workflows)('$file', ({ doc }) => {
  it('is started only by pushes and pull requests', () => {
    // `on` may be a string, a list, or a map; normalise to event names.
    const on = doc.on
    const events =
      typeof on === 'string' ? [on] : Array.isArray(on) ? on : Object.keys((on ?? {}) as Yaml)
    for (const event of events) expect(ALLOWED_TRIGGERS).toContain(event)
  })

  it('never references a repository secret', () => {
    for (const { at, value } of strings(doc)) {
      expect(value, `${at} references secrets`).not.toMatch(/secrets\s*\./)
    }
  })

  it('grants only read access to the repository, at the workflow level', () => {
    expect(doc.permissions).toEqual({ contents: 'read' })
    for (const [name, job] of jobs(doc)) {
      expect(job.permissions, `job ${name} sets its own permissions`).toBeUndefined()
    }
  })

  it('runs only on GitHub-hosted runners', () => {
    for (const [name, job] of jobs(doc)) {
      expect(job['runs-on'], `job ${name}`).toMatch(/^(ubuntu|windows|macos)-/)
    }
  })

  it('points every URL-shaped variable at the runner itself', () => {
    for (const { at, name, value } of envEntries(doc)) {
      if (!/URL$/i.test(name)) continue
      // The Postgres URL has no scheme parser-friendly enough for `new URL` in every form;
      // pull the host out of anything that looks like `scheme://[user[:pass]@]host[:port]`.
      const host = value.match(/^[a-z][a-z0-9+.-]*:\/\/(?:[^@/]*@)?([^:/?#]+)/i)?.[1]
      expect(host, `${at}.${name} = ${value}`).toBeDefined()
      expect(LOCAL_HOSTS, `${at}.${name} = ${value}`).toContain(host)
    }
  })

  it('gives every credential-shaped variable a literal dummy value', () => {
    for (const { at, name, value } of envEntries(doc)) {
      if (!CREDENTIAL_NAME.test(name)) continue
      expect(value, `${at}.${name}`).not.toMatch(/\$\{\{/)
    }
  })

  it('keeps service containers on the runner', () => {
    for (const [name, job] of jobs(doc)) {
      for (const [svc, spec] of Object.entries((job.services ?? {}) as Record<string, Yaml>)) {
        for (const [envName, envValue] of Object.entries((spec.env ?? {}) as Yaml)) {
          if (CREDENTIAL_NAME.test(envName))
            expect(String(envValue), `${name}.services.${svc}.env.${envName}`).not.toMatch(/\$\{\{/)
        }
        // A service image is pulled from a registry; make sure it's a plain public tag rather
        // than something authenticated via `credentials:`.
        expect(
          spec.credentials,
          `${name}.services.${svc} uses registry credentials`,
        ).toBeUndefined()
      }
    }
  })
})
