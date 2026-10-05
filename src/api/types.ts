// Shared domain types for the MarketForce mini-store.
// Money is integer cents everywhere — floats never go near a payment.

export type Role = 'guest' | 'customer' | 'staff'

export interface Session {
  userId: string
  role: Role
}

export interface OrderItem {
  sku: string
  name: string
  unitCents: number
  qty: number
}

export type OrderStatus = 'created' | 'paid' | 'delivered' | 'cancelled'
export type PaymentState = 'unpaid' | 'paid'

export interface Order {
  reference: string
  ownerId: string
  items: OrderItem[]
  totalCents: number
  status: OrderStatus
  paymentState: PaymentState
  pointsGranted: number
  shippingAddress: string
  phone: string
}

export interface GiftCard {
  code: string
  amountCents: number
  state: 'unpaid' | 'active' | 'redeemed'
  ownerId: string
}

/** Format integer cents as a display string, e.g. 2500 → "$25.00". */
export function money(cents: number): string {
  const sign = cents < 0 ? '-' : ''
  const abs = Math.abs(cents)
  return `${sign}$${(abs / 100).toFixed(2)}`
}
