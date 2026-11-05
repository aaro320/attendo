-- =====================================================================
-- Attendo: Smart Attendance Monitoring System
-- Bulacan State University - Computer Engineering Department
--
-- Paste this whole script into Supabase > SQL Editor > New query > Run.
-- It is idempotent: safe to re-run (tables, functions and policies are
-- created only if missing / replaced; seed data is skipped if present).
--
-- Sections
--   1. Extensions
--   2. Tables + indexes
--   3. Identity helper functions
--   4. Row Level Security policies
--   5. RPC functions (token rotation, verify, submit attendance)
--   6. Grants
--   7. Realtime
--   8. Seed data (BulSU CPE 3A)
--
-- Time zone note: every "today" / "now" decision is made in Asia/Manila,
-- because the database itself runs in UTC.
-- =====================================================================

-- 1. EXTENSIONS ------------------------------------------------------
create extension if not exists pgcrypto with schema extensions;

-- 2. TABLES ----------------------------------------------------------
create table if not exists public.students (
  student_num  varchar(20)  primary key,
  name         varchar(100) not null,
  email        varchar(100) unique not null,
  created_at   timestamptz  default now()
);

create table if not exists public.instructors (
  instructor_id varchar(20)  primary key,
  name          varchar(100) not null,
  email         varchar(100) unique not null,
  created_at    timestamptz  default now()
);

create table if not exists public.class_sessions (
  session_id       bigserial    primary key,
  instructor_id    varchar(20)  references public.instructors(instructor_id) on delete cascade,
  subject          varchar(100) not null,   -- e.g. 'CPE 301 - Differential Equation'
  room             varchar(50)  not null,
  session_date     date         not null default current_date,
  start_time       time         not null,
  end_time         time         not null,
  active_token     varchar(255) not null,   -- 6-char code, rotated every ~60 s while active
  is_active        boolean      default true,
  created_at       timestamptz  default now(),
  -- Additive column (not in the original spec): lets the server enforce token expiry.
  token_expires_at timestamptz,
  constraint chk_session_time_order check (end_time > start_time)
);

create table if not exists public.attendance_logs (
  log_id        bigserial    primary key,
  session_id    bigint       references public.class_sessions(session_id) on delete cascade,
  student_num   varchar(20)  references public.students(student_num)      on delete cascade,
  date_scanned  date         not null default current_date,
  time_scanned  time         not null default current_time,
  status        varchar(20)  not null check (status in ('Present', 'Late', 'Excused')),
  created_at    timestamptz  default now(),
  constraint unique_student_session_scan unique (session_id, student_num)
);

create index if not exists idx_sessions_instructor_date on public.class_sessions (instructor_id, session_date desc);
create index if not exists idx_logs_session             on public.attendance_logs (session_id);
create index if not exists idx_logs_student             on public.attendance_logs (student_num);
-- Two live sessions can never share a code, so a manually typed code is unambiguous.
create unique index if not exists uq_active_token on public.class_sessions (active_token) where is_active;

-- 3. IDENTITY HELPERS ------------------------------------------------
-- Supabase Auth users are linked to students / instructors by e-mail.
create or replace function public.current_student_num()
returns varchar language sql stable security definer set search_path = public as $$
  select student_num from public.students
  where lower(email) = lower(auth.jwt() ->> 'email') limit 1
$$;

create or replace function public.current_instructor_id()
returns varchar language sql stable security definer set search_path = public as $$
  select instructor_id from public.instructors
  where lower(email) = lower(auth.jwt() ->> 'email') limit 1
$$;

create or replace function public.my_profiles()
returns table (role text, id varchar, name varchar)
language sql stable security definer set search_path = public as $$
  select 'student'::text, s.student_num, s.name
    from public.students s where lower(s.email) = lower(auth.jwt() ->> 'email')
  union all
  select 'instructor'::text, i.instructor_id, i.name
    from public.instructors i where lower(i.email) = lower(auth.jwt() ->> 'email')
$$;

-- Student sign-in uses a student number, but Supabase Auth signs in with e-mail.
-- NOTE: this reveals the registered e-mail for a known student number. See README.
create or replace function public.student_login_email(p_student_num text)
returns text language sql stable security definer set search_path = public as $$
  select email from public.students where student_num = trim(p_student_num)
$$;

