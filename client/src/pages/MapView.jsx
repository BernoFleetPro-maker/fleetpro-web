import React, { useEffect, useRef } from "react";

const API      = "https://fleetpro-backend-production.up.railway.app/api";
const MAPS_KEY = "AIzaSyCwlu54d0fcLUJ_7z7rG4wQSpDqoFlRPBw";

// Module-level phase cache — survives React navigation/remounting
const _phaseCache = {};

// Version stamp — change this to bust route cache after code updates
const ROUTE_CACHE_VERSION = "v2-truck-1.5";

export default function MapView() {
  const mapRef           = useRef(null);
  const mapInstance      = useRef(null);
  const markersRef       = useRef({});
  const pointOverlaysRef = useRef([]);
  const routeLinesRef    = useRef({});
  const routeCacheRef    = useRef({});
  const vehicleRouteRef  = useRef({}); // reg → { duration, distance, dest } for popup

  // ── Phase logic ──────────────────────────────────────────────────────────
  // Uses direction-of-travel to detect loading, not just radius
  // Phases: to_load → at_load → to_drop → at_drop
  function resolvePhase(id, taskId, atLoad, atDrop, hasLoadPt, hasDropPt, distToLoad, loadRadius) {
    const current = getPhase(id);

    // If new task — start fresh at to_load
    if (!current || current.taskId !== taskId) {
      const phase = hasLoadPt ? "to_load" : hasDropPt ? "to_drop" : null;
      setPhase(id, { phase, taskId, prevDistToLoad: distToLoad, closestToLoad: distToLoad, outsideLoadCount: 0, wasInsideLoad: false });
      return phase;
    }

    const phase    = current.phase;
    const prevDist = current.prevDistToLoad || distToLoad;
    const closest  = Math.min(current.closestToLoad || distToLoad, distToLoad);

    // Update tracking
    setPhase(id, { ...current, prevDistToLoad: distToLoad, closestToLoad: closest });

    const PHASE_ORDER   = { to_load: 0, at_load: 1, to_drop: 2, at_drop: 3 };
    const currentOrder  = PHASE_ORDER[phase] ?? 0;
    const advanceTo = (newPhase) => {
      if ((PHASE_ORDER[newPhase] ?? 0) > currentOrder) {
        setPhase(id, { ...current, phase: newPhase, prevDistToLoad: distToLoad, closestToLoad: closest });
        return newPhase;
      }
      return phase;
    };

    // to_load phase
    if (phase === "to_load") {
      if (atLoad) {
        setPhase(id, { ...current, phase: "at_load", wasInsideLoad: true, outsideLoadCount: 0, prevDistToLoad: distToLoad, closestToLoad: closest });
        return "at_load";
      }
      // Direction detection: was approaching, now moving away
      const wasApproaching = closest <= loadRadius * 2;
      const nowMovingAway  = distToLoad > prevDist && distToLoad > closest * 1.3;
      if (wasApproaching && nowMovingAway && hasDropPt) return advanceTo("to_drop");
      // Was inside before, now far away
      if (current.wasInsideLoad && distToLoad > loadRadius * 2 && hasDropPt) return advanceTo("to_drop");
    }

    // at_load phase
    if (phase === "at_load") {
      if (!atLoad) {
        const count = (current.outsideLoadCount || 0) + 1;
        setPhase(id, { ...current, outsideLoadCount: count, prevDistToLoad: distToLoad, closestToLoad: closest });
        if (count >= 2) return advanceTo(hasDropPt ? "to_drop" : phase);
        return "at_load";
      } else {
        setPhase(id, { ...current, outsideLoadCount: 0, wasInsideLoad: true, prevDistToLoad: distToLoad, closestToLoad: closest });
      }
    }

    // to_drop phase
    if (phase === "to_drop" && atDrop) return advanceTo("at_drop");

    return phase;
  }


