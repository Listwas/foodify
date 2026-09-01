import { StrictMode, Suspense, lazy } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { BrowserRouter, Routes, Route, Outlet, Link } from 'react-router-dom'
import { ToastProvider } from './context/ToastContext'
import Nav from './components/Nav'
import WeekView from './pages/week/WeekView'
import { hydrate } from './store'
import { loadRecipes } from './data/library'
import './index.css'

const DayDetail = lazy(() => import('./pages/day/DayDetail.tsx'))
const ShoppingList = lazy(() => import('./pages/shopping/ShoppingList.tsx'))
const RecipeBrowse = lazy(() => import('./pages/recipes/RecipeBrowse.tsx'))
const RecipePage = lazy(() => import('./pages/recipes/RecipePage.tsx'))
const Discover = lazy(() => import('./pages/discover/Discover.tsx'))
const History = lazy(() => import('./pages/discover/History.tsx'))
const Profile = lazy(() => import('./pages/profile/Profile.tsx'))

function Layout() {
  return (
    <>
      <Nav />
      <Suspense fallback={null}>
        <Outlet />
      </Suspense>
    </>
  )
}

/**
 * Any address the app doesn't recognise.
 *
 * `_redirects` hands every path to index.html so deep links work, which means
 * an unknown one reaches the router rather than the server. Without this it
 * matched no route and rendered a blank page — including for anyone still
 * running a cached copy from before a new page shipped.
 */
function NotFound() {
  return (
    <div className="page">
      <h1>There's nothing here</h1>
      <p className="muted">That address doesn't match anything in Foodify.</p>
      <Link to="/" className="btn primary">Back to the plan</Link>
    </div>
  )
}

function App() {
  return (
    <StrictMode>
      <ToastProvider>
        <BrowserRouter>
          <Routes>
            <Route element={<Layout />}>
              <Route path="/" element={<WeekView />} />
              <Route path="/day/:date" element={<DayDetail />} />
              <Route path="/shopping" element={<ShoppingList />} />
              <Route path="/shopping/:start" element={<ShoppingList />} />
              <Route path="/discover" element={<Discover />} />
              <Route path="/discover/history" element={<History />} />
              <Route path="/recipes" element={<RecipeBrowse />} />
              <Route path="/recipe/:id" element={<RecipePage />} />
              <Route path="/profile" element={<Profile />} />
              <Route path="*" element={<NotFound />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </ToastProvider>
    </StrictMode>
  )
}

function Failed({ error }: { error: unknown }) {
  return (
    <div className="page">
      <h1>Foodify couldn't start</h1>
      <p className="muted">{error instanceof Error ? error.message : String(error)}</p>
      <button className="btn" onClick={() => location.reload()}>Try again</button>
    </div>
  )
}

// Mounting is async (see below), so the module can be evaluated again — by
// Vite's HMR, or by the entry being pulled in twice — before the first render
// lands. Creating a second root on the same node puts two React trees on one
// DOM element, which share this app's module-level store and then update each
// other mid-render. One root per container, reused.
const container = document.getElementById('root')! as HTMLElement & { _root?: Root }
const root = (container._root ??= createRoot(container))

// Both the saved state and the recipe library are needed before anything can
// render, and both are local — IndexedDB and a precached file — so waiting is a
// few milliseconds rather than a network round trip. index.html paints a
// placeholder in the meantime.
Promise.all([hydrate(), loadRecipes()]).then(
  () => root.render(<App />),
  error => root.render(<Failed error={error} />),
)
