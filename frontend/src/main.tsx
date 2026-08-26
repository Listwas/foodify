import { StrictMode, Suspense, lazy } from 'react'
import { createRoot } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Outlet } from 'react-router-dom'
import { QueryClient, QueryClientProvider } from '@tanstack/react-query'
import { ToastProvider } from './context/ToastContext'
import Nav, { Footer } from './components/Nav'
import WeekView from './pages/week/WeekView'
import './index.css'

const DayDetail = lazy(() => import('./pages/day/DayDetail.tsx'))
const RecipeBrowse = lazy(() => import('./pages/recipes/RecipeBrowse.tsx'))
const RecipePage = lazy(() => import('./pages/recipes/RecipePage.tsx'))
const Discover = lazy(() => import('./pages/discover/Discover.tsx'))
const History = lazy(() => import('./pages/discover/History.tsx'))
const Profile = lazy(() => import('./pages/profile/Profile.tsx'))

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
})

function Layout() {
  return (
    <>
      <Nav />
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
      <Footer />
    </>
  )
}

createRoot(document.getElementById('root')!).render(
  <StrictMode>
    <QueryClientProvider client={queryClient}>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<WeekView />} />
              <Route path="/day/:id" element={<DayDetail />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/discover/history" element={<History />} />
              <Route path="/recipes" element={<RecipeBrowse />} />
              <Route path="/recipe/:id" element={<RecipePage />} />
              <Route path="/profile" element={<Profile />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </QueryClientProvider>
  </StrictMode>
)
