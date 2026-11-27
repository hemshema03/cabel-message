'use client';
import { useEffect } from 'react';
export default function PWARegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production' || !('serviceWorker' in navigator)) return;
    navigator.serviceWorker.register('/sw.js', { scope: '/', updateViaCache: 'none' })
      .catch(error => console.error('PWA registration failed:', error));
  }, []);
  return null;
}
