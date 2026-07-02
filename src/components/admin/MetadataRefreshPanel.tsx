"use client";

import { useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import axios from "axios";
import {
  AlertTriangle,
  CheckCircle2,
  Clock3,
  Loader2,
  PauseCircle,
  Play,
  RefreshCw,
  Search,
  XCircle,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RemoteImage } from "@/components/RemoteImage";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { useLocale } from "@/lib/client/providers/LocaleProvider";
import { hasGameMediaGalleryAttachment } from "@/lib/metadata/galleries";

type RefreshableType = "games" | "movies" | "musics" | "books" | "boardgames";
type RefreshState =
  | "idle"
  | "queued"
  | "running"
  | "success"
  | "empty"
  | "error";

interface AdminRefreshItem {
  id: string;
  name: string;
  imageUrl?: string | null;
  barcode?: string | null;
  condition: string;
  metadataRefreshStartedAt?: string | null;
  createdAt: string;
  updatedAt: string;
  shelf: {
    id: string;
    name: string;
    type: RefreshableType;
  };
  user: {
    id: string;
    name?: string | null;
    email?: string | null;
  };
  metadata?: {
    id: string;
    title?: string | null;
    imageUrl?: string | null;
    lastFetched: string;
    attachments?: Array<{ source: string }> | null;
  } | null;
}

interface AdminRefreshPayload {
  generatedAt: string;
  total: number;
  items: AdminRefreshItem[];
}

interface ItemRunState {
  status: RefreshState;
  message?: string;
  startedAt?: number;
  endedAt?: number;
}

const refreshTypes: Array<"all" | RefreshableType> = [
  "all",
  "boardgames",
  "games",
  "movies",
  "books",
  "musics",
];

function statusClass(status: RefreshState) {
  if (status === "success") {
    return "border-emerald-500/30 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300";
  }
  if (status === "empty") {
    return "border-amber-500/30 bg-amber-500/10 text-amber-700 dark:text-amber-300";
  }
  if (status === "error") {
    return "border-destructive/30 bg-destructive/10 text-destructive";
  }
  if (status === "running") {
    return "border-primary/30 bg-primary/10 text-primary";
  }
  if (status === "queued") {
    return "border-sky-500/30 bg-sky-500/10 text-sky-700 dark:text-sky-300";
  }
  return "border-zinc-500/20 bg-zinc-500/10 text-muted-foreground";
}

function StatusIcon({ status }: { status: RefreshState }) {
  if (status === "running") return <Loader2 className="size-3 animate-spin" />;
  if (status === "success") return <CheckCircle2 className="size-3" />;
  if (status === "empty") return <AlertTriangle className="size-3" />;
  if (status === "error") return <XCircle className="size-3" />;
  if (status === "queued") return <Clock3 className="size-3" />;
  return <Clock3 className="size-3" />;
}

export function MetadataRefreshPanel() {
  const { locale } = useLocale();
  const queryClient = useQueryClient();
  const cancelRef = useRef(false);
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState<"all" | RefreshableType>("all");
  const [runStates, setRunStates] = useState<Record<string, ItemRunState>>({});
  const [isRunning, setIsRunning] = useState(false);
  const [currentItemId, setCurrentItemId] = useState<string | null>(null);
  const [lastRunTotal, setLastRunTotal] = useState(0);
  const [onlyMissingGameMediaGallery, setOnlyMissingGameMediaGallery] =
    useState(false);

  const {
    data,
    isLoading,
    isFetching,
    refetch: refetchItems,
  } = useQuery<AdminRefreshPayload>({
    queryKey: ["adminItemsRefresh"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/items-refresh");
      return res.data;
    },
    refetchOnWindowFocus: false,
  });

  const formatDate = (value?: string | null) => {
    if (!value) return locale === "fr" ? "Jamais" : "Never";
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const typeLabel = (type: "all" | RefreshableType) => {
    if (locale === "fr") {
      const labels: Record<"all" | RefreshableType, string> = {
        all: "Tous",
        games: "Jeux vidéo",
        movies: "Films / séries",
        musics: "Musique",
        books: "Livres",
        boardgames: "Jeux de société",
      };
      return labels[type];
    }
    const labels: Record<"all" | RefreshableType, string> = {
      all: "All",
      games: "Games",
      movies: "Movies",
      musics: "Music",
      books: "Books",
      boardgames: "Board games",
    };
    return labels[type];
  };

  const filteredItems = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (data?.items || [])
      .filter((item) => typeFilter === "all" || item.shelf.type === typeFilter)
      .filter((item) => {
        if (!onlyMissingGameMediaGallery) return true;
        if (item.shelf.type !== "games") return false;
        const hasGallery = hasGameMediaGalleryAttachment(
          item.metadata?.attachments ?? [],
        );
        return !hasGallery;
      })
      .filter((item) => {
        if (!q) return true;
        return [
          item.name,
          item.metadata?.title,
          item.barcode,
          item.shelf.name,
          item.user.name,
          item.user.email,
        ]
          .filter(Boolean)
          .join(" ")
          .toLowerCase()
          .includes(q);
      })
      .sort((a, b) => {
        const aTime = a.metadata?.lastFetched
          ? new Date(a.metadata.lastFetched).getTime()
          : 0;
        const bTime = b.metadata?.lastFetched
          ? new Date(b.metadata.lastFetched).getTime()
          : 0;
        return aTime - bTime;
      });
  }, [data?.items, search, typeFilter, onlyMissingGameMediaGallery]);

  const summary = useMemo(() => {
    const values = Object.values(runStates);
    return {
      queued: values.filter((state) => state.status === "queued").length,
      running: values.filter((state) => state.status === "running").length,
      success: values.filter((state) => state.status === "success").length,
      empty: values.filter((state) => state.status === "empty").length,
      error: values.filter((state) => state.status === "error").length,
    };
  }, [runStates]);

  const doneCount = summary.success + summary.empty + summary.error;
  const progress =
    lastRunTotal > 0
      ? Math.min(100, Math.round((doneCount / lastRunTotal) * 100))
      : 0;

  const updateItemAfterRefresh = (
    id: string,
    payload: {
      item?: { imageUrl?: string | null; metadata?: any } | null;
      refreshedAt?: string;
    },
  ) => {
    queryClient.setQueryData<AdminRefreshPayload>(
      ["adminItemsRefresh"],
      (current) => {
        if (!current) return current;
        return {
          ...current,
          items: current.items.map((item) => {
            if (item.id !== id) return item;
            return {
              ...item,
              imageUrl: payload.item?.imageUrl ?? item.imageUrl,
              metadata: payload.item?.metadata
                ? {
                    id:
                      item.metadata?.id ||
                      payload.item.metadata.id ||
                      "metadata",
                    title: payload.item.metadata.title || item.metadata?.title,
                    imageUrl:
                      payload.item.metadata.imageUrl || item.metadata?.imageUrl,
                    lastFetched:
                      payload.refreshedAt || new Date().toISOString(),
                  }
                : item.metadata,
            };
          }),
        };
      },
    );
  };

  const markState = (id: string, state: ItemRunState) => {
    setRunStates((previous) => ({
      ...previous,
      [id]: {
        ...previous[id],
        ...state,
      },
    }));
  };

  const waitForMetadataRefreshComplete = async (
    itemId: string,
  ): Promise<AdminRefreshItem | null> => {
    const deadline = Date.now() + 10 * 60 * 1000;
    while (!cancelRef.current && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 2000));
      const res = await axios.get<AdminRefreshPayload>("/api/admin/items-refresh");
      const refreshed = res.data.items.find((entry) => entry.id === itemId);
      if (!refreshed?.metadataRefreshStartedAt) {
        return refreshed ?? null;
      }
    }
    return null;
  };

  const runRefreshQueue = async (items: AdminRefreshItem[]) => {
    if (isRunning || items.length === 0) return;
    cancelRef.current = false;
    setIsRunning(true);
    setLastRunTotal(items.length);
    setCurrentItemId(null);
    setRunStates((previous) => {
      const next = { ...previous };
      for (const item of items) {
        next[item.id] = { status: "queued" };
      }
      return next;
    });

    for (const item of items) {
      if (cancelRef.current) break;

      setCurrentItemId(item.id);
      markState(item.id, { status: "running", startedAt: Date.now() });

      try {
        const res = await axios.post(`/api/admin/items-refresh/${item.id}`, {});
        updateItemAfterRefresh(item.id, res.data);

        if (res.data?.accepted) {
          const refreshedItem = await waitForMetadataRefreshComplete(item.id);
          if (cancelRef.current) break;
          if (refreshedItem) {
            queryClient.setQueryData<AdminRefreshPayload>(
              ["adminItemsRefresh"],
              (current) => {
                if (!current) return current;
                return {
                  ...current,
                  items: current.items.map((entry) =>
                    entry.id === item.id ? refreshedItem : entry,
                  ),
                };
              },
            );
          }
          const hasMetadata = Boolean(refreshedItem?.metadata);
          markState(item.id, {
            status: refreshedItem
              ? hasMetadata
                ? "success"
                : "empty"
              : "error",
            message: !refreshedItem
              ? locale === "fr"
                ? "Délai de refresh dépassé"
                : "Refresh timed out"
              : hasMetadata
                ? locale === "fr"
                  ? "Métadonnées rafraîchies"
                  : "Metadata refreshed"
                : locale === "fr"
                  ? "Aucune métadonnée trouvée"
                  : "No metadata found",
            endedAt: Date.now(),
          });
        } else {
          const hasMetadata = Boolean(res.data?.metadata);
          markState(item.id, {
            status: hasMetadata ? "success" : "empty",
            message: hasMetadata
              ? locale === "fr"
                ? "Métadonnées rafraîchies"
                : "Metadata refreshed"
              : locale === "fr"
                ? "Aucune métadonnée trouvée"
                : "No metadata found",
            endedAt: Date.now(),
          });
        }
      } catch (error: any) {
        markState(item.id, {
          status: "error",
          message:
            error.response?.data?.error ||
            error.message ||
            (locale === "fr" ? "Erreur de refresh" : "Refresh failed"),
          endedAt: Date.now(),
        });
      }
    }

    setCurrentItemId(null);
    setIsRunning(false);
    await refetchItems();
  };

  const stopQueue = () => {
    cancelRef.current = true;
    setRunStates((previous) => {
      const next = { ...previous };
      for (const [id, state] of Object.entries(next)) {
        if (state.status === "queued") {
          next[id] = {
            ...state,
            status: "idle",
            message: locale === "fr" ? "En attente" : "Waiting",
          };
        }
      }
      return next;
    });
  };

  const currentItem = currentItemId
    ? data?.items.find((item) => item.id === currentItemId)
    : null;

  if (isLoading) {
    return (
      <div className="grid gap-4">
        <Skeleton className="h-40 rounded-xl" />
        <Skeleton className="h-96 rounded-xl" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <Card className="border bg-card/60 shadow-md">
        <CardHeader>
          <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
            <div>
              <CardTitle className="flex items-center gap-2 text-lg">
                <RefreshCw className="size-5 text-primary" />
                {locale === "fr"
                  ? "Refresh metadata global"
                  : "Global metadata refresh"}
              </CardTitle>
              <CardDescription>
                {locale === "fr"
                  ? "File séquentielle façon Plex: chaque item passe de queued à running puis terminé."
                  : "Plex-like sequential queue: each item moves from queued to running to done."}
              </CardDescription>
            </div>
            <div className="flex flex-col sm:flex-row gap-2">
              <Button
                variant="outline"
                onClick={() => refetchItems()}
                disabled={isFetching || isRunning}
              >
                <RefreshCw
                  className={`size-4 ${isFetching ? "animate-spin" : ""}`}
                />
                {locale === "fr" ? "Recharger" : "Reload"}
              </Button>
              {isRunning ? (
                <Button variant="destructive" onClick={stopQueue}>
                  <PauseCircle className="size-4" />
                  {locale === "fr" ? "Arrêter après l'item" : "Stop after item"}
                </Button>
              ) : (
                <Button
                  onClick={() => runRefreshQueue(filteredItems)}
                  disabled={filteredItems.length === 0}
                >
                  <Play className="size-4" />
                  {locale === "fr"
                    ? `Refresh ${filteredItems.length} item(s)`
                    : `Refresh ${filteredItems.length} item(s)`}
                </Button>
              )}
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-[1fr_220px_auto] gap-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
              <Input
                value={search}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={
                  locale === "fr"
                    ? "Filtrer par nom, étagère, code-barres, utilisateur..."
                    : "Filter by name, shelf, barcode, user..."
                }
                className="pl-9"
              />
            </div>
            <Select
              value={typeFilter}
              onValueChange={(value) =>
                setTypeFilter(value as "all" | RefreshableType)
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {refreshTypes.map((type) => (
                  <SelectItem key={type} value={type}>
                    {typeLabel(type)}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Button
              variant="ghost"
              onClick={() => {
                setSearch("");
                setTypeFilter("all");
                setRunStates({});
                setLastRunTotal(0);
                setOnlyMissingGameMediaGallery(false);
              }}
              disabled={isRunning}
            >
              {locale === "fr" ? "Réinitialiser" : "Reset"}
            </Button>
          </div>

          <div className="flex items-center space-x-2.5 pt-1">
            <Switch
              id="game-media-gallery-filter"
              checked={onlyMissingGameMediaGallery}
              onCheckedChange={(checked) => {
                setOnlyMissingGameMediaGallery(checked);
                if (checked) {
                  setTypeFilter("games");
                }
              }}
              disabled={isRunning}
            />
            <Label
              htmlFor="game-media-gallery-filter"
              className="text-xs font-medium cursor-pointer select-none text-muted-foreground hover:text-foreground transition-colors"
            >
              {locale === "fr"
                ? "Uniquement les jeux vidéo sans galerie média catalogue"
                : "Only games missing catalog media gallery"}
            </Label>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">
                {locale === "fr" ? "Items affichés" : "Visible items"}
              </div>
              <div className="text-2xl font-semibold">
                {filteredItems.length}
              </div>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">OK</div>
              <div className="text-2xl font-semibold text-emerald-600">
                {summary.success}
              </div>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">
                {locale === "fr" ? "Vides" : "Empty"}
              </div>
              <div className="text-2xl font-semibold text-amber-600">
                {summary.empty}
              </div>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">
                {locale === "fr" ? "Erreurs" : "Errors"}
              </div>
              <div className="text-2xl font-semibold text-destructive">
                {summary.error}
              </div>
            </div>
            <div className="rounded-lg border bg-background/60 p-3">
              <div className="text-xs text-muted-foreground">
                {locale === "fr" ? "En file" : "Queued"}
              </div>
              <div className="text-2xl font-semibold">
                {summary.queued + summary.running}
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className="flex items-center justify-between gap-3 text-xs text-muted-foreground">
              <span>
                {currentItem
                  ? locale === "fr"
                    ? `En cours: ${currentItem.name}`
                    : `Now refreshing: ${currentItem.name}`
                  : isRunning
                    ? locale === "fr"
                      ? "Préparation..."
                      : "Preparing..."
                    : locale === "fr"
                      ? "Prêt"
                      : "Ready"}
              </span>
              <span>{progress}%</span>
            </div>
            <div className="h-2 overflow-hidden rounded-full bg-muted">
              <div
                className="h-full bg-primary transition-all duration-300"
                style={{ width: `${progress}%` }}
              />
            </div>
          </div>
        </CardContent>
      </Card>

      <Card className="border bg-card/60 shadow-md">
        <CardHeader className="border-b">
          <CardTitle className="text-lg">
            {locale === "fr" ? "File de refresh" : "Refresh queue"}
          </CardTitle>
          <CardDescription>
            {locale === "fr"
              ? `${data?.total || 0} item(s) en base, triés par ancienneté de refresh.`
              : `${data?.total || 0} item(s) in database, sorted by oldest refresh.`}
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="max-h-[680px] overflow-auto">
            <table className="w-full min-w-[980px] text-sm">
              <thead className="sticky top-0 z-10 border-b bg-background text-left text-xs text-muted-foreground">
                <tr>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Item" : "Item"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Type / étagère" : "Type / shelf"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Utilisateur" : "User"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Dernier refresh" : "Last refresh"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Statut" : "Status"}
                  </th>
                  <th className="px-4 py-3 font-medium">
                    {locale === "fr" ? "Action" : "Action"}
                  </th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => {
                  const state = runStates[item.id]?.status || "idle";
                  const message = runStates[item.id]?.message;
                  const isCurrent = currentItemId === item.id;
                  const image = item.imageUrl || item.metadata?.imageUrl;
                  return (
                    <tr
                      key={item.id}
                      className={`border-b align-middle transition-colors ${
                        isCurrent ? "bg-primary/10" : "hover:bg-muted/45"
                      }`}
                    >
                      <td className="px-4 py-3">
                        <div className="flex min-w-0 items-center gap-3">
                          <div className="relative h-14 w-10 shrink-0 overflow-hidden rounded border bg-muted">
                            {image ? (
                              <RemoteImage
                                src={image}
                                alt={item.name}
                                width={40}
                                height={56}
                                className="h-full w-full object-cover"
                              />
                            ) : (
                              <div className="flex h-full w-full items-center justify-center text-[10px] text-muted-foreground">
                                IMG
                              </div>
                            )}
                          </div>
                          <div className="min-w-0">
                            <div className="truncate font-medium">
                              {item.metadata?.title || item.name}
                            </div>
                            {item.metadata?.title &&
                              item.metadata.title !== item.name && (
                                <div className="truncate text-xs text-muted-foreground">
                                  {item.name}
                                </div>
                              )}
                            {item.barcode && (
                              <div className="font-mono text-[11px] text-muted-foreground">
                                {item.barcode}
                              </div>
                            )}
                          </div>
                        </div>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-col gap-1">
                          <Badge variant="outline" className="w-fit">
                            {typeLabel(item.shelf.type)}
                          </Badge>
                          <span className="text-xs text-muted-foreground">
                            {item.shelf.name}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {item.user.name || item.user.email || item.user.id}
                      </td>
                      <td className="px-4 py-3 text-xs text-muted-foreground">
                        {formatDate(item.metadata?.lastFetched)}
                      </td>
                      <td className="px-4 py-3">
                        <Badge
                          variant="outline"
                          className={`gap-1.5 ${statusClass(state)}`}
                        >
                          <StatusIcon status={state} />
                          {state}
                        </Badge>
                        {message && (
                          <div className="mt-1 max-w-[220px] truncate text-xs text-muted-foreground">
                            {message}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => runRefreshQueue([item])}
                          disabled={isRunning}
                        >
                          <RefreshCw className="size-4" />
                          {locale === "fr" ? "Refresh" : "Refresh"}
                        </Button>
                      </td>
                    </tr>
                  );
                })}
                {filteredItems.length === 0 && (
                  <tr>
                    <td
                      colSpan={6}
                      className="px-4 py-12 text-center text-sm text-muted-foreground"
                    >
                      {locale === "fr"
                        ? "Aucun item ne correspond au filtre."
                        : "No item matches the filter."}
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
