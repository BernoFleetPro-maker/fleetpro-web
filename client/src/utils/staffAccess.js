// Shared between Sidebar.jsx and App.jsx so a nav link and its route can
// never disagree about whether a staff member can see/reach something.

// Fail-open: an absent or non-boolean value means "visible" — mirrors the
// schema/migration default (existing controllers had unconditional full
// access; an ambiguous or missing key should never silently hide an item).
export function canSeeStaffItem(role, permissions, key) {
  if (role !== "staff") return true;
  if (!key) return true;
  return permissions?.[key] !== false;
}
