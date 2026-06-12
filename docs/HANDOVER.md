# clar.tracker — Handover für Emergent

Stand: 12.06.2026. Diese Datei fasst alles zusammen, was ein neues Team braucht, um clar.tracker weiterzuentwickeln.

---

## 1. Was ist clar.tracker?

Eine PWA für ADHS-Stimulanzien-Tracking: Dosen, Wirkungskurve, Stimmung, Schlaf, Nebenwirkungen, Wochenfokus. Drei Tabs (`/heute`, `/bericht`, `/einstellungen`). Lokaler Store + Supabase-Sync, Magic-Link-Auth, Offline-Modus, Embedded-Shell-Mode für die native `clar.heim`-Hülle.

## 2. Stack

| Layer | Technologie |
|---|---|
| Framework | TanStack Start v1.167+ (React 19 + Vite 7) |
| Routing | File-based (`src/routes/`), Auto-generated `routeTree.gen.ts` |
| Styling | Tailwind v4 (via `src/styles.css`, kein `tailwind.config.js`) + shadcn/ui |
| State | React Hooks + custom `useStore` (`src/lib/clar-storage.ts`) |
| Backend | Supabase (Schema `clar_log`, geteiltes Projekt `cgwpzpnklxphqxlixtva`) |
| Auth | Supabase Magic-Link (OTP) — Email-only, kein Passwort |
| Server-Code | TanStack `createServerFn` (z. B. `src/lib/account.functions.ts`) |
| Deploy-Target | Cloudflare Workers (via `@cloudflare/vite-plugin` + `wrangler.jsonc`) |
| Paket-Manager | Bun (`bun.lock`) |

## 3. Routen-Architektur

```
src/routes/
  __root.tsx                       — HTML-Shell, QueryClient, Error-/NotFound-Boundary
  index.tsx                        — redirect → /heute
  auth.tsx                         — /auth (ssr:false) — Magic-Link + Offline-Bypass
  _authenticated.tsx               — Layout (ssr:false): Auth-Gate, Shell-Bridge, Tab-Bar, Outlet
  _authenticated.heute.tsx         — /heute
  _authenticated.bericht.tsx       — /bericht
  _authenticated.einstellungen.tsx — /einstellungen
```

- `_authenticated`-Subtree ist client-only (`ssr: false`). Auth-Gate prüft `useStore().userId` + Embedded-Modus + Offline-Bypass; ohne Session → `navigate("/auth")`.
- `/` ist nur eine `redirect()`-Weiche.
- Bottom-Tab-Bar nutzt `<Link replace>`, Tabs sind echte URLs.

## 4. Datenmodell & Supabase-Schema

SQL-Setup in [`docs/SUPABASE_SETUP.sql`](./SUPABASE_SETUP.sql). Schema **`clar_log`** (separater Namespace, weil das Supabase-Projekt mit `clar.heim` und `clar.markt` geteilt wird).

| Tabelle | Spalten | Zweck |
|---|---|---|
| `clar_log.tracker_logs` | `(user_id uuid, date date, data jsonb, updated_at) PK(user_id,date)` | Ein Tageslog pro User + Datum. `data` ist die serialisierte `DayLog`-Struktur aus `src/lib/clar-storage.ts`. |
| `clar_log.tracker_settings` | `(user_id uuid PK, data jsonb, updated_at)` | Settings: Medikamente, Erinnerungszeiten, Wochenfokus. |

- **RLS aktiv**, Policy `auth.uid() = user_id` für alle 4 Operations.
- **Grants**: `usage` auf Schema + CRUD auf beide Tables für `authenticated`. `service_role` hat `all` (für Account-Delete via `supabaseAdmin`).
- **Cascade Delete** auf `auth.users(id)` — Nutzer-Löschung räumt automatisch ab.
- **Data-API-Exposure**: Im Supabase-Dashboard unter Settings → API → "Exposed schemas" muss `clar_log` ergänzt sein. Der Client greift mit `supabase.schema("clar_log").from(...)` zu.

TypeScript-Typen (`DayLog`, `Settings`, `Dose`, `EffectWindow`, …) sind in `src/lib/clar-storage.ts` definiert. Das `data`-JSONB-Feld ist **un-typed in Supabase**; der Client wendet die TS-Typen beim Lesen an.

## 5. Auth-Flow

### 5.1 Magic-Link (Web)

1. `/auth` → `AuthScreen` ruft `supabase.auth.signInWithOtp({ email, options: { emailRedirectTo: window.location.origin } })`.
2. User klickt Link im Mail → Redirect zurück, Supabase setzt Session in `localStorage`.
3. `useStore` hört auf `onAuthStateChange`, setzt `userId`, lädt Server-Daten und mergt lokalen Store (Migration via `migrateLocalToSupabase`).
4. `_authenticated`-Gate sieht `userId` → Tabs sind erreichbar.

### 5.2 Offline-Bypass

- "Ohne Konto fortfahren"-Button in `AuthScreen` setzt `localStorage["clar.offlineBypass"] = "1"`.
- Gate akzeptiert das als gültige Session. Alle Daten landen nur lokal (`localStorage["clar.tracker.v1"]`). Spätere Anmeldung migriert via `migrateLocalToSupabase`.

### 5.3 Account-Delete (DSGVO)

- Settings → "Alle meine Daten löschen" (Doppelbestätigung).
- Schritt 1: `deleteAllUserData()` (Client, unter RLS) löscht `tracker_logs` + `tracker_settings`.
- Schritt 2: `deleteAccount({ accessToken })` (Server-Fn in `src/lib/account.functions.ts`) verifiziert Token, baut Service-Role-Client mit `CLAR_SUPABASE_SERVICE_ROLE_KEY` und ruft `admin.auth.admin.deleteUser(userId)` → entfernt den `auth.users`-Eintrag vollständig.
- Schritt 3: `signOut()` + Reload.

