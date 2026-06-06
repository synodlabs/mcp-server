/**
 * websocket.ts â€” Persistent WebSocket client
 *
 * - Opens connection with ws_ticket query param
 * - Sends an application-level ping every 30s (connection already authenticated)
 * - Auto-reconnects with exponential backoff on drop
 * - Re-authenticates before reconnecting so a fresh ws_ticket is always used
 * - Stores recent events for polling-oriented MCP clients
 */

import { WebSocket } from "ws";

import {
  SYNOD_WS_URL,
  WS_PING_INTERVAL_MS,
  WS_RECONNECT_BASE_MS,
  WS_RECONNECT_MAX_MS,
} from "../config.js";
import { getErrorMessage } from "../lib/errors.js";

export type WsStatus = "disconnected" | "connecting" | "connected";

export interface SynodEvent {
  type: string;
  [key: string]: unknown;
}

export interface StoredSynodEvent {
  received_at: string;
  event: SynodEvent;
}

type EventHandler = (event: SynodEvent) => void;
type TicketRefresher = () => Promise<string>;
type WebSocketLike = WebSocket;
type WebSocketFactory = (url: string) => WebSocketLike;

interface SynodWebSocketOptions {
  createWebSocket?: WebSocketFactory;
  wsUrl?: string;
  pingIntervalMs?: number;
  reconnectBaseMs?: number;
  reconnectMaxMs?: number;
}

export class SynodWebSocket {
  private readonly _createWebSocket: WebSocketFactory;
  private readonly _wsUrl: string;
  private readonly _pingIntervalMs: number;
  private readonly _reconnectBaseMs: number;
  private readonly _reconnectMaxMs: number;

  private _ws: WebSocketLike | null = null;
  private _status: WsStatus = "disconnected";
  private _pingTimer: ReturnType<typeof setInterval> | null = null;
  private _reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private _reconnectAttempts = 0;
  private _destroyed = false;
  private _handlers: EventHandler[] = [];
  private _ticket = "";
  private _ticketRefresher: TicketRefresher | null = null;
  private _connectedAt: number | null = null;
  private _lastEventAt: number | null = null;
  private _lastError: string | null = null;
  private _recentEvents: StoredSynodEvent[] = [];

  constructor(options: SynodWebSocketOptions = {}) {
    this._createWebSocket = options.createWebSocket ?? ((url) => new WebSocket(url));
    this._wsUrl = options.wsUrl ?? SYNOD_WS_URL;
    this._pingIntervalMs = options.pingIntervalMs ?? WS_PING_INTERVAL_MS;
    this._reconnectBaseMs = options.reconnectBaseMs ?? WS_RECONNECT_BASE_MS;
    this._reconnectMaxMs = options.reconnectMaxMs ?? WS_RECONNECT_MAX_MS;
  }

  get status(): WsStatus { return this._status; }
  get connectedAt(): number | null { return this._connectedAt; }
  get lastEventAt(): number | null { return this._lastEventAt; }
  get lastError(): string | null { return this._lastError; }

  connect(ticket: string, options: { refreshTicket?: TicketRefresher } = {}): void {
    const previous = this._ws;

    this._ticket = ticket;
    this._ticketRefresher = options.refreshTicket ?? null;
    this._destroyed = false;
    this._clearTimers();
    this._ws = null;
    previous?.close();

    void this._doConnect(false);
  }

  onEvent(handler: EventHandler): void {
    this._handlers.push(handler);
  }

  getRecentEvents(limit = 20): StoredSynodEvent[] {
    return this._recentEvents.slice(0, Math.max(0, limit));
  }

  clearRecentEvents(): void {
    this._recentEvents = [];
    this._lastEventAt = null;
  }

  destroy(): void {
    this._destroyed = true;
    this._clearTimers();
    this._ws?.close();
    this._ws = null;
    this._status = "disconnected";
    this._ticketRefresher = null;
  }

  private async _doConnect(refreshTicket: boolean): Promise<void> {
    if (this._destroyed) return;

    this._status = "connecting";
    this._lastError = null;

    if (refreshTicket && this._ticketRefresher) {
      try {
        this._ticket = await this._ticketRefresher();
      } catch (error) {
        this._status = "disconnected";
        this._lastError = getErrorMessage(error, "Failed to refresh WebSocket ticket.");
        this._scheduleReconnect();
        return;
      }
    }

    const ws = this._createWebSocket(`${this._wsUrl}?ticket=${encodeURIComponent(this._ticket)}`);
    this._ws = ws;

    ws.on("open", () => {
      if (this._ws !== ws) return;

      this._status = "connected";
      this._connectedAt = Date.now();
      this._reconnectAttempts = 0;
      this._startPing();
    });

    ws.on("message", (raw) => {
      if (this._ws !== ws) return;

      try {
        const event = JSON.parse(raw.toString()) as SynodEvent;
        this._recordEvent(event);
        this._handlers.forEach((handler) => handler(event));
      } catch {
        // Ignore malformed frames from the upstream socket.
      }
    });

    ws.on("close", () => {
      if (this._ws !== ws) return;

      this._status = "disconnected";
      this._connectedAt = null;
      this._clearTimers();
      this._ws = null;

      if (!this._destroyed) {
        this._scheduleReconnect();
      }
    });

    ws.on("error", (error) => {
      if (this._ws !== ws) return;
      this._lastError = getErrorMessage(error, "WebSocket connection failed.");
    });
  }

  private _startPing(): void {
    this._pingTimer = setInterval(() => {
      if (this._ws?.readyState === WebSocket.OPEN) {
        this._ws.send("ping");
      }
    }, this._pingIntervalMs);
  }

  private _scheduleReconnect(): void {
    const delay = Math.min(
      this._reconnectBaseMs * Math.pow(2, this._reconnectAttempts),
      this._reconnectMaxMs
    );

    this._reconnectAttempts++;
    this._reconnectTimer = setTimeout(() => {
      void this._doConnect(true);
    }, delay);
  }

  private _recordEvent(event: SynodEvent): void {
    this._lastEventAt = Date.now();
    this._recentEvents.unshift({
      received_at: new Date(this._lastEventAt).toISOString(),
      event,
    });
    this._recentEvents = this._recentEvents.slice(0, 100);
  }

  private _clearTimers(): void {
    if (this._pingTimer) {
      clearInterval(this._pingTimer);
      this._pingTimer = null;
    }

    if (this._reconnectTimer) {
      clearTimeout(this._reconnectTimer);
      this._reconnectTimer = null;
    }
  }
}

export const synodWs = new SynodWebSocket();
