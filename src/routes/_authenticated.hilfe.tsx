import { createFileRoute, useNavigate } from "@tanstack/react-router";
import {
  ArrowLeft,
  CalendarDays,
  ClipboardEdit,
  LineChart,
  Stethoscope,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/hilfe")({
  head: () => ({
    meta: [
      { title: "Hilfe & Anleitung – clar·log" },
      { name: "robots", content: "noindex" },
    ],
  }),
  component: HilfePage,
});

function HilfePage() {
  const navigate = useNavigate();

  return (
    <div style={{ maxWidth: 680, margin: "0 auto", padding: "1rem 1rem 4rem" }} className="space-y-6">
      {/* Zurück + Titel */}
      <div className="space-y-2">
        <button
          type="button"
          onClick={() => navigate({ to: "/einstellungen" })}
          className="flex items-center gap-2 text-sm text-muted-foreground transition-colors hover:text-foreground"
        >
          <ArrowLeft className="h-4 w-4" />
          Zurück
        </button>
        <h1 className="font-display text-[2rem] font-semibold leading-tight tracking-tight">
          Hilfe & Anleitung
        </h1>
      </div>

      {/* Willkommen — Kein-Medizinprodukt-Hinweis bleibt sichtbar */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Willkommen
        </h2>
        <p className="text-[15px] leading-relaxed text-foreground">
          clar·log ist ein digitales Tagebuch für Familien, die eine ärztlich begleitete
          Medikamenteneinstellung bei ADHS durchlaufen. Statt Zettelwirtschaft und Bauchgefühl
          dokumentierst du täglich in wenigen Minuten, wie es läuft — und bringst zum nächsten
          Arzttermin einen übersichtlichen Verlauf mit.
        </p>
        <p className="mt-3 rounded-xl border border-border bg-background p-3 text-[13px] leading-relaxed text-foreground">
          <strong>Wichtig:</strong> clar·log ist kein Medizinprodukt. Die App stellt keine
          Diagnosen, gibt keine Therapieempfehlungen und ersetzt kein Arztgespräch. Alle
          Entscheidungen zur Medikation trifft die behandelnde Ärztin oder der behandelnde
          Arzt.
        </p>
      </section>

      {/* So funktioniert clar·log — 4 Schritte mit Icon */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          So funktioniert clar·log
        </h2>
        <ul className="space-y-4">
          <li className="flex items-start gap-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15">
              <CalendarDays className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-[15px] font-semibold">1. Beobachtungsperiode anlegen</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Du startest eine Periode mit Medikament und Dosierung (z. B. «Concerta 36 mg
                ab 1. August»). Ändert sich die Dosis, beginnt eine neue Periode. So bleibt
                vergleichbar, was unter welcher Einstellung passiert ist.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15">
              <ClipboardEdit className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-[15px] font-semibold">2. Täglich kurz erfassen</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Dreimal täglich (Morgen, Mittag, Abend) beantwortest du einen kurzen
                Fragebogen: Medikament eingenommen? Energie, Stimmung, Fokus, Ablenkbarkeit,
                Impulsivität — dazu morgens der Schlaf (Dauer, Einschlafzeit, Erholung) und
                abends Appetit, Rebound und Notizen. Die Fragen sind altersgerecht formuliert;
                für Kinder und Jugendliche gibt es angepasste Versionen in einfacher Sprache.
                Jede Frage hat vier kurze Antworten zum Antippen.
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15">
              <LineChart className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-[15px] font-semibold">3. Verlauf ansehen</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Die Wochenansicht zeigt Durchschnitte (Fokus, Stimmung, Schlaf, Rebound) und
                einen Tagesverlauf über alle erfassten Werte. So erkennt ihr Muster: Wirkt das
                Medikament nachmittags noch? Leidet der Schlaf? Gibt es einen Rebound am
                Abend?
              </div>
            </div>
          </li>
          <li className="flex items-start gap-3">
            <div className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-primary/15">
              <Stethoscope className="h-4 w-4 text-primary" />
            </div>
            <div>
              <div className="text-[15px] font-semibold">4. Mit dem Arzt teilen</div>
              <div className="text-sm text-muted-foreground leading-relaxed">
                Vor dem Termin erstellst du ein Arzt-Dossier: einen Link, der 90 Tage gültig
                ist. Damit blättert die Ärztin oder der Arzt Woche für Woche durch euren
                Verlauf. Kein Konto nötig, kein Ausdruck — nur der Link.
              </div>
            </div>
          </li>
        </ul>
      </section>

      {/* Häufige Fragen — aufklappbare Abschnitte */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-4 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Häufige Fragen
        </h2>
        <div className="divide-y divide-border">
          <FaqItem question="Für wen ist clar·log gedacht?">
            <p>
              Für Erwachsene in der eigenen Einstellungsphase und für Familien, deren Kind
              oder Jugendliche/r neu eingestellt wird. Die Erfassung passt sich an:
              Erwachsene füllen selbst aus, bei Kindern erfassen die Eltern, Jugendliche
              ab 12 können ein eigenes Tagebuch führen.
            </p>
          </FaqItem>
          <FaqItem question="Wie erfasse ich für mein Kind?">
            <p>
              Beim Anlegen der Periode wählst du «Eltern erfassen für Kind». Du beantwortest
              die Fragen dann aus deiner Beobachtung — die Formulierungen sind entsprechend
              angepasst.
            </p>
          </FaqItem>
          <FaqItem question="Mein Teenager will selbst ausfüllen — geht das?">
            <p>
              Ja. Für Jugendliche (ab 12, mit deiner Zustimmung als erziehungsberechtigte
              Person) erstellst du unter «Konto» → «Jugendliche/r einladen» einen Link. Dein Kind erhält einen
              persönlichen Link und füllt die komplette Tagesabfrage selbst aus — ohne
              eigenes Konto und ohne Zugriff auf deine anderen Daten. Der Link ist 30 Tage
              gültig; danach erstellst du einen neuen. Die Einträge fliessen
              in denselben Verlauf und in die Arzt-Auswertung.
            </p>
          </FaqItem>
          <FaqItem question="Wie gibt der andere Elternteil Rückmeldung?">
            <p>
              Unter «Konto» → «Beobachter» erstellst du einen Link für den Partner, die
              Partnerin oder das zweite Elternteil. Damit füllt diese Person täglich ein
              kurzes Formular aus: Stimmung, Mitarbeit, Umgang mit Gefühlen, Hausaufgaben,
              Zubettgehen und ob am Abend ein Rebound auffiel. Kein Konto nötig. Der Link ist
              30 Tage gültig. Die Rückmeldungen erscheinen in deinem Verlauf und im
              Arzt-Dossier.
            </p>
          </FaqItem>
          <FaqItem question="Wie gibt die Lehrperson Rückmeldung?">
            <p>
              Unter «Konto» → «Lehrperson» erstellst du einen Link und gibst ihn der
              Lehrperson weiter. Sie füllt damit einmal pro Woche einen kurzen Wochenbericht
              aus: Vormittag, Nachmittag, Umgang mit anderen Kindern, Organisation und ein
              Gesamteindruck. Kein Konto nötig. Der Link ist 7 Tage gültig; für die nächste
              Woche erstellst du einen neuen.
            </p>
            <p className="mt-2">
              Beobachter und Lehrpersonen sehen nur ihr eigenes Formular, nicht deine
              Einträge. Du kannst jeden Link jederzeit löschen.
            </p>
          </FaqItem>
          <FaqItem question="Was sieht die Ärztin / der Arzt genau?">
            <p>
              Eine Übersicht pro Woche: Durchschnittswerte, einen Tagesverlauf mit farbigen
              Feldern (grün = gut, gelb = mittel, rot = schwierig), die Schlafdauer und wann
              welches Medikament genommen wurde. Darin zusammengeführt: deine Einträge, die
              deines Kindes und die Rückmeldungen von Beobachtern und Lehrpersonen. Der Link ist 90 Tage gültig und jederzeit
              widerrufbar.
            </p>
          </FaqItem>
          <FaqItem question="Muss ich wirklich dreimal täglich erfassen?">
            <p>
              Nein. Jeder Eintrag hilft, aber auch lückenhafte Daten zeigen Muster.
              Erfasse, was realistisch ist — lieber regelmässig kurz als selten perfekt.
            </p>
          </FaqItem>
          <FaqItem question="Sind die Gesundheitsdaten meiner Familie sicher?">
            <p>
              Ja, das nehmen wir ernst: Die Daten liegen verschlüsselt auf Servern in
              Frankfurt. Niemand ausser dir sieht deine Einträge – ausser den Personen,
              denen du selbst einen Link gibst. Die Übertragung ist immer verschlüsselt. clar·log
              verwendet keine Tracking-Cookies, kein Analytics und keine Werbung, und
              deine Daten werden weder verkauft noch für KI-Training verwendet. Details in
              der{" "}
              <a
                href="https://blog.lautini.ch/datenschutz"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                Datenschutzerklärung
              </a>
              .
            </p>
          </FaqItem>
          <FaqItem question="Warum fragt die App nach einer Einwilligung?">
            <p>
              Die Einträge sind gesundheitsbezogene Daten und damit besonders geschützt
              (Schweizer Datenschutzgesetz, revDSG). Deshalb holen wir vor der ersten Nutzung deine ausdrückliche
              Einwilligung ein. Du kannst sie jederzeit widerrufen — per E-Mail oder indem
              du deine Daten löschst.
            </p>
          </FaqItem>
          <FaqItem question="Wie lösche ich meine Daten?">
            <p>
              Unter «Konto» ganz unten bei «Gefahrenzone» → «Alle clar·log-Daten endgültig
              löschen». Die Löschung ist sofort und unwiderruflich und betrifft alle
              clar·log-Daten. Dein clar-Konto und die anderen Apps bleiben bestehen.
              Nach einer Kontolöschung sind sämtliche personenbezogenen Daten innerhalb von
              30 Tagen entfernt.
            </p>
          </FaqItem>
          <FaqItem question="Was kostet clar·log?">
            <p>
              Bis 31. Januar 2027 sind alle clar-Apps kostenlos. Danach ist clar·log Teil
              des clar-Abos: einzeln oder zusammen mit clar·markt, clar·heim und clar·tag,
              jeweils für die ganze Familie (bis 5 Personen). Auf dem iPhone läuft das Abo
              über Apple.
              Aktuelle Preise und Abo-Verwaltung findest du auf{" "}
              <a
                href="https://home.lautini.ch"
                target="_blank"
                rel="noopener noreferrer"
                className="font-medium text-primary underline underline-offset-2"
              >
                home.lautini.ch
              </a>
              .
            </p>
          </FaqItem>
          <FaqItem question="Die App ersetzt also den Arzt nicht?">
            <p>
              Nein, bewusst nicht. clar·log macht eure Beobachtungen sichtbar und
              Arztgespräche fundierter — nicht mehr und nicht weniger. Bei Fragen zur
              Medikation, bei belastenden Nebenwirkungen oder in Krisensituationen wende
              dich immer direkt an das Behandlungsteam.
            </p>
          </FaqItem>
        </div>
      </section>

      {/* Rechtliches */}
      <section className="rounded-2xl border border-border bg-card p-5">
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-[0.12em] text-muted-foreground">
          Rechtliches
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          <a
            href="https://blog.lautini.ch/datenschutz"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            Datenschutzerklärung
          </a>{" "}
          ·{" "}
          <a
            href="https://blog.lautini.ch/agb"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            AGB
          </a>{" "}
          ·{" "}
          <a
            href="https://blog.lautini.ch/impressum"
            target="_blank"
            rel="noopener noreferrer"
            className="font-medium text-primary underline underline-offset-2"
          >
            Impressum
          </a>
        </p>
      </section>
    </div>
  );
}

function FaqItem({ question, children }: { question: string; children: React.ReactNode }) {
  return (
    <details className="group py-3">
      <summary className="flex cursor-pointer items-start justify-between gap-3 list-none">
        <span className="text-[15px] font-semibold text-foreground">{question}</span>
        <span
          aria-hidden
          className="mt-1 shrink-0 text-primary transition-transform group-open:rotate-45"
          style={{ fontSize: 20, lineHeight: 1 }}
        >
          +
        </span>
      </summary>
      <div className="mt-2 text-[14px] leading-relaxed text-muted-foreground space-y-2">
        {children}
      </div>
    </details>
  );
}
