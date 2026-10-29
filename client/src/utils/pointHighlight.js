// Hovering "Loading Points" / "Dropoff Points" in the sidebar makes that kind
// of point stand out a little on the map. The Sidebar (app shell) and MapView
// (a routed page) share no state, so the Sidebar announces the hover as a
// window event and MapView listens for it — nothing happens on pages that
// have no map listening.

export const POINT_HOVER_EVENT = "fleetpro:point-hover";

// type: "loading" | "dropoff" | null (null = hover ended)
export function announcePointHover(type) {
  window.dispatchEvent(new CustomEvent(POINT_HOVER_EVENT, { detail: { type } }));
}

// How a saved point's circle + centre dot look normally, and while its kind is
// hovered in the sidebar. Kept deliberately subtle: a slightly stronger fill,
// a thicker outline and a bigger centre dot.
export const POINT_STYLE = {
  base:  { fillOpacity: 0.18, strokeOpacity: 0.7, strokeWeight: 2, dotScale: 2, zIndex: 0 },
  hover: { fillOpacity: 0.40, strokeOpacity: 1,   strokeWeight: 4, dotScale: 4, zIndex: 5 },
};

// overlays: [{ circle, dot, type }] as kept by MapView. hoveredType: "loading"
// | "dropoff" | null — points of that kind stand out, everything else (and
// everything when null) gets the normal look.
export function applyPointHighlight(overlays, hoveredType) {
  for (const o of overlays || []) {
    const look = hoveredType && o.type === hoveredType ? POINT_STYLE.hover : POINT_STYLE.base;
    if (o.circle) {
      o.circle.setOptions({
        fillOpacity: look.fillOpacity, strokeOpacity: look.strokeOpacity,
        strokeWeight: look.strokeWeight, zIndex: look.zIndex,
      });
    }
    if (o.dot) o.dot.setIcon({ ...o.dot.getIcon(), scale: look.dotScale });
  }
}
