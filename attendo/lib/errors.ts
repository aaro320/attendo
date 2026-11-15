const MESSAGES: Record<string, string> = {
  INVALID_TOKEN: 'That code is not valid. Check it and try again.',
  TOKEN_EXPIRED: "That code has expired. Scan the latest code on your instructor's screen.",
  SESSION_CLOSED: 'This class session is closed.',
  ALREADY_LOGGED: 'You have already been marked for this class.',
  NOT_A_STUDENT: 'This account is not registered as a student.',
  NOT_AN_INSTRUCTOR: 'This account is not registered as an instructor.',
  SESSION_NOT_ACTIVE: 'This session is no longer active.',
  INVALID_TIME_RANGE: 'End time must be later than start time.',
}

const REGISTRATION_MESSAGES: Record<string, string> = {
  INVALID_EMAIL: 'Enter a valid email address.',
  INVALID_NAME: 'Enter your first and last name.',
  INVALID_STUDENT_NUM: 'Student number must be 5 to 20 letters, numbers or dashes.',
  STUDENT_NUM_TAKEN: 'That student number is already registered with a different email. Check the number, or ask your instructor.',
  EMAIL_TAKEN: 'That email is already registered. Sign in instead, or use a different email.',
  BAD_ACCESS_CODE: 'That instructor access code is not correct. Ask the department for the current code.',
  INVALID_ROLE: 'Choose Student or Instructor.',
}

/** Maps a validate_registration() result code to a friendly message. */
export function registrationMessage(code: string | null | undefined): string {
  return (code && REGISTRATION_MESSAGES[code]) || 'We could not create your account. Please try again.'
}

/** Maps a Supabase/Postgres error (RAISE EXCEPTION 'CODE') to a friendly message. */
export function friendlyError(err: { message?: string } | null | undefined): string {
  const code = err?.message?.trim() ?? ''
  return MESSAGES[code] ?? 'Something went wrong. Please try again.'
}