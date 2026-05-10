import { execSync } from 'child_process'
import { copyFileSync } from 'fs'

function run(cmd: string) {
  execSync(cmd, { stdio: 'inherit' })
}

run('npm run generate')
run('npm run build')

// Seed preview environments with anonymised prod data
const isProduction = process.env.RAILWAY_ENVIRONMENT_NAME === 'production'
const hasB2 = Boolean(process.env.B2_KEY_ID)

if (!isProduction && hasB2) {
  run('npm run fetch-prod-db')
  copyFileSync('db/anonymised_prod.db', 'db/catalyse.db')
}
