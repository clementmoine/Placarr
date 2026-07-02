"use client";

import { LibraryBig } from "lucide-react";
import Link from "next/link";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { UserNav } from "./UserNav";
import { BottomNav } from "./BottomNav";
import { BackgroundJobsMenu } from "./BackgroundJobsMenu";

interface HeaderProps {
  children?: React.ReactNode;
}

export default function Header(props: HeaderProps) {
  const { t } = useLocale();

  return (
    <>
      <header className="sticky top-0 z-40 flex items-center justify-between p-3 md:p-4 border-b bg-background/80 backdrop-blur-md shadow-sm">
        {/* Left part */}
        <div className="flex items-center gap-6">
          <Link href="/shelves">
            <div className="flex items-center gap-1.5 md:gap-2">
              <LibraryBig className="size-5 md:size-6 text-foreground" />
              <h1 className="text-base md:text-lg font-semibold text-foreground">
                {t("app.name")}
              </h1>
            </div>
          </Link>

          {/* Desktop Navigation */}
          <nav className="hidden sm:flex items-center gap-4 text-xs font-semibold uppercase tracking-wider text-muted-foreground select-none">
            <Link
              href="/shelves"
              className="hover:text-foreground transition-colors"
            >
              {t("navigation.shelves")}
            </Link>
            <Link
              href="/items"
              className="hover:text-foreground transition-colors"
            >
              {t("navigation.items")}
            </Link>
            <Link
              href="/explore"
              className="hover:text-foreground transition-colors"
            >
              {t("navigation.explore")}
            </Link>
            <Link
              href="/loans"
              className="hover:text-foreground transition-colors"
            >
              {t("navigation.loans")}
            </Link>
          </nav>
        </div>

        {/* Right part */}
        <div className="flex items-center gap-2 md:gap-4">
          {props.children}
          <BackgroundJobsMenu />
          <UserNav />
        </div>
      </header>
      <BottomNav />
    </>
  );
}
