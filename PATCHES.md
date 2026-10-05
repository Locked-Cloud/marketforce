# PATCHES.md — the five real fixes

One section per challenge: the class name (with OWASP mapping where natural),
the vulnerable pattern, the patch that shipped, and how the bug was
originally found in the audited production store. The code below is the lab
retelling — condensed from the real incident, same mechanics, same fix shape.

---

## C1 — FREE-MONEY MINTING

**Class:** business logic / improper state machine — OWASP A04:2021
Insecure Design

**The bug.** The gift-card purchase endpoint minted a card in a fully
redeemable (`active`) state at request time. Payment was a separate,
later step — a provider webhook existed in the codebase, but neither the
data model nor the redeem path required it. Value was minted where money
was only *expected*.

**Vulnerable (as it shipped):**

```ts
// POST /giftcards/purchase — as it shipped
purchaseGiftCard(amountCents) {
  const code = freshCode()
  // BUG: minted 'active' — instantly redeemable. The payment webhook
  // exists (settlePayment) but nothing requires it before redemption.
  cards.set(code, { code, amountCents, state: 'active', ownerId })
  return { ok: true, code }
}

// POST /giftcards/redeem
redeem(code) {
  const card = cards.get(code)
  if (!card || card.state === 'redeemed') return { ok: false }
  card.state = 'redeemed'
  walletCents += card.amountCents   // wallet credited
  return { ok: true, walletCents }  // ...no money was ever collected
}
```

**Patched (as it ships now):**

```ts
// POST /giftcards/purchase — patched
purchaseGiftCard(amountCents) {
  const code = freshCode()
  // PATCH: minted 'unpaid'. Only the payment provider can activate it.
  cards.set(code, { code, amountCents, state: 'unpaid', ownerId })
  return { ok: true, code }
}

// POST /payments/webhook — the ONLY door to 'active'
settlePayment(code) {
  const card = cards.get(code)
  if (!card || card.state !== 'unpaid') return { ok: false }
  card.state = 'active'
  revenueCents += card.amountCents  // revenue counted where money lands
  return { ok: true }
}

// POST /giftcards/redeem
redeem(code) {
  const card = cards.get(code)
  if (!card || card.state !== 'active') return { ok: false }
  card.state = 'redeemed'
  walletCents += card.amountCents
  return { ok: true, walletCents }
}
```

**How it was found.** During the audit I walked the gift-card flow with the
network tab open, interposed on the checkout request, and dropped it. The
purchase had already returned a live code. The original finding was one
screenshot: order confirmation, live card, zero payment records. The exploit
chain — mint, redeem, wallet credit, free order — ran in under a minute with
no tools beyond devtools.

**Test coverage:** `src/api/c1-giftcard.test.ts` proves the full chain works
on the vulnerable twin (goods delivered, revenue `$0.00`) and dies on the
patched twin (`CARD_NOT_PAID` until the provider webhook settles).

---

## C2 — THE ENUMERATION ORACLE

**Class:** information disclosure + broken rate limiting via transactional
rollback — OWASP A01:2021 Broken Access Control / A05 Security
Misconfiguration

**The bug.** Two flaws cooperating. (1) The redeem endpoint answered three
*distinguishable* ways for bad input — `INVALID_FORMAT`, `NOT_ISSUED`,
`ALREADY_REDEEMED` — each response a free bit of information about the
~1,000,000-code space. (2) The rate-limit counter was incremented inside the
same database transaction as the redeem, so every failing probe rolled the
counter bump back. Probing was unlimited *and* informative: a script could
map every live card.

**Vulnerable (as it shipped):**

```ts
// POST /giftcards/redeem — as it shipped
probe(raw) {
  let committed = false
  try {
    attempts += 1                    // counted INSIDE the transaction
    if (!validFormat(raw))  throw { oracleCode: 'INVALID_FORMAT' }
    if (!issued.has(raw))   throw { oracleCode: 'NOT_ISSUED' }
    if (isBurned(raw))      throw { oracleCode: 'ALREADY_REDEEMED' }
    burn(raw); wallet += value
    committed = true
    return { ok: true }
  } catch (err) {
    // BUG: the raise rolls the whole tx back — quota included — and the
    // distinct oracleCode turns the endpoint into a map of the space.
    if (!committed) attempts -= 1
    return { ok: false, code: err.oracleCode }
  }
}
```

