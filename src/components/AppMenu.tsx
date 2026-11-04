import { useEffect, useRef, useState } from 'react'
import { Link, useLocation } from 'react-router'

// Top bar with a ☰ menu for things you rarely need (settings), keeping the bottom nav for daily use.
export function AppMenu() {
  const { pathname } = useLocation()
  // The page the menu was opened on, so navigating anywhere closes it.
  const [openOn, setOpenOn] = useState<string | null>(null)
  const open = openOn === pathname
  const setOpen = (value: boolean) => setOpenOn(value ? pathname : null)
  const ref = useRef<HTMLDivElement>(null)

  // Close on any tap outside the menu.
  useEffect(() => {
    if (!open) return
    const close = (e: PointerEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpenOn(null)
    }
    document.addEventListener('pointerdown', close)
    return () => document.removeEventListener('pointerdown', close)
  }, [open])

  return (
    <header className="mb-3 flex items-center justify-between">
      <Link to="/" className="text-sm font-semibold text-gray-400">
        Nihongo Coach
      </Link>
      <div ref={ref} className="relative">
        <button
          onClick={() => setOpen(!open)}
          aria-label="選單"
          aria-expanded={open}
          className="-mr-2 flex h-9 w-9 items-center justify-center rounded-full text-xl text-gray-600 active:bg-gray-100"
        >
          ☰
        </button>
        {open && (
          <nav className="absolute right-0 z-20 mt-1 w-40 overflow-hidden rounded-lg border border-gray-200 bg-white py-1 shadow-lg">
            <Link to="/settings" className="block px-4 py-2.5 text-sm active:bg-gray-100">
              ⚙️ 設定
            </Link>
          </nav>
        )}
      </div>
    </header>
  )
}
