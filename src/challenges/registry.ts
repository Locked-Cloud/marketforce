// Challenge registry — the narrative layer. Every entry describes a bug
// class that was found and fixed in a real audited production store
// (WOKOOD, 2026) and is retold here as a lab challenge.

export interface ChallengeMeta {
  id: number
  title: string
  className: string
  difficulty: 1 | 2 | 3
  brief: string[]
  hints: [string, string, string]
  exploit: string[]
  patchNote: string
  howFound: string
  vulnCode: string
  patchedCode: string
}

export const CHALLENGES: ChallengeMeta[] = [
  {
    id: 1,
    title: 'FREE-MONEY MINTING',
    className: 'business logic · broken state machine · OWASP A04 Insecure Design',
    difficulty: 2,
    brief: [
      'The store sold gift cards. The purchase endpoint minted a card the moment you clicked buy — in a fully redeemable state. The payment step was supposed to happen afterwards, and a payment webhook existed in the codebase, but nothing in the data model or the redeem path ever required it. The two flows — minting value and collecting money — were never wired together.',
      'That is the whole bug: a store credit instrument that trusts an event which may never arrive. Purchase minted spendable money; the wallet accepted it; orders shipped against it. Revenue stayed at zero the entire time.',
    ],
    hints: [
      'Click BUY GIFT CARD and read the response carefully. What state is the card minted in? Did anything ask you to pay?',
      'The code box is right there. Paste the code you were handed straight into REDEEM and watch the wallet.',
      'Now buy something real with the wallet balance. Then look at the COLLECTED stat — that number is the entire vulnerability in one field.',
    ],
    exploit: [
      'Click BUY GIFT CARD ($25.00). Notice: no checkout, no payment, no card. The API hands you a live code anyway.',
      'Paste the code into the REDEEM box and send it. Your wallet is credited $25.00 that nobody ever collected.',
      'Buy an item from the catalog with the wallet balance. The order is placed and delivered.',
      'Read the stats: ORDERS 1, COLLECTED $0.00. You just shipped yourself goods on minted money. Toggle PATCHED MODE and try the same chain — the mint now hands you an UNPAID card and only the payment provider webhook can activate it.',
    ],
    patchNote:
      'The fix is a real state machine: a minted card is born UNPAID, and the only transition to redeemable runs through the payment provider\'s server-to-server webhook. Revenue is counted at the same door — where money actually lands — never at mint time. Redeem now refuses unpaid cards outright, so even a leaked code list has no value until each card is paid for. The general lesson: any artifact that carries spendable value needs an explicit lifecycle whose happy path passes through the money.',
    howFound:
      'During the audit I simply walked the gift-card flow with the network tab open, interposed on the checkout request, and dropped it. The purchase had already returned a live code. The original finding was one screenshot: order confirmation, live card, zero payment records.',
    vulnCode: `// POST /giftcards/purchase — as it shipped
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
}`,
    patchedCode: `// POST /giftcards/purchase — patched
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
}`,
  },
  {
    id: 2,
    title: 'THE ENUMERATION ORACLE',
    className: 'information disclosure · rate-limit rollback · OWASP A01 + A05',
    difficulty: 3,
    brief: [
      'The redeem endpoint answered three different ways for bad input: INVALID_FORMAT for malformed codes, NOT_ISSUED for codes that never existed, and ALREADY_REDEEMED for cards that existed but were burned. Each response is a free bit of information. Across a 6-digit code space — about one million codes — those bits add up to a map of every live card in the system.',
      'The twist that made it unfixable-by-tuning: the rate-limit counter was incremented inside the same database transaction as the redeem. When a probe raised — and every bad code raises — the transaction rolled back, including the counter bump. Failed probes were free. You could hammer the endpoint forever, and it would keep whispering which codes were alive.',
    ],
    hints: [
      'Probe a few codes and read the error messages as data, not noise. What does each distinct message tell you about the code you tried?',
      'Try 100000. The response tells you that code EXISTS and is burned — now you know the format is real and codes are enumerable. Watch the ATTEMPTS USED meter while you probe: why does it never move?',
      '417293 is live in this demo. But first run HARVEST x25 and watch the quota meter — every failed probe refunds itself. That refund is the second half of the bug.',
    ],
    exploit: [
      'Probe 999999 — response NOT_ISSUED. Probe 100000 — response ALREADY_REDEEMED. The endpoint just confirmed both codes exist (or not) in the space. That is your oracle.',
      'Fire HARVEST x25 and watch ATTEMPTS USED: it stays at 0. Every failure rolled its transaction back, quota bump included. The rate limit only counts successes — which an attacker never has.',
      'With free probing plus distinct responses, a script walks the ~1,000,000-code space and harvests every live card. Redeem 417293 — the demo\'s live card — to finish.',
      'Toggle PATCHED MODE: every failure now answers with the same REDEEM_FAILED, and every probe — failed or not — burns quota. Five garbage probes and the live card itself becomes unreachable and indistinguishable from a dead one.',
    ],
    patchNote:
      'Two changes, one principle: reveal nothing, charge for everything. All failure modes — bad format, not issued, already redeemed, quota exceeded — collapse into a single uniform REDEEM_FAILED response, so the endpoint leaks no bits about the code space. And the quota counter moves outside every failure path: an attempt is counted when it is received, not when it commits, so there is no transaction left to roll it back. Rate limiting is a resource decision the server makes before doing any work — it must never share a transaction boundary with business logic.',
    howFound:
      'I wrote a 200-line script against the redeem endpoint with a fresh test account and watched the responses while throttling up. The distinct errors were visible on the first ten probes. The rollback behavior showed up when I compared the rate-limit response headers against the DB counter: after a hundred failures the counter read zero. Two bugs, one endpoint, both invisible in the UI.',
    vulnCode: `// POST /giftcards/redeem — as it shipped
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
}`,
    patchedCode: `// POST /giftcards/redeem — patched
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
}`,
  },
  {
    id: 3,
    title: 'CLIENT-TRUSTED STATE',
    className: 'mass assignment · OWASP A08 Software and Data Integrity Failures',
    difficulty: 2,
    brief: [
      'The order-create endpoint accepted the client\'s entire payload and stored it verbatim — including status and payment_state. The store UI only ever sent created/unpaid, so from inside the browser everything looked correct. But the API never validated what arrived, and the loyalty engine granted points to any order that showed up already marked delivered+paid.',
      'This is mass assignment wearing a commerce costume. The client controls fields it should never own — lifecycle state — and downstream business rules trust them. Free points, tier upgrades, discount eligibility: all minted by one hand-crafted request with zero money attached.',
    ],
    hints: [
      'Use CREATE ORDER (as the UI sends it) once and read the log. The UI sends status created and payment_state unpaid — because it has to. Does anything make you?',
      'The raw JSON box below is your request body. Edit it: set status to delivered and payment_state to paid, then POST it. You are the client; the endpoint believes you.',
      'Watch the loyalty panel tick up while COLLECTED stays $0.00. The points trigger fired on arrival — it never asked who set the fields it trusted.',
    ],
    exploit: [
      'Create one order normally and note the log: the UI sends status: "created", payment_state: "unpaid". Order born, no points, no money.',
      'Edit the raw JSON body: change status to "delivered" and payment_state to "paid". POST /api/orders with it.',
      'The order lands delivered+paid on arrival. The loyalty trigger grants points for the full order value — check the LOYALTY panel and your tier.',
      'COLLECTED still reads $0.00. In patched mode the same request is accepted but the server pins the order to created/unpaid and tells you which fields it ignored; points now only flow through the server-verified SETTLE then FULFILL transitions, exactly once.',
    ],
    patchNote:
      'The server now owns lifecycle state. Initial order state is pinned to created/unpaid at creation, and client-supplied status or payment_state fields are dropped and acknowledged as ignored. Loyalty points moved to a server-verified transition — the payment webhook settles money, a staff/ops fulfill call delivers — and the grant is guarded by a pointsGranted ledger flag so it fires exactly once per order, no matter how many transitions replay. Client input defines what you want to buy; it never defines what state the purchase is in.',
    howFound:
      'Classic devtools move: I opened the order-create request from the real UI, copied it as fetch, added status and payment_state to the body, and sent it. The response came back 200 with the order already delivered. The loyalty credit posted before I refreshed the profile page.',
    vulnCode: `// POST /api/orders — as it shipped
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
}`,
    patchedCode: `// POST /api/orders — patched
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
}`,
  },
  {
    id: 4,
    title: 'IDOR ON ORDER LOOKUP',
    className: 'OWASP A01:2021 Broken Access Control',
    difficulty: 1,
    brief: [
      'The order-tracking page looked up an order by reference and showed it to whoever asked. No ownership predicate, no role check. References were short, sequential, and printed on every invoice and confirmation email — so any logged-in customer could walk the range and read any other customer\'s order: shipping address, phone, items, totals.',
      'This is the textbook Insecure Direct Object Reference, and it survived for years for a reason you will hear in every codebase: staff used the same endpoint, so "adding a check would break staff." The fix is not to pick between customers and staff — it is to authorize the caller against the object.',
    ],
    hints: [
      'You are signed in as you (customer). Your own order is MF-1007 — look it up first to see what a legitimate tracking response contains.',
      'References are sequential. Try the numbers right below yours: MF-1006, MF-1005, MF-1004... every one of them is another customer\'s order.',
      'MF-1001 belongs to Marta Kowalski in Warsaw. Note the PII LEAK badge — the demo tags any response whose order owner is not you.',
    ],
    exploit: [
      'Look up MF-1007 — your own order. The tracker shows items, total, address: a normal, boring response.',
      'Look up MF-1001. Full read: another customer\'s name, street address, phone number, purchase history. The API never asked whose session was asking.',
      'Realize the range is finite and sequential: a loop over MF-1001..MF-100N is a customer database dump with a for-loop.',
      'Toggle PATCHED MODE: another customer\'s reference now returns the exact same NOT FOUND as a nonexistent one — no data, and no oracle to tell the two apart. Staff can still read everything; the check that "would break staff" broke nothing.',
    ],
    patchNote:
      'The lookup now authorizes before it serializes: owner-or-staff, evaluated server-side against the session, every time. And the failure mode was chosen deliberately — a not-yours order answers byte-identically to a nonexistent one (NOT FOUND, same message), so the patched endpoint cannot be used as an existence oracle either. Access control is not a UI concern and not a staff-versus-customer tradeoff; it is a predicate on (caller, object) applied where the object is read.',
    howFound:
      'Sequential references in confirmation emails were the tell. I incremented my own order reference by one in the tracking URL and got a stranger\'s home address. The original report was three requests: mine, minus-one, minus-two — three different customers, all 200 OK.',
    vulnCode: `// GET /api/orders/:reference — as it shipped
lookup(reference) {
  const order = orders.get(reference)
  if (!order) return notFound()
  // BUG: the order is returned to whoever asks. No ownership
  // predicate, no role check — refs are sequential, so this
  // endpoint is a customer database with a for-loop.
  return { ok: true, order }
}`,
    patchedCode: `// GET /api/orders/:reference — patched
lookup(reference, session) {
  const order = orders.get(reference)
  if (!order) return notFound()
  const isOwner = order.ownerId === session.userId
  const isStaff = session.role === 'staff'
  // PATCH: authorize the caller against the object — owner or staff.
  if (!isOwner && !isStaff) return notFound()  // same answer as a miss:
  return { ok: true, order }                  // no existence oracle
}`,
  },
  {
    id: 5,
    title: 'ROUTE SHADOWING',
    className: 'SPA guard bypass · duplicate route registration · OWASP A01:2021',
    difficulty: 3,
    brief: [
      'Two teams, one path. An "ops console" feature module registered /admin as a plain route and mounted early in the app. Months later the platform team added /admin again — this time behind a proper staff guard. React Router matches the first route registered for a path, so the guarded registration was dead code the moment it shipped. Nobody was warned: no error, no warning, just a silently unreachable route.',
      'The result: the unguarded console won, and every guest on the internet was one URL away from refunds, price overrides, and a customer export. All the careful guard code existed — you could read it in the repo — it just never ran. SPA access control is decided by route resolution order, and nothing in the framework tells you when you have accidentally made order the vulnerability.',
    ],
    hints: [
      'Read the ROUTE TABLE in registration order. Two rows claim /admin. Which one has the guard — and which one is marked SHADOWED?',
      'Set the role selector to guest and hit NAVIGATE TO /admin. The guard you can see in the table never runs: the router matched the first registration, and it has no guard at all.',
      'Toggle PATCHED MODE and watch the route inventory: one /admin, guarded, and a duplicate registration now fails loudly at boot instead of becoming dead code.',
    ],
    exploit: [
      'Read the route table: registration #1 is /admin with NO guard (the ops-console feature module, mounted early). Registration #2 is /admin WITH a staff guard — struck through, marked SHADOWED, never matches.',
      'Set the role to guest and click NAVIGATE TO /admin. The console shell renders: refunds, price overrides, customer export. The guard exists in the codebase and never executes.',
      'Switch role to staff and navigate again — same screen, but notice it is the SAME unguarded screen; the staff-only version is unreachable dead code in vulnerable mode.',
      'Toggle PATCHED MODE: the boot now registers /admin exactly once, guarded. A guest gets ACCESS DENIED, staff get the real admin panel — and the route-inventory test (see the vitest suite) fails the build on the first duplicate registration instead of shipping it.',
    ],
    patchNote:
      'One registration per path, enforced mechanically: the patched router throws ROUTE_ALREADY_REGISTERED on any duplicate, and a route-inventory test asserts the full table at boot — the first shadowed registration fails CI instead of shipping as silent dead code. The single /admin registration carries the staff guard, and the guard is also enforced at resolution time, so even a future unguarded re-registration cannot win by mounting early. Route tables are security configuration; duplicate entries are a build failure, not a footnote.',
    howFound:
      'During the route audit I listed every path the bundle could render and diffed it against the routes file. /admin appeared twice in the built app but once in the guarded config. Clicking through as a logged-out user confirmed which one served. The guard code was fine — it was just unreachable, which is its own kind of bug.',
    vulnCode: `// app boot — as it shipped (two modules, one path)
register({ path: '/admin', screen: OPS_CONSOLE })            // #1: no guard
register({ path: '/admin', screen: ADMIN, guard: staffOnly })// #2: dead code

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
}`,
    patchedCode: `// app boot — patched (one module, one path, one guard)
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
})`,
  },
]
