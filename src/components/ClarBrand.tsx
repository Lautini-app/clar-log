type ClarApp = "tag" | "heim" | "markt" | "log";

/** Reine Marken-Darstellung, ohne Zustand, Navigation oder Datenzugriff. */
export function ClarBrand({ app, className = "", showByline = true }: {
  app: ClarApp;
  className?: string;
  showByline?: boolean;
}) {
  return (
    <span className={`clar-brand ${className}`}>
      <span className="clar-brand-main">
        <span className="clar-wordmark">clar<span className="clar-brand-separator">·</span>{app}</span>
        <svg className="clar-brand-dots" viewBox="0 0 20 20" aria-hidden="true" focusable="false">
          <circle cx="5" cy="5" r="4" fill="#2F9A68" />
          <circle cx="15" cy="5" r="4" fill="#7A5CB0" />
          <circle cx="5" cy="15" r="4" fill="#D4941A" />
          <circle cx="15" cy="15" r="4" fill="#3D8BD4" />
        </svg>
      </span>
      {showByline && <span className="clar-brand-byline">by Lautini</span>}
    </span>
  );
}
