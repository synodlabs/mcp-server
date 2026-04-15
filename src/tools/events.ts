/**
 * tools/events.ts â€” get_recent_events tool
 */

import { synodWs } from "../transport/websocket.js";

export function getRecentEvents(limit = 20): {
  success: boolean;
  events: ReturnType<typeof synodWs.getRecentEvents>;
  message: string;
} {
  const events = synodWs.getRecentEvents(limit);

  return {
    success: true,
    events,
    message: events.length > 0
      ? `Returning ${events.length} recent Synod event(s).`
      : "No Synod events have been received yet.",
  };
}
