import type { Metadata } from 'next'
import Link from 'next/link'
import LandingCTA from '@/components/LandingCTA'
import { prisma } from '@/lib/prisma'

export const metadata: Metadata = {
  title: 'Volunteer with PauseAI UK',
  description:
    'Catalyse is the volunteer platform for PauseAI UK. Find campaign, policy, organising and creative work that matches your skills.',
}

// The local group list is the only dynamic thing on the page, and it changes
// rarely, so rebuild hourly rather than per request.
export const revalidate = 3600

/**
 * Public landing page.
 *
 * Deliberately contains no project data. Individual projects are only visible
 * to approved volunteers at /projects; this page describes the *kinds* of work
 * the movement does so a prospective volunteer can decide whether to apply.
 */

/**
 * UK local group names, straight from the table the rest of the app filters on.
 * The same rows are already served publicly by the `localGroups.list` procedure,
 * so nothing new is exposed here.
 *
 * Failures are swallowed: the DB may not be reachable when the page is
 * prerendered at build time, and a missing sentence clause is a much better
 * outcome than a failed build. The next revalidation picks the names up.
 */
async function fetchUkLocalGroupNames(): Promise<string[]> {
  try {
    const groups = await prisma.localGroup.findMany({
      where: { country: 'UK' },
      orderBy: { name: 'asc' },
      select: { name: true },
    })
    return groups.map((g) => g.name)
  } catch {
    return []
  }
}

const WORK_AREAS: { title: string; body: string }[] = [
  {
    title: 'Campaigns & protests',
    body: 'Organising demonstrations, planning actions, stewarding on the day and the logistics that hold a public campaign together.',
  },
  {
    title: 'Political engagement',
    body: 'Writing to MPs, preparing briefings for lawmakers, drafting policy proposals and following up after meetings.',
  },
  {
    title: 'Local chapters',
    body: 'Running regular meetups, welcoming new volunteers and starting a chapter where there isn’t one yet.',
  },
  {
    title: 'Events',
    body: 'Conferences, workshops, film screenings, book launches and socials, from finding a venue to running the door.',
  },
  {
    title: 'Communications & media',
    body: 'Social media, newsletters, press outreach and helping people tell their own stories about why this matters to them.',
  },
  {
    title: 'Design & creative',
    body: 'Graphics, placards, video, photography, merchandise and the visual identity that makes a campaign recognisable.',
  },
  {
    title: 'Research & writing',
    body: 'Explainers, fact-checking, literature summaries and turning dense technical material into something a non-specialist can act on.',
  },
  {
    title: 'Software & operations',
    body: 'Internal tools, data and analysis, web work and the unglamorous admin that keeps a volunteer organisation running.',
  },
]

/**
 * Dated, historical wins from https://pauseai.uk/track-record, chosen because each
 * one runs from an ordinary volunteer task to a political or press outcome. They
 * are past events rather than live counts, so they do not go stale. Phrased as
 * sequence rather than causation where the track record only establishes order.
 */
const TRACK_RECORD: { when: string; body: string }[] = [
  {
    when: 'August 2025',
    body: 'Volunteers gathered signatures from over 60 UK politicians on an open letter about Google DeepMind’s safety commitments. TIME broke the story, and Google went on to give the UK AI Safety Institute pre-deployment access to its next frontier model.',
  },
  {
    when: 'December 2025',
    body: 'Volunteers proposed and helped organise a Westminster Hall debate on AI safety, putting the question in front of Parliament directly.',
  },
  {
    when: 'February 2026',
    body: 'Volunteers co-organised the March for AI Safety, the largest protest yet focused solely on AI risk, covered by MIT Technology Review and the Wall Street Journal.',
  },
]

const STEPS: { title: string; body: string }[] = [
  {
    title: 'Apply',
    body: 'Tell us about your connection to PauseAI, what you’re good at and how much time you have. Applications are read by a person, not a filter.',
  },
  {
    title: 'Get matched',
    body: 'Once you’re approved you can see every open project. We highlight the ones that need the skills you listed, so you don’t have to guess where you’re useful.',
  },
  {
    title: 'Contribute',
    body: 'Take on a single task, join a project team or lead a project of your own. If you have an idea we aren’t working on yet, you can propose it.',
  },
]

