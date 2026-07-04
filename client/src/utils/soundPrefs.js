// Shared "available vehicle" sound preference — per-device, stored in
// localStorage only (no backend/database involvement).
export const SOUND_AVAILABLE_KEY = "fp_sound_available_enabled";

// On by default: only an explicit "false" turns it off.
export function isAvailableSoundEnabled() {
  try { return localStorage.getItem(SOUND_AVAILABLE_KEY) !== "false"; }
  catch { return true; }
}

export function setAvailableSoundEnabled(enabled) {
  try { localStorage.setItem(SOUND_AVAILABLE_KEY, String(!!enabled)); } catch {}
}

export function playAvailableSound() {
  if (!isAvailableSoundEnabled()) return;
  try {
    const audio = new Audio("/Sounds/universfield-new-notification-014-363678.mp3");
    audio.play().catch(() => {}); // browsers may block autoplay before user interaction — non-fatal
  } catch {}
}
