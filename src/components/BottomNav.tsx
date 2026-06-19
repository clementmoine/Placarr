"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { LibraryBig, Compass, Repeat, LayoutGrid } from "lucide-react";
import { motion } from "framer-motion";
import { useLocale } from "@/lib/providers/LocaleProvider";
import { useAccount } from "@/lib/hooks/useAccount";

export function BottomNav() {
  const { t } = useLocale();
  const { isAuthenticated, isGuest } = useAccount();
  const pathname = usePathname() || "";

  if (!isAuthenticated || isGuest) return null;

  const navItems = [
    {
      href: "/shelves",
      label: t("navigation.shelves") || "Étagères",
      icon: LibraryBig,
    },
    {
      href: "/items",
      label: t("navigation.items") || "Objets",
      icon: LayoutGrid,
    },
    {
      href: "/explore",
      label: t("navigation.explore") || "Exploration",
      icon: Compass,
    },
    {
      href: "/loans",
      label: t("navigation.loans") || "Mes Prêts",
      icon: Repeat,
    },
  ];

  return (
    <div className="sm:hidden fixed bottom-4 left-4 right-4 h-16 z-40 bg-zinc-50/90 dark:bg-zinc-950/90 border border-zinc-200/50 dark:border-zinc-800/50 rounded-2xl shadow-xl backdrop-blur-xl px-4 flex items-center justify-around select-none">
      {navItems.map((item) => {
        const isActive =
          pathname === item.href || pathname.startsWith(item.href + "/");
        const Icon = item.icon;

        return (
          <Link
            key={item.href}
            href={item.href}
            className="relative flex flex-col items-center justify-center w-16 h-full"
          >
            <div
              className={`flex flex-col items-center gap-1 transition-all duration-300 ${isActive ? "text-primary scale-105" : "text-muted-foreground hover:text-foreground"}`}
            >
              <Icon className="size-5.5 stroke-[2.2]" />
              <span className="text-[9px] font-black uppercase tracking-wider">
                {item.label}
              </span>
            </div>

            {isActive && (
              <motion.div
                layoutId="activeMobileIndicator"
                className="absolute bottom-1.5 size-1.5 rounded-full bg-primary shadow-[0_0_8px_rgba(239,68,68,0.5)]"
                transition={{ type: "spring", stiffness: 380, damping: 30 }}
              />
            )}
          </Link>
        );
      })}
    </div>
  );
}