export default async function LandingPage() {
  const localGroupNames = await fetchUkLocalGroupNames()
  const localGroupList =
    localGroupNames.length > 0
      ? new Intl.ListFormat('en-GB', { style: 'long', type: 'conjunction' }).format(localGroupNames)
      : null

  return (
    <main>
      {/* Hero */}
      <section className="border-b border-brand-border bg-surface">
        <div className="container py-14 md:py-20">
          <div className="max-w-3xl mx-auto md:text-center">
            <p className="font-heading text-sm font-bold uppercase tracking-widest text-primary-dark mb-3">
              PauseAI UK
            </p>
            <h1 className="text-3xl md:text-5xl">Find the work that needs you</h1>
            <p className="text-lg text-text-light mb-8">
              Catalyse is the volunteer platform for PauseAI UK. It connects the people who want to
              help with the projects that need them, matching what you can do to what the movement
              is actually working on right now.
            </p>
            <div className="md:flex md:justify-center">
              <LandingCTA />
            </div>
            <p className="text-sm text-text-light mt-4 mb-0">
              Already applied? <Link href="/login">Log in to check your application status</Link>.
            </p>
          </div>
        </div>
      </section>

      {/* What PauseAI UK is */}
      <section className="container py-12 md:py-16">
        <div className="max-w-3xl">
          <h2>Who we are</h2>
          <p className="text-text-light">
            PauseAI UK is a civic movement working to avert the risks of superhuman artificial
            intelligence. We campaign for binding limits on the development of the most powerful AI
            systems until there is a credible way to make them safe. We do that through public
            campaigning, political engagement and local organising across the UK.
          </p>
          <p className="text-text-light">
            Campaigning works as a chain. Someone drafts a briefing, someone else gets it in front
            of an MP, and months later there is a debate in Parliament or a commitment from a lab
            that was not there before. Almost everything below started as an ordinary task that a
            volunteer picked up.
          </p>
          <p className="text-text-light">
            We are a small staff supported by a large number of volunteers
            {localGroupList ? `, with local groups in ${localGroupList}` : ''}. You do not need a
            technical background, and you do not need to be an expert on AI.
          </p>
          <p className="mb-0">
            <a href="https://pauseai.uk" target="_blank" rel="noopener noreferrer">
              Read more about PauseAI UK →
            </a>
          </p>
        </div>
      </section>

      {/* Kinds of work */}
      <section className="bg-surface border-y border-brand-border">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mb-8">
            <h2>The kinds of things we do</h2>
            <p className="text-text-light mb-0">
              Projects on Catalyse change constantly, but they tend to fall into these areas. Some
              need a few hours once; others need someone to take ownership for months.
            </p>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-5">
            {WORK_AREAS.map((area) => (
              <div
                key={area.title}
                className="bg-brand-bg border border-brand-border rounded-xl p-5"
              >
                <h3 className="text-base mb-2">{area.title}</h3>
                <p className="text-sm text-text-light mb-0">{area.body}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Track record. Answers the "will any of this make a difference?" objection. */}
      <section className="container py-12 md:py-16">
        <div className="max-w-3xl mb-8">
          <h2>Where that work has led</h2>
          <p className="text-text-light mb-0">
            A few things volunteers have done, and what came of them.
          </p>
        </div>
        <ul className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none p-0 m-0 mb-6">
          {TRACK_RECORD.map((item) => (
            <li key={item.when} className="bg-surface border border-brand-border rounded-xl p-6">
              <p className="font-heading text-xs font-bold uppercase tracking-widest text-primary-dark mb-2">
                {item.when}
              </p>
              <p className="text-sm text-text-light mb-0">{item.body}</p>
            </li>
          ))}
        </ul>
        <p className="mb-0">
          <a href="https://pauseai.uk/track-record" target="_blank" rel="noopener noreferrer">
            See the full track record →
          </a>
        </p>
      </section>

      {/* How it works */}
      <section className="bg-surface border-y border-brand-border">
        <div className="container py-12 md:py-16">
          <div className="max-w-3xl mb-8">
            <h2>How Catalyse works</h2>
          </div>
          <ol className="grid grid-cols-1 md:grid-cols-3 gap-5 list-none p-0 m-0">
            {STEPS.map((step, i) => (
              <li
                key={step.title}
                className="bg-brand-bg border border-brand-border rounded-xl p-6"
              >
                <span
                  className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-primary text-[#111827] font-bold mb-3"
                  aria-hidden="true"
                >
                  {i + 1}
                </span>
                <h3 className="text-lg mb-2">
                  <span className="sr-only">Step {i + 1}: </span>
                  {step.title}
                </h3>
                <p className="text-sm text-text-light mb-0">{step.body}</p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      {/* Expectations */}
      <section className="container py-12 md:py-16">
        <div className="max-w-3xl">
          <h2>Before you apply</h2>
          <ul className="text-text-light space-y-2 pl-5 list-disc marker:text-primary">
            <li>
              Applications are reviewed by our team, so there is a short wait before you can see
              open projects. We will email you either way.
            </li>
            <li>
              There is no minimum commitment. Plenty of volunteers contribute an hour here and
              there, and that is genuinely useful.
            </li>
            <li>
              You control what other volunteers can see. Your profile can stay out of the directory
              entirely, and your contact details are never shared without your say-so.
            </li>
            <li>
              Catalyse is for coordinating work. For events, the newsletter and the wider community,
              start at{' '}
              <a href="https://pauseai.uk" target="_blank" rel="noopener noreferrer">
                pauseai.uk
              </a>
              .
            </li>
          </ul>
        </div>
      </section>

      {/* Closing CTA */}
      <section className="container border-t border-brand-border py-14 md:py-20">
        <div className="max-w-2xl">
          <h2>Ready to start?</h2>
          <p className="text-text-light mb-6">
            Tell us what you are good at and we will show you where it is needed.
          </p>
          <LandingCTA />
        </div>
      </section>
    </main>
  )
}
