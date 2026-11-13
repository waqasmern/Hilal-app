/**
 * API Base URL configuration for Local Desktop System.
 * All requests route directly to the local Express backend on http://localhost:5000.
 */

export function getApiBase() {
    return 'http://localhost:5000';
}

export const API_BASE = 'http://localhost:5000';

export function apiUrl(path) {
    const cleanPath = path.startsWith('/') ? path : `/${path}`;
    return `http://localhost:5000${cleanPath}`;
}

export function resolveMediaUrl(mediaPath) {
    if (!mediaPath) return '';
    if (mediaPath.startsWith('http://') || mediaPath.startsWith('https://') || mediaPath.startsWith('data:')) {
        return mediaPath;
    }
    const cleanPath = mediaPath.startsWith('/') ? mediaPath : `/${mediaPath}`;
    return `http://localhost:5000${cleanPath}`;
}

export default apiUrl;
