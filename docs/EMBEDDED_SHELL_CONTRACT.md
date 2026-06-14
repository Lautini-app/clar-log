# clar.tracker — Embedded Shell Contract

Wenn clar.tracker in einer nativen Hülle (clar.heim Wrapper, React-Native-WebView, Iframe-Embed) läuft, übernimmt die Shell die Authentifizierung — die Email/Passwort-UI wird übersprungen. Kommunikation läuft ausschließlich über `postMessage` / native Bridges.

Implementierung: `src/lib/embedded-shell.ts`.

## Erkennung

Die App betrachtet sich als embedded, sobald **einer** dieser Indikatoren erfüllt ist:

- URL-Param `?clar_embedded=1` (wird in `sessionStorage` persistiert)
- `sessionStorage["clar_embedded"] === "1"`
- `window.__CLAR_EMBEDDED__ === true`
- UserAgent enthält `clar-shell`
- `window.clarShell` ist definiert
- `window.ReactNativeWebView` ist definiert

→ Shell sollte die App mit `https://app.clar.cloud/?clar_embedded=1` laden.

## Protokoll

Alle Messages sind JSON-Strings mit `type`-Feld.

### Shell → App

| Message | Payload | Wirkung |
|---|---|---|
| `clar:session` | `{ access_token, refresh_token }` | Ruft `supabase.auth.setSession(...)` → User ist eingeloggt. |
| `clar:signout` | — | Ruft `supabase.auth.signOut()`. |

### App → Shell

| Message | Payload | Bedeutung |
|---|---|---|
| `clar:ready` | — | App ist hydriert und hört auf Messages. |
| `clar:needs-session` | — | App ist embedded, hat aber keinen User — Shell soll Session liefern. |
| `clar:signed-in` | `{ user_id }` | Auth erfolgreich (auch nach Session-Injection). |
| `clar:signed-out` | — | User wurde abgemeldet. |

## Transport

**App → Shell** versucht in dieser Reihenfolge:

1. `window.clarShell.<method>()` (nativ injizierte Bridge)
2. `window.ReactNativeWebView.postMessage(json)` (RN WebView)
3. `window.parent.postMessage(json, "*")` (Web-Iframe)

**Shell → App** kann über zwei Wege:

- `iframe.contentWindow.postMessage(json, "*")` — Standard für Iframes
- `window.__clarReceiveShellMessage(payload)` — globale Funktion, die native Shells direkt aufrufen können (auch `payload` als bereits geparstes Objekt zulässig).

## Beispiel — Iframe-Wrapper (Web)

```html
<iframe id="tracker" src="https://app.clar.cloud/?clar_embedded=1"></iframe>
<script>
  const frame = document.getElementById("tracker");

  // Auf Messages aus der App reagieren
  window.addEventListener("message", (e) => {
    let msg;
    try { msg = typeof e.data === "string" ? JSON.parse(e.data) : e.data; }
    catch { return; }
    if (!msg?.type?.startsWith("clar:")) return;

    if (msg.type === "clar:ready" || msg.type === "clar:needs-session") {
      // Shell-eigene Supabase-Session in die App pushen
      const { access_token, refresh_token } = getCurrentSupabaseSession();
      frame.contentWindow.postMessage(
        JSON.stringify({ type: "clar:session", access_token, refresh_token }),
        "*",
      );
    }
    if (msg.type === "clar:signed-out") {
      // App-Logout wurde durchgereicht — ggf. Shell-Session ebenfalls beenden
    }
  });
</script>
```

## Beispiel — React Native WebView

```jsx
<WebView
  source={{ uri: "https://app.clar.cloud/?clar_embedded=1" }}
  injectedJavaScriptBeforeContentLoaded={`
    window.__CLAR_EMBEDDED__ = true;
    true;
  `}
  onMessage={(event) => {
    const msg = JSON.parse(event.nativeEvent.data);
    if (msg.type === "clar:ready" || msg.type === "clar:needs-session") {
      const { access_token, refresh_token } = getNativeSupabaseSession();
      webviewRef.current.injectJavaScript(`
        window.__clarReceiveShellMessage(${JSON.stringify({
          type: "clar:session",
          access_token,
          refresh_token,
        })});
        true;
      `);
    }
  }}
/>
```

## Hinweise

- Die App **wartet aktiv** auf `clar:session` — sie zeigt im Embedded-Modus nie den Email/Passwort-Screen. Schickt die Shell keine Session, bleibt die App auf einem leeren Hydration-Screen (mit lokalem Store, falls vorhanden).
- `setSession` setzt sowohl Access- als auch Refresh-Token; die App refresht danach selbständig (Supabase-Standard).
- Origin-Whitelist auf `postMessage` ist aktuell `"*"` — bei harter Production-Härtung sollten beide Seiten gegen die jeweilige App-Origin prüfen.
- Bei `clar:signout` aus der Shell beendet die App die Supabase-Session — die Shell sollte den globalen Logout dann auch in clar.heim / clar.markt durchreichen.