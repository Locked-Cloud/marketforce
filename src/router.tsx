// Minimal hash-based router — zero dependencies on purpose.
// The lab's own routing story (C5) is about guard discipline, not about
// which router library you use.

import { useSyncExternalStore } from 'react'
import type { ReactNode } from 'react'

function currentPath(): string {
  const hash = window.location.hash
  return hash.startsWith('#') ? hash.slice(1) : '/'
}

function subscribe(cb: () => void): () => void {
  window.addEventListener('hashchange', cb)
  return () => window.removeEventListener('hashchange', cb)
}

export function useRoute(): string {
  return useSyncExternalStore(subscribe, currentPath, () => '/')
}

export function navigate(to: string): void {
  window.location.hash = to
}

export function Link({
  to,
  className,
  children,
}: {
  to: string
  className?: string
  children: ReactNode
}) {
  return (
    <a href={`#${to}`} className={className}>
      {children}
    </a>
  )
}
