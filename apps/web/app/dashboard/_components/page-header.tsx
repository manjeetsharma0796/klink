import type { ReactNode } from "react";

interface Props {
  /** Small uppercase context line above the title. */
  eyebrow?: string;
  /** Main heading text. */
  title: string;
  /** Optional one-line description rendered below the title. */
  subtitle?: string;
  /** Optional right-aligned action(s) — e.g. a "New session" button. */
  action?: ReactNode;
}

export function PageHeader({ eyebrow, title, subtitle, action }: Props) {
  return (
    <header className="flex flex-col gap-3 md:flex-row md:items-end md:justify-between md:gap-6">
      <div>
        {eyebrow && <span className="klink-eyebrow">{eyebrow}</span>}
        <h1 className="mt-1 text-[34px] font-bold leading-[1.05] tracking-[-0.025em] text-olive-deep md:text-[40px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-[60ch] text-[14px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
