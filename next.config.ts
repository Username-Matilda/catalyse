import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  async redirects() {
    return [
      // Dynamic routes — id was a query param in the old HTML version
      {
        source: '/static/volunteer.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/volunteers/:id',
        permanent: true,
      },
      {
        source: '/static/project.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/projects/:id',
        permanent: true,
      },
      {
        source: '/static/edit-project.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/projects/:id/edit',
        permanent: true,
      },
      {
        source: '/static/admin/volunteer-detail.html',
        has: [{ type: 'query', key: 'id', value: '(?<id>.+)' }],
        destination: '/admin/volunteers/:id',
        permanent: true,
      },
      // Fallback for dynamic routes without an id
      { source: '/static/volunteer.html', destination: '/volunteers', permanent: true },
      { source: '/static/project.html', destination: '/dashboard', permanent: true },
      { source: '/static/edit-project.html', destination: '/dashboard', permanent: true },
      { source: '/static/admin/volunteer-detail.html', destination: '/admin/triage', permanent: true },
      // Static routes
      { source: '/static/index.html', destination: '/', permanent: true },
      { source: '/static/accept-invite.html', destination: '/accept-invite', permanent: true },
      { source: '/static/admin/bugs.html', destination: '/admin/bugs', permanent: true },
      { source: '/static/admin/create-project.html', destination: '/admin/projects/new', permanent: true },
      { source: '/static/admin/skills.html', destination: '/admin/skills', permanent: true },
      { source: '/static/admin/starter-tasks.html', destination: '/admin/starter-tasks', permanent: true },
      { source: '/static/admin/stats.html', destination: '/admin/stats', permanent: true },
      { source: '/static/admin/team.html', destination: '/admin/team', permanent: true },
      { source: '/static/admin/triage.html', destination: '/admin/triage', permanent: true },
      { source: '/static/dashboard.html', destination: '/dashboard', permanent: true },
      { source: '/static/forgot-password.html', destination: '/forgot-password', permanent: true },
      { source: '/static/login.html', destination: '/login', permanent: true },
      { source: '/static/privacy.html', destination: '/privacy', permanent: true },
      { source: '/static/profile.html', destination: '/profile', permanent: true },
      { source: '/static/reset-password.html', destination: '/reset-password', permanent: true },
      { source: '/static/settings.html', destination: '/settings', permanent: true },
      { source: '/static/signup.html', destination: '/signup', permanent: true },
      { source: '/static/starter-tasks.html', destination: '/starter-tasks', permanent: true },
      { source: '/static/suggest.html', destination: '/suggest', permanent: true },
      { source: '/static/volunteers.html', destination: '/volunteers', permanent: true },
    ]
  },
}

export default nextConfig
