// Network utility for detecting online/offline state
class NetworkUtils {
    constructor() {
        this.isOnline = navigator.onLine;
        this.lastCheckTime = null;
        this.checkCache = null;
        this.checkCacheDuration = 5000; // 5 seconds
        
        // Listen for browser online/offline events
        window.addEventListener('online', () => {
            console.log('[NetworkUtils] Browser reports: ONLINE');
            this.isOnline = true;
            this.checkCache = { online: true, timestamp: Date.now() };
        });
        
        window.addEventListener('offline', () => {
            console.log('[NetworkUtils] Browser reports: OFFLINE');
            this.isOnline = false;
            this.checkCache = { online: false, timestamp: Date.now() };
        });
    }

    /**
     * Quick synchronous check using navigator.onLine
     * @returns {boolean} - true if browser thinks we're online
     */
    isOnlineSync() {
        return navigator.onLine;
    }

    /**
     * Fast async check with quick timeout - for Google Drive connectivity
     * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
     * @returns {Promise<boolean>} - true if online
     */
    async checkGoogleDriveConnectivity(timeout = 3000) {
        // Use cached result if recent
        if (this.checkCache && (Date.now() - this.checkCache.timestamp) < this.checkCacheDuration) {
            console.log('[NetworkUtils] Using cached connectivity result:', this.checkCache.online);
            return this.checkCache.online;
        }

        // First check navigator.onLine for instant offline detection
        if (!navigator.onLine) {
            console.log('[NetworkUtils] Navigator reports offline');
            this.checkCache = { online: false, timestamp: Date.now() };
            return false;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // Try to reach a Google service (lightweight endpoint)
            const response = await fetch('https://www.google.com/favicon.ico', {
                method: 'HEAD',
                mode: 'no-cors',
                cache: 'no-cache',
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            // With no-cors, we can't check response.ok, but if fetch didn't throw, we likely have connectivity
            this.checkCache = { online: true, timestamp: Date.now() };
            console.log('[NetworkUtils] Google connectivity check: ONLINE');
            return true;
        } catch (error) {
            console.log('[NetworkUtils] Google connectivity check: OFFLINE', error.message);
            this.checkCache = { online: false, timestamp: Date.now() };
            return false;
        }
    }

    /**
     * Fast check for local services (Ollama, SearXNG)
     * @param {string} url - URL to check
     * @param {number} timeout - Timeout in milliseconds (default: 2000ms)
     * @returns {Promise<boolean>} - true if reachable
     */
    async checkLocalService(url, timeout = 2000) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(url, {
                method: 'HEAD',
                signal: controller.signal,
                cache: 'no-cache'
            });

            clearTimeout(timeoutId);
            return response.ok || response.status < 500; // Accept any non-5xx response
        } catch (error) {
            console.log(`[NetworkUtils] Local service check failed for ${url}:`, error.message);
            return false;
        }
    }

    /**
     * Check general internet connectivity
     * @param {number} timeout - Timeout in milliseconds (default: 3000ms)
     * @returns {Promise<boolean>} - true if online
     */
    async checkInternetConnectivity(timeout = 3000) {
        // First check navigator.onLine
        if (!navigator.onLine) {
            return false;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            // Try multiple lightweight endpoints for reliability
            const endpoints = [
                'https://www.google.com/favicon.ico',
                'https://www.cloudflare.com/favicon.ico'
            ];

            // Race the endpoints - first successful response wins
            const fetchPromises = endpoints.map(endpoint =>
                fetch(endpoint, {
                    method: 'HEAD',
                    mode: 'no-cors',
                    cache: 'no-cache',
                    signal: controller.signal
                })
            );

            await Promise.race(fetchPromises);
            clearTimeout(timeoutId);
            return true;
        } catch (error) {
            console.log('[NetworkUtils] Internet connectivity check failed:', error.message);
            return false;
        }
    }

    /**
     * Clear the connectivity check cache
     */
    clearCache() {
        this.checkCache = null;
    }
}

// Create singleton instance
const networkUtils = new NetworkUtils();

// Export for use in other modules
if (typeof window !== 'undefined') {
    window.NetworkUtils = NetworkUtils;
    window.networkUtils = networkUtils;
}

if (typeof module !== 'undefined' && module.exports) {
    module.exports = { NetworkUtils, networkUtils };
}
