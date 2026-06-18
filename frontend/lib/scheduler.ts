// Mirrors agents/scheduler.py — finds next optimal posting slot per channel

const OPTIMAL_SLOTS: Record<string, { weekdays: number[]; hour: number }[]> = {
  linkedin: [
    { weekdays: [1, 2, 3], hour: 9 },
    { weekdays: [1, 2, 3], hour: 12 },
    { weekdays: [0, 4], hour: 9 },
  ],
  instagram: [
    { weekdays: [0, 1, 2, 3, 4], hour: 11 },
    { weekdays: [0, 1, 2, 3, 4], hour: 19 },
    { weekdays: [5, 6], hour: 10 },
  ],
  email: [
    { weekdays: [1, 3], hour: 9 },
    { weekdays: [1, 3], hour: 14 },
  ],
  tiktok: [
    { weekdays: [0, 1, 2, 3, 4], hour: 19 },
    { weekdays: [5, 6], hour: 10 },
  ],
}

export function findNextSlot(channel: string, bookedDates: Set<string>): Date {
  const slots = OPTIMAL_SLOTS[channel] ?? OPTIMAL_SLOTS.linkedin
  const now = new Date()

  for (let daysAhead = 1; daysAhead <= 60; daysAhead++) {
    const candidate = new Date(now)
    candidate.setDate(candidate.getDate() + daysAhead)
    const dateStr = candidate.toISOString().slice(0, 10)

    if (bookedDates.has(dateStr)) continue

    const weekday = candidate.getDay() === 0 ? 6 : candidate.getDay() - 1 // convert Sun=0 to Mon=0

    for (const slot of slots) {
      if (!slot.weekdays.includes(weekday)) continue

      const result = new Date(candidate)
      result.setHours(slot.hour, 0, 0, 0)
      if (result > now) return result
    }
  }

  // Fallback: 7 days from now at 9am
  const fallback = new Date(now)
  fallback.setDate(fallback.getDate() + 7)
  fallback.setHours(9, 0, 0, 0)
  return fallback
}
