import axios from "axios";
import { useSession, signOut } from "next-auth/react";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useRouter } from "next/navigation";

import { type User, UserRole } from "@prisma/client";

export function useAccount() {
  const { data: session, update: updateSession } = useSession();
  const queryClient = useQueryClient();
  const router = useRouter();

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
          // Session is invalid, sign out and redirect to login
          await signOut({ redirect: false });
          router.push("/auth/login");
        }
        throw error;
      }
    },
    enabled: !!session?.user,
  });

  const { mutate: update } = useMutation({
    mutationFn: async (data: {
      name?: string;
      image?: string;
      password?: string;
      email?: string;
    }) => {
      const response = await axios.patch("/api/users", data);
      return response.data;
    },
    onSuccess: async (data) => {
      // Update session with new data
      await updateSession({
        user: {
          ...session?.user,
          name: data.name,
          email: data.email,
        },
      });
      // Invalidate and refetch user data
      queryClient.invalidateQueries({ queryKey: ["user"] });
    },
  });

  const { mutate: deleteAccount } = useMutation({
    mutationFn: async () => {
      const response = await axios.delete("/api/users");
      return response.data;
    },
    onSuccess: async () => {
      // Invalidate all user-related queries
      queryClient.invalidateQueries({ queryKey: ["user"] });
      queryClient.invalidateQueries({ queryKey: ["users"] });
      // Sign out and redirect to login
      await signOut({ redirect: false });
      router.push("/auth/login");
    },
  });

  const isAuthenticated = user;

  const isGuest = user?.role === UserRole.guest;
  const isAdmin = user?.role === UserRole.admin;
  const userId = user?.id;

  const hasPermission = (ownerId?: string | null) => {
    if (isAdmin) return true;
    if (!userId || !ownerId) return false;
    return userId === ownerId;
  };

  return {
    user,
    update,
    deleteAccount,
    isAuthenticated,
    isGuest,
    isAdmin,
    userId,
    hasPermission,
  };
}