**Patched (as it ships now):**

```ts
// POST /giftcards/redeem — patched
probe(raw) {
  // PATCH: quota is a resource decision made BEFORE any work — it can
  // never be rolled back by a business-logic failure.
  attempts += 1
  if (attempts > QUOTA) return uniformFail()

  // PATCH: one uniform failure for every mode. No oracle bits leaked.
  if (!validFormat(raw)) return uniformFail()
  if (!isLive(raw))      return uniformFail()

  burn(raw); wallet += value
  return { ok: true, walletCents: wallet }
}

function uniformFail() {
  return { ok: false, code: 'REDEEM_FAILED', message: 'redeem failed' }
}
```

**How it was found.** A 200-line script against the endpoint with a fresh
test account. The distinct errors were visible on the first ten probes. The
rollback behavior showed up when I compared the rate-limit response headers
against the DB counter: after a hundred failures the counter read zero. Two
bugs, one endpoint, both invisible from the UI — the UI only ever sends one
good code.

**Test coverage:** `src/api/c2-enumeration.test.ts` proves the oracle +
rollback on the vulnerable twin, uniform failures on the patched twin, and
a hard lockout that consumes quota even on failures.

---

## C3 — CLIENT-TRUSTED STATE

**Class:** mass assignment — OWASP A08:2021 Software and Data Integrity
Failures

**The bug.** The order-create endpoint accepted the client's entire payload
and stored it verbatim, including `status` and `payment_state`. The store UI
only ever sent `created`/`unpaid` — so the bug was invisible from inside the
app — and a loyalty trigger granted points to any order *arriving* already
marked `delivered`+`paid`.

**Vulnerable (as it shipped):**

```ts
// POST /api/orders — as it shipped
createOrder(input) {
  const order = buildLines(input.items)
  // BUG: the server copies client-controlled state fields verbatim.
  order.status = input.status ?? 'created'
  order.paymentState = input.payment_state ?? 'unpaid'

  if (order.status === 'delivered' && order.paymentState === 'paid') {
    // loyalty trigger fires on ARRIVAL — trusting fields the client set
    order.pointsGranted = pointsFor(order.totalCents)
    loyalty.points += order.pointsGranted
  }
  return save(order)
}
```

**Patched (as it ships now):**

```ts
// POST /api/orders — patched
createOrder(input) {
  const order = buildLines(input.items)
  // PATCH: initial state is pinned server-side; client-supplied status
  // and payment_state are dropped entirely.
  order.status = 'created'
  order.paymentState = 'unpaid'
  order.pointsGranted = 0
  return save(order)
}

// points flow only through server-verified transitions, exactly once
function grantLoyaltyPoints(order) {
  if (order.pointsGranted !== 0) return            // ledger guard
  if (order.paymentState !== 'paid') return        // provider settled first
  const pts = pointsFor(order.totalCents)
  order.pointsGranted = pts
  loyalty.points += pts
}
```

**How it was found.** Classic devtools move: I opened the order-create
request from the real UI, copied it as fetch, added `status` and
`payment_state` to the body, and sent it. `200 OK`, order already
delivered. The loyalty credit posted before I refreshed the profile page.

**Test coverage:** `src/api/c3-orders.test.ts` proves the crafted request
mints 90 points at `$0.00` collected on the vulnerable twin, and on the
patched twin is pinned to `created/unpaid` with points flowing only through
settle-then-fulfill, exactly once.

---

## C4 — IDOR ON ORDER LOOKUP

**Class:** OWASP A01:2021 Broken Access Control (IDOR)

**The bug.** The order-tracking endpoint returned any order by reference to
whoever asked — no ownership predicate, no role check. References were
short, sequential, and printed on every invoice, so any logged-in customer
could walk the range and read anyone's order: address, phone, items,
totals. It survived for years because staff used the same endpoint and
"adding a check would break staff."

**Vulnerable (as it shipped):**

