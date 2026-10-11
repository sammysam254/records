/**
 * Utility functions for extracting device serials and formatting workstation stream URLs.
 * 
 * Works with Android device control URLs such as:
 * https://android10.devicecontrol.app/?token=95993a1ffe036c0a:R3CN60C14GT:0:906257bb#!action=stream&udid=R3CN60C14GT...
 * Serial is extracted as: "R3CN60C14GT"
 */

/**
 * Extracts the physical/virtual device serial (e.g. R3CN60C14GT) from a workstation device URL
 */
export function extractDeviceSerial(raw: string | null | undefined): string {
  if (!raw) return '';
  const str = String(raw).trim();

  // 1. User specified rule: inside token parameter, the part starting with 'R'/'r'
  // e.g. token=95993a1ffe036c0a:R3CN60C14GT:0:906257bb or token=xxx:R3CN60C14GT&...
  const tokenRMatch = str.match(/token=[^&]*?:([rR][a-zA-Z0-9_-]+)/i);
  if (tokenRMatch && tokenRMatch[1]) {
    const candidate = tokenRMatch[1].split(':')[0].split('&')[0].split('#')[0];
    if (candidate) return candidate.toUpperCase();
  }

  // 2. Direct query parameter udid= (standard in devicecontrol.app URLs)
  const udidMatch = str.match(/[?&#]udid=([a-zA-Z0-9_-]+)/i) || str.match(/udid%3D([a-zA-Z0-9_-]+)/i);
  if (udidMatch && udidMatch[1]) {
    return udidMatch[1].split('&')[0].toUpperCase();
  }

  // 3. General token with colon-separated parts: token=<hash>:<serial>
  const generalTokenMatch = str.match(/token=([a-zA-Z0-9]+):([a-zA-Z0-9_-]+)/i);
  if (generalTokenMatch && generalTokenMatch[2]) {
    const candidate = generalTokenMatch[2].split(':')[0].split('&')[0].split('#')[0];
    if (candidate) return candidate.toUpperCase();
  }

  // 4. Standalone R-prefixed hardware serial (e.g. R3CN60C14GT)
  const standaloneR = str.match(/\b([rR][a-zA-Z0-9]{8,15})\b/);
  if (standaloneR && standaloneR[1]) {
    return standaloneR[1].toUpperCase();
  }

  // 5. If user pasted just the serial directly
  if (/^[a-zA-Z0-9_-]{6,25}$/.test(str)) {
    return str.toUpperCase();
  }

  return '';
}

/**
 * Ensures device URL has a valid protocol for opening in a browser tab
 */
export function getDeviceOpenUrl(deviceUrl: string | null | undefined): string {
  if (!deviceUrl) return '';
  const trimmed = deviceUrl.trim();
  if (trimmed.startsWith('http://') || trimmed.startsWith('https://')) {
    return trimmed;
  }
  return `https://${trimmed}`;
}
