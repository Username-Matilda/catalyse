import type { MetadataRoute } from 'next'
import { env } from '@/lib/env'

export default function sitemap(): MetadataRoute.Sitemap {
  const routes = ['', '/login', '/signup', '/forgot-password', '/privacy', '/local-groups']

  return routes.map((route) => ({
    url: `${env.APP_URL}${route}`,
    lastModified: new Date(),
  }))
}
