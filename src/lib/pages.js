// Every page except the drive map loads on demand, so the app starts fast.
// Shortly after startup they're all fetched in the background, so tab switches stay instant.
import { lazy } from 'react';

const loaders = {
  History: () => import('@/pages/History'),
  Leaderboard: () => import('@/pages/Leaderboard'),
  Profile: () => import('@/pages/Profile'),
  FeedPage: () => import('@/pages/FeedPage'),
  MeetsPage: () => import('@/pages/MeetsPage'),
  IdeasPage: () => import('@/pages/IdeasPage'),
  FamilyPage: () => import('@/pages/FamilyPage'),
  ConvoyPage: () => import('@/pages/ConvoyPage'),
  TripDetailPage: () => import('@/pages/TripDetailPage'),
  LiveMap: () => import('@/pages/LiveMap'),
  RoutesPage: () => import('@/pages/RoutesPage'),
  PlacesPage: () => import('@/pages/PlacesPage'),
  ImportPage: () => import('@/pages/ImportPage'),
  PublicProfile: () => import('@/pages/PublicProfile'),
  JoinPage: () => import('@/pages/JoinPage'),
  Login: () => import('@/pages/Login'),
  Register: () => import('@/pages/Register'),
  ForgotPassword: () => import('@/pages/ForgotPassword'),
  ResetPassword: () => import('@/pages/ResetPassword'),
};

export const Page = Object.fromEntries(Object.entries(loaders).map(([k, load]) => [k, lazy(load)]));

let started = false;
export function prefetchPages() {
  if (started) return;
  started = true;
  const order = ['History', 'Profile', 'FeedPage', 'MeetsPage', 'TripDetailPage', 'RoutesPage', 'PlacesPage', 'LiveMap', 'Leaderboard', 'ConvoyPage', 'ImportPage'];
  const idle = window.requestIdleCallback || ((fn) => setTimeout(fn, 300));
  const next = () => { const k = order.shift(); if (!k) return; loaders[k]().catch(() => {}).finally(() => idle(next)); };
  idle(next);
}