## 6. Embedded-Shell-Contract

Komplette Spezifikation: [`docs/EMBEDDED_SHELL_CONTRACT.md`](./EMBEDDED_SHELL_CONTRACT.md). Kurzfassung:

- App erkennt Embedded-Modus via URL-Param `?clar_embedded=1`, UA `clar-shell`, `window.clarShell`, `window.ReactNativeWebView`, oder gesetztem `sessionStorage["clar_embedded"]`.
- App → Shell: `clar:ready`, `clar:needs-session`, `clar:signed-in`, `clar:signed-out`.
- Shell → App: `clar:session` (mit `access_token` + `refresh_token`), `clar:signout`.
- Transport: `window.clarShell.<method>()` > `window.ReactNativeWebView.postMessage()` > `window.parent.postMessage()`.
- Im Embedded-Modus wird `/auth` übersprungen — die App wartet auf `clar:session` und zeigt sonst nur einen leeren Hydration-Screen.

Implementierung: `src/lib/embedded-shell.ts`. Eingebunden in `_authenticated.tsx` (Bridge install, ready/needs-session/sign-in/sign-out signals).

## 7. Secrets / Env-Variablen

| Name | Scope | Zweck |
|---|---|---|
| `VITE_SUPABASE_URL` | Client | Supabase Projekt-URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` (oder `ANON_KEY`) | Client | Anon-Key |
| `CLAR_SUPABASE_SERVICE_ROLE_KEY` | Server (createServerFn) | Service-Role-Key für `admin.auth.admin.deleteUser`. **Lovable-Reserved-Prefix `SUPABASE_` wird umgangen** — daher `CLAR_`-Prefix. |

Lokal: `.env` (nicht im Bundle). In Lovable: über das Secrets-Panel.

## 8. Lokales Setup

```bash
bun install
# .env anlegen (siehe oben)
bun run dev          # Vite dev server
bun run build        # Production-Build (Cloudflare Workers Target)
bun run preview      # Production-Build lokal
```

Erstes Mal: SQL aus `docs/SUPABASE_SETUP.sql` im Supabase SQL-Editor ausführen + Schema `clar_log` in Settings → API exposing.

## 9. Wichtige Module

| Pfad | Zweck |
|---|---|
| `src/lib/clar-storage.ts` | `useStore`-Hook, lokal+Supabase-Sync, Typen (`DayLog`, `Settings`, …), `migrateLocalToSupabase`. |
| `src/lib/embedded-shell.ts` | Shell-Detection + postMessage-Bridge. |
| `src/lib/account.functions.ts` | `deleteAccount` Server-Fn (Service-Role Admin-Delete). |
| `src/integrations/supabase/client.ts` | Browser-Client mit `storageKey`-Persistenz. |
| `src/components/clar/*` | UI: TodayView, ReportView, SettingsView, AuthScreen, CurveInsights, EffectCurve, Notification. |

## 10. Offene Punkte / Technische Schuld

1. **Kein `requireSupabaseAuth`-Middleware-Stack**: `deleteAccount` validiert das Bearer-Token manuell statt über die TanStack-Auth-Attacher-Middleware. Funktioniert, aber inkonsistent zur offiziellen Empfehlung.
2. **Kein dedizierter `client.server.ts`**: Service-Role-Client wird inline in `account.functions.ts` gebaut.
3. **Offline → Online Sync ist Einweg**: `migrateLocalToSupabase` läuft einmal nach Anmeldung. Kein kontinuierlicher Bidirektional-Merge, keine Konflikt-Strategie (`updatedAt`-wins).
4. **PWA-Härtung fehlt**: kein `manifest.json`, kein Service Worker, kein App-Icon, kein `standalone`-Display-Mode.
5. **Keine Push-Erinnerungen**: Notifikationen sind nur In-App-Banner. Native Reminders (Service Worker + Scheduled Notifications) sind nicht umgesetzt.
6. **DSGVO Daten-Export fehlt**: Settings hat nur Delete-Pfad, kein JSON/CSV-Export.
7. **Origin-Whitelist auf postMessage = `"*"`**: Für Production-Härtung sollten Shell und App jeweils gegen die andere Origin prüfen.
8. **Single-shared-Supabase-Projekt**: Schema `clar_log` teilt sich Projekt mit clar.heim / clar.markt. Bei Migration zu eigenem Projekt müssen SQL + exposed schemas + Env-Vars nachgezogen werden.

## 11. Etappen-Historie

| Etappe | Inhalt | Status |
|---|---|---|
| 1 | Supabase-Schema `clar_log` + RLS + Grants | ✅ |
| 2 | Magic-Link Auth + Offline-Bypass + lokale Migration | ✅ |
| 3 | Embedded Shell Contract (postMessage-Bridge, Erkennung, Doku) | ✅ |
| 4 | DSGVO Account-Delete (Service-Role-Admin-Delete) | ✅ |
| 5 | Routen-Architektur: `_authenticated` Layout + `/auth` + Tab-Routen | ✅ |

## 12. Kontakt-Stellen für Emergent

- Schema-Änderungen → neue SQL-Datei in `docs/` ergänzen, **niemals** `SUPABASE_SETUP.sql` retroaktiv editieren.
- Neue Server-Funktionen → `src/lib/*.functions.ts` (client-imported) bzw. `*.server.ts` (server-only).
- Routen-Änderungen → niemals `src/routeTree.gen.ts` editieren (auto-generiert).
- Neue Brand-Assets → `src/assets/` + Tailwind-Tokens in `src/styles.css`.