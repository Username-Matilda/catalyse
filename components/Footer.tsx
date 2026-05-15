'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Footer() {
  const [sha, setSha] = useState<string | null>(null)
  const [prNumber, setPrNumber] = useState<number | null>(null)

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => {
        if (d.sha && d.sha !== 'dev') setSha(d.sha.slice(0, 7))
        const match = typeof d.env === 'string' && d.env.match(/^catalyse-pr-(\d+)$/)
        if (match) setPrNumber(parseInt(match[1]))
      })
      .catch(() => {})
  }, [])

  return (
    <footer className="border-t border-brand-border mt-auto py-6 text-sm text-muted">
      <div className="container flex flex-wrap justify-center gap-x-6 gap-y-1">
        <Link href="/privacy" className="underline hover:text-foreground transition-colors">Privacy &amp; Data</Link>
        <a href="mailto:matilda@pauseai.info" className="underline hover:text-foreground transition-colors">Contact</a>
        <a href="https://pauseai.uk" target="_blank" rel="noopener noreferrer" className="underline hover:text-foreground transition-colors">
          PauseAI UK
        </a>
        {prNumber && (
          <a
            href={`https://github.com/Username-Matilda/catalyse/pull/${prNumber}`}
            target="_blank"
            rel="noopener noreferrer"
            className="underline hover:text-foreground transition-colors"
          >
            PR #{prNumber}
          </a>
        )}
        {sha && (
          <span className="font-mono" title={sha}>
            {sha}
          </span>
        )}
      </div>
    </footer>
  )
}
