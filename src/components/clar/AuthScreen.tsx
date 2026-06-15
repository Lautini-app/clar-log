export function AuthScreen() {
  return (
    <div className="min-h-screen bg-background text-foreground">
      <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center px-5 py-10">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-9 w-9 place-items-center rounded-lg bg-primary/20 text-primary">
            <span className="text-sm font-bold">c.</span>
          </div>
          <span className="text-sm font-medium tracking-tight text-foreground">
            clar.<span className="text-muted-foreground">log</span>
          </span>
        </div>

        <section className="rounded-3xl border border-border bg-card p-6 text-center">
          <p className="text-xs uppercase tracking-wider text-muted-foreground">clar by lautini</p>
          <h1 className="mt-3 text-2xl font-semibold text-foreground">
            Bitte öffne die App über clar by lautini
          </h1>
          <p className="mt-3 text-sm text-muted-foreground">
            Diese App hat keinen eigenen Login. Deine Session wird automatisch von
            home.lautini.ch übergeben.
          </p>
        </section>
      </div>
    </div>
  );
}
