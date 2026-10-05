// C5 — "ROUTE SHADOWING"
//
// Real-world origin (WOKOOD, 2026 audit): an "ops console" feature module
// registered /admin as a plain, unguarded route and mounted early in the
// app. A later platform module registered /admin again — this time behind a
// proper staff guard. React Router matches the FIRST route for a path, so
// the guarded registration was dead code: the unguarded console won, and
// every guest was one URL away from the ops console.
//
// The mini-router below reproduces those semantics in memory so the demo
// (and the tests) can watch the shadowing happen.

import type { Session } from './types'

export interface RouteDef {
  path: string
  screen: string
  guard?: (session: Session) => boolean
}

export interface RegisterResult {
  ok: boolean
  code?: string
  message?: string
}

export interface NavigateResult {
  screen: string
  guarded: boolean
}

export interface C5Api {
  mode: 'vulnerable' | 'patched'
  register(def: RouteDef): RegisterResult
  routes(): RouteDef[]
  shadowed(): RouteDef[]
  navigate(path: string, session: Session): NavigateResult
}

export const CONSOLE_SCREEN = 'OPS CONSOLE — refunds, price overrides, customer export'
export const GUARDED_SCREEN = 'ADMIN — staff console'

/** The vulnerable app's boot sequence: feature module first, platform second. */
export function bootC5Vulnerable(api: C5Api): void {
  // Feature module "ops-console-beta" — mounts early, registers unguarded.
  api.register({ path: '/admin', screen: CONSOLE_SCREEN })
  // Platform routes — the guarded registration is silently shadowed.
  api.register({ path: '/admin', screen: GUARDED_SCREEN, guard: (s) => s.role === 'staff' })
  api.register({ path: '/shop', screen: 'STOREFRONT — browse the catalog' })
  api.register({ path: '/orders', screen: 'MY ORDERS — your own orders', guard: (s) => s.role !== 'guest' })
}

/** The patched app's boot sequence: single guarded registration. */
export function bootC5Patched(api: C5Api): void {
  api.register({ path: '/admin', screen: GUARDED_SCREEN, guard: (s) => s.role === 'staff' })
  api.register({ path: '/shop', screen: 'STOREFRONT — browse the catalog' })
  api.register({ path: '/orders', screen: 'MY ORDERS — your own orders', guard: (s) => s.role !== 'guest' })
}

export function createC5Vulnerable(): C5Api {
  const table = new Map<string, RouteDef>()
  const shadowed: RouteDef[] = []

  return {
    mode: 'vulnerable',

    register(def) {
      if (table.has(def.path)) {
        // THE BUG — later registrations for the same path are silently
        // shadowed. First registration wins at match time; the second one
        // is dead code and nobody is told.
        shadowed.push(def)
        return { ok: true }
      }
      table.set(def.path, def)
      return { ok: true }
    },

    routes: () => [...table.values()],
    shadowed: () => [...shadowed],

    navigate(path, session) {
      const route = table.get(path)
      if (!route) return { screen: '404 — not found', guarded: false }
      // The guard only runs if the WINNING registration defined one.
      if (route.guard && !route.guard(session)) {
        return { screen: 'ACCESS DENIED — staff only', guarded: true }
      }
      return { screen: route.screen, guarded: Boolean(route.guard) }
    },
  }
}

export function createC5Patched(): C5Api {
  const table = new Map<string, RouteDef>()

  return {
    mode: 'patched',

    register(def) {
      // PATCH — duplicates fail loudly. A route-inventory test asserts the
      // full table at boot, so the first shadowed registration fails the
      // build instead of shipping as silent dead code.
      if (table.has(def.path)) {
        return {
          ok: false,
          code: 'ROUTE_ALREADY_REGISTERED',
          message: `duplicate route: ${def.path} — first registration wins; fix the inventory`,
        }
      }
      table.set(def.path, def)
      return { ok: true }
    },

    routes: () => [...table.values()],
    shadowed: () => [],

    navigate(path, session) {
      const route = table.get(path)
      if (!route) return { screen: '404 — not found', guarded: false }
      if (route.guard && !route.guard(session)) {
        return { screen: 'ACCESS DENIED — staff only', guarded: true }
      }
      return { screen: route.screen, guarded: Boolean(route.guard) }
    },
  }
}
