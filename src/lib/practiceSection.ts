// Sections of the 練習 tab, and which one was used last (where the bottom-nav tab goes back to).
export const PRACTICE_SECTIONS = [
  { to: '/practice', label: '會話' },
  { to: '/reading', label: '讀音' },
] as const

const LAST_KEY = 'nihongo-coach-practice-section'

export function lastPracticeSection(): string {
  try {
    const last = localStorage.getItem(LAST_KEY)
    return PRACTICE_SECTIONS.find((s) => s.to === last)?.to ?? PRACTICE_SECTIONS[0].to
  } catch {
    return PRACTICE_SECTIONS[0].to
  }
}

export function rememberPracticeSection(to: string) {
  try {
    localStorage.setItem(LAST_KEY, to)
  } catch {
    // private mode: always start on the first section
  }
}
