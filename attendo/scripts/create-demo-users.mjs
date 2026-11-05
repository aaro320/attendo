// Creates Supabase Auth users for every student / instructor in the seed data.
// Run AFTER supabase/schema.sql:   npm run seed:users
// Needs NEXT_PUBLIC_SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in .env.local.
import { createClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY
const password = process.env.DEMO_PASSWORD

if (!url || !serviceKey || !password) {
  console.error('Set NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY and DEMO_PASSWORD in .env.local')
  process.exit(1)
}
if (password.length < 8) {
  console.error('DEMO_PASSWORD must be at least 8 characters.')
  process.exit(1)
}

const admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })

const [{ data: students, error: e1 }, { data: instructors, error: e2 }] = await Promise.all([
  admin.from('students').select('email'),
  admin.from('instructors').select('email'),
])
if (e1 || e2) {
  console.error('Could not read students/instructors. Did you run schema.sql?', (e1 ?? e2).message)
  process.exit(1)
}

const emails = [...(students ?? []), ...(instructors ?? [])].map((r) => r.email)
let created = 0
let skipped = 0

for (const email of emails) {
  const { error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (!error) {
    created += 1
    console.log(`created  ${email}`)
  } else if (/already|registered|exists/i.test(error.message)) {
    skipped += 1
    console.log(`exists   ${email}`)
  } else {
    console.error(`failed   ${email}: ${error.message}`)
  }
}

console.log(`\nDone. ${created} created, ${skipped} already existed. All demo accounts use DEMO_PASSWORD.`)
