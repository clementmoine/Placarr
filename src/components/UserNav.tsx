"use client";

import { useState } from "react";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import {
  LogOut,
  Shield,
  Globe,
  Sun,
  Moon,
  Laptop,
  LockOpen,
  Settings,
  KeyRound,
} from "lucide-react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import { useTheme } from "next-themes";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
  DropdownMenuSub,
  DropdownMenuSubTrigger,
  DropdownMenuSubContent,
} from "@/components/ui/dropdown-menu";
import { ProfileModal } from "@/components/modals/ProfileModal";

import { useAccount } from "@/lib/client/hooks/useAccount";

export function UserNav() {
  const { t, locale, changeLocale, availableLocales } = useLocale();
  const { isGuest, isAdmin } = useAccount();
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const router = useRouter();
  const { theme, setTheme } = useTheme();

  const localeNames: Record<string, string> = {
    en: "English",
    fr: "Français",
  };

  if (isGuest) {
    return (
      <div className="flex items-center gap-1">
        <DropdownMenu modal={false}>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="size-8 rounded-full">
              <Globe className="size-4" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent className="w-48" align="end">
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
                <DropdownMenuItem onClick={() => setTheme("light")}>
                  <Sun className="size-4 mr-2" />
                  <span>{t("common.themeLight") || "Light"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("dark")}>
                  <Moon className="size-4 mr-2" />
                  <span>{t("common.themeDark") || "Dark"}</span>
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => setTheme("system")}>
                  <Laptop className="size-4 mr-2" />
                  <span>{t("common.themeSystem") || "System"}</span>
                </DropdownMenuItem>
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          </DropdownMenuContent>
        </DropdownMenu>
        <Button
          variant="outline"
          size="sm"
          className="h-8 gap-1.5 rounded-full px-3 text-xs font-semibold"
          onClick={() => router.push("/auth/login")}
        >
          <LockOpen className="size-3.5" />
          {t("auth.unlockButton")}
        </Button>
      </div>
    );
  }

  return (
    <>
      <DropdownMenu modal={false}>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-8 rounded-full">
            <Settings className="size-4" />
          </Button>
        </DropdownMenuTrigger>

        <DropdownMenuContent className="w-56" align="end" forceMount>
          <DropdownMenuItem onClick={() => setShowPasswordModal(true)}>
            <KeyRound className="size-4" />
            <span>{t("profile.changePasswordTitle")}</span>
          </DropdownMenuItem>

          <DropdownMenuSeparator />

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

          <DropdownMenuItem onClick={() => signOut({ callbackUrl: "/" })}>
            <LogOut className="text-destructive" />
            <span className="text-destructive">{t("user.lock")}</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showPasswordModal && (
        <ProfileModal onClose={() => setShowPasswordModal(false)} />
      )}
    </>
  );
}
