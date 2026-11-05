import { QR_PREFIX, TOKEN_LENGTH } from './constants'

const TOKEN_RE = new RegExp(`^[A-Z0-9]{${TOKEN_LENGTH}}$`)

/** Text encoded in the instructor's QR code: ATTENDO:<session_id>:<TOKEN> */
export function buildQrPayload(sessionId: number, token: string): string {
  return `${QR_PREFIX}:${sessionId}:${token}`
}

/** Returns the 6-char token from a scanned QR string, or null if it isn't an Attendo code. */
export function parseQrPayload(raw: string): string | null {
  const parts = raw.trim().split(':')
  if (parts.length !== 3 || parts[0] !== QR_PREFIX) return null
  const token = parts[2].toUpperCase()
  return TOKEN_RE.test(token) ? token : null
}

/** Normalises what a student types into the manual-entry box. */
export function normalizeManualToken(input: string): string {
  return input.toUpperCase().replace(/[^A-Z0-9]/g, '').slice(0, TOKEN_LENGTH)
}

export function isValidToken(token: string): boolean {
  return TOKEN_RE.test(token)
}
