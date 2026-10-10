import axios from "axios";
import { useSession, signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import { type User, UserRole } from "@/generated/prisma/browser";

export function useAccount() {
  const { data: session, status } = useSession();
  const queryClient = useQueryClient();

  const unlocked = status === "authenticated" && !!session?.user?.id;

  const { data: user } = useQuery<User>({
    queryKey: ["user"],
    queryFn: async () => {
      try {
        const response = await axios.get("/api/users/me");
        if (!response.data) {
          throw new Error("No data received from server");
        }
        return response.data;
      } catch (error) {
        if (axios.isAxiosError(error) && error.response?.status === 404) {
          // Stale unlock cookie — clear it; browsing stays public.
          await signOut({ redirect: false });
        }
        throw error;
      }
    },
    enabled: unlocked,
  });

  const { mutateAsync: update } = useMutation({
    mutationFn: async (data: { password: string }) => {
      const response = await axios.patch("/api/users", data);
      return response.data;
    },
    onSuccess: async () => {
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  // Unlocked owner session. Anonymous browsing is intentional — not "logged out".
  const isGuest =
    !unlocked ||
    session?.user?.role === "guest" ||
    user?.role === UserRole.guest;
  const isAuthenticated = unlocked && !isGuest;
  const isAdmin =
    session?.user?.role === "admin" || user?.role === UserRole.admin;
  const userId = user?.id ?? session?.user?.id;

  const hasPermission = (ownerId?: string | null) => {
    if (isGuest) return false;
    if (isAdmin) return true;
    if (!userId || !ownerId) return false;
    return userId === ownerId;
  };

  return {
    user,
    update,
    isAuthenticated,
    isGuest,
    isAdmin,
    userId,
    hasPermission,
  };
}
