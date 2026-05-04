"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, KeySquare, TrendingUp, Wallet, ScrollText, Settings,
} from "lucide-react";
import { cn } from "@/lib/cn";

interface Item { href: string; label: string; icon: React.ComponentType<{ className?: string }>; }
interface Section { title: string; items: Item[]; }

const SECTIONS: Section[] = [
  {
    title: "Main",
    items: [{ href: "/dashboard", label: "Overview", icon: LayoutDashboard }],
  },
  {
    title: "Activity",
    items: [{ href: "/dashboard/audit", label: "Audit log", icon: ScrollText }],
  },
  {
    title: "Config",
    items: [
      { href: "/dashboard/sessions", label: "Sessions", icon: KeySquare },
      { href: "/dashboard/yield", label: "Yield", icon: TrendingUp },
      { href: "/dashboard/fund", label: "Fund", icon: Wallet },
      { href: "/dashboard/settings", label: "Settings", icon: Settings },
    ],
  },
];

const NAV_EASE = "transition-all duration-200 ease-[cubic-bezier(.22,1,.36,1)]";

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-screen w-60 shrink-0 flex-col bg-card md:flex">
      {/* Brand mark, logo + wordmark, mirrors landing Navbar */}
      <Link
        href="/dashboard"
        className="flex h-20 items-center gap-2.5 px-6 group"
      >
        <img
          src="/logo.png"
          alt="Klink"
          width={32}
          height={32}
          className={cn(
            "h-8 w-8 object-contain group-hover:scale-105",
            NAV_EASE,
          )}
        />
        <span className="text-[22px] font-bold tracking-tight text-olive-deep">
          klink
        </span>
      </Link>

      <nav className="flex-1 space-y-7 px-3 pb-6 pt-2">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-2 text-[11px] font-medium uppercase tracking-wider text-muted-foreground/70">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active =
                  pathname === item.href ||
                  (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "relative flex items-center gap-3 rounded-pill px-3.5 py-2.5 text-sm",
                        NAV_EASE,
                        active
                          ? "bg-primary/20 font-semibold text-olive-deep"
                          : "text-muted-foreground hover:bg-primary/10 hover:text-olive-deep",
                      )}
                    >
                      <Icon className="h-4 w-4 shrink-0" />
                      <span>{item.label}</span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>

      {/* Soft footer pill, devnet status indicator */}
      <div className="px-6 pb-6">
        <div className="flex items-center gap-2 rounded-pill bg-primary/10 px-3 py-2 text-xs">
          <span className="h-2 w-2 rounded-full bg-sap-green animate-pulse" />
          <span className="font-medium text-olive-deep">Devnet</span>
          <span className="text-muted-foreground">live</span>
        </div>
      </div>
    </aside>
  );
}
