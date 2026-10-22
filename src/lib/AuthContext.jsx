import React, { createContext, useState, useContext, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

const AuthContext = createContext();

// The signed-in account is remembered on this phone so the app opens instantly;
// the server check runs in the background and signs you out if the session ended.
const CACHE = 'dz-me';
const readCached = () => { try { return JSON.parse(localStorage.getItem(CACHE) || 'null'); } catch { return null; } };
const writeCached = (u) => { try { if (u) localStorage.setItem(CACHE, JSON.stringify(u)); else localStorage.removeItem(CACHE); } catch { /* ignore */ } };

export const AuthProvider = ({ children }) => {
  const [user, setUserState] = useState(readCached);
  const [isLoadingAuth, setIsLoadingAuth] = useState(() => !readCached());
  const setUser = (u) => { writeCached(u); setUserState(u); };

  const checkUserAuth = useCallback(async () => {
    try {
      setUser(await base44.auth.me());
    } catch (e) {
      // Offline or server hiccup: keep the remembered account. Signed out: forget it.
      if (!e.status || e.status === 401 || e.status === 403) { if (e.status) setUser(null); else if (!readCached()) setUser(null); }
    } finally {
      setIsLoadingAuth(false);
    }
  }, []);

  useEffect(() => { checkUserAuth(); }, [checkUserAuth]);

  const logout = () => {
    setUser(null);
    try { ['dz-data-cache'].forEach((k) => localStorage.removeItem(k)); } catch { /* ignore */ }
    base44.auth.logout('/login');
  };

  return (
    <AuthContext.Provider value={{ user, isAuthenticated: !!user, isLoadingAuth, logout, checkUserAuth }}>
      {children}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within an AuthProvider');
  return context;
};
