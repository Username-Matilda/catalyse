# Self-improvement backlog

Each entry starts with a count of how many times the problem has been hit. The
list is **sorted by that count, highest first** — the top of the file is what
this repo pays for most often, and that is the order to fix things in.

An entry is one problem with one fix. When you hit something, look below
first. Bump an entry's count (`1x` → `2x`) only where its fix, had it been
made, would have prevented what you just hit; add what the new instance
taught, and move the entry up to its place. Anything else is a new entry at
`1x`, at the end of the `1x` run, however much it resembles one already here
— a resemblance is not a recurrence, and a count that grows on resemblance
puts a family of small problems above the one the repo pays for most. An
entry whose remedy has landed comes off the list.

Entries live under a heading per count (`## 2x`, `## 1x`), highest first, each
a checkbox whose bold opening sentence names the problem and whose rest names
the fix:

```markdown
## 1x

- [ ] **One sentence naming the problem.** What it cost, and the change to
      the repo that would have prevented it.
```

This is not the issue tracker. A bug or feature in the product belongs in a
GitHub issue. An entry here is about the work itself: something in the code
structure, tooling, tests, docs or diagnostics that made a task slower or more
confusing than it needed to be, and that will do so again.

## 2x

- [ ] **A `null`-target guard written for a dialog's confirm or dismiss handler
      is unreachable, and 100% statement coverage only says so after a full
      unit run.** Five confirm-dialog call sites, then the approval welcome's
      dismiss handler, each needed rewriting once the coverage gate rejected
      them, and a handler wired only to Escape or the close button stays
      uncovered until a test presses it. The pattern that has no unreachable
      line — render the dialog inside `{target && (…)}` and read the target in
      the handler closure — belongs in `AGENTS.md` next to the coverage rules,
      and in `components/ui/ConfirmDialog.tsx`'s own usage note.

## 1x

- [ ] **Component tests count error toasts (`getAllByText(msg).length`), and a
      toast dismisses itself after 4 s, so the count never arrives when the
      full suite runs slowly.** `app/quick-tasks/page.test.tsx` failed that way
      in a `check-all` run and cost a second full run; the same pattern is in
      `app/projects/[id]/page.test.tsx` and `components/ProjectEditor.test.tsx`.
      A shared helper in `test/` that finds a toast by text, clicks its Dismiss
      and waits for it to go (the `expectNotFound` helper in the Quick Tasks
      test) would let each step wait for a toast of its own.
- [ ] **After a client-side redirect, `window.location` can still hold the old address
      while the new page first renders, and jsdom tests never show it.** A `useState`
      initializer that read `?notice=` passed every unit test and showed nothing in the
      browser; only an e2e run caught it. The one note on this sat in a comment inside
      `app/dashboard/page.tsx`. Reading query parameters through one hook
      (`lib/hooks/useOneTimeNotice.ts` reads on mount) and a line in `AGENTS.md` would stop
      the next page repeating it.
- [ ] **Races that only show under full-suite load surface one per `check-all` run,
      and each costs another run of up to ten minutes.** `ProjectEditor.test.tsx`
      failed in three different ways across four runs (a 5 s database poll, a title
      long enough to start autosave, then a real bug where edits made during the
      first autosave were dropped), and e2e `01` reloaded before a background
      mark-read landed. Each passed 8/8 when run alone. A script that reruns one
      file under the same parallel load (for example all unit files at once with
      only the suspect repeated) would find them in one pass instead of one per
      full run.
