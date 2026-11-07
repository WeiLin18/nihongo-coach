// Month/day in the device's time zone, e.g. 11/05 (createdAt is stored in UTC).
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })

// Today in the device's time zone as YYYY-MM-DD, the date prepared items are filed under.
export const localDate = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`

// Prepared items for today that have not been opened yet, oldest first (the order they were written).
export const todayQueue = <T extends { preparedFor: string | null; openedAt: string | null; createdAt: string }>(items: T[]) =>
  items.filter((i) => i.preparedFor === localDate() && !i.openedAt).sort((a, b) => a.createdAt.localeCompare(b.createdAt))
