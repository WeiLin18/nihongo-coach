// Month/day in the device's time zone, e.g. 11/05 (createdAt is stored in UTC).
export const shortDate = (iso: string) => new Date(iso).toLocaleDateString('ja-JP', { month: '2-digit', day: '2-digit' })
