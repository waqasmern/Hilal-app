/**
 * Dynamic API Base URL configuration.
 * - In Vercel / Cloud: uses relative path '' so requests go to Next.js serverless API routes (`/api/...`).
 * - In local development: uses NEXT_PUBLIC_API_URL if set, or empty string to use Next.js routes.
 */
export const API_BASE = process.env.NEXT_PUBLIC_API_URL || '';

export function apiUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `${API_BASE}${cleanPath}`;
}

export default apiUrl;
