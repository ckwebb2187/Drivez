import React, { lazy, Suspense } from 'react'
import ReactDOM from 'react-dom/client'
import App from '@/App.jsx'
import '@/index.css'

// The Waze overlay (Android app) loads /overlay: just the floating widgets on a see-through page.
const OverlayPage = lazy(() => import('@/pages/OverlayPage.jsx'))
const overlay = location.pathname === '/overlay'
ReactDOM.createRoot(document.getElementById('root')).render(overlay ? <Suspense fallback={null}><OverlayPage /></Suspense> : <App />)

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('/sw.js').catch(() => {}));
}
