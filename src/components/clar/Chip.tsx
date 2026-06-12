import { cn } from "@/lib/utils";

type Props = {
  active?: boolean;
  onClick?: () => void;
  children: React.ReactNode;
  className?: string;
};

export function Chip({ active, onClick, children, className }: Props) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "inline-flex items-center gap-1.5 rounded-full border px-4 py-2.5 text-sm font-medium transition-all duration-200 active:scale-95",
        active
          ? "border-primary bg-primary-soft text-foreground shadow-[0_0_0_1px_var(--primary)] animate-chip-pop"
          : "border-border bg-card text-muted-foreground hover:text-foreground hover:border-primary/40",
        className,
      )}
    >
      {children}
    </button>
  );
}