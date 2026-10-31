/**
 * Gmail-only email validation — rule-for-rule the same as
 * backend/app/validation/email.py. The server repeats every check, so this is
 * for instant feedback only.
 */

export type EmailErrorCode = 'invalid_email' | 'unsupported_email_domain'

export const EMAIL_MESSAGES: Record<EmailErrorCode, string> = {
  invalid_email: 'Please enter a valid email address.',
  unsupported_email_domain: 'Only Gmail addresses ending in @gmail.com are accepted.',
}

export type EmailCheck =
  | { ok: true; email: string; canonical: string }
  | { ok: false; code: EmailErrorCode; message: string }

const GMAIL_DOMAIN = 'gmail.com'
const LOCAL_ATOM = "[A-Za-z0-9!#$%&'*+/=?^_`{|}~-]+"
const GENERAL_RE = new RegExp(
  `^${LOCAL_ATOM}(?:\\.${LOCAL_ATOM})*@(?:[A-Za-z0-9](?:[A-Za-z0-9-]{0,61}[A-Za-z0-9])?\\.)+[A-Za-z]{2,63}$`,
)
const GMAIL_USER_RE = /^(?=.{6,30}$)[a-z0-9]+(?:\.[a-z0-9]+)*$/
const GMAIL_TAG_RE = /^[a-z0-9._-]{1,40}$/

const fail = (code: EmailErrorCode): EmailCheck => ({ ok: false, code, message: EMAIL_MESSAGES[code] })

export function validateGmail(raw: unknown): EmailCheck {
  if (typeof raw !== 'string') return fail('invalid_email')
  const value = raw.trim()
  if (!value || value.length > 254 || /\s/.test(value)) return fail('invalid_email')
  if (value.split('@').length !== 2 || !GENERAL_RE.test(value)) return fail('invalid_email')

  const at = value.lastIndexOf('@')
  const localRaw = value.slice(0, at)
  const domain = value.slice(at + 1)
  if (localRaw.length > 64) return fail('invalid_email')
  if (domain.toLowerCase() !== GMAIL_DOMAIN) return fail('unsupported_email_domain')

  const local = localRaw.toLowerCase()
  const plus = local.indexOf('+')
  const user = plus === -1 ? local : local.slice(0, plus)
  const tag = plus === -1 ? '' : local.slice(plus + 1)
  if (!GMAIL_USER_RE.test(user)) return fail('invalid_email')
  if (plus !== -1 && !GMAIL_TAG_RE.test(tag)) return fail('invalid_email')

  return { ok: true, email: `${local}@${GMAIL_DOMAIN}`, canonical: `${user.replaceAll('.', '')}@${GMAIL_DOMAIN}` }
}

/** Message to show under the field, or undefined when the value is fine. */
export function emailError(raw: string): string | undefined {
  const r = validateGmail(raw)
  return r.ok ? undefined : r.message
}
