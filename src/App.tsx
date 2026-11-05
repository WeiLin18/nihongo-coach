import { useEffect } from 'react'
import { BrowserRouter, NavLink, Route, Routes, useLocation } from 'react-router'
import { AppMenu } from './components/AppMenu'
import { getToken } from './lib/api'
import { lastPracticeSection, PRACTICE_SECTIONS, rememberPracticeSection } from './lib/practiceSection'
import { CardDetail } from './pages/CardDetail'
import { Cards } from './pages/Cards'
import { Home } from './pages/Home'
import { Practice } from './pages/Practice'
import { PracticeLayout } from './pages/PracticeLayout'
import { Reading } from './pages/Reading'
import { Settings } from './pages/Settings'

const tab = ({ isActive }: { isActive: boolean }) =>
  `flex-1 py-3 text-center text-sm ${isActive ? 'font-semibold text-rose-600' : 'text-gray-500'}`

// Re-checked on every navigation, so saving the token in Settings lands on Home.
function Start() {
  useLocation()
  return getToken() ? <Home /> : <Settings />
}

function BottomNav() {
  const { pathname } = useLocation()
  // 練習 reopens the section used last (會話 or 讀音).
  const section = PRACTICE_SECTIONS.find((s) => pathname.startsWith(s.to))?.to
  useEffect(() => {
    if (section) rememberPracticeSection(section)
  }, [section])
  return (
    <nav className="fixed inset-x-0 bottom-0 flex border-t bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <NavLink to="/" end className={tab}>
        查詢
      </NavLink>
      <NavLink to={section ?? lastPracticeSection()} className={() => tab({ isActive: !!section })}>
        練習
      </NavLink>
      <NavLink to="/cards" className={tab}>
        卡片
      </NavLink>
    </nav>
  )
}

export default function App() {
  return (
    <BrowserRouter>
      <main className="mx-auto max-w-xl px-4 pt-[max(1rem,env(safe-area-inset-top))] pb-24">
        <AppMenu />
        <Routes>
          <Route path="/" element={<Start />} />
          <Route element={<PracticeLayout />}>
            <Route path="/practice" element={<Practice />} />
            <Route path="/reading" element={<Reading />} />
            <Route path="/reading/:id" element={<Reading />} />
          </Route>
          <Route path="/cards" element={<Cards />} />
          <Route path="/cards/:id" element={<CardDetail />} />
          <Route path="/settings" element={<Settings />} />
        </Routes>
      </main>
      <BottomNav />
    </BrowserRouter>
  )
}
