// Offen seit 06.08.2026 — clar·log ist aus der geschlossenen Beta entlassen
// (anwaltliches Grünlicht, Entscheid Rainer). Die Funktion bleibt bestehen,
// damit die Aufruf-Stellen unverändert funktionieren; sie lässt jetzt alle zu.
export function isClosedBetaAllowed(_email: string | null | undefined): boolean {
  return true;
}
