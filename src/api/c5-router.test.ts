import { describe, expect, it } from 'vitest'
import {
  bootC5Patched,
  bootC5Vulnerable,
  CONSOLE_SCREEN,
  createC5Patched,
  createC5Vulnerable,
} from './c5-router'
import type { Session } from './types'

const GUEST: Session = { userId: 'anon', role: 'guest' }
const STAFF: Session = { userId: 'staff_1', role: 'staff' }

describe('C5 — route shadowing', () => {
  it('VULNERABLE: the guarded /admin is shadowed; a guest gets the raw console', () => {
    const api = createC5Vulnerable()
    bootC5Vulnerable(api)

    // The guarded registration was silently ignored — no error, just dead code.
    expect(api.shadowed()).toHaveLength(1)
    expect(api.shadowed()[0]?.guard).toBeDefined()
    expect(api.routes().filter((r) => r.path === '/admin')).toHaveLength(1)

    // First registration wins at match time: guest lands on the console shell.
    const nav = api.navigate('/admin', GUEST)
    expect(nav.screen).toBe(CONSOLE_SCREEN)
    expect(nav.guarded).toBe(false)
  })

  it('PATCHED: duplicate registration fails loudly instead of shadowing silently', () => {
    const api = createC5Patched()

    expect(api.register({ path: '/admin', screen: 'first' }).ok).toBe(true)
    const dup = api.register({ path: '/admin', screen: 'second', guard: (s) => s.role === 'staff' })
    expect(dup.ok).toBe(false)
    expect(dup.code).toBe('ROUTE_ALREADY_REGISTERED')
    expect(api.routes()).toHaveLength(1)
  })

  it('PATCHED: single guarded registration — guests denied, staff through', () => {
    const api = createC5Patched()
    bootC5Patched(api)

    expect(api.navigate('/admin', GUEST).screen).toBe('ACCESS DENIED — staff only')
    expect(api.navigate('/admin', STAFF).screen).toContain('ADMIN')
    expect(api.navigate('/shop', GUEST).screen).toContain('STOREFRONT')
    expect(api.shadowed()).toHaveLength(0)
  })
})
