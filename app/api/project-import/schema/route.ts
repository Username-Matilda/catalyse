import { projectImportJsonSchema } from '@/lib/project-porting-docs'

/**
 * The import file's JSON Schema, generated from the zod schema the importer actually
 * validates against. Served rather than checked in so the two cannot drift apart, and
 * public so an assistant or an editor can fetch it from the `$schema` key on an export.
 */
export function GET() {
  return Response.json(projectImportJsonSchema(), {
    headers: { 'Cache-Control': 'public, max-age=3600' },
  })
}
