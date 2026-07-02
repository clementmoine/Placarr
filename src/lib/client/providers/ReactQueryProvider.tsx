"use client";

import {
  QueryClientProvider,
  QueryClient,
  isServer,
} from "@tanstack/react-query";
import { useState } from "react";
import axios from "axios";

function makeQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: {
        // Les données restent "fraîches" 1 min : pas de refetch au remount
        // ni au retour de focus pendant ce laps de temps.
        staleTime: 60_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        // Ne pas réessayer les erreurs définitives (4xx) côté client.
        retry: (failureCount, error) => {
          const status = axios.isAxiosError(error)
            ? error.response?.status
            : undefined;
          if (status && status >= 400 && status < 500) return false;
          return failureCount < 2;
        },
      },
      mutations: {
        retry: 0,
      },
    },
  });
}

let browserQueryClient: QueryClient | undefined;

function getQueryClient(): QueryClient {
  // Sur le serveur, toujours un nouveau client (évite le partage entre requêtes).
  if (isServer) return makeQueryClient();
  // Dans le navigateur, un singleton stable d'une navigation à l'autre.
  if (!browserQueryClient) browserQueryClient = makeQueryClient();
  return browserQueryClient;
}

const ReactQueryProvider = ({ children }: { children: React.ReactNode }) => {
  const [queryClient] = useState(getQueryClient);

  return (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

export default ReactQueryProvider;
