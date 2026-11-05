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

/** Maps a Supabase/Postgres error (RAISE EXCEPTION 'CODE') to a friendly message. */
export function friendlyError(err: { message?: string } | null | undefined): string {
  const code = err?.message?.trim() ?? ''
  return MESSAGES[code] ?? 'Something went wrong. Please try again.'
}
