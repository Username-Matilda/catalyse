# Data model vs. shareable URLs

Goal: every record in the data model should have a URI that a volunteer/admin can copy and send to a colleague, landing them on a view of that specific record. This is an audit of `prisma/schema.prisma` against `app/**/page.tsx` to see where that holds and where it doesn't.

## Has a real, shareable detail URL

| Model                            | URL                                             | Notes                                                                    |
| -------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------ |
| `WorkItem` (type `PROJECT`)      | `/projects/[id]`                                | Also `/projects/[id]/edit`.                                              |
| `WorkItem` (type `STARTER_TASK`) | `/starter-tasks/[id]`                           | Public detail page exists.                                               |
| `Volunteer`                      | `/volunteers/[id]` and `/admin/volunteers/[id]` | Two views of the same record, both address by id — fine.                 |
| `Volunteer` (as an application)  | `/admin/applications/[id]`                      | `id` here is the volunteer id.                                           |
| `PlatformSettings`               | `/admin/platform-settings`                      | Singleton row (`id` is always `1`), no id in URL needed — correct as-is. |

## Token-addressed, not id-addressed (expected — these are one-time secrets)

| Model                    | URL                       | Notes                                                              |
| ------------------------ | ------------------------- | ------------------------------------------------------------------ |
| `PasswordResetToken`     | `/reset-password?token=…` | Ephemeral, single-use by design. Query-param token is appropriate. |
| `EmailVerificationToken` | `/verify-email?token=…`   | Same.                                                              |
| `AdminInvite`            | `/accept-invite?token=…`  | Same.                                                              |

These are fine as-is — they're deliberately not stable/guessable ids, so a query-string token rather than a REST-style `/id` route is the right call here.

## Has a UI, but no addressable URL

These records are only reachable through client-side modal state (`useState`) inside a list page. Closing the tab or refreshing loses your place, and there's nothing to copy into a message to a colleague — you can only say "go to the X list and find Y yourself."

| Model                    | Where it lives                                                           | What's missing                                                                                                                                                     |
| ------------------------ | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BugReport`              | `/admin/bugs` (edit modal keyed by local state)                          | No `/admin/bugs/[id]`.                                                                                                                                             |
| `LocalGroup`             | `/admin/local-groups` (edit modal)                                       | No `/admin/local-groups/[id]`.                                                                                                                                     |
| `LocalGroupSuggestion`   | `/admin/local-groups` (review modal)                                     | No detail URL; can't link a colleague to "review this specific suggestion."                                                                                        |
| `Skill`                  | `/admin/skills` (edit modal)                                             | No detail URL.                                                                                                                                                     |
| `SkillCategory`          | `/admin/skills` (edit modal)                                             | No detail URL.                                                                                                                                                     |
| `WorkItemInterest`       | Inline in `/projects/[id]` and `/admin/triage` (no dedicated modal even) | No way to link directly to a specific expression of interest.                                                                                                      |
| `WorkItem` (type `TASK`) | Inline list inside `/projects/[id]`, no anchor id on the `<li>`          | Can't deep-link to one task within a project — only to the project as a whole.                                                                                     |
| `WorkItemComment`        | `CommentThread` component, rendered inline                               | No id/anchor on individual comments — can't link "see this specific comment."                                                                                      |
| `Notification`           | Dashboard list only                                                      | No `/notifications/[id]`; the record's own `link` field points elsewhere, but there's no URL _for the notification itself_.                                        |
| `Message`                | Send-only (`orpc.messages.send` from the project contact form)           | The `messages.list` procedure exists server-side but nothing in the UI reads it — there is no inbox view at all, so this is a gap even before URLs are considered. |
| `SkillEndorsement`       | No UI found anywhere (not even a list)                                   | Same as above — a viewing gap, not just a URL gap.                                                                                                                 |
| `AdminNote`              | No dedicated UI found                                                    | Same.                                                                                                                                                              |
| `DigestRun`              | No UI (backend-only, written by `jobs/digest.ts`)                        | Arguably fine — this is an operational log, not a user-facing record.                                                                                              |

## Found one real inconsistency: two different URL schemes for the same entity

`app/admin/starter-tasks/page.tsx` has a "copy link" action for starter tasks:

```ts
function copyLink(taskId: number) {
  const url = `${window.location.origin}/starter-tasks#task-${taskId}`
  ...
}
```

This builds `/starter-tasks#task-{id}` — a URL fragment pointing at an anchor that **doesn't exist** in `app/starter-tasks/page.tsx` (no element has `id="task-{id}"`), so the copied link doesn't actually scroll to anything. Meanwhile the _same_ `WorkItem` (type `STARTER_TASK`) already has a working canonical detail route at `/starter-tasks/[id]` (linked from the public list page). The copy-link feature should just build `${origin}/starter-tasks/${taskId}` instead of inventing a second, broken addressing scheme.

## Records that plausibly don't need a URL

These are either internal/compliance-only or pure join tables, so a shareable URL doesn't make sense for them:

- `WorkItemSkill`, `VolunteerSkill` — join tables, addressed via their parent records.
- `SchemaMigration` — explicitly `@@ignore`d from Prisma Client, infra-only.
- `RejectedApplication`, `AnonymisedEmail`, `DeletionRequest` — GDPR/compliance bookkeeping, not meant to be browsed or shared.

## Summary

The two "primary" entities in the product — projects and starter tasks — plus volunteers and applications have solid, working detail URLs. Everything admin-facing that's implemented as a list-plus-modal (bug reports, local groups/suggestions, skills/categories) has no addressable URL, so nothing in those admin screens can be linked to a colleague directly; the best you can do is link the list and ask them to find the row. Tasks (as opposed to projects) and comments are nested inside a project and have no id-level addressing at all. Messages and skill endorsements don't have a _view_ yet, which is a prerequisite gap before a URL question is even reachable. The starter-tasks copy-link button is a concrete, fixable bug: it generates a URL that doesn't work when a correct one already exists one line away.
