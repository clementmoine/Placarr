"use client";

import { useState } from "react";
import { User, LogOut } from "lucide-react";
import { signOut } from "next-auth/react";

import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { ProfileModal } from "@/components/modals/ProfileModal";

import { useAccount } from "@/lib/hooks/useAccount";

export function UserNav() {
  const { isGuest, isAuthenticated, user } = useAccount();
  const [showProfileModal, setShowProfileModal] = useState(false);

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
                alt={user?.name || "User avatar"}
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
                  alt={user?.name || "User avatar"}
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
            <DropdownMenuItem onClick={() => setShowProfileModal(true)}>
              <User />
              <span>Profile</span>
            </DropdownMenuItem>
          )}

          <DropdownMenuItem
            onClick={() => signOut({ callbackUrl: "/auth/login" })}
          >
            <LogOut className="text-destructive" />
            <span className="text-destructive">Log out</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {showProfileModal && (
        <ProfileModal onClose={() => setShowProfileModal(false)} />
      )}
    </>
  );
}
