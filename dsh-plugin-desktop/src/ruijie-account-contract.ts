/** Same-origin account summary exposed by the desktop Host to its renderer. */

export const RUIJIE_ACCOUNT_PATH = '/__dsh_desktop/ruijie-account'
export const RUIJIE_LOGOUT_PATH = '/__dsh_desktop/ruijie-logout'
export const RUIJIE_BRAND_WORDMARK_PATH = '/__dsh_desktop/ruijie-wordmark.png'
export const RUIJIE_ACCOUNT_CLIENT_HEADER = 'x-ruijie-dsh-client'
export const RUIJIE_ACCOUNT_CLIENT_VALUE = 'account-card'

export interface RuijieAccountIdentity {
  /** Stable OAuth subject, kept as a fallback when the issuer omits display claims. */
  readonly id: string
  /** Human-readable SSO name when present in the OAuth JWT. */
  readonly name?: string
  /** Corporate email when present in the OAuth JWT. */
  readonly email?: string
}

export interface RuijieAccountBilling {
  /** GPTAuth currently names its source field hard_limit_usd, but the Ruijie wallet values are RMB. */
  readonly currency: 'CNY'
  readonly total: number
  readonly used: number
  readonly remaining: number
  readonly usedPercent: number
}

export interface RuijieAccountSummary {
  readonly authentication: 'sso'
  readonly account: RuijieAccountIdentity
  readonly billing: RuijieAccountBilling
  readonly fetchedAt: string
}

export interface RuijieAccountError {
  readonly error: string
}