```ts
// GET /api/orders/:reference — as it shipped
lookup(reference) {
  const order = orders.get(reference)
  if (!order) return notFound()
  // BUG: the order is returned to whoever asks. No ownership
  // predicate, no role check — refs are sequential, so this
  // endpoint is a customer database with a for-loop.
  return { ok: true, order }
}
```

**Patched (as it ships now):**

```ts
// GET /api/orders/:reference — patched
lookup(reference, session) {
  const order = orders.get(reference)
  if (!order) return notFound()
  const isOwner = order.ownerId === session.userId
  const isStaff = session.role === 'staff'
  // PATCH: authorize the caller against the object — owner or staff.
  if (!isOwner && !isStaff) return notFound()  // same answer as a miss:
  return { ok: true, order }                  // no existence oracle
}
```

**How it was found.** Sequential references in confirmation emails were the
tell. I incremented my own order reference by one in the tracking URL and
got a stranger's home address. The original report was three requests:
mine, minus-one, minus-two — three different customers, all `200 OK`.

**Test coverage:** `src/api/c4-idor.test.ts` proves the PII leak on the
vulnerable twin; on the patched twin a not-yours order answers
byte-identically to a nonexistent one, owners and staff still get through.

---

## C5 — ROUTE SHADOWING

**Class:** SPA access-control bypass via duplicate route registration —
OWASP A01:2021 Broken Access Control (and A05 misconfiguration in spirit)

**The bug.** Two teams, one path. An "ops console" feature module registered
`/admin` as a plain, unguarded route and mounted early. Months later the
platform registered `/admin` again — behind a proper staff guard. React
Router matches the *first* route for a path, so the guarded registration
was dead code the moment it shipped: no error, no warning. Every guest on
the internet was one URL away from refunds, price overrides, and a customer
export. The guard existed in the repo — it just never ran.

**Vulnerable (as it shipped):**

```ts
// app boot — as it shipped (two modules, one path)
register({ path: '/admin', screen: OPS_CONSOLE })             // #1: no guard
register({ path: '/admin', screen: ADMIN, guard: staffOnly }) // #2: dead code

// mini-router — first registration wins at match time
register(def) {
  if (table.has(def.path)) {
    shadowed.push(def)
    return { ok: true }   // BUG: silently ignored — no error, no warning
  }
  table.set(def.path, def)
  return { ok: true }
}

navigate(path, session) {
  const route = table.get(path)
  if (route.guard && !route.guard(session)) return denied()
  return render(route)    // #1 matched; it has no guard to run
}
```

**Patched (as it ships now):**

```ts
// app boot — patched (one module, one path, one guard)
register({ path: '/admin', screen: ADMIN, guard: staffOnly })
register({ path: '/shop',  screen: STOREFRONT })

// mini-router — duplicates fail loudly
register(def) {
  if (table.has(def.path)) {
    // PATCH: a route table is security configuration — a duplicate
    // is a build failure, not silent dead code.
    throw new Error('ROUTE_ALREADY_REGISTERED: ' + def.path)
  }
  table.set(def.path, def)
  return { ok: true }
}

// route-inventory test (vitest) — fails CI on the first shadowed route
it('route inventory: /admin registered exactly once, guarded', () => {
  boot(app)
  const admin = app.routes().filter(r => r.path === '/admin')
  expect(admin).toHaveLength(1)
  expect(admin[0].guard).toBeDefined()
})
```

**How it was found.** During the route audit I listed every path the bundle
could render and diffed it against the routes file. `/admin` appeared twice
in the built app but once in the guarded config. Clicking through as a
logged-out user confirmed which one served. The guard code was fine — it was
just unreachable, which is its own kind of bug.

**Test coverage:** `src/api/c5-router.test.ts` proves the guest reaches the
unguarded console on the vulnerable twin; on the patched twin duplicates
fail loudly, guests are denied, staff pass, and the inventory stays clean.

---

## The pattern behind all five

None of these are exotic. Each is a *trust boundary* drawn in the wrong
place: value minted before money lands (C1), quota and business logic
sharing a transaction (C2), lifecycle state owned by the client (C3),
authorization skipped on read (C4), and security configuration decided by
registration order (C5). The fixes share a shape too: move the trust
boundary to where the truth actually lives — the payment provider, the
request counter, the server, the session — and make violations loud.
