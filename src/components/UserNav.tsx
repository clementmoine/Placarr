"use client";

import { useState } from "react";
import { useLocale } from "@/lib/providers/LocaleProvider";
import {
  User,
  LogOut,
  Shield,
  Globe,
  Sun,
  Moon,
  Laptop,
  LibraryBig,
  Compass,
  Repeat,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfileModal } from "@/components/modals/ProfileModal";

import { useAccount } from "@/lib/hooks/useAccount";

export function UserNav() {
  const { t, locale, changeLocale, availableLocales } = useLocale();
  const { isGuest, isAuthenticated, isAdmin, user } = useAccount();
  const [showProfileModal, setShowProfileModal] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const localeNames: Record<string, string> = {
    en: "English",
    fr: "Français",
  };

  const initials = user?.name
    ?.split(" ")
    .map((n: string) => n[0])
    .join("")
    .toUpperCase();

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" className="relative size-8 rounded-full">
            <Avatar className="size-8">
              <AvatarImage
                src={user?.image || undefined}
                alt={user?.name || t("user.avatar")}
              />

              <AvatarFallback>{initials}</AvatarFallback>
            </Avatar>
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuLabel className="font-normal">
            <div className="flex items-center gap-2">
              <Avatar className="size-8">
                <AvatarImage
                  src={user?.image || undefined}
                  alt={user?.name || t("user.avatar")}
                />

                <AvatarFallback>{initials}</AvatarFallback>
              </Avatar>

              <div className="flex flex-col space-y-1 overflow-hidden">
                <p className="text-sm font-medium leading-none">{user?.name}</p>
                <p className="text-xs leading-none text-muted-foreground truncate">
                  {user?.email}
                </p>
              </div>
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />

          {isAuthenticated && !isGuest && (
            <>
              <DropdownMenuItem onClick={() => router.push("/shelves")}>
                <LibraryBig className="size-4" />
                <span>{t("navigation.shelves")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/explore")}>
                <Compass className="size-4" />
                <span>{t("navigation.explore")}</span>
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => router.push("/loans")}>
                <Repeat className="size-4" />
                <span>{t("navigation.loans")}</span>
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowProfileModal(true)}>
                <User />
                <span>{t("user.profile")}</span>
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              <Globe className="size-4 text-muted-foreground" />
              <span>{t("common.switchLanguage")}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {availableLocales.map((loc) => (
                <DropdownMenuItem
                  key={loc}
                  onClick={() => changeLocale(loc)}
                  className={locale === loc ? "bg-accent" : ""}
                >
                  {localeNames[loc]}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="gap-2">
              {theme === "dark" && (
                <Moon className="size-4 text-muted-foreground" />
              )}
              {theme === "light" && (
                <Sun className="size-4 text-muted-foreground" />
              )}
              {theme === "system" && (
                <Laptop className="size-4 text-muted-foreground" />
              )}
              <span>{t("common.theme") || "Theme"}</span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuItem
                onClick={() => setTheme("light")}
                className={theme === "light" ? "bg-accent" : ""}
              >
                <Sun className="size-4 mr-2" />
                <span>{t("common.themeLight") || "Light"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("dark")}
                className={theme === "dark" ? "bg-accent" : ""}
              >
                <Moon className="size-4 mr-2" />
                <span>{t("common.themeDark") || "Dark"}</span>
              </DropdownMenuItem>
              <DropdownMenuItem
                onClick={() => setTheme("system")}
                className={theme === "system" ? "bg-accent" : ""}
              >
                <Laptop className="size-4 mr-2" />
                <span>{t("common.themeSystem") || "System"}</span>
              </DropdownMenuItem>
            </DropdownMenuSubContent>
          </DropdownMenuSub>

          {isAdmin && (
            <DropdownMenuItem onClick={() => router.push("/admin")}>
              <Shield className="size-4" />
              <span>{t("navigation.admin") || "Administration"}</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="text-destructive" />
            <span className="text-destructive">{t("user.logout")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}
    </>
  );
}
