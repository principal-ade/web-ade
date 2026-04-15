/**
 * Device ID utility for web browsers
 *
 * Generates and persists a unique device identifier for this browser.
 * Used to track device-specific sessions in the auth server.
 */

const DEVICE_ID_KEY = 'web-ade-device-id';

/**
 * Generate a UUID v4
 */
function generateUUID(): string {
  // Use crypto.randomUUID if available (modern browsers)
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }

  // Fallback for older browsers
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Get or create a device ID for this browser
 *
 * Strategy:
 * 1. Try to read from localStorage (persistent across sessions)
 * 2. If not found or error, generate a new UUID
 * 3. Store in localStorage for future use
 *
 * Format: browser-{uuid}
 */
export function getDeviceId(): string {
  try {
    // Try to get existing device ID from localStorage
    if (typeof window !== 'undefined' && window.localStorage) {
      const existingId = localStorage.getItem(DEVICE_ID_KEY);
      if (existingId) {
        return existingId;
      }
    }
  } catch (error) {
    console.warn('[DeviceId] Failed to read from localStorage:', error);
  }

  // Generate new device ID
  const deviceId = `browser-${generateUUID()}`;

  // Try to store it for next time
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.setItem(DEVICE_ID_KEY, deviceId);
    }
  } catch (error) {
    console.warn('[DeviceId] Failed to write to localStorage:', error);
    // Continue anyway - device ID will be regenerated on next page load
  }

  return deviceId;
}

/**
 * Get device metadata for tracking
 */
export function getDeviceMetadata(): {
  userAgent?: string;
  platform?: string;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return {};
  }

  return {
    userAgent: navigator.userAgent,
    platform: navigator.platform,
  };
}

/**
 * Clear the stored device ID (useful for testing or logout)
 */
export function clearDeviceId(): void {
  try {
    if (typeof window !== 'undefined' && window.localStorage) {
      localStorage.removeItem(DEVICE_ID_KEY);
    }
  } catch (error) {
    console.warn('[DeviceId] Failed to clear device ID:', error);
  }
}
