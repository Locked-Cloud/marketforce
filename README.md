# MarketForce

**A deliberately-vulnerable mini-store security lab.** Five real commerce
vulnerabilities — each one found and fixed during a real production audit —
replayed as interactive browser challenges. Exploit them here, then read the
patch that shipped.

Dark terminal aesthetic, in-memory store, zero blast radius. State resets on
every visit, so break things.

## Why this exists

The author is a front-end developer with bug-bounty habits. Every challenge
below is a real bug he found and fixed in a real audited store (WOKOOD). The
lab teaches both directions of the craft:

- **Attack** — reproduce the exploit in the browser, in minutes, with hints
  if you want them.
- **Defense** — flip the **PATCHED MODE** toggle on any demo and feel the
  same attack die, then unseal THE REAL PATCH for the vulnerable/patched
  code side by side and how the bug was originally found.

It doubles as proof of both skill sets.

## Run it

```bash
npm install
npm run dev          # http://localhost:5173
```

```bash
npm run test:unit    # vitest — 13 tests: exploit works on the vuln twin,
                     #             rejected on the patched twin
npm run build        # tsc -b && vite build
npm run preview      # serve the production build
```

## The challenges

| #  | Name                   | Class                                                    | Difficulty |
|----|------------------------|----------------------------------------------------------|------------|
| 01 | FREE-MONEY MINTING     | Business logic / broken state machine (OWASP A04)        | ★★☆        |
| 02 | THE ENUMERATION ORACLE | Info disclosure + rate-limit rollback (OWASP A01/A05)    | ★★★        |
| 03 | CLIENT-TRUSTED STATE   | Mass assignment (OWASP A08)                              | ★★☆        |
| 04 | IDOR ON ORDER LOOKUP   | Broken access control (OWASP A01:2021)                  | ★☆☆        |
| 05 | ROUTE SHADOWING        | SPA guard bypass via duplicate route registration        | ★★★        |

Each challenge page carries, in order:

1. **BRIEF** — the bug class and the real-world context it lived in.
2. **INTERACTIVE DEMO** — a live, in-memory vulnerable API driven from the
   page, with a per-demo **PATCHED MODE** toggle that swaps in the fixed
   twin.
3. **HINTS** — a three-rung collapsible ladder. Climb only as far as you
   need.
4. **EXPLOIT** — the step-by-step kill chain.
5. **THE REAL PATCH** — the fix explained, vulnerable/patched code side by
   side, and how the bug was originally found in production.

## Every bug here was real

Not "inspired by", not "plausible". Each pattern shipped to production
customers, was found during a hands-on audit, and was fixed with the exact
class of patch shown in [PATCHES.md](PATCHES.md). The store name, datasets,
and identifiers in this lab are synthetic; the vulnerability mechanics are
not.

## Repository layout

```
src/
  api/            challenge twins — the actual vulnerable + patched logic
  challenges/     registry (narrative) + ChallengePage + 5 demos
  components/     terminal UI primitives (console, code blocks, hints, toggle)
  router.tsx      minimal hash router (no dependency, on purpose)
tests are colocated: src/api/*.test.ts
```

## Credits

Patterns from a real audited production store (WOKOOD), 2026.
Built to teach both sides of the aisle — break it here, ship the fix there.