-- 4. ROW LEVEL SECURITY ----------------------------------------------
alter table public.students        enable row level security;
alter table public.instructors     enable row level security;
alter table public.class_sessions  enable row level security;
alter table public.attendance_logs enable row level security;

-- students
drop policy if exists students_select_self        on public.students;
drop policy if exists students_select_instructors on public.students;
create policy students_select_self on public.students
  for select to authenticated using (student_num = public.current_student_num());
create policy students_select_instructors on public.students
  for select to authenticated using (public.current_instructor_id() is not null);

-- instructors
drop policy if exists instructors_select_self on public.instructors;
create policy instructors_select_self on public.instructors
  for select to authenticated using (instructor_id = public.current_instructor_id());

-- class_sessions: instructors manage ONLY their own sessions.
-- Students get NO direct access (it would expose active_token); they use RPCs below.
drop policy if exists sessions_instructor_all on public.class_sessions;
create policy sessions_instructor_all on public.class_sessions
  for all to authenticated
  using      (instructor_id = public.current_instructor_id())
  with check (instructor_id = public.current_instructor_id());

-- attendance_logs
drop policy if exists logs_select_student    on public.attendance_logs;
drop policy if exists logs_select_instructor on public.attendance_logs;
drop policy if exists logs_insert_instructor on public.attendance_logs;
drop policy if exists logs_update_instructor on public.attendance_logs;
drop policy if exists logs_delete_instructor on public.attendance_logs;

create policy logs_select_student on public.attendance_logs
  for select to authenticated using (student_num = public.current_student_num());

create policy logs_select_instructor on public.attendance_logs
  for select to authenticated using (exists (
    select 1 from public.class_sessions cs
    where cs.session_id = attendance_logs.session_id
      and cs.instructor_id = public.current_instructor_id()));

create policy logs_insert_instructor on public.attendance_logs
  for insert to authenticated with check (exists (
    select 1 from public.class_sessions cs
    where cs.session_id = attendance_logs.session_id
      and cs.instructor_id = public.current_instructor_id()));

create policy logs_update_instructor on public.attendance_logs
  for update to authenticated
  using (exists (
    select 1 from public.class_sessions cs
    where cs.session_id = attendance_logs.session_id
      and cs.instructor_id = public.current_instructor_id()))
  with check (exists (
    select 1 from public.class_sessions cs
    where cs.session_id = attendance_logs.session_id
      and cs.instructor_id = public.current_instructor_id()));

create policy logs_delete_instructor on public.attendance_logs
  for delete to authenticated using (exists (
    select 1 from public.class_sessions cs
    where cs.session_id = attendance_logs.session_id
      and cs.instructor_id = public.current_instructor_id()));
-- Students have NO insert policy: they can only record attendance through
-- submit_attendance(), which validates the rotating token server-side.

-- 5. RPC FUNCTIONS ---------------------------------------------------
-- Unambiguous 6-char code (no 0/O/1/I). 32 symbols => byte % 32 is unbiased.
create or replace function public.gen_session_token()
returns text language plpgsql volatile set search_path = public, extensions as $$
declare
  alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  bytes bytea := gen_random_bytes(6);
  result text := '';
  i int;
begin
  for i in 0..5 loop
    result := result || substr(alphabet, (get_byte(bytes, i) % 32) + 1, 1);
  end loop;
  return result;
end $$;

-- Instructor: open a session and get its first code.
create or replace function public.start_session(
  p_subject text, p_room text, p_start time, p_end time, p_ttl_seconds int default 60)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ins   varchar := public.current_instructor_id();
  v_token text;
  v_exp   timestamptz;
  v_id    bigint;
  tries   int := 0;
begin
  if v_ins is null then
    raise exception 'NOT_AN_INSTRUCTOR' using errcode = '42501';
  end if;
  if p_end <= p_start then
    raise exception 'INVALID_TIME_RANGE';
  end if;
  loop
    v_token := public.gen_session_token();
    v_exp   := now() + make_interval(secs => p_ttl_seconds);
    begin
      insert into public.class_sessions
        (instructor_id, subject, room, session_date, start_time, end_time, active_token, is_active, token_expires_at)
      values
        (v_ins, trim(p_subject), trim(p_room), (now() at time zone 'Asia/Manila')::date,
         p_start, p_end, v_token, true, v_exp)
      returning class_sessions.session_id into v_id;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('session_id', v_id, 'token', v_token,
                            'expires_at', v_exp, 'server_now', now());
