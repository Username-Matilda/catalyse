import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
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
        destination: '/admin/starter-tasks',
        permanent: false,
      },
      { source: '/static/admin/stats.html', destination: '/admin/stats', permanent: false },
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
      { source: '/static/starter-tasks.html', destination: '/starter-tasks', permanent: false },
      { source: '/static/suggest.html', destination: '/suggest', permanent: false },
      { source: '/static/volunteers.html', destination: '/volunteers', permanent: false },
    ]
  },
}

export default nextConfig
