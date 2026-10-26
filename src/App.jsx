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
import { Suspense } from 'react';
import { Page } from '@/lib/pages';

export default function App() {
  return (
    <AuthProvider>
      <QueryClientProvider client={queryClientInstance}>
        <Router>
          <ScrollToTop />
          <AppProvider>
            <SafeRoutes>
            <Suspense fallback={<div className="min-h-screen bg-background" />}>
            <Routes>
              <Route element={<GuestOnly />}>
                <Route path="/login" element={<Page.Login />} />
                <Route path="/register" element={<Page.Register />} />
                <Route path="/forgot-password" element={<Page.ForgotPassword />} />
              </Route>
              <Route path="/reset-password" element={<Page.ResetPassword />} />
              <Route path="/u/:username" element={<Page.PublicProfile />} />
              <Route path="/join/:code" element={<Page.JoinPage />} />
              <Route element={<ProtectedRoute />}>
                <Route element={<Layout />}>
                  {/* The drive map is the home screen. Layout draws it so it keeps running in the background. */}
                  <Route path="/" element={null} />
                  <Route path="/drive" element={null} />
                  <Route path="/history" element={<Page.History />} />
                  <Route path="/leaderboard" element={<Page.Leaderboard />} />
                  <Route path="/profile" element={<Page.Profile />} />
                  <Route path="/feed" element={<Page.FeedPage />} />
                  <Route path="/meets" element={<Page.MeetsPage />} />
                  <Route path="/family" element={<Page.FamilyPage />} />
                  <Route path="/convoy/:code" element={<Page.ConvoyPage />} />
                  {/* Full-screen pages: also inside Layout so a drive in progress keeps running. */}
                  <Route path="/trip/:id" element={<Page.TripDetailPage />} />
                  <Route path="/live-map" element={<Page.LiveMap />} />
                  <Route path="/routes" element={<Page.RoutesPage />} />
                  <Route path="/places" element={<Page.PlacesPage />} />
                  <Route path="/import" element={<Page.ImportPage />} />
                  <Route path="/ideas" element={<Page.IdeasPage />} />
                </Route>
              </Route>
              <Route path="*" element={<PageNotFound />} />
            </Routes>
            </Suspense>
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
