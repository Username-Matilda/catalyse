import type { NextConfig } from 'next'

// Google Sign-In loads its client script and renders its button in an iframe from
// accounts.google.com; everything else is same-origin. 'unsafe-inline' stays in
// script-src because Next.js injects inline bootstrap/flight scripts without a nonce —
// the CSP still stops any third-party script host.
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' https://accounts.google.com",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https://*.googleusercontent.com",
  "font-src 'self' data:",
  "connect-src 'self' https://accounts.google.com",
  "frame-src 'self' https://accounts.google.com",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
].join('; ')

const securityHeaders = [
  { key: 'Content-Security-Policy', value: CSP },
  { key: 'X-Content-Type-Options', value: 'nosniff' },
  { key: 'X-Frame-Options', value: 'DENY' },
  { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
  { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
  {
    key: 'Strict-Transport-Security',
    value: 'max-age=63072000; includeSubDomains; preload',
  },
]

const nextConfig: NextConfig = {
  async headers() {
    return [{ source: '/:path*', headers: securityHeaders }]
  },

  async redirects() {
    return [
      // Dynamic routes — id was a query param in the old HTML version
      {
        source: '/static/volunteer.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/volunteers/:id',
        permanent: false,
      },
      {
        source: '/static/project.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/projects/:id',
        permanent: false,
      },
      {
        source: '/static/edit-project.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/projects/:id/edit',
        permanent: false,
      },
      {
        source: '/static/admin/volunteer-detail.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/admin/volunteers/:id',
        permanent: false,
      },
      // Fallback for dynamic routes without an id
      { source: '/static/volunteer.html', destination: '/volunteers', permanent: false },
      { source: '/static/project.html', destination: '/dashboard', permanent: false },
      { source: '/static/edit-project.html', destination: '/dashboard', permanent: false },
      {
        source: '/static/admin/volunteer-detail.html',
        destination: '/admin/triage',
        permanent: false,
      },
      // Static routes
      { source: '/static/index.html', destination: '/', permanent: false },
      { source: '/static/accept-invite.html', destination: '/accept-invite', permanent: false },
      { source: '/static/admin/bugs.html', destination: '/admin/bugs', permanent: false },
      {
        source: '/static/admin/create-project.html',
        destination: '/admin/projects/new',
        permanent: false,
      },
      { source: '/static/admin/skills.html', destination: '/admin/skills', permanent: false },
      {
        source: '/static/admin/starter-tasks.html',
        destination: '/quick-tasks',
        permanent: false,
      },
      { source: '/admin/starter-tasks', destination: '/quick-tasks', permanent: false },
      { source: '/static/admin/stats.html', destination: '/admin', permanent: false },
      { source: '/static/admin/team.html', destination: '/admin/team', permanent: false },
      { source: '/static/admin/triage.html', destination: '/admin/triage', permanent: false },
      { source: '/static/dashboard.html', destination: '/dashboard', permanent: false },
      { source: '/static/forgot-password.html', destination: '/forgot-password', permanent: false },
      { source: '/static/login.html', destination: '/login', permanent: false },
      { source: '/static/privacy.html', destination: '/privacy', permanent: false },
      { source: '/static/profile.html', destination: '/profile', permanent: false },
      { source: '/static/reset-password.html', destination: '/reset-password', permanent: false },
      { source: '/static/settings.html', destination: '/settings', permanent: false },
      { source: '/static/signup.html', destination: '/signup', permanent: false },
      { source: '/static/starter-tasks.html', destination: '/quick-tasks', permanent: false },
      { source: '/starter-tasks', destination: '/quick-tasks', permanent: false },
      { source: '/starter-tasks/:path*', destination: '/quick-tasks/:path*', permanent: false },
      { source: '/static/suggest.html', destination: '/suggest', permanent: false },
      { source: '/static/volunteers.html', destination: '/volunteers', permanent: false },
    ]
  },
}

export default nextConfig
