import { useEffect, useState } from "react";
import { Bell, X } from "lucide-react";

export function NotificationBanner({
  morningTime,
  eveningTime,
  weeklyFocus,
  onAct,
}: {
  morningTime: string;
  eveningTime: string;
  weeklyFocus: string;
  onAct: () => void;
}) {
  const [dismissed, setDismissed] = useState(false);
  const [now, setNow] = useState(() => new Date());

  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);

  if (dismissed) return null;

  const cur = now.getHours() * 60 + now.getMinutes();
  const [mh, mm] = morningTime.split(":").map(Number);
  const [eh, em] = eveningTime.split(":").map(Number);
  const morn = mh * 60 + mm;
  const eve = eh * 60 + em;

  let title: string | null = null;
  let body: string | null = null;
  if (cur >= morn && cur < morn + 180) {
    title = "Zeit, deine Dosis zu erfassen?";
    body = "Kurz antippen — dauert 5 Sekunden.";
  } else if (cur >= eve && cur < eve + 180) {
    title = "Abend-Check-in";
    body = weeklyFocus;
  }

  if (!title) return null;

  return (
    <div className="animate-fade-up rounded-2xl border border-primary/40 bg-gradient-to-br from-primary-soft/60 to-card p-4">
      <div className="flex items-start gap-3">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-primary/30 text-primary">
          <Bell className="h-4 w-4" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-semibold text-foreground">{title}</p>
          <p className="mt-0.5 text-xs text-muted-foreground">{body}</p>
          <div className="mt-3 flex gap-2">
            <button
              onClick={onAct}
              className="rounded-full bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground"
            >
              Log öffnen
            </button>
            <button
              onClick={() => setDismissed(true)}
              className="rounded-full bg-secondary px-3 py-1.5 text-xs font-medium text-muted-foreground"
            >
              Später
            </button>
          </div>
        </div>
        <button
          onClick={() => setDismissed(true)}
          className="grid h-7 w-7 place-items-center rounded-full text-muted-foreground hover:bg-secondary"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}