end $$;

-- Instructor: issue a fresh code for one of their active sessions.
create or replace function public.rotate_session_token(p_session_id bigint, p_ttl_seconds int default 60)
returns jsonb language plpgsql security definer set search_path = public, extensions as $$
declare
  v_ins   varchar := public.current_instructor_id();
  v_token text;
  v_exp   timestamptz;
  tries   int := 0;
begin
  if v_ins is null then
    raise exception 'NOT_AN_INSTRUCTOR' using errcode = '42501';
  end if;
  loop
    v_token := public.gen_session_token();
    v_exp   := now() + make_interval(secs => p_ttl_seconds);
    begin
      update public.class_sessions
         set active_token = v_token, token_expires_at = v_exp
       where session_id = p_session_id and instructor_id = v_ins and is_active;
      if not found then
        raise exception 'SESSION_NOT_ACTIVE' using errcode = 'P0002';
      end if;
      exit;
    exception when unique_violation then
      tries := tries + 1;
      if tries > 5 then raise; end if;
    end;
  end loop;
  return jsonb_build_object('session_id', p_session_id, 'token', v_token,
                            'expires_at', v_exp, 'server_now', now());
end $$;

-- Student: classes open for attendance right now. Never returns the token.
create or replace function public.list_open_sessions()
returns table (session_id bigint, subject varchar, room varchar, instructor_name varchar,
               start_time time, end_time time, already_logged boolean)
language sql stable security definer set search_path = public as $$
  select cs.session_id, cs.subject, cs.room, i.name, cs.start_time, cs.end_time,
         exists (select 1 from public.attendance_logs al
                 where al.session_id = cs.session_id
                   and al.student_num = public.current_student_num())
    from public.class_sessions cs
    join public.instructors i on i.instructor_id = cs.instructor_id
   where cs.is_active
     and cs.session_date = (now() at time zone 'Asia/Manila')::date
     and (now() at time zone 'Asia/Manila')::time <= cs.end_time
     and public.current_student_num() is not null
   order by cs.start_time
$$;

-- Student step 1: validate a code and return a summary for the confirmation modal.
create or replace function public.verify_token(p_token text)
returns jsonb language plpgsql stable security definer set search_path = public as $$
declare
  v_student public.students%rowtype;
  s         record;
  v_local   timestamp := now() at time zone 'Asia/Manila';
begin
  select * into v_student from public.students where lower(email) = lower(auth.jwt() ->> 'email');
  if not found then raise exception 'NOT_A_STUDENT' using errcode = '42501'; end if;

  select cs.session_id, cs.subject, cs.room, cs.session_date, cs.start_time, cs.end_time,
         cs.token_expires_at, i.name as instructor_name
    into s
    from public.class_sessions cs
    join public.instructors i on i.instructor_id = cs.instructor_id
   where cs.active_token = upper(trim(p_token)) and cs.is_active
   limit 1;

  if not found then raise exception 'INVALID_TOKEN'; end if;
  if s.token_expires_at is null or s.token_expires_at <= now() then raise exception 'TOKEN_EXPIRED'; end if;
  if s.session_date <> v_local::date or v_local::time > s.end_time then raise exception 'SESSION_CLOSED'; end if;
  if exists (select 1 from public.attendance_logs where session_id = s.session_id and student_num = v_student.student_num) then
    raise exception 'ALREADY_LOGGED';
  end if;

  return jsonb_build_object(
    'session_id',       s.session_id,
    'subject',          s.subject,
    'room',             s.room,
    'instructor_name',  s.instructor_name,
    'session_date',     s.session_date,
    'start_time',       s.start_time,
    'end_time',         s.end_time,
    'student_num',      v_student.student_num,
    'student_name',     v_student.name,
    -- Late once 15 minutes past the scheduled start.
    'predicted_status', case when v_local::time > s.start_time + interval '15 minutes' then 'Late' else 'Present' end,
    'expires_at',       s.token_expires_at,
    'server_now',       now());
end $$;

-- Student step 2: record attendance. The token is re-validated here.
create or replace function public.submit_attendance(p_token text)
returns jsonb language plpgsql security definer set search_path = public as $$
declare
  v_student public.students%rowtype;
  s         record;
  v_local   timestamp := now() at time zone 'Asia/Manila';
  v_status  text;
  v_log     public.attendance_logs%rowtype;
