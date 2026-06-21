// Embedded-Shell Contract — identisch zu clar.markt / clar.zeit / clar.heim.
//
// Protokoll (postMessage, JSON-Strings):
//
//   Shell → App:
//     { type: "clar:session", access_token, refresh_token }   // SSO-Login
//     { type: "clar:signout" }                                  // Logout-Befehl
//
//   App → Shell:
//     { type: "clar:ready" }                                    // App hydriert
//     { type: "clar:needs-session" }                            // kein User, Shell soll Session liefern
//     { type: "clar:signed-in",  user_id }                      // Auth-State-Forward
//     { type: "clar:signed-out" }
//
// Transport (in dieser Reihenfolge versucht):
//   1. window.clarShell.<method>()         — nativ injizierte Bridge
//   2. window.ReactNativeWebView.postMessage — RN WebView
//   3. window.parent.postMessage            — Web-Iframe-Embed

import { supabase } from "@/integrations/supabase/client";

declare global {
  interface Window {
    __CLAR_EMBEDDED__?: boolean;
    clarShell?: {
      ready?: () => void;
      needsSession?: () => void;
      onSignedIn?: (userId: string) => void;
      onSignedOut?: () => void;
    };
    ReactNativeWebView?: { postMessage: (msg: string) => void };
  }
}

type ShellInbound =
  | { type: "clar:session"; access_token: string; refresh_token: string }
  | { type: "clar:signout" };

export function isEmbeddedShell(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return (
      window.__CLAR_EMBEDDED__ === true ||
      sessionStorage.getItem("clar_embedded") === "1" ||
      new URLSearchParams(window.location.search).get("clar_embedded") === "1" ||
      navigator.userAgent.includes("clar-shell") ||
      typeof window.clarShell !== "undefined" ||
      typeof window.ReactNativeWebView !== "undefined" ||
      window !== window.parent // iframe-Embed (z.B. home.lautini.ch)
    );
  } catch {
    return false;
  }
}

/** Persistiere den Embedded-Status für die Session, sobald `?clar_embedded=1` vorkam. */
export function persistEmbeddedFlag(): void {
  if (typeof window === "undefined") return;
  try {
    const fromUrl =
      new URLSearchParams(window.location.search).get("clar_embedded") === "1";
    if (fromUrl) sessionStorage.setItem("clar_embedded", "1");
  } catch {
    /* noop */
  }
}

function postToShell(payload: Record<string, unknown>): void {
  if (typeof window === "undefined") return;
  const msg = JSON.stringify(payload);
  try {
    if (window.ReactNativeWebView?.postMessage) {
      window.ReactNativeWebView.postMessage(msg);
    }
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, "*");
    }
  } catch {
    /* noop */
  }
}

export function signalShellReady(): void {
  if (typeof window === "undefined") return;
  try {
    window.clarShell?.ready?.();
  } catch {
    /* noop */
  }
  postToShell({ type: "clar:ready" });
}

export function signalNeedsSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.clarShell?.needsSession?.();
  } catch {
    /* noop */
  }
  postToShell({ type: "clar:needs-session" });
}

export function signalSignedIn(userId: string): void {
  try {
    window.clarShell?.onSignedIn?.(userId);
  } catch {
    /* noop */
  }
  postToShell({ type: "clar:signed-in", user_id: userId });
}

export function signalSignedOut(): void {
  try {
    window.clarShell?.onSignedOut?.();
  } catch {
    /* noop */
  }
  postToShell({ type: "clar:signed-out" });
}

/** Parsed shell-inbound payloads (Strings ODER bereits geparste Objekte). */
function parseInbound(data: unknown): ShellInbound | null {
  let obj: unknown = data;
  if (typeof data === "string") {
    try {
      obj = JSON.parse(data);
    } catch {
      return null;
    }
  }
  if (!obj || typeof obj !== "object") return null;
  const t = (obj as { type?: unknown }).type;
  if (t === "clar:session") {
    const { access_token, refresh_token } = obj as Record<string, unknown>;
    if (typeof access_token === "string" && typeof refresh_token === "string") {
      return { type: "clar:session", access_token, refresh_token };
    }
    return null;
  }
  if (t === "clar:signout") return { type: "clar:signout" };
  return null;
}

/**
 * Registriert den postMessage-Listener für Shell→App-Nachrichten.
 * Gibt eine Cleanup-Funktion zurück.
 */
export function installShellBridge(): () => void {
  if (typeof window === "undefined") return () => {};

  const handler = async (event: MessageEvent) => {
    const msg = parseInbound(event.data);
    if (!msg) return;
    if (msg.type === "clar:session") {
      const { error } = await supabase.auth.setSession({
        access_token: msg.access_token,
        refresh_token: msg.refresh_token,
      });
      if (error) console.warn("[shell] setSession failed:", error.message);
      return;
    }
    if (msg.type === "clar:signout") {
      await supabase.auth.signOut();
    }
  };

  window.addEventListener("message", handler);

  // Native Bridge: globale Funktion, die die Shell direkt aufrufen kann.
  const w = window as Window & {
    __clarReceiveShellMessage?: (payload: unknown) => void;
  };
  w.__clarReceiveShellMessage = (payload) => {
    void handler(new MessageEvent("message", { data: payload }));
  };

  return () => {
    window.removeEventListener("message", handler);
    delete w.__clarReceiveShellMessage;
  };
}