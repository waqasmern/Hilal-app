/**
 * Dynamic API Base URL configuration.
 * - In Electron desktop app: uses 'http://localhost:5000' (local Express backend).
 * - In Vercel / Cloud: uses relative path '' so requests go to Next.js serverless API routes (`/api/...`).
 * - In local development: uses NEXT_PUBLIC_API_URL if set, or empty string to use Next.js routes.
 */

export function getApiBase() {
    if (typeof window !== 'undefined') {
        const isElectron = 
            window.location.protocol === 'app:' || 
            window.location.protocol === 'file:' || 
            (typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('electron'));
        if (isElectron) {
            return 'http://localhost:5000';
        }
    }
    return process.env.NEXT_PUBLIC_API_URL || '';
}

export const API_BASE = typeof window !== 'undefined' ? getApiBase() : (process.env.NEXT_PUBLIC_API_URL || '');

export function apiUrl(path) {
    const base = getApiBase();
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${base}${cleanPath}`;
}

export default apiUrl;
