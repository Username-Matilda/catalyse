import path from 'node:path'

export const TEST_DB_DIR = path.resolve(__dirname, '..', 'db', 'vitest')
export const TEMPLATE_DB = path.join(TEST_DB_DIR, 'template.db')
