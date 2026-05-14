'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'

export default function Footer() {
  const [sha, setSha] = useState<string | null>(null)

  useEffect(() => {
    fetch('/api/version')
      .then(r => r.json())
      .then(d => {
        if (d.sha && d.sha !== 'dev') setSha(d.sha.slice(0, 7))
      })
      .catch(() => {})
  }, [])

  return (
    <footer className="border-t border-brand-border mt-auto py-6 text-sm text-muted">
      <div className="container flex flex-wrap justify-center gap-x-6 gap-y-1">
        <Link href="/privacy" className="hover:text-foreground transition-colors">
          Privacy &amp; Data
        </Link>
        <a
          href="mailto:matilda@pauseai.info"
          className="hover:text-foreground transition-colors"
        >
          Contact
        </a>
        <a
          href="https://pauseai.uk"
          target="_blank"
          rel="noopener noreferrer"
          className="hover:text-foreground transition-colors"
        >
          PauseAI UK
        </a>
        {sha && (
          <span className="font-mono" title={sha}>
            {sha}
          </span>
        )}
      </div>
    </footer>
  )
}
