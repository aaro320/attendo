export type Role = 'student' | 'instructor'

/** Statuses the database accepts. "Absent" is represented by having no log row. */
export type AttendanceStatus = 'Present' | 'Late' | 'Excused'
export type RowStatus = AttendanceStatus | 'Absent'

export interface Student {
  student_num: string
  name: string
  email: string
}

export interface ClassSession {
  session_id: number
  instructor_id: string
  subject: string
  room: string
  session_date: string // YYYY-MM-DD
  start_time: string // HH:MM:SS
  end_time: string
  active_token: string
  is_active: boolean
  token_expires_at: string | null
}

export interface AttendanceLog {
  log_id: number
  session_id: number
  student_num: string
  date_scanned: string
  time_scanned: string
  status: AttendanceStatus
}

export interface Profile {
  role: Role
  id: string
  name: string
}

/** Row returned by the list_open_sessions() RPC (never contains the token). */
export interface OpenSession {
  session_id: number
  subject: string
  room: string
  instructor_name: string
  start_time: string
  end_time: string
  already_logged: boolean
}

/** Returned by verify_token(): shown in the confirmation modal. */
export interface VerifyResult {
  session_id: number
  subject: string
  room: string
  instructor_name: string
  session_date: string
  start_time: string
  end_time: string
  student_num: string
  student_name: string
  predicted_status: 'Present' | 'Late'
  expires_at: string
  server_now: string
}

/** Returned by submit_attendance(): rendered as the digital gate slip. */
export interface SubmitResult {
  log_id: number
  reference: string
  status: AttendanceStatus
  date_scanned: string
  time_scanned: string
  subject: string
  room: string
  instructor_name: string
  student_num: string
  student_name: string
}

/** Returned by start_session() / rotate_session_token(). */
export interface TokenResult {
  session_id: number
  token: string
  expires_at: string
  server_now: string
}
