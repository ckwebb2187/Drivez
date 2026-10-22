import { QueryClientProvider } from '@tanstack/react-query'
import { queryClientInstance } from '@/lib/query-client'
import { BrowserRouter as Router, Route, Routes, useLocation } from 'react-router-dom';
import ErrorBoundary from '@/components/ErrorBoundary';
import ProtectedRoute, { GuestOnly } from '@/components/ProtectedRoute';
import PageNotFound from './lib/PageNotFound';
import { AuthProvider } from '@/lib/AuthContext';
import ScrollToTop from './components/ScrollToTop';
import { AppProvider } from '@/lib/AppContext';
import Layout from '@/components/Layout';
import MapHome from '@/pages/MapHome';
import History from '@/pages/History';
import Leaderboard from '@/pages/Leaderboard';
import Profile from '@/pages/Profile';
import TripDetailPage from '@/pages/TripDetailPage';
import LiveMap from '@/pages/LiveMap';
import RoutesPage from '@/pages/RoutesPage';
import PlacesPage from '@/pages/PlacesPage';
import ImportPage from '@/pages/ImportPage';
import Login from '@/pages/Login';
import Register from '@/pages/Register';
import ForgotPassword from '@/pages/ForgotPassword';
import ResetPassword from '@/pages/ResetPassword';

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppProvider>
            <SafeRoutes>
            <Routes>
              <Route element={<GuestOnly />}>
                <Route path="/login" element={<Login />} />
                <Route path="/register" element={<Register />} />
                <Route path="/forgot-password" element={<ForgotPassword />} />
              </Route>
              <Route path="/reset-password" element={<ResetPassword />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  <Route path="/" element={<MapHome />} />
                  <Route path="/drive" element={null} /> {/* drawn by Layout so it keeps running in the background */}
                  <Route path="/history" element={<History />} />
                  <Route path="/leaderboard" element={<Leaderboard />} />
                  <Route path="/profile" element={<Profile />} />
                </Route>
                <Route path="/trip/:id" element={<TripDetailPage />} />
                <Route path="/live-map" element={<LiveMap />} />
                <Route path="/routes" element={<RoutesPage />} />
                <Route path="/places" element={<PlacesPage />} />
                <Route path="/import" element={<ImportPage />} />
              </Route>
              <Route path="*" element={<PageNotFound />} />
            </Routes>
            </SafeRoutes>
          </AppProvider>
        </Router>
      </QueryClientProvider>
    </AuthProvider>
  )
}

// Catches a crashed screen (instead of a black screen); moving to another page clears it.
function SafeRoutes({ children }) {
  const { pathname } = useLocation();
  return <ErrorBoundary resetKey={pathname}>{children}</ErrorBoundary>;
}
