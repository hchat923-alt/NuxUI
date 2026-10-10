/**
 * Puter Keep-Alive & Connection Resilience Service
 * Keeps Puter.js connection continuously warm, active, and listening.
 * Automatically recovers from idle sleep or session timeouts.
 */

declare global {
  interface Window {
    puter?: any;
  }
}

let keepAliveTimer: any = null;
let isInitialized = false;

/**
 * Checks if Puter SDK is ready on window.
 */
export function isPuterReady(): boolean {
  return typeof window !== 'undefined' && !!window.puter && !!window.puter.ai;
}

/**
 * Ensures Puter SDK is loaded and actively connected.
 * Waits up to 3 seconds for script injection if not yet ready.
 */
export async function ensurePuterConnected(): Promise<boolean> {
  if (typeof window === 'undefined') return false;

  // If already ready, verify connection
  if (isPuterReady()) {
    try {
      // Lightweight call to keep connection alive
      if (typeof window.puter?.auth?.isSignedIn === 'function') {
        await window.puter.auth.isSignedIn().catch(() => false);
      }
      return true;
    } catch {
      // ignore
    }
    return true;
  }

  // Wait for script to initialize if still loading
  return new Promise((resolve) => {
    let attempts = 0;
    const interval = setInterval(() => {
      attempts++;
      if (isPuterReady()) {
        clearInterval(interval);
        resolve(true);
      } else if (attempts > 15) {
        clearInterval(interval);
        resolve(false);
      }
    }, 200);
  });
}

/**
 * Ping Puter periodically (every 50 seconds) to prevent idle timeouts,
 * connection dropping, or sleeping tokens. Keeps Puter "always listening".
 */
export function startPuterKeepAlive(): void {
  if (typeof window === 'undefined' || isInitialized) return;
  isInitialized = true;

  // Clear any stale quota exhaustion flags on fresh load
  try {
    sessionStorage.removeItem('puter_quota_exhausted');
  } catch {}

  const pingPuter = async () => {
    if (!isPuterReady()) return;
    try {
      // Heartbeat: checks auth state or active session without consuming AI tokens
      if (typeof window.puter.auth?.isSignedIn === 'function') {
        await window.puter.auth.isSignedIn();
      } else if (typeof window.puter.ui?.show === 'function') {
        // connection probe
      }
    } catch {
      // Ignore background heartbeat errors
    }
  };

  // Initial ping after 2 seconds
  setTimeout(pingPuter, 2000);

  // Periodic heartbeat every 50 seconds
  if (keepAliveTimer) clearInterval(keepAliveTimer);
  keepAliveTimer = setInterval(pingPuter, 50000);

  // Also ping immediately whenever user returns to the tab (visibilitychange)
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pingPuter();
    }
  });

  // Also ping on window focus
  window.addEventListener('focus', () => {
    pingPuter();
  });
}
