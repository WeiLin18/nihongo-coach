import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { getToken } from './lib/api'
import { CardDetail } from './pages/CardDetail'
import { Cards } from './pages/Cards'
import { Home } from './pages/Home'
import { Settings } from './pages/Settings'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-rose-600' : 'text-gray-500'}`

// Re-checked on every navigation, so saving the token in Settings lands on Home.
function Start() {
  useLocation()
  return getToken() ? <Home /> : <Settings />
}

export default function App() {
  return (
    <BrowserRouter>
      <main className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        <Routes>
          <Route path="/" element={<Start />} />
          <Route path="/cards" element={<Cards />} />
          <Route path="/cards/:id" element={<CardDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <nav className="fixed inset-x-0 bottom-0 flex border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
        <NavLink to="/" end className={tab}>
          練習
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
