# Attendo — Smart Attendance Monitoring System

QR-based attendance for the BulSU Computer Engineering Department.
Next.js (App Router) · TypeScript · Tailwind · Supabase (Postgres + RLS + Auth + Realtime) · Vercel.

## 1. Set up Supabase

1. Create a project at supabase.com.
2. **SQL Editor → New query →** paste all of `supabase/schema.sql` → **Run**.
   (Idempotent: tables, RLS policies, RPC functions, realtime, and CPE 3A seed data. Safe to re-run.)
3. Copy `.env.example` to `.env.local` and fill in the URL, anon key, service-role key and a demo password
   (**Project Settings → API**).
4. Create demo sign-in accounts for the seeded students/instructors:
   ```bash
   npm install
   npm run seed:users
   ```
   (Or add users manually in **Authentication → Users** using the same e-mails as the seed rows, with *Auto Confirm* on.
   Accounts are linked to students/instructors **by e-mail**.)
5. **Authentication → URL Configuration:** add `http://localhost:3000/reset-password` (and your Vercel URL) to the redirect allow-list so password recovery works.

## 1b. Registration with an e-mailed code (Gmail)

Students and instructors register themselves at `/register` (there is a **Register** button on the login page).
They enter their details, and Supabase e-mails a 6-digit code to the address they gave. They type the code to finish.
Their `students` / `instructors` record is only created after the code is accepted.

Do these once, in order:

1. **SQL Editor →** paste all of `supabase/registration.sql` → **Run** (after `schema.sql`; safe to re-run).
2. **Authentication → Sign In / Providers → Email:** turn **Confirm email ON**. (Leave "Email OTP Length" at 6.)
3. **Authentication → Emails → SMTP Settings:** turn on **Custom SMTP**. Supabase's built-in sender only delivers to your own
   team's addresses and is capped at a few emails per hour, so real students will not get codes without this.
   Using a Gmail account as the sender:
   - Host `smtp.gmail.com`, Port `465`
   - Username: the full Gmail address. Sender email: the same address. Sender name: `Attendo`
   - Password: a Google **App Password** (Google Account → Security → turn on 2-Step Verification → App passwords).
     Do not use your normal Gmail password.
   - Gmail limits a personal account to about 500 emails a day, which is plenty for one class.
4. **Authentication → Emails → Templates → Confirm sign up:** set the subject to `Your Attendo verification code`
   and paste in `supabase/email-template-confirm-signup.html`. It must contain `{{ .Token }}` (the code), not a link.
5. **Authentication → Rate Limits:** raise "Rate limit for sending emails" above the default if a whole class registers at once.
6. **Change the instructor access code** (default `CPE-INSTRUCTOR-2026`):
   `update public.registration_settings set value = 'YOUR-NEW-SECRET-CODE' where key = 'instructor_access_code';`

Notes:
- A student number that is already on the roster (for example the demo `2023101001`) can only be claimed with the e-mail the roster holds for it.
- Anyone can register a student number that is not taken yet. If you need only enrolled students to register, load the real
  class list into `students` first and ask for a change so registration allows roster numbers only.
- The instructor access code is the only thing stopping a student from registering as an instructor, so keep it private.

## 2. Run

```bash
npm run dev        # http://localhost:3000
npm run typecheck
npm run build
```

Demo logins (password = your `DEMO_PASSWORD`):

| Role | Identifier |
|---|---|
| Student | `2023101001` … `2023101015` |
| Instructor | `ricardo.alvarez@attendo-demo.dev` or `lorna.valdez@attendo-demo.dev` |

Try it end to end: sign in as an instructor, launch a session, then in another browser/profile sign in as a student and scan the QR (or type the 6-character code). The student appears in the instructor's grid instantly.

## 3. Deploy to Vercel

Import the repo, set `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY`. Do **not** add the service-role key to Vercel; it is only for the local seed script. Camera access requires HTTPS (Vercel provides it; `localhost` also works).

## 4. Project map

```
supabase/schema.sql              tables · RLS · RPCs · realtime · seed
lib/supabaseClient.ts            Supabase client ("Remember me"-aware storage)
lib/{types,utils,csv,errors,qr-payload,constants}.ts
hooks/use-auth.ts                role-guarded routes     hooks/use-countdown.ts
components/qr-scanner.tsx        camera scan (html5-qrcode) + manual 6-char entry
components/qr-generator.tsx      SVG QR + live rotating-token countdown + projector mode
components/attendance-table.tsx  live grid: search · filter · override · CSV export
components/ui/*                  Button (4 states) · Input · Dialog (shadcn-style)
app/login                        role toggle · remember me · password-recovery modal
app/reset-password               completes the recovery e-mail flow
app/student/dashboard            banner · scanner · verify modal · digital gate slip
app/instructor/dashboard         session launcher · rotating QR · realtime grid
```

## 5. How the security works

- **Students never read `class_sessions`** (it holds the live token). They call `list_open_sessions()`, `verify_token()` and `submit_attendance()`, which are `SECURITY DEFINER` functions that re-check token, expiry, session date/time and duplicates on the server.
- **Students cannot insert attendance rows directly** (no INSERT policy), so a scan can't be forged from the browser console.
- Instructors can only see and edit **their own** sessions and those sessions' logs (RLS).
- Tokens are 6 characters from an unambiguous alphabet, generated with `pgcrypto`, rotated every 60 s (`TOKEN_TTL_SECONDS` in `lib/constants.ts`, default in `schema.sql`), and unique among active sessions.
- Late = scanned more than 15 minutes after `start_time` (edit the interval in `verify_token` / `submit_attendance`). All date/time logic uses `Asia/Manila`.

## 6. Decisions and trade-offs worth knowing

- **Added column:** `class_sessions.token_expires_at` (not in the original spec) so expiry is enforced server-side.
- **"Absent" has no row.** The spec's `status` CHECK only allows Present/Late/Excused, so Absent means "no log". The grid treats every row in `students` as the class roster; choosing Absent deletes the log, and choosing another status inserts/updates it. For multiple sections, add an `enrollments` table and filter the roster by it.
- **Student number sign-in** works by resolving the number to its e-mail with `student_login_email()` (callable before login). That means anyone who knows a student number can learn that student's registered e-mail. If that matters, use institution-issued e-mails as login names instead, or put this lookup behind an Edge Function with rate limiting.
- **Route protection is client-side** (Supabase sessions live in browser storage). Data is protected by RLS regardless of what the UI does.
- **Rate limiting:** a 6-character code is guessable in theory (~10⁹ combinations, but it changes every minute). Enable Supabase Auth rate limits and consider an attempt counter in `verify_token` for production.
- **Colours:** the brief's emerald `#10B981` and red `#EF4444` fail WCAG AA for text and white-on-fill, so `success-strong` (`#047857`) and `danger-strong` (`#B91C1C`) are used for text and solid buttons; the exact brief colours remain for icons, dots and tints.
- A student who verifies at second 59 of a code may need to rescan if it rotates before they tap Confirm; the modal's countdown shows exactly how long they have.
- Demo e-mails use the placeholder domain `attendo-demo.dev`; replace with real addresses before production.
