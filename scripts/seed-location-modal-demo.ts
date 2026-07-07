// Seeds db/anonymised_prod.db with two ConfirmLocationModal states:
//   - volunteer@example.com: pre-migration, no country at all (freetext-only
//     location) -> modal shows full country+group picker.
//   - admin@example.com: valid country already set, no localGroup -> modal
//     skips country picker, shows only local-group/city picker.
// See components/ConfirmLocationModal.tsx.
//
// Run: NODE_OPTIONS=--experimental-sqlite npx tsx scripts/seed-location-modal-demo.ts
// Login: volunteer@example.com / volunteer1  OR  admin@example.com / admin1
//
// Idempotent: UPDATE keyed off fixed ids.
import { DatabaseSync } from 'node:sqlite'
import { join } from 'path'

const DB_PATH = join(process.cwd(), 'db', 'anonymised_prod.db')
const VOL = 59 // volunteer@example.com
const ADMIN = 60 // admin@example.com

const db = new DatabaseSync(DB_PATH)

console.log(`Seeding ${DB_PATH}`)

const infoVol = db
  .prepare(
    `UPDATE volunteers
     SET location='London, UK', country=NULL, local_group=NULL, location_confirmed_at=NULL
     WHERE id=?`,
  )
  .run(VOL)
console.log(`  volunteer -> pre-migration, no country: ${infoVol.changes} row(s)`)

const infoAdmin = db
  .prepare(
    `UPDATE volunteers
     SET location='', country='UK', local_group=NULL, location_confirmed_at=NULL
     WHERE id=?`,
  )
  .run(ADMIN)
console.log(`  admin -> valid country, no local group: ${infoAdmin.changes} row(s)`)

db.close()
console.log('Done.')
console.log('  volunteer@example.com / volunteer1  -> full country+group picker')
console.log('  admin@example.com / admin1          -> local group/city only')
