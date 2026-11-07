export function renderErrorPage(): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <title>Die Seite konnte nicht geladen werden</title>
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <style>
      body { font: 15px/1.5 system-ui, -apple-system, sans-serif; background: #F5F3EE; color: #1C2E1C; display: grid; place-items: center; min-height: 100vh; margin: 0; padding: 1.5rem; }
      .card { max-width: 28rem; width: 100%; text-align: center; padding: 2rem; }
      h1 { font-size: 1.25rem; margin: 0 0 0.5rem; }
      p { color: #1C2E1C; margin: 0 0 1.5rem; }
      .actions { display: flex; gap: 0.5rem; justify-content: center; flex-wrap: wrap; }
      a, button { padding: 0.5rem 1rem; border-radius: 0.375rem; font: inherit; cursor: pointer; text-decoration: none; border: 1px solid transparent; }
      .primary { background: #2E5C3E; color: #F5F3EE; }
      .secondary { background: transparent; color: #2E5C3E; border-color: #2E5C3E; }
    </style>
  </head>
  <body>
    <div class="card">
      <h1>Die Seite konnte nicht geladen werden</h1>
      <p>Bei uns ist etwas schiefgelaufen. Lade die Seite neu oder geh zurück zur Startseite.</p>
      <div class="actions">
        <button class="primary" onclick="location.reload()">Nochmals versuchen</button>
        <a class="secondary" href="/">Zur Startseite</a>
      </div>
    </div>
  </body>
</html>`;
}