begin
  select * into v_student from public.students where lower(email) = lower(auth.jwt() ->> 'email');
  if not found then raise exception 'NOT_A_STUDENT' using errcode = '42501'; end if;

  select cs.session_id, cs.subject, cs.room, cs.session_date, cs.start_time, cs.end_time,
         cs.token_expires_at, i.name as instructor_name
    into s
    from public.class_sessions cs
    join public.instructors i on i.instructor_id = cs.instructor_id
   where cs.active_token = upper(trim(p_token)) and cs.is_active
   limit 1;

  if not found then raise exception 'INVALID_TOKEN'; end if;
  if s.token_expires_at is null or s.token_expires_at <= now() then raise exception 'TOKEN_EXPIRED'; end if;
  if s.session_date <> v_local::date or v_local::time > s.end_time then raise exception 'SESSION_CLOSED'; end if;

  v_status := case when v_local::time > s.start_time + interval '15 minutes' then 'Late' else 'Present' end;

  insert into public.attendance_logs (session_id, student_num, date_scanned, time_scanned, status)
  values (s.session_id, v_student.student_num, v_local::date, date_trunc('second', v_local)::time, v_status)
  on conflict (session_id, student_num) do nothing
  returning * into v_log;

  if v_log.log_id is null then raise exception 'ALREADY_LOGGED'; end if;

  return jsonb_build_object(
    'log_id',          v_log.log_id,
    'reference',       'LOG-REF #' || to_char(v_log.date_scanned, 'YYYYMMDD') || '-' || lpad(v_log.log_id::text, 6, '0'),
    'status',          v_log.status,
    'date_scanned',    v_log.date_scanned,
    'time_scanned',    v_log.time_scanned,
    'subject',         s.subject,
    'room',            s.room,
    'instructor_name', s.instructor_name,
    'student_num',     v_student.student_num,
    'student_name',    v_student.name);
end $$;

-- 6. GRANTS ----------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select                         on public.students        to authenticated;
grant select                         on public.instructors     to authenticated;
grant select, insert, update, delete on public.class_sessions  to authenticated;
grant select, insert, update, delete on public.attendance_logs to authenticated;
grant usage, select on all sequences in schema public to authenticated;

revoke execute on function public.gen_session_token()                    from public, anon, authenticated;
revoke execute on function public.current_student_num()                  from public, anon;
revoke execute on function public.current_instructor_id()                from public, anon;
revoke execute on function public.my_profiles()                          from public, anon;
revoke execute on function public.start_session(text, text, time, time, int) from public, anon;
revoke execute on function public.rotate_session_token(bigint, int)      from public, anon;
revoke execute on function public.list_open_sessions()                   from public, anon;
revoke execute on function public.verify_token(text)                     from public, anon;
revoke execute on function public.submit_attendance(text)                from public, anon;
revoke execute on function public.student_login_email(text)              from public;

grant execute on function public.current_student_num()                   to authenticated;
grant execute on function public.current_instructor_id()                 to authenticated;
grant execute on function public.my_profiles()                           to authenticated;
grant execute on function public.start_session(text, text, time, time, int) to authenticated;
grant execute on function public.rotate_session_token(bigint, int)       to authenticated;
grant execute on function public.list_open_sessions()                    to authenticated;
grant execute on function public.verify_token(text)                      to authenticated;
grant execute on function public.submit_attendance(text)                 to authenticated;
grant execute on function public.student_login_email(text)               to anon, authenticated;

-- 7. REALTIME --------------------------------------------------------
-- REPLICA IDENTITY FULL so DELETE events carry the old row (needed by the live grid).
alter table public.attendance_logs replica identity full;

do $$
begin
  alter publication supabase_realtime add table public.attendance_logs;
exception when duplicate_object then
  null; -- already in the publication
end $$;

-- 8. SEED DATA (BulSU CPE 3A) ----------------------------------------
-- Demo e-mails use a placeholder domain. Replace with real addresses before production.
insert into public.instructors (instructor_id, name, email) values
  ('INS-0001', 'Engr. Ricardo M. Alvarez', 'ricardo.alvarez@attendo-demo.dev'),
  ('INS-0002', 'Engr. Lorna P. Valdez',    'lorna.valdez@attendo-demo.dev')
on conflict (instructor_id) do nothing;

