// C2 — "THE ENUMERATION ORACLE"
//
// Real-world origin (WOKOOD, 2026 audit): the gift-card redeem endpoint
// answered three DIFFERENT ways for bad input — invalid format, never
// issued, already redeemed. Worse, the rate-limit counter was incremented
// inside the same database transaction as the redeem itself, so any failing
// probe rolled the whole transaction back — including the counter bump.
// Probing the ~1,000,000-code space was free, and the distinct errors told
// you exactly which codes were live.

export const C2_CODE_SPACE = 1_000_000
export const C2_QUOTA = 5
export const C2_CARD_VALUE_CENTS = 2500

export type C2Result =
  | { ok: true; message: string; walletCents: number }
  | { ok: false; code: string; message: string }

export interface C2Api {
  mode: 'vulnerable' | 'patched'
  quota: number
  attemptsUsed(): number
  walletCents(): number
  /** POST /giftcards/redeem { code } */
  probe(code: string): C2Result
}

export interface C2Seed {
  live?: string[]
  burned?: string[]
}

export const C2_DEFAULT_SEED: Required<C2Seed> = {
  live: ['417293'],
  burned: ['100000'],
}

interface OracleFailure {
  oracleCode: string
  message: string
}

export function createC2Vulnerable(seed: C2Seed = {}): C2Api {
  const live = seed.live ?? C2_DEFAULT_SEED.live
  const burned = seed.burned ?? C2_DEFAULT_SEED.burned
  const issued = new Map<string, 'live' | 'burned'>()
  for (const c of live) issued.set(c, 'live')
  for (const c of burned) issued.set(c, 'burned')
  let wallet = 0
  let attempts = 0

  function probe(raw: string): C2Result {
    const code = raw.trim()
    // Everything — including the quota bump — runs "inside the transaction".
    let committed = false
    try {
      attempts += 1
      if (!/^\d{6}$/.test(code)) {
        throw { oracleCode: 'INVALID_FORMAT', message: `format error: "${raw}" is not a 6-digit code` } satisfies OracleFailure
      }
      const state = issued.get(code)
      if (state === undefined) {
        throw { oracleCode: 'NOT_ISSUED', message: `no card ${code} was ever issued` } satisfies OracleFailure
      }
      if (state === 'burned') {
        throw { oracleCode: 'ALREADY_REDEEMED', message: `card ${code} was already redeemed` } satisfies OracleFailure
      }
      issued.set(code, 'burned')
      wallet += C2_CARD_VALUE_CENTS
      committed = true
      return { ok: true, message: `card ${code} redeemed — wallet +$25.00`, walletCents: wallet }
    } catch (e) {
      // THE BUG — the transaction rolls back on any raise, and the quota
      // increment lived inside it. Failed probes are free, and the distinct
      // error messages turn the endpoint into a map of the code space.
      const err = e as OracleFailure
      if (!committed) attempts -= 1
      return {
        ok: false,
        code: err.oracleCode,
        message: `${err.message} [tx rolled back — quota refunded]`,
      }
    }
  }

  return {
    mode: 'vulnerable',
    quota: C2_QUOTA,
    attemptsUsed: () => attempts,
    walletCents: () => wallet,
    probe,
  }
}

export function createC2Patched(seed: C2Seed = {}): C2Api {
  const live = seed.live ?? C2_DEFAULT_SEED.live
  const burned = seed.burned ?? C2_DEFAULT_SEED.burned
  const issued = new Map<string, 'live' | 'burned'>()
  for (const c of live) issued.set(c, 'live')
  for (const c of burned) issued.set(c, 'burned')
  let wallet = 0
  let attempts = 0

  function probe(raw: string): C2Result {
    // PATCH — the quota lives outside every failure path, so every probe
    // burns it, committed or not; and every failure mode answers with the
    // exact same uniform result, so the endpoint reveals nothing.
    attempts += 1
    if (attempts > C2_QUOTA) {
      return { ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' }
    }
    const code = raw.trim()
    if (!/^\d{6}$/.test(code)) return { ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' }
    const state = issued.get(code)
    if (state !== 'live') return { ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' }
    issued.set(code, 'burned')
    wallet += C2_CARD_VALUE_CENTS
    return { ok: true, message: `card ${code} redeemed — wallet +$25.00`, walletCents: wallet }
  }

  return {
    mode: 'patched',
    quota: C2_QUOTA,
    attemptsUsed: () => attempts,
    walletCents: () => wallet,
    probe,
  }
}
