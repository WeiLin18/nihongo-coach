import { NavLink, Outlet } from 'react-router'
import { PRACTICE_SECTIONS } from '../lib/practiceSection'

// The 練習 tab: conversation drills and kanji reading, switched with underline tabs
// so they don't look like the segmented controls inside each page.
export function PracticeLayout() {
  return (
    <div className="space-y-4">
      <nav className="flex border-b">
        {PRACTICE_SECTIONS.map((s) => (
          <NavLink
            key={s.to}
            to={s.to}
            className={({ isActive }) =>
              `-mb-px flex-1 border-b-2 py-2 text-center ${isActive ? 'border-rose-600 font-semibold text-rose-600' : 'border-transparent text-gray-500'}`
            }
          >
            {s.label}
          </NavLink>
        ))}
      </nav>
      <Outlet />
    </div>
  )
}
