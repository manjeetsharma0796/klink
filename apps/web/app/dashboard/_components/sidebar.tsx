"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, KeySquare, TrendingUp, Wallet, ScrollText, Settings, Boxes,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; }

const ITEMS: Item[] = [
  { href: "/dashboard", label: "Overview", icon: LayoutDashboard },
  { href: "/dashboard/audit", label: "Audit log", icon: ScrollText },
  { href: "/dashboard/sessions", label: "Sessions", icon: KeySquare },
  { href: "/dashboard/services", label: "Services", icon: Boxes },
  { href: "/dashboard/yield", label: "Yield", icon: TrendingUp },
  { href: "/dashboard/fund", label: "Fund", icon: Wallet },
  { href: "/dashboard/settings", label: "Settings", icon: Settings },
];

const NAV_EASE = "transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)]";

interface SidebarProps {
  /** When true (set by the dashboard layout while the sign-in gate is up),
   *  the whole sidebar is non-interactive so the user can't navigate behind
   *  the modal. The chrome stays visible for visual context. */
  disabled?: boolean;
}

export function Sidebar({ disabled }: SidebarProps = {}) {
  const pathname = usePathname();
  return (
    <aside
      className={cn(
        "sticky top-0 hidden h-screen w-60 shrink-0 flex-col border-r border-olive-deep/[0.08] bg-card md:flex",
        disabled && "pointer-events-none select-none opacity-60",
      )}
    >
      {/* Brand mark, logo + wordmark, mirrors landing Navbar */}
      <Link
        href="/dashboard"
        className="flex h-20 items-center gap-2.5 border-b border-olive-deep/[0.08] px-6 group"
      >
        <img
          src="/logo.png"
          alt="Klink"
          width={32}
          height={32}
          className={cn(
            "h-8 w-8 object-contain group-hover:scale-110 group-hover:rotate-[-6deg]",
            NAV_EASE,
          )}
        />
        <span className="klink-lens text-[22px] font-bold tracking-tight text-olive-deep">
          klink
        </span>
      </Link>

      <nav className="flex-1 px-3 pb-6 pt-5">
        <ul className="space-y-1">
          {ITEMS.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "group relative flex items-center gap-3 rounded-pill px-3.5 py-3 text-[15px]",
                        NAV_EASE,
                        active
                          ? "bg-primary/20 font-semibold text-olive-deep shadow-[inset_0_0_0_1px_rgba(61,79,42,0.06)]"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-olive-deep",
                      )}
                    >
                      <Icon
                        className={cn(
                          "h-[18px] w-[18px] shrink-0 transition-transform duration-[var(--dur-base)] ease-[var(--ease-klink)] group-hover:scale-110",
                          active ? "text-olive-deep" : "text-muted-foreground",
                        )}
                      />
                      <span>{item.label}</span>
                      {active && (
                        <span
                          aria-hidden="true"
                          className="ml-auto h-1.5 w-1.5 rounded-full bg-sap-green klink-pulse"
                        />
                      )}
                    </Link>
                  </li>
                );
              })}
        </ul>
      </nav>

      {/* Soft footer pill, devnet status indicator */}
      <div className="px-4 pb-6">
        <div className="flex items-center gap-2 rounded-pill bg-primary/10 px-3.5 py-2 text-xs shadow-[var(--shadow-pill)] ring-1 ring-olive-deep/[0.06] transition-all duration-[var(--dur-base)] ease-[var(--ease-klink)] hover:bg-primary/15">
          <span className="relative flex h-2 w-2">
            <span className="absolute inset-0 rounded-full bg-sap-green opacity-60 klink-pulse" />
            <span className="relative inline-block h-2 w-2 rounded-full bg-sap-green" />
          </span>
          <span className="font-medium text-olive-deep">Devnet</span>
          <span className="text-muted-foreground">live</span>
        </div>
      </div>
    </aside>
  );
}