insert into public.students (student_num, name, email) values
  ('2023101001', 'Dela Cruz, Juan Miguel',    'juan.delacruz@attendo-demo.dev'),
  ('2023101002', 'Santos, Maria Angelica',    'maria.santos@attendo-demo.dev'),
  ('2023101003', 'Reyes, Carlo Antonio',      'carlo.reyes@attendo-demo.dev'),
  ('2023101004', 'Bautista, Katrina Mae',     'katrina.bautista@attendo-demo.dev'),
  ('2023101005', 'Garcia, Jose Paolo',        'jose.garcia@attendo-demo.dev'),
  ('2023101006', 'Mendoza, Althea Nicole',    'althea.mendoza@attendo-demo.dev'),
  ('2023101007', 'Villanueva, Miguel Angelo', 'miguel.villanueva@attendo-demo.dev'),
  ('2023101008', 'Ramos, Bianca Louise',      'bianca.ramos@attendo-demo.dev'),
  ('2023101009', 'Aquino, Renzo Gabriel',     'renzo.aquino@attendo-demo.dev'),
  ('2023101010', 'Castillo, Jasmine Faith',   'jasmine.castillo@attendo-demo.dev'),
  ('2023101011', 'Navarro, Kyle Matthew',     'kyle.navarro@attendo-demo.dev'),
  ('2023101012', 'Flores, Samantha Joy',      'samantha.flores@attendo-demo.dev'),
  ('2023101013', 'Torres, Daniel Joseph',     'daniel.torres@attendo-demo.dev'),
  ('2023101014', 'Pascual, Hannah Grace',     'hannah.pascual@attendo-demo.dev'),
  ('2023101015', 'Domingo, Ethan Ray',        'ethan.domingo@attendo-demo.dev')
on conflict (student_num) do nothing;

-- Two finished past sessions with logs, so the grid and CSV export have data on first run.
do $$
declare
  v_today date := (now() at time zone 'Asia/Manila')::date;
  v1 bigint;
  v2 bigint;
begin
  if exists (select 1 from public.class_sessions where active_token in ('SEED01', 'SEED02')) then
    return;
  end if;

  insert into public.class_sessions
    (instructor_id, subject, room, session_date, start_time, end_time, active_token, is_active, token_expires_at)
  values
    ('INS-0001', 'CPE 301 - Differential Equation', 'ENG-204', v_today - 7, '08:00', '10:00', 'SEED01', false, now())
  returning session_id into v1;

  insert into public.attendance_logs (session_id, student_num, date_scanned, time_scanned, status)
  select v1, x.student_num, v_today - 7, x.t::time, x.status
    from (values
      ('2023101001', '07:52:10', 'Present'), ('2023101002', '07:55:31', 'Present'),
      ('2023101003', '07:58:02', 'Present'), ('2023101004', '07:59:47', 'Present'),
      ('2023101005', '08:01:15', 'Present'), ('2023101006', '08:03:20', 'Present'),
      ('2023101007', '08:04:44', 'Present'), ('2023101008', '08:06:09', 'Present'),
      ('2023101009', '08:19:33', 'Late'),    ('2023101010', '08:24:51', 'Late'),
      ('2023101011', '07:50:00', 'Excused'), ('2023101012', '08:02:38', 'Present')
    ) as x(student_num, t, status);

  insert into public.class_sessions
    (instructor_id, subject, room, session_date, start_time, end_time, active_token, is_active, token_expires_at)
  values
    ('INS-0002', 'CPE 304L - Software Design', 'CPE-LAB-1', v_today - 3, '13:00', '16:00', 'SEED02', false, now())
  returning session_id into v2;

  insert into public.attendance_logs (session_id, student_num, date_scanned, time_scanned, status)
  select v2, x.student_num, v_today - 3, x.t::time, x.status
    from (values
      ('2023101001', '12:55:12', 'Present'), ('2023101002', '12:57:40', 'Present'),
      ('2023101003', '13:02:05', 'Present'), ('2023101004', '13:03:58', 'Present'),
      ('2023101005', '13:05:21', 'Present'), ('2023101007', '13:09:16', 'Present'),
      ('2023101008', '13:11:42', 'Present'), ('2023101010', '13:14:03', 'Present'),
      ('2023101011', '13:22:30', 'Late'),    ('2023101013', '13:26:14', 'Late'),
      ('2023101014', '12:58:49', 'Present'), ('2023101015', '13:01:27', 'Present')
    ) as x(student_num, t, status);
end $$;
