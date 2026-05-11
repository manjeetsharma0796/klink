import type { ReactNode } from "react";

interface Props {
  /** Main heading text. */
  title: string;
  /** Optional one-line description rendered below the title. */
  subtitle?: string;
  /** Optional right-aligned action(s), for example a "New session" button. */
  action?: ReactNode;
  /**
   * Deprecated — eyebrows were dropped in the May 11 polish pass. The prop
   * stays in the type as `unknown` so legacy call sites compile without
   * forcing a sweep; it is no longer rendered.
   */
  eyebrow?: string;
}

export function PageHeader({ title, subtitle, action }: Props) {
  return (
    <header className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between md:gap-6">
      <div>
        <h1 className="text-3xl font-semibold tracking-tight text-olive-deep md:text-[34px]">
          {title}
        </h1>
        {subtitle && (
          <p className="mt-2 max-w-[64ch] text-[15px] leading-relaxed text-muted-foreground">
            {subtitle}
          </p>
        )}
      </div>
      {action && <div className="flex shrink-0 items-center gap-2">{action}</div>}
    </header>
  );
}
