import { createFileRoute } from "@tanstack/react-router";

export const Route = createFileRoute("/agb")({
  component: Agb,
});

function Agb() {
  return (
    <div className="min-h-screen bg-[#F5F3EE] px-5 py-10">
      <article className="mx-auto max-w-[680px] text-[#1a1a1a]">
        <div className="mb-8 flex items-center gap-2">
          <div className="grid h-8 w-8 place-items-center rounded-lg bg-[#085041]/20">
            <span className="text-sm font-bold text-[#085041]">c.</span>
          </div>
          <span className="text-sm font-medium tracking-tight">
            clar.<span className="opacity-50">log</span>
          </span>
        </div>

        <h1 className="mb-1 text-2xl font-bold text-[#085041]">
          Allgemeine Geschäftsbedingungen
        </h1>
        <p className="mb-8 text-xs text-[#1a1a1a]/50">
          Der Inhalt wird nachgeliefert.
        </p>
      </article>
    </div>
  );
}
