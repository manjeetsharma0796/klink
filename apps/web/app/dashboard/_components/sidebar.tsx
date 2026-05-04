"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard, ListChecks, KeySquare, TrendingUp, Wallet, ScrollText, Settings,
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

export function Sidebar() {
  const pathname = usePathname();
  return (
    <aside className="hidden h-screen w-56 shrink-0 border-r border-border/50 bg-card md:flex md:flex-col">
      <div className="flex h-16 items-center px-6">
        <Link href="/dashboard" className="text-2xl font-bold tracking-tight text-olive-deep">klink</Link>
      </div>
      <nav className="flex-1 space-y-6 px-3 py-4">
        {SECTIONS.map((section) => (
          <div key={section.title}>
            <div className="px-3 pb-2 text-xs font-medium uppercase tracking-wider text-muted-foreground">
              {section.title}
            </div>
            <ul className="space-y-0.5">
              {section.items.map((item) => {
                const active = pathname === item.href || (item.href !== "/dashboard" && pathname?.startsWith(item.href));
                const Icon = item.icon;
                return (
                  <li key={item.href}>
                    <Link
                      href={item.href}
                      className={cn(
                        "flex items-center gap-3 rounded-md px-3 py-2 text-sm transition",
                        active ? "bg-primary/15 font-medium text-foreground" : "text-muted-foreground hover:bg-primary/10 hover:text-foreground",
                      )}
                    >
                      <Icon className="h-4 w-4" /> {item.label}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
