"use client";

import { useEffect, useState } from "react";
import type { z } from "zod";
import type { EventDetailResponse } from "@/server/api/schemas";

export const POLL_INTERVAL_MS = 5_000;

/**
 * Keeps the seat map current while the visitor looks at it, by polling the public
 * event API. Returns the IDs of the taken seats, or null until the first poll answers
 * (the server-rendered seat map is current until then).
 *
 * Polling, not a WebSocket or SSE stream: on serverless hosting a stream would hold a
 * function open per visitor, while a poll is a short request, and the API answers
 * 304 Not Modified when nothing changed (the browser revalidates with the ETag).
 * Polling stops while the tab is hidden and catches up as soon as it is visible again.
 * The booking itself is still checked on the server; this only keeps the map honest.
 */
export function useLiveTakenSeats(url: string, intervalMs = POLL_INTERVAL_MS): ReadonlySet<string> | null {
  const [taken, setTaken] = useState<ReadonlySet<string> | null>(null);

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let controller: AbortController | undefined;

    async function poll() {
      controller = new AbortController();
      try {
        const response = await fetch(url, { signal: controller.signal });
        if (response.ok) {
          const body: z.output<typeof EventDetailResponse> = await response.json();
          const next = new Set(
            body.data.sections.flatMap((section) =>
              section.seats.filter((seat) => !seat.available).map((seat) => seat.id),
            ),
          );
          // Keep the same Set when nothing changed, so the form does not re-render.
          setTaken((current) => (current && sameSet(current, next) ? current : next));
        }
      } catch (error) {
        if (controller.signal.aborted) return;
        // A failed poll (offline, a deploy) keeps the last known map; the next one retries.
        console.warn("Could not refresh seat availability", error);
      }
      controller = undefined;
      schedule();
    }

    function schedule() {
      clearTimeout(timer);
      if (document.visibilityState === "visible") {
        timer = setTimeout(poll, intervalMs);
      }
    }

    function onVisibilityChange() {
      // Catch up right away when the visitor comes back; a poll in flight reschedules itself.
      if (document.visibilityState === "visible" && !controller) {
        clearTimeout(timer);
        void poll();
      } else {
        clearTimeout(timer);
      }
    }

    schedule();
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      clearTimeout(timer);
      controller?.abort();
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [url, intervalMs]);

  return taken;
}

function sameSet(a: ReadonlySet<string>, b: ReadonlySet<string>) {
  return a.size === b.size && [...a].every((id) => b.has(id));
}
