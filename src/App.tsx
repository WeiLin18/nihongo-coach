import { useEffect, useState } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { api, getToken } from './lib/api'
import { CardDetail } from './pages/CardDetail'
import { Cards } from './pages/Cards'
import { Home } from './pages/Home'
import { Review, REVIEW_CHANGED } from './pages/Review'
import { Settings } from './pages/Settings'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-rose-600' : 'text-gray-500'}`

// Re-checked on every navigation, so saving the token in Settings lands on Home.
function Start() {
  useLocation()
  return getToken() ? <Home /> : <Settings />
}

// Cards to review today; refreshed on navigation and after each rating.
function DueBadge() {
  const { pathname } = useLocation()
  const [due, setDue] = useState(0)
  useEffect(() => {
    if (!getToken()) return
    const refresh = () => api.reviewCount().then((s) => setDue(s.due + s.new), () => {})
    refresh()
    window.addEventListener(REVIEW_CHANGED, refresh)
    return () => window.removeEventListener(REVIEW_CHANGED, refresh)
  }, [pathname])
  if (!due) return null
  return (
    <span className="ml-1 rounded-full bg-rose-500 px-1.5 py-0.5 text-[10px] font-semibold text-white">
      {due > 99 ? '99+' : due}
    </span>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <main className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/review" element={<Review />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/cards/:id" element={<CardDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <NavLink to="/" end className={tab}>
          練習
        </NavLink>
        <NavLink to="/review" className={tab}>
          複習
          <DueBadge />
        </NavLink>
        <NavLink to="/cards" className={tab}>
          卡片
        </NavLink>
        <NavLink to="/settings" className={tab}>
          設定
        </NavLink>
      </nav>
    </BrowserRouter>
  )
}
