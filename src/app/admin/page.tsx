"use client";

import { useQuery } from "@tanstack/react-query";
import axios from "axios";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { useSession } from "next-auth/react";

import { useLocale } from "@/lib/providers/LocaleProvider";
import Header from "@/components/Header";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Database,
  Key,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Play,
  Loader2,
  FlaskConical,
  Terminal,
} from "lucide-react";
import { useAccount } from "@/lib/hooks/useAccount";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import Image from "next/image";

interface ApiStatus {
  name: string;
  type: "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: { remaining: number; limit: number } | null;
}

type ProviderType = "games" | "movies" | "musics" | "books" | "boardgames";
type ProviderCapability =
  | "identify"
  | "price"
  | "rating"
  | "ageRating"
  | "cover"
  | "description"
  | "screenshots"
  | "releaseDate"
  | "duration"
  | "people"
  | "pageCount"
  | "tracksCount";

interface ProviderRegistryEntry {
  id: string;
  label: string;
  types: ProviderType[];
  capabilities: ProviderCapability[];
  canonical: boolean;
  notes?: string;
  auth:
    | { kind: "none" }
    | { kind: "scrape" }
    | { kind: "key"; env: string[]; free: boolean };
  configured: boolean;
}

interface ProviderCoverageEntry {
  capability: ProviderCapability;
  providers: string[];
  configuredCount: number;
  risk: "missing" | "single-source" | "ok" | "n/a";
}

interface ProviderCoverageByType {
  type: ProviderType;
  capabilities: ProviderCoverageEntry[];
}

interface ProviderRegistryPayload {
  providers: ProviderRegistryEntry[];
  coverage: ProviderCoverageByType[];
}

type MappingProbeStatus = "ok" | "partial" | "empty" | "blocked" | "error";

interface ProviderMappingProbeEntry {
  providerId: string;
  label: string;
  status: MappingProbeStatus;
  sampleInput: string;
  mappedKeys: string[];
  unusedKeys: string[];
  attachmentsCount: number;
  factsCount: number;
  reason: string | null;
  example: string | null;
}

interface ProviderMappingAuditPayload {
  generatedAt: string;
  probes: ProviderMappingProbeEntry[];
}

interface TeardownNameBlock {
  kind:
    | "title"
    | "platform"
    | "edition"
    | "region"
    | "format"
    | "condition"
    | "year"
    | "noise";
  text: string;
  reason: string;
}

interface TeardownNameParse {
  rawName: string;
  cleanName: string;
  platformKey: string | null;
  blocks: TeardownNameBlock[];
}

interface TeardownProviderContribution {
  provider: string;
  phase: "barcode" | "metadata" | "merged";
  status: "hit" | "empty" | "error" | "skipped";
  durationMs: number;
  fields: Array<{
    field: string;
    value: string;
    confidence?: number;
  }>;
  products: Array<{
    name: string;
    coverUrl?: string | null;
    platformKey?: string | null;
  }>;
  error?: string;
  rawSample?: unknown;
  coverSelection?: {
    selectedUrl: string | null;
    candidates: Array<{
      url: string;
      type: string;
      source?: string;
      role?: string;
      score: number;
      selected: boolean;
      signals: string[];
      width?: number;
      height?: number;
      aspectRatio?: number;
      format?: string;
    }>;
  };
}

interface ProductTeardownResult {
  input: {
    barcode: string;
    name: string;
    type: string;
    platform: string | null;
    providers?: string[];
  };
  inferredType?: string | null;
  selectedName: string;
  barcodeResult: any;
  parser: TeardownNameParse[];
  providers: TeardownProviderContribution[];
  coverage: Array<{
    field: string;
    providers: string[];
    values: string[];
    confidence?: number;
  }>;
  gaps: string[];
  globalConfidence: number;
  generatedAt: string;
}

const dashboardUrls: Record<string, string> = {
  Deezer: "https://developers.deezer.com/",
  "Open Library": "https://openlibrary.org/",
  BoardGameGeek: "https://boardgamegeek.com/",
  "Chasse aux Livres": "https://www.chasse-aux-livres.fr/",
  LeDenicheur: "https://ledenicheur.fr/",
  TMDB: "https://www.themoviedb.org/settings/api",
  RAWG: "https://rawg.io/apikeys",
  ScreenScraper: "https://www.screenscraper.fr/",
  IGDB: "https://dev.twitch.tv/console/apps",
};

const providerWebsiteUrls: Record<string, string> = {
  screenscraper: "https://www.screenscraper.fr/",
  igdb: "https://www.igdb.com/",
  rawg: "https://rawg.io/",
  steamgriddb: "https://www.steamgriddb.com/",
  steam: "https://store.steampowered.com/",
  howlongtobeat: "https://howlongtobeat.com/",
  pricecharting: "https://www.pricecharting.com/",
  coverproject: "https://www.thecoverproject.net/",
  musicbrainz: "https://musicbrainz.org/",
  discogs: "https://www.discogs.com/",
  deezer: "https://www.deezer.com/",
  tmdb: "https://www.themoviedb.org/",
  omdb: "https://www.omdbapi.com/",
  openlibrary: "https://openlibrary.org/",
  boardgamegeek: "https://boardgamegeek.com/",
  chasseauxlivres: "https://www.chasse-aux-livres.fr/",
  achatmoinscher: "https://www.achatmoinscher.com/",
  ledenicheur: "https://ledenicheur.fr/",
  apriloshop: "https://apriloshop.fr/",
  freakxy: "https://www.freakxy.fr/",
  picclick: "https://picclick.fr/",
  scandex: "https://scandex.app/",
};

const providerTypesOrder: ProviderType[] = [
  "games",
  "movies",
  "musics",
  "books",
  "boardgames",
];

const matrixCapabilities: ProviderCapability[] = [
  "identify",
  "price",
  "rating",
  "ageRating",
  "cover",
  "description",
  "screenshots",
  "releaseDate",
  "duration",
  "people",
  "pageCount",
  "tracksCount",
];

const normalizeProviderKey = (value: string) =>
  value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/gi, "")
    .toLowerCase();

function teardownStatusClass(status: TeardownProviderContribution["status"]) {
  if (status === "hit") {
    return "bg-emerald-500/10 text-emerald-700 border-emerald-500/25 dark:text-emerald-300";
  }
  if (status === "error") {
    return "bg-destructive/10 text-destructive border-destructive/25";
  }
  return "bg-zinc-500/10 text-zinc-600 border-zinc-500/20 dark:text-zinc-300";
}

function teardownBlockClass(kind: TeardownNameBlock["kind"]) {
  if (kind === "title") {
    return "bg-primary/10 text-primary border-primary/25";
  }
  if (kind === "platform") {
    return "bg-cyan-500/10 text-cyan-700 border-cyan-500/25 dark:text-cyan-300";
  }
  if (kind === "edition") {
    return "bg-violet-500/10 text-violet-700 border-violet-500/25 dark:text-violet-300";
  }
  if (kind === "condition" || kind === "noise") {
    return "bg-amber-500/10 text-amber-700 border-amber-500/25 dark:text-amber-300";
  }
  return "bg-zinc-500/10 text-zinc-700 border-zinc-500/20 dark:text-zinc-300";
}

function AdminDashboardComponent() {
  const { status, data: session } = useSession();
  useAccount();
  const router = useRouter();
  const { t, locale } = useLocale();

  const [expandedErrors, setExpandedErrors] = useState<Record<string, boolean>>(
    {},
  );

  const {
    data: apis,
    isLoading,
    refetch,
    isFetching,
  } = useQuery<ApiStatus[]>({
    queryKey: ["adminStatus"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/status");
      return res.data;
    },
    enabled: status === "authenticated" && session?.user?.role === "admin",
    refetchOnWindowFocus: false,
  });

  const {
    data: providerRegistry,
    isLoading: isLoadingProviders,
    isFetching: isFetchingProviders,
    refetch: refetchProviders,
  } = useQuery<ProviderRegistryPayload>({
    queryKey: ["adminProvidersRegistry"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/providers");
      return res.data;
    },
    enabled: status === "authenticated" && session?.user?.role === "admin",
    refetchOnWindowFocus: false,
  });

  const {
    data: providerMappingAudit,
    isFetching: isFetchingMappingAudit,
    refetch: refetchMappingAudit,
  } = useQuery<ProviderMappingAuditPayload>({
    queryKey: ["adminProviderMappingAudit"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/provider-mapping-audit");
      return res.data;
    },
    enabled: false,
    refetchOnWindowFocus: false,
  });

  const [teardownBarcode, setTeardownBarcode] = useState("");
  const [teardownName, setTeardownName] = useState("");
  const [teardownType, setTeardownType] = useState("auto");
  const [teardownPlatform, setTeardownPlatform] = useState("");
  const [teardownProviders, setTeardownProviders] = useState("all");
  const [isRunningTeardown, setIsRunningTeardown] = useState(false);
  const [teardownResult, setTeardownResult] =
    useState<ProductTeardownResult | null>(null);
  const [teardownError, setTeardownError] = useState<string | null>(null);
  const [providerSearch, setProviderSearch] = useState("");
  const [providerTypeFilter, setProviderTypeFilter] = useState<
    "all" | ProviderType
  >("all");
  const [providerRuntimeFilter, setProviderRuntimeFilter] = useState<
    "all" | "up" | "down" | "unconfigured" | "no-probe"
  >("all");
  const [providerSortBy, setProviderSortBy] = useState<
    | "provider"
    | "types"
    | "canonical"
    | "auth"
    | "config"
    | "status"
    | ProviderCapability
  >("provider");
  const [providerSortDirection, setProviderSortDirection] = useState<
    "asc" | "desc"
  >("asc");
  const [showProviderRuntime, setShowProviderRuntime] = useState(false);
  const [showCoverageByType, setShowCoverageByType] = useState(false);
  const [mappingAuditFilter, setMappingAuditFilter] = useState<
    "all" | MappingProbeStatus
  >("all");

  const formatAdminDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  const capabilityLabel = (capability: ProviderCapability) => {
    if (locale === "fr") {
      const labels: Record<ProviderCapability, string> = {
        identify: "Code-barres / identification",
        price: "Prix",
        rating: "Evaluation",
        ageRating: "Public",
        cover: "Image / jaquette",
        description: "Description",
        screenshots: "Screenshots",
        releaseDate: "Date de sortie",
        duration: "Durée / time-to-beat",
        people: "Auteurs / studios",
        pageCount: "Nombre de pages",
        tracksCount: "Nombre de pistes",
      };
      return labels[capability];
    }
    const labels: Record<ProviderCapability, string> = {
      identify: "Barcode / identify",
      price: "Price",
      rating: "Rating",
      ageRating: "Audience",
      cover: "Cover",
      description: "Description",
      screenshots: "Screenshots",
      releaseDate: "Release date",
      duration: "Duration / time-to-beat",
      people: "People / studios",
      pageCount: "Page count",
      tracksCount: "Track count",
    };
    return labels[capability];
  };

  const typeLabel = (type: ProviderType) => {
    if (locale === "fr") {
      const labels: Record<ProviderType, string> = {
        games: "Jeux video",
        movies: "Films / series",
        musics: "Musique",
        books: "Livres",
        boardgames: "Jeux de societe",
      };
      return labels[type];
    }
    const labels: Record<ProviderType, string> = {
      games: "Games",
      movies: "Movies",
      musics: "Music",
      books: "Books",
      boardgames: "Board games",
    };
    return labels[type];
  };

  const parseTeardownProviders = (value: string) => {
    const entries = value
      .split(/[\n,;]+/)
      .map((entry) => entry.trim())
      .filter(Boolean);
    if (
      entries.length === 0 ||
      entries.some((entry) => /^(all|\*)$/i.test(entry))
    ) {
      return [];
    }
    return Array.from(new Set(entries));
  };

  const handleRunProductTeardown = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teardownBarcode.trim() && !teardownName.trim()) {
      toast.error(
        locale === "fr"
          ? "Entre un code-barres, un nom, ou les deux"
          : "Enter a barcode, a name, or both",
      );
      return;
    }

    setIsRunningTeardown(true);
    setTeardownError(null);
    setTeardownResult(null);
    try {
      const selectedProviders = parseTeardownProviders(teardownProviders);
      const res = await axios.post("/api/admin/product-teardown", {
        barcode: teardownBarcode,
        name: teardownName,
        type: teardownType === "auto" ? null : teardownType,
        platform: teardownPlatform,
        providers: selectedProviders,
        refresh: true,
      });
      setTeardownResult(res.data);
    } catch (err: any) {
      const msg =
        err.response?.data?.error ||
        err.message ||
        t("common.somethingWentWrong") ||
        "Request failed";
      setTeardownError(msg);
      toast.error(msg);
    } finally {
      setIsRunningTeardown(false);
    }
  };


  useEffect(() => {
    if (status !== "loading") {
      if (!session || session.user.role !== "admin") {
        router.replace("/shelves");
      }
    }
  }, [session, status, router]);

  if (status === "loading" || !session || session.user.role !== "admin") {
    return (
      <div className="flex flex-col h-screen bg-background text-foreground items-center justify-center p-4">
        <Activity className="size-10 text-primary animate-pulse mb-4" />
        <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
      </div>
    );
  }

  const toggleError = (name: string) => {
    setExpandedErrors((prev) => ({
      ...prev,
      [name]: !prev[name],
    }));
  };

  const metadataApis = apis?.filter((a) => a.type === "metadata") || [];

  const healthyCount = apis?.filter((a) => a.status === "up").length || 0;
  const totalCount = apis?.length || 0;

  const runtimeStatusByProviderKey = new Map(
    (apis || []).map((api) => [normalizeProviderKey(api.name), api]),
  );

  const providersWithRuntime = (providerRegistry?.providers || []).map(
    (provider) => {
      const runtime =
        runtimeStatusByProviderKey.get(normalizeProviderKey(provider.label)) ||
        runtimeStatusByProviderKey.get(normalizeProviderKey(provider.id));
      return {
        ...provider,
        runtime,
      };
    },
  );

  const providerHealthSummary = providersWithRuntime.reduce(
    (acc, provider) => {
      if (provider.configured) {
        acc.configured += 1;
      }
      if (provider.runtime?.status === "up") {
        acc.up += 1;
      } else if (provider.runtime?.status === "down") {
        acc.down += 1;
      } else if (provider.runtime?.status === "unconfigured") {
        acc.unconfigured += 1;
      } else {
        acc.noProbe += 1;
      }
      return acc;
    },
    { configured: 0, up: 0, down: 0, unconfigured: 0, noProbe: 0 },
  );

  const coverageRisks = (providerRegistry?.coverage || []).flatMap((entry) =>
    entry.capabilities
      .filter((cell) => cell.risk === "missing" || cell.risk === "single-source")
      .map((cell) => ({ type: entry.type, ...cell })),
  );

  const mappingAuditSummary = (providerMappingAudit?.probes || []).reduce(
    (acc, probe) => {
      acc[probe.status] += 1;
      return acc;
    },
    { ok: 0, partial: 0, empty: 0, blocked: 0, error: 0 },
  );
  const filteredMappingProbes = (providerMappingAudit?.probes || []).filter(
    (probe) => mappingAuditFilter === "all" || probe.status === mappingAuditFilter,
  );
  const mappingStatusRank: Record<MappingProbeStatus, number> = {
    error: 5,
    blocked: 4,
    empty: 3,
    partial: 2,
    ok: 1,
  };
  const sortedMappingProbes = [...filteredMappingProbes].sort((a, b) => {
    const rankDiff = mappingStatusRank[b.status] - mappingStatusRank[a.status];
    if (rankDiff !== 0) return rankDiff;
    return a.label.localeCompare(b.label, undefined, { numeric: true });
  });

  const searchTerm = providerSearch.trim().toLowerCase();
  const filteredProviders = providersWithRuntime.filter((provider) => {
    if (
      searchTerm &&
      !`${provider.label} ${provider.id}`.toLowerCase().includes(searchTerm)
    ) {
      return false;
    }
    if (
      providerTypeFilter !== "all" &&
      !provider.types.includes(providerTypeFilter)
    ) {
      return false;
    }
    if (providerRuntimeFilter === "all") return true;
    if (providerRuntimeFilter === "no-probe") return !provider.runtime;
    return provider.runtime?.status === providerRuntimeFilter;
  });

  const sortStatusRank = (status?: "up" | "down" | "unconfigured") => {
    if (status === "up") return 3;
    if (status === "down") return 2;
    if (status === "unconfigured") return 1;
    return 0;
  };

  const sortedProviders = [...filteredProviders].sort((a, b) => {
    const direction = providerSortDirection === "asc" ? 1 : -1;

    if (
      providerSortBy === "provider" ||
      providerSortBy === "types" ||
      providerSortBy === "auth" ||
      providerSortBy === "status"
    ) {
      let left = "";
      let right = "";
      if (providerSortBy === "provider") {
        left = `${a.label} ${a.id}`.toLowerCase();
        right = `${b.label} ${b.id}`.toLowerCase();
      } else if (providerSortBy === "types") {
        left = a.types.join("|");
        right = b.types.join("|");
      } else if (providerSortBy === "auth") {
        left = a.auth.kind;
        right = b.auth.kind;
      } else {
        left = String(sortStatusRank(a.runtime?.status));
        right = String(sortStatusRank(b.runtime?.status));
      }
      const cmp = left.localeCompare(right, undefined, { numeric: true });
      return cmp !== 0
        ? cmp * direction
        : a.label.localeCompare(b.label, undefined, { numeric: true });
    }

    if (providerSortBy === "canonical" || providerSortBy === "config") {
      const left = providerSortBy === "canonical" ? a.canonical : a.configured;
      const right = providerSortBy === "canonical" ? b.canonical : b.configured;
      if (left === right) {
        return a.label.localeCompare(b.label, undefined, { numeric: true });
      }
      return (left ? 1 : -1) * direction;
    }

    const leftHas = a.capabilities.includes(providerSortBy);
    const rightHas = b.capabilities.includes(providerSortBy);
    if (leftHas === rightHas) {
      return a.label.localeCompare(b.label, undefined, { numeric: true });
    }
    return (leftHas ? 1 : -1) * direction;
  });

  const handleProviderSort = (
    key:
      | "provider"
      | "types"
      | "canonical"
      | "auth"
      | "config"
      | "status"
      | ProviderCapability,
  ) => {
    if (providerSortBy === key) {
      setProviderSortDirection((prev) => (prev === "asc" ? "desc" : "asc"));
      return;
    }
    setProviderSortBy(key);
    setProviderSortDirection("asc");
  };

  const SortIndicator = ({
    sortKey,
  }: {
    sortKey:
      | "provider"
      | "types"
      | "canonical"
      | "auth"
      | "config"
      | "status"
      | ProviderCapability;
  }) => {
    if (providerSortBy !== sortKey) {
      return <ChevronDown className="size-3.5 opacity-30" />;
    }
    return providerSortDirection === "asc" ? (
      <ChevronUp className="size-3.5 text-primary" />
    ) : (
      <ChevronDown className="size-3.5 text-primary" />
    );
  };

  return (
    <div className="flex flex-col min-h-screen bg-background text-foreground pb-24 md:pb-12">
      <Header>
        <div className="flex gap-2">
          <Button
            id="btn-refresh-status"
            variant="outline"
            size="sm"
            onClick={() => {
              refetch();
              refetchProviders();
              refetchMappingAudit();
            }}
            disabled={isLoading || isFetching}
            className="flex items-center gap-1.5"
          >
            <RefreshCw
              className={`size-4 ${isFetching ? "animate-spin" : ""}`}
            />
            <span>{t("admin.status.refresh")}</span>
          </Button>
        </div>
      </Header>

      <div className="max-w-7xl w-full mx-auto p-4 md:p-6 space-y-6">
        {/* Navigation & Header Info */}
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <div className="flex items-center gap-2 text-muted-foreground text-sm mb-1">
              <Link
                href="/shelves"
                className="hover:text-foreground flex items-center gap-1"
              >
                <ArrowLeft className="size-3.5" />
                {t("admin.status.backToShelves")}
              </Link>
            </div>
            <h1 className="text-3xl font-bold tracking-tight">
              {t("navigation.admin") || "Administration"}
            </h1>
            <p className="text-muted-foreground text-sm mt-1">
              {t("admin.status.description")}
            </p>
          </div>
        </div>

        <Tabs defaultValue="providers" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-2 max-w-[620px]">
            <TabsTrigger value="providers" className="flex items-center gap-2">
              <Database className="size-4" />
              {locale === "fr" ? "Providers" : "Providers"}
            </TabsTrigger>
            <TabsTrigger value="playground" className="flex items-center gap-2">
              <FlaskConical className="size-4" />
              {locale === "fr" ? "Teardown" : "Teardown"}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="playground" className="space-y-6 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-[360px_1fr] gap-6">
              <Card className="border bg-card/60 backdrop-blur-sm shadow-md h-fit">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <Cpu className="size-5 text-primary" />
                    {locale === "fr" ? "Teardown fiche" : "Product teardown"}
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <form
                    onSubmit={handleRunProductTeardown}
                    className="space-y-4"
                  >
                    <div className="space-y-2">
                      <Label htmlFor="teardown-barcode">
                        {locale === "fr" ? "Code-barres" : "Barcode"}
                      </Label>
                      <Input
                        id="teardown-barcode"
                        value={teardownBarcode}
                        onChange={(e) => setTeardownBarcode(e.target.value)}
                        placeholder="5021290082728"
                        className="bg-background text-foreground"
                      />
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="teardown-name">
                        {locale === "fr"
                          ? "Nom connu ou suspect"
                          : "Known or suspected name"}
                      </Label>
                      <Input
                        id="teardown-name"
                        value={teardownName}
                        onChange={(e) => setTeardownName(e.target.value)}
                        placeholder="Wheelman PS3 PAL"
                        className="bg-background text-foreground"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-1 gap-4">
                      <div className="space-y-2">
                        <Label htmlFor="teardown-type">
                          {locale === "fr" ? "Type" : "Type"}
                        </Label>
                        <Select
                          value={teardownType}
                          onValueChange={setTeardownType}
                        >
                          <SelectTrigger
                            id="teardown-type"
                            className="bg-background text-foreground w-full"
                          >
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="auto">
                              {locale === "fr" ? "Auto" : "Auto"}
                            </SelectItem>
                            <SelectItem value="books">
                              {t("shelf.type.books")}
                            </SelectItem>
                            <SelectItem value="games">
                              {t("shelf.type.games")}
                            </SelectItem>
                            <SelectItem value="movies">
                              {t("shelf.type.movies")}
                            </SelectItem>
                            <SelectItem value="musics">
                              {t("shelf.type.musics")}
                            </SelectItem>
                            <SelectItem value="boardgames">
                              {t("shelf.type.boardgames")}
                            </SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-2">
                        <Label htmlFor="teardown-platform">
                          {locale === "fr" ? "Plateforme" : "Platform"}
                        </Label>
                        <Input
                          id="teardown-platform"
                          value={teardownPlatform}
                          onChange={(e) => setTeardownPlatform(e.target.value)}
                          placeholder="PS3, Wii, Switch, PC..."
                          className="bg-background text-foreground"
                        />
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Label htmlFor="teardown-providers">
                        {locale === "fr" ? "Providers cibles" : "Target providers"}
                      </Label>
                      <Textarea
                        id="teardown-providers"
                        value={teardownProviders}
                        onChange={(e) => setTeardownProviders(e.target.value)}
                        placeholder={
                          locale === "fr"
                            ? "all (defaut) ou ex: IGDB, ScreenScraper, TMDB"
                            : "all (default) or e.g. IGDB, ScreenScraper, TMDB"
                        }
                        className="min-h-20 font-mono text-xs"
                      />
                      <p className="text-xs text-muted-foreground">
                        {locale === "fr"
                          ? "Laisse `all` pour tout lancer. Sinon liste comma/ligne par provider."
                          : "Leave `all` to run everything. Otherwise list providers comma/newline separated."}
                      </p>
                    </div>

                    <Button
                      type="submit"
                      disabled={isRunningTeardown}
                      className="w-full flex items-center justify-center gap-2"
                    >
                      {isRunningTeardown ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {locale === "fr" ? "Analyse..." : "Analyzing..."}
                        </>
                      ) : (
                        <>
                          <Play className="size-4" />
                          {locale === "fr"
                            ? "Lancer le teardown"
                            : "Run teardown"}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              <Card className="border bg-card/60 backdrop-blur-sm shadow-md min-h-[520px]">
                <CardHeader className="border-b">
                  <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                    <div>
                      <CardTitle className="text-lg font-semibold">
                        {locale === "fr" ? "Diagnostic" : "Diagnostic"}
                      </CardTitle>
                      <CardDescription>
                        {teardownResult
                          ? teardownResult.selectedName || "-"
                          : locale === "fr"
                            ? "Aucun teardown lancé"
                            : "No teardown run yet"}
                      </CardDescription>
                    </div>
                    {teardownResult && (
                      <Badge variant="outline" className="w-fit">
                        {Math.round(teardownResult.globalConfidence * 100)}%
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="p-6">
                  {isRunningTeardown && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                      <Loader2 className="size-8 text-primary animate-spin mb-4" />
                      <p className="text-sm text-muted-foreground">
                        {locale === "fr"
                          ? "Les providers sont interrogés en parallèle."
                          : "Providers are being queried in parallel."}
                      </p>
                    </div>
                  )}

                  {!isRunningTeardown && teardownError && (
                    <div className="rounded-lg border border-destructive/25 bg-destructive/10 p-4 text-sm text-destructive">
                      {teardownError}
                    </div>
                  )}

                  {!isRunningTeardown && !teardownResult && !teardownError && (
                    <div className="flex min-h-[360px] flex-col items-center justify-center text-center">
                      <Terminal className="size-12 text-muted-foreground/30 mb-4" />
                      <p className="text-sm text-muted-foreground">
                        {locale === "fr" ? "Aucun diagnostic" : "No diagnostic"}
                      </p>
                    </div>
                  )}

                  {!isRunningTeardown && teardownResult && (
                    <div className="space-y-6">
                      <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                        <div className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {locale === "fr" ? "Nom retenu" : "Selected name"}
                          </div>
                          <div className="font-semibold truncate">
                            {teardownResult.selectedName || "-"}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {locale === "fr" ? "Type" : "Type"}
                          </div>
                          <div className="font-mono">
                            {teardownResult.input.type}
                            {teardownResult.input.type === "auto" &&
                            teardownResult.inferredType
                              ? ` -> ${teardownResult.inferredType}`
                              : ""}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {locale === "fr" ? "Providers OK" : "Provider hits"}
                          </div>
                          <div className="font-semibold">
                            {
                              teardownResult.providers.filter(
                                (provider) => provider.status === "hit",
                              ).length
                            }
                            /{teardownResult.providers.length}
                          </div>
                        </div>
                        <div className="rounded-lg border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {locale === "fr"
                              ? "Champs couverts"
                              : "Covered fields"}
                          </div>
                          <div className="font-semibold">
                            {teardownResult.coverage.length}
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-3">
                          <h3 className="text-sm font-semibold">
                            {locale === "fr"
                              ? "Confiance globale"
                              : "Global confidence"}
                          </h3>
                          <span className="text-xs font-mono text-muted-foreground">
                            {teardownResult.globalConfidence.toFixed(2)}
                          </span>
                        </div>
                        <div className="h-2 rounded-full bg-muted overflow-hidden">
                          <div
                            className="h-full bg-primary"
                            style={{
                              width: `${Math.round(
                                teardownResult.globalConfidence * 100,
                              )}%`,
                            }}
                          />
                        </div>
                      </div>

                      {teardownResult.gaps.length > 0 && (
                        <div className="rounded-lg border border-amber-500/25 bg-amber-500/10 p-4">
                          <div className="flex items-center gap-2 font-semibold text-amber-700 dark:text-amber-300 mb-2">
                            <AlertTriangle className="size-4" />
                            {locale === "fr"
                              ? "Points fragiles"
                              : "Weak points"}
                          </div>
                          <div className="flex flex-wrap gap-2">
                            {teardownResult.gaps.map((gap) => (
                              <Badge
                                key={gap}
                                variant="outline"
                                className="border-amber-500/25 text-amber-700 dark:text-amber-300"
                              >
                                {gap}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}

                      <div className="space-y-3">
                        <h3 className="text-sm font-semibold">
                          {locale === "fr" ? "Parser de nom" : "Name parser"}
                        </h3>
                        <div className="space-y-3">
                          {teardownResult.parser.map((parsed, index) => (
                            <div
                              key={`${parsed.rawName}-${index}`}
                              className="rounded-lg border bg-background/60 p-3 space-y-2"
                            >
                              <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-medium truncate">
                                    {parsed.cleanName}
                                  </div>
                                  <div className="text-xs font-mono text-muted-foreground truncate">
                                    {parsed.rawName}
                                  </div>
                                </div>
                                {parsed.platformKey && (
                                  <Badge variant="secondary">
                                    {parsed.platformKey}
                                  </Badge>
                                )}
                              </div>
                              <div className="flex flex-wrap gap-2">
                                {parsed.blocks.map((block, blockIndex) => (
                                  <span
                                    key={`${block.text}-${blockIndex}`}
                                    title={block.reason}
                                    className={`inline-flex items-center gap-1 rounded-md border px-2 py-1 text-xs font-semibold ${teardownBlockClass(
                                      block.kind,
                                    )}`}
                                  >
                                    <span className="uppercase text-[10px] opacity-70">
                                      {block.kind}
                                    </span>
                                    {block.text}
                                  </span>
                                ))}
                              </div>
                            </div>
                          ))}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">
                            {locale === "fr" ? "Providers" : "Providers"}
                          </h3>
                          <div className="space-y-2 max-h-[520px] overflow-y-auto pr-1">
                            {teardownResult.providers.map((provider) => (
                              <div
                                key={`${provider.phase}-${provider.provider}`}
                                className="rounded-lg border bg-background/60 p-3 space-y-2"
                              >
                                <div className="flex items-center justify-between gap-2">
                                  <div className="min-w-0">
                                    <div className="font-semibold truncate">
                                      {provider.provider}
                                    </div>
                                    <div className="text-xs text-muted-foreground">
                                      {provider.phase} · {provider.durationMs}{" "}
                                      ms
                                    </div>
                                  </div>
                                  <Badge
                                    variant="outline"
                                    className={teardownStatusClass(
                                      provider.status,
                                    )}
                                  >
                                    {provider.status}
                                  </Badge>
                                </div>
                                {provider.error && (
                                  <div className="text-xs text-destructive">
                                    {provider.error}
                                  </div>
                                )}
                                {provider.products.length > 0 && (
                                  <div className="space-y-1">
                                    {provider.products
                                      .slice(0, 3)
                                      .map((product) => (
                                        <div
                                          key={product.name}
                                          className="flex items-center gap-2 text-xs"
                                        >
                                          {product.coverUrl && (
                                            <Image
                                              src={product.coverUrl}
                                              alt={product.name}
                                              width={40}
                                              height={52}
                                              className="size-8 rounded border object-cover bg-muted"
                                            />
                                          )}
                                          <span className="truncate">
                                            {product.name}
                                          </span>
                                        </div>
                                      ))}
                                  </div>
                                )}
                                {provider.coverSelection?.candidates?.length ? (
                                  <div className="space-y-2 rounded-md border border-dashed bg-muted/25 p-2">
                                    <div className="flex items-center justify-between text-[11px]">
                                      <span className="font-semibold text-muted-foreground">
                                        {locale === "fr"
                                          ? "Score cover (objectif)"
                                          : "Objective cover score"}
                                      </span>
                                      <span className="font-mono text-muted-foreground">
                                        {provider.coverSelection.selectedUrl
                                          ? (locale === "fr"
                                              ? "cover retenue"
                                              : "selected cover")
                                          : "-"}
                                      </span>
                                    </div>
                                    <div className="space-y-1.5">
                                      {provider.coverSelection.candidates
                                        .slice(0, 4)
                                        .map((candidate, candidateIndex) => (
                                          <div
                                            key={`${candidate.url}-${candidateIndex}`}
                                            className="rounded border bg-background/70 p-1.5"
                                          >
                                            <div className="flex items-center justify-between gap-2">
                                              <div className="flex min-w-0 items-center gap-2">
                                                <span className="inline-flex h-5 w-5 shrink-0 items-center justify-center rounded-full border text-[10px] font-mono">
                                                  {candidateIndex + 1}
                                                </span>
                                                <span className="font-mono text-[10px] uppercase text-muted-foreground">
                                                  {candidate.type}
                                                </span>
                                                {candidate.source && (
                                                  <span className="truncate text-[10px] text-muted-foreground">
                                                    {candidate.source}
                                                  </span>
                                                )}
                                              </div>
                                              <div className="flex items-center gap-1.5">
                                                <span className="font-mono text-xs font-semibold">
                                                  {candidate.score}
                                                </span>
                                                {candidate.selected && (
                                                  <Badge
                                                    variant="outline"
                                                    className="h-5 px-1.5 text-[10px]"
                                                  >
                                                    {locale === "fr"
                                                      ? "retenue"
                                                      : "selected"}
                                                  </Badge>
                                                )}
                                              </div>
                                            </div>
                                            <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                                              {candidate.url && (
                                                <Image
                                                  src={candidate.url}
                                                  alt={`candidate-${candidateIndex + 1}`}
                                                  width={26}
                                                  height={34}
                                                  className="h-7 w-5 rounded border object-cover bg-muted"
                                                />
                                              )}
                                              <span className="truncate">
                                                {candidate.role || "-"}
                                                {candidate.width && candidate.height
                                                  ? ` • ${candidate.width}x${candidate.height}`
                                                  : ""}
                                                {candidate.format
                                                  ? ` • ${candidate.format}`
                                                  : ""}
                                              </span>
                                            </div>
                                            {candidate.signals.length > 0 && (
                                              <div className="mt-1 truncate text-[10px] text-muted-foreground">
                                                {candidate.signals
                                                  .slice(0, 3)
                                                  .join(" • ")}
                                              </div>
                                            )}
                                          </div>
                                        ))}
                                    </div>
                                  </div>
                                ) : null}
                                {provider.fields.length > 0 && (
                                  <div className="flex flex-wrap gap-1.5">
                                    {provider.fields
                                      .slice(0, 8)
                                      .map((field) => (
                                        <Badge
                                          key={`${field.field}-${field.value}`}
                                          variant="secondary"
                                          className="max-w-full whitespace-normal"
                                        >
                                          {field.field}: {field.value}
                                        </Badge>
                                      ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>

                        <div className="space-y-3">
                          <h3 className="text-sm font-semibold">
                            {locale === "fr"
                              ? "Couverture des champs"
                              : "Field coverage"}
                          </h3>
                          <div className="rounded-lg border overflow-hidden">
                            <div className="max-h-[520px] overflow-auto">
                              <table className="w-full text-xs">
                                <thead className="sticky top-0 bg-muted text-muted-foreground">
                                  <tr>
                                    <th className="text-left p-2">
                                      {locale === "fr" ? "Champ" : "Field"}
                                    </th>
                                    <th className="text-left p-2">
                                      {locale === "fr" ? "Sources" : "Sources"}
                                    </th>
                                    <th className="text-left p-2">
                                      {locale === "fr" ? "Valeurs" : "Values"}
                                    </th>
                                  </tr>
                                </thead>
                                <tbody>
                                  {teardownResult.coverage.map((field) => (
                                    <tr
                                      key={field.field}
                                      className="border-t align-top"
                                    >
                                      <td className="p-2 font-mono">
                                        {field.field}
                                      </td>
                                      <td className="p-2">
                                        <div className="flex flex-wrap gap-1">
                                          {field.providers.map((provider) => (
                                            <Badge
                                              key={provider}
                                              variant="outline"
                                            >
                                              {provider}
                                            </Badge>
                                          ))}
                                        </div>
                                      </td>
                                      <td className="p-2 text-muted-foreground">
                                        {field.values.join(" | ")}
                                      </td>
                                    </tr>
                                  ))}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="space-y-2 pt-2 border-t">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          JSON
                        </span>
                        <pre className="p-4 rounded-lg bg-black/90 text-green-400 font-mono text-[11px] overflow-x-auto whitespace-pre max-h-[260px] border">
                          {JSON.stringify(teardownResult, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="providers" className="space-y-6 outline-none">
            {isLoadingProviders ? (
              <div className="grid gap-4">
                {Array.from({ length: 4 }).map((_, i) => (
                  <Skeleton key={i} className="h-24 rounded-xl" />
                ))}
              </div>
            ) : (
              <>
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                  <div>
                    <h2 className="text-xl font-semibold tracking-tight">
                      {locale === "fr"
                        ? "Registre des providers"
                        : "Providers registry"}
                    </h2>
                    <p className="text-sm text-muted-foreground">
                      {locale === "fr"
                        ? "Source unique des rôles, couverture et état runtime."
                        : "Single source of truth for roles, coverage and runtime state."}
                    </p>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => {
                      refetch();
                      refetchProviders();
                      refetchMappingAudit();
                    }}
                    disabled={isFetchingProviders}
                    className="w-full sm:w-auto"
                  >
                    <RefreshCw
                      className={`size-4 ${isFetchingProviders ? "animate-spin" : ""}`}
                    />
                    {t("admin.status.refresh")}
                  </Button>
                </div>

                <div className="rounded-lg border bg-card/40 px-3 py-2">
                  <button
                    type="button"
                    onClick={() => setShowProviderRuntime((prev) => !prev)}
                    className="w-full flex items-center justify-between text-sm font-medium"
                  >
                    <span className="flex items-center gap-2">
                      <Activity className="size-4 text-primary" />
                      {locale === "fr"
                        ? "Santé système et APIs"
                        : "System & APIs health"}
                    </span>
                    {showProviderRuntime ? (
                      <ChevronUp className="size-4 text-muted-foreground" />
                    ) : (
                      <ChevronDown className="size-4 text-muted-foreground" />
                    )}
                  </button>
                </div>

                {showProviderRuntime && (isLoading ? (
                  <div className="grid gap-6">
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      {Array.from({ length: 3 }).map((_, i) => (
                        <Skeleton key={i} className="h-28 rounded-xl" />
                      ))}
                    </div>
                    <Skeleton className="h-6 w-48" />
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {Array.from({ length: 6 }).map((_, i) => (
                        <Skeleton key={i} className="h-44 rounded-xl" />
                      ))}
                    </div>
                  </div>
                ) : (
                  <>
                    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                      <Card className="relative overflow-hidden border bg-card/60 backdrop-blur-sm shadow-md">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                          <Activity className="size-16" />
                        </div>
                        <CardHeader className="pb-2">
                          <CardDescription className="text-xs font-medium uppercase tracking-wider">
                            {t("admin.status.overallStatus")}
                          </CardDescription>
                          <CardTitle className="text-2xl font-bold flex items-center gap-2">
                            {t("admin.status.apisHealthy", {
                              healthy: healthyCount,
                              total: totalCount,
                            })}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <div className="w-full bg-secondary h-2 rounded-full overflow-hidden mt-1">
                            <div
                              className={`h-full transition-all duration-500 ${
                                healthyCount === totalCount
                                  ? "bg-emerald-500"
                                  : healthyCount > totalCount / 2
                                    ? "bg-amber-500"
                                    : "bg-destructive"
                              }`}
                              style={{
                                width: `${(healthyCount / (totalCount || 1)) * 100}%`,
                              }}
                            />
                          </div>
                        </CardContent>
                      </Card>

                      <Card className="relative overflow-hidden border bg-card/60 backdrop-blur-sm shadow-md">
                        <div className="absolute top-0 right-0 p-3 opacity-10">
                          <Database className="size-16" />
                        </div>
                        <CardHeader className="pb-2">
                          <CardDescription className="text-xs font-medium uppercase tracking-wider">
                            {t("admin.status.servicesConfigured")}
                          </CardDescription>
                          <CardTitle className="text-2xl font-bold">
                            {apis?.filter((a) => a.configured).length || 0} /{" "}
                            {totalCount}
                          </CardTitle>
                        </CardHeader>
                        <CardContent>
                          <p className="text-xs text-muted-foreground">
                            {t("admin.status.servicesConfiguredDesc")}
                          </p>
                        </CardContent>
                      </Card>
                    </div>

                    <div className="space-y-4">
                      <div className="flex items-center gap-2 border-b pb-2">
                        <Database className="size-5 text-primary" />
                        <h3 className="text-lg font-semibold tracking-tight">
                          {t("admin.status.metadataApis")}
                        </h3>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                        {metadataApis.map((api) => (
                          <Card
                            key={api.name}
                            className={`relative overflow-hidden border transition-all duration-300 ${
                              api.status === "down"
                                ? "border-destructive/30 bg-destructive/5"
                                : api.status === "unconfigured"
                                  ? "border-muted/30 opacity-70 bg-card/30"
                                  : "border-border bg-card/40 hover:border-border/80"
                            }`}
                          >
                            <CardHeader className="pb-3 flex flex-row items-center justify-between space-y-0">
                              <div className="space-y-0.5">
                                <CardTitle className="text-base font-semibold flex items-center gap-2">
                                  {api.name}
                                  {dashboardUrls[api.name] && (
                                    <a
                                      href={dashboardUrls[api.name]}
                                      target="_blank"
                                      rel="noopener noreferrer"
                                      className="text-muted-foreground hover:text-foreground transition-colors"
                                      title="Open Dashboard"
                                    >
                                      <ExternalLink className="size-3.5" />
                                    </a>
                                  )}
                                </CardTitle>
                                <CardDescription className="text-xs">
                                  {api.configured ? (
                                    <span className="text-emerald-500 font-medium flex items-center gap-1">
                                      <Key className="size-3" />
                                      {t("admin.status.configured")}
                                    </span>
                                  ) : (
                                    <span className="text-muted-foreground flex items-center gap-1">
                                      <Key className="size-3" />
                                      {t("admin.status.notConfigured")}
                                    </span>
                                  )}
                                </CardDescription>
                              </div>

                              <div>
                                {api.status === "up" && (
                                  <Badge
                                    variant="secondary"
                                    className="bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/10 border-emerald-500/20 font-medium flex items-center gap-1"
                                  >
                                    <span className="relative flex h-2 w-2">
                                      <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                                      <span className="relative inline-flex rounded-full h-2 w-2 bg-emerald-500"></span>
                                    </span>
                                    {t("admin.status.up")}
                                  </Badge>
                                )}
                                {api.status === "down" && (
                                  <Badge
                                    variant="destructive"
                                    className="font-medium flex items-center gap-1"
                                  >
                                    <XCircle className="size-3.5" />
                                    {t("admin.status.down")}
                                  </Badge>
                                )}
                                {api.status === "unconfigured" && (
                                  <Badge
                                    variant="outline"
                                    className="text-muted-foreground font-medium flex items-center gap-1"
                                  >
                                    <AlertTriangle className="size-3.5 text-muted-foreground" />
                                    {t("admin.status.unconfigured")}
                                  </Badge>
                                )}
                              </div>
                            </CardHeader>

                            <CardContent className="space-y-2">
                              {api.latency !== null && (
                                <div className="flex items-center justify-between text-xs text-muted-foreground">
                                  <span>{t("admin.status.latency")}</span>
                                  <span>{api.latency} ms</span>
                                </div>
                              )}

                              {api.error && (
                                <div className="border-t pt-2 mt-2">
                                  <button
                                    id={`btn-toggle-error-${api.name.replace(/\s+/g, "-").toLowerCase()}`}
                                    onClick={() => toggleError(api.name)}
                                    className="w-full flex items-center justify-between text-xs font-semibold text-destructive/80 hover:text-destructive transition-colors"
                                  >
                                    <span className="flex items-center gap-1">
                                      <AlertTriangle className="size-3.5" />
                                      {t("admin.status.error")}
                                    </span>
                                    {expandedErrors[api.name] ? (
                                      <ChevronUp className="size-3.5" />
                                    ) : (
                                      <ChevronDown className="size-3.5" />
                                    )}
                                  </button>
                                  {expandedErrors[api.name] && (
                                    <pre className="mt-2 p-2 rounded bg-black/80 dark:bg-black/50 text-[10px] font-mono text-red-400 overflow-x-auto whitespace-pre-wrap max-h-24">
                                      {api.error}
                                    </pre>
                                  )}
                                </div>
                              )}
                            </CardContent>
                          </Card>
                        ))}
                      </div>
                    </div>
                  </>
                ))}

                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs uppercase tracking-wider">
                        {locale === "fr" ? "Providers" : "Providers"}
                      </CardDescription>
                      <CardTitle className="text-2xl">
                        {providersWithRuntime.length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs uppercase tracking-wider">
                        {locale === "fr" ? "Configurés" : "Configured"}
                      </CardDescription>
                      <CardTitle className="text-2xl">
                        {providerHealthSummary.configured} /{" "}
                        {providersWithRuntime.length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs uppercase tracking-wider">
                        {locale === "fr" ? "Runtime UP" : "Runtime UP"}
                      </CardDescription>
                      <CardTitle className="text-2xl">
                        {providerHealthSummary.up}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs uppercase tracking-wider">
                        {locale === "fr"
                          ? "Risques actifs"
                          : "Active risks"}
                      </CardDescription>
                      <CardTitle className="text-2xl">
                        {coverageRisks.length}
                      </CardTitle>
                    </CardHeader>
                  </Card>
                </div>

                <Card className="border bg-card/60 shadow-md">
                  <CardHeader>
                    <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
                      <div>
                        <CardTitle className="text-lg">
                          {locale === "fr"
                            ? "Audit mapping providers (informatif)"
                            : "Provider mapping audit (informative)"}
                        </CardTitle>
                        <CardDescription>
                          {locale === "fr"
                            ? "Détecte les retours vides / partiels sur des requêtes exemples. Aucun blocage automatique."
                            : "Highlights empty/partial probe results on sample queries. Never blocks builds."}
                        </CardDescription>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => refetchMappingAudit()}
                        disabled={isFetchingMappingAudit}
                        className="w-full md:w-auto"
                      >
                        <RefreshCw
                          className={`size-4 ${isFetchingMappingAudit ? "animate-spin" : ""}`}
                        />
                        {locale === "fr" ? "Relancer audit" : "Rerun audit"}
                      </Button>
                    </div>
                    <div className="flex flex-wrap gap-2 pt-1 text-xs">
                      <Badge variant="outline" className="border-emerald-500/30 text-emerald-700">
                        OK: {mappingAuditSummary.ok}
                      </Badge>
                      <Badge variant="outline" className="border-amber-500/30 text-amber-700">
                        {locale === "fr" ? "Partiel" : "Partial"}: {mappingAuditSummary.partial}
                      </Badge>
                      <Badge variant="outline" className="border-zinc-500/30 text-zinc-700">
                        {locale === "fr" ? "Vide" : "Empty"}: {mappingAuditSummary.empty}
                      </Badge>
                      <Badge variant="outline" className="border-sky-500/30 text-sky-700">
                        {locale === "fr" ? "Bloqué" : "Blocked"}: {mappingAuditSummary.blocked}
                      </Badge>
                      <Badge variant="outline" className="border-rose-500/30 text-rose-700">
                        {locale === "fr" ? "Erreurs" : "Errors"}: {mappingAuditSummary.error}
                      </Badge>
                      {providerMappingAudit?.generatedAt && (
                        <span className="text-muted-foreground self-center">
                          {locale === "fr" ? "Dernier audit" : "Last audit"}:{" "}
                          {formatAdminDate(providerMappingAudit.generatedAt)}
                        </span>
                      )}
                    </div>
                    <div className="pt-1">
                      <Select
                        value={mappingAuditFilter}
                        onValueChange={(value) =>
                          setMappingAuditFilter(value as "all" | MappingProbeStatus)
                        }
                      >
                        <SelectTrigger className="w-full md:w-[220px] h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {locale === "fr" ? "Tous les statuts" : "All statuses"}
                          </SelectItem>
                          <SelectItem value="ok">ok</SelectItem>
                          <SelectItem value="partial">partial</SelectItem>
                          <SelectItem value="empty">empty</SelectItem>
                          <SelectItem value="blocked">blocked</SelectItem>
                          <SelectItem value="error">error</SelectItem>
                        </SelectContent>
                      </Select>
                    </div>
                  </CardHeader>
                  <CardContent>
                    {isFetchingMappingAudit ? (
                      <Skeleton className="h-28 rounded-lg" />
                    ) : !providerMappingAudit ? (
                      <div className="rounded-lg border border-dashed p-6 text-center text-sm text-muted-foreground">
                        {locale === "fr"
                          ? "Aucun audit lancé. Cliquez sur « Relancer audit » pour interroger les providers."
                          : "No audit run yet. Click “Rerun audit” to probe providers."}
                      </div>
                    ) : (
                      <div className="overflow-x-auto rounded-lg border">
                        <table className="w-full min-w-[1140px] text-xs border-collapse">
                          <thead>
                            <tr className="border-b bg-background text-left text-muted-foreground">
                              <th className="px-3 py-2">{locale === "fr" ? "Provider" : "Provider"}</th>
                              <th className="px-3 py-2">{locale === "fr" ? "Statut" : "Status"}</th>
                              <th className="px-3 py-2">{locale === "fr" ? "Exemple" : "Example"}</th>
                              <th className="px-3 py-2">{locale === "fr" ? "Input probe" : "Probe input"}</th>
                              <th className="px-3 py-2">{locale === "fr" ? "Champs mappés" : "Mapped fields"}</th>
                              <th className="px-3 py-2">
                                {locale === "fr" ? "Champs inutilisés" : "Unused fields"}
                              </th>
                              <th className="px-3 py-2">attachments</th>
                              <th className="px-3 py-2">facts</th>
                              <th className="px-3 py-2">{locale === "fr" ? "Info" : "Details"}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {sortedMappingProbes.map((probe) => (
                              <tr key={probe.providerId} className="border-b align-top">
                                <td className="px-3 py-2">
                                  <div className="font-medium">{probe.label}</div>
                                  <div className="font-mono text-[11px] text-muted-foreground">
                                    {probe.providerId}
                                  </div>
                                </td>
                                <td className="px-3 py-2">
                                  <Badge
                                    variant="outline"
                                    className={
                                      probe.status === "ok"
                                        ? "border-emerald-500/30 text-emerald-700"
                                        : probe.status === "partial"
                                          ? "border-amber-500/30 text-amber-700"
                                          : probe.status === "empty"
                                            ? "border-zinc-500/30 text-zinc-700"
                                            : probe.status === "blocked"
                                              ? "border-sky-500/30 text-sky-700"
                                              : "border-rose-500/30 text-rose-700"
                                    }
                                  >
                                    {probe.status}
                                  </Badge>
                                </td>
                                <td className="px-3 py-2">{probe.example || "-"}</td>
                                <td className="px-3 py-2 font-mono">{probe.sampleInput}</td>
                                <td className="px-3 py-2 font-mono text-[11px] leading-relaxed break-words max-w-md">
                                  {probe.mappedKeys.length > 0
                                    ? probe.mappedKeys.join(", ")
                                    : "-"}
                                </td>
                                <td className="px-3 py-2 font-mono text-[11px] leading-relaxed break-words max-w-md">
                                  {probe.unusedKeys.length > 0
                                    ? probe.unusedKeys.join(", ")
                                    : "-"}
                                </td>
                                <td className="px-3 py-2">{probe.attachmentsCount}</td>
                                <td className="px-3 py-2">{probe.factsCount}</td>
                                <td className="px-3 py-2 text-muted-foreground">
                                  {probe.reason || "-"}
                                </td>
                              </tr>
                            ))}
                            {filteredMappingProbes.length === 0 && (
                              <tr>
                                <td
                                  colSpan={9}
                                  className="px-3 py-8 text-center text-muted-foreground"
                                >
                                  {locale === "fr"
                                    ? "Aucun provider ne correspond au filtre."
                                    : "No provider matches the filter."}
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    )}
                  </CardContent>
                </Card>

                <Card className="border bg-card/60 shadow-md">
                  <CardContent className="pt-6">
                    <div className="grid grid-cols-1 lg:grid-cols-[1fr_180px_180px_auto] gap-3">
                      <Input
                        value={providerSearch}
                        onChange={(e) => setProviderSearch(e.target.value)}
                        placeholder={
                          locale === "fr"
                            ? "Rechercher un provider (nom ou id)"
                            : "Search provider (name or id)"
                        }
                      />
                      <Select
                        value={providerTypeFilter}
                        onValueChange={(value) =>
                          setProviderTypeFilter(value as "all" | ProviderType)
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {locale === "fr" ? "Tous les types" : "All types"}
                          </SelectItem>
                          {providerTypesOrder.map((type) => (
                            <SelectItem key={type} value={type}>
                              {typeLabel(type)}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <Select
                        value={providerRuntimeFilter}
                        onValueChange={(value) =>
                          setProviderRuntimeFilter(
                            value as
                              | "all"
                              | "up"
                              | "down"
                              | "unconfigured"
                              | "no-probe",
                          )
                        }
                      >
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="all">
                            {locale === "fr" ? "Tous statuts" : "All status"}
                          </SelectItem>
                          <SelectItem value="up">UP</SelectItem>
                          <SelectItem value="down">DOWN</SelectItem>
                          <SelectItem value="unconfigured">
                            {locale === "fr" ? "Non configuré" : "Unconfigured"}
                          </SelectItem>
                          <SelectItem value="no-probe">
                            {locale === "fr" ? "Sans probe" : "No probe"}
                          </SelectItem>
                        </SelectContent>
                      </Select>
                      <Button
                        variant="ghost"
                        onClick={() => {
                          setProviderSearch("");
                          setProviderTypeFilter("all");
                          setProviderRuntimeFilter("all");
                        }}
                      >
                        {locale === "fr" ? "Réinitialiser" : "Reset"}
                      </Button>
                    </div>
                  </CardContent>
                </Card>

                <Card className="border bg-card/60 shadow-md">
                  <CardHeader>
                    <CardTitle className="text-lg">
                      {locale === "fr"
                        ? "Matrice des rôles par provider"
                        : "Role matrix by provider"}
                    </CardTitle>
                    <CardDescription>
                      {locale === "fr"
                        ? "Check = donnée fournie, croix = non fournie."
                        : "Check means capability is provided; cross means missing."}
                    </CardDescription>
                    <div className="text-xs text-muted-foreground">
                      {locale === "fr"
                        ? `${filteredProviders.length} provider(s) affiché(s)`
                        : `${filteredProviders.length} provider(s) shown`}
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-3">
                    <div className="flex flex-wrap items-center gap-2 text-xs">
                      <span className="inline-flex items-center gap-1 rounded-full border border-emerald-500/25 bg-emerald-500/10 px-2 py-1 text-emerald-700 dark:text-emerald-300">
                        <CheckCircle2 className="size-3.5" />
                        {locale === "fr" ? "Feature fournie" : "Feature provided"}
                      </span>
                      <span className="inline-flex items-center gap-1 rounded-full border border-rose-500/25 bg-rose-500/10 px-2 py-1 text-rose-700 dark:text-rose-300">
                        <XCircle className="size-3.5" />
                        {locale === "fr" ? "Feature absente" : "Feature missing"}
                      </span>
                    </div>
                    <div className="overflow-x-auto rounded-lg border">
                      <table className="w-full min-w-[1680px] text-sm border-collapse">
                        <thead>
                          <tr className="bg-muted/60 text-[11px] uppercase tracking-wider text-muted-foreground border-b">
                            <th
                              colSpan={3}
                              className="px-3 py-2 text-left font-semibold"
                            >
                              {locale === "fr"
                                ? "Informations provider"
                                : "Provider information"}
                            </th>
                            <th
                              colSpan={matrixCapabilities.length}
                              className="px-3 py-2 text-center font-semibold"
                            >
                              {locale === "fr" ? "Fonctionnalités" : "Capabilities"}
                            </th>
                          </tr>
                          <tr className="border-b bg-background text-left text-xs text-muted-foreground">
                            <th className="sticky left-0 z-20 bg-background px-3 py-2 min-w-[240px]">
                              <button
                                type="button"
                                onClick={() => handleProviderSort("provider")}
                                className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                              >
                                {locale === "fr" ? "Provider" : "Provider"}
                                <SortIndicator sortKey="provider" />
                              </button>
                            </th>
                            <th className="sticky left-[240px] z-20 bg-background px-3 py-2 min-w-[180px]">
                              <button
                                type="button"
                                onClick={() => handleProviderSort("types")}
                                className="inline-flex items-center gap-1 font-semibold hover:text-foreground"
                              >
                                {locale === "fr" ? "Types" : "Types"}
                                <SortIndicator sortKey="types" />
                              </button>
                            </th>
                            <th className="px-3 py-2 min-w-[130px] text-center">
                              <button
                                type="button"
                                onClick={() => handleProviderSort("canonical")}
                                className="mx-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                              >
                                {locale === "fr" ? "Nom canonique" : "Canonical name"}
                                <SortIndicator sortKey="canonical" />
                              </button>
                            </th>
                            {matrixCapabilities.map((capability) => (
                              <th
                                key={capability}
                                className="px-2 py-2 min-w-[118px] text-center"
                              >
                                <button
                                  type="button"
                                  onClick={() => handleProviderSort(capability)}
                                  className="mx-auto inline-flex items-center gap-1 font-semibold hover:text-foreground"
                                >
                                  {capabilityLabel(capability)}
                                  <SortIndicator sortKey={capability} />
                                </button>
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sortedProviders.map((provider, rowIndex) => {
                            const stickyRowBg =
                              rowIndex % 2 === 0 ? "bg-background" : "bg-muted";
                            const providerWebsite =
                              providerWebsiteUrls[provider.id] || dashboardUrls[provider.label];
                            return (
                            <tr
                              key={provider.id}
                              className="border-b align-top odd:bg-background even:bg-muted hover:bg-primary/5 transition-colors"
                            >
                              <td
                                className={`sticky left-0 z-10 px-3 py-3 ${stickyRowBg}`}
                              >
                                <div className="space-y-1">
                                  <div className="font-semibold flex items-center gap-2">
                                    {providerWebsite ? (
                                      <a
                                        href={providerWebsite}
                                        target="_blank"
                                        rel="noopener noreferrer"
                                        className="inline-flex items-center gap-1 hover:text-primary transition-colors"
                                        title={locale === "fr" ? "Ouvrir le site du provider" : "Open provider website"}
                                      >
                                        <span>{provider.label}</span>
                                        <ExternalLink className="size-3.5" />
                                      </a>
                                    ) : (
                                      <span>{provider.label}</span>
                                    )}
                                    {provider.canonical && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] border-emerald-500/30 text-emerald-700 dark:text-emerald-300"
                                      >
                                        {locale === "fr" ? "Canonique" : "Canonical"}
                                      </Badge>
                                    )}
                                  </div>
                                  <div className="font-mono text-xs text-muted-foreground">
                                    {provider.id}
                                  </div>
                                  {provider.notes && (
                                    <div className="text-xs text-muted-foreground max-w-[280px]">
                                      {provider.notes}
                                    </div>
                                  )}
                                </div>
                              </td>
                              <td
                                className={`sticky left-[240px] z-10 px-3 py-3 ${stickyRowBg}`}
                              >
                                <div className="flex flex-wrap gap-1">
                                  {providerTypesOrder
                                    .filter((type) => provider.types.includes(type))
                                    .map((type) => (
                                      <Badge key={type} variant="outline">
                                        {typeLabel(type)}
                                      </Badge>
                                    ))}
                                </div>
                              </td>
                              <td className="px-3 py-3 text-center align-middle">
                                <span
                                  className={`mx-auto inline-grid size-8 place-items-center rounded-full border leading-none ${
                                    provider.canonical
                                      ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                                      : "border-rose-500/25 bg-rose-500/10 text-rose-500"
                                  }`}
                                >
                                  {provider.canonical ? (
                                    <CheckCircle2 className="size-4 shrink-0" />
                                  ) : (
                                    <XCircle className="size-4 shrink-0" />
                                  )}
                                </span>
                              </td>
                              {matrixCapabilities.map((capability) => {
                                const hasCapability =
                                  provider.capabilities.includes(capability);
                                return (
                                  <td
                                    key={capability}
                                    className="px-2 py-3 text-center align-middle"
                                  >
                                    <span
                                      title={`${provider.label} · ${capabilityLabel(capability)}: ${
                                        hasCapability
                                          ? locale === "fr"
                                            ? "oui"
                                            : "yes"
                                          : locale === "fr"
                                            ? "non"
                                            : "no"
                                      }`}
                                      className={`mx-auto inline-grid size-8 place-items-center rounded-full border leading-none ${
                                        hasCapability
                                          ? "border-emerald-500/25 bg-emerald-500/10 text-emerald-600"
                                          : "border-rose-500/25 bg-rose-500/10 text-rose-500"
                                      }`}
                                    >
                                      {hasCapability ? (
                                        <CheckCircle2 className="size-4 shrink-0" />
                                      ) : (
                                        <XCircle className="size-4 shrink-0" />
                                      )}
                                    </span>
                                  </td>
                                );
                              })}
                            </tr>
                          );
                          })}
                          {sortedProviders.length === 0 && (
                            <tr>
                              <td
                                colSpan={3 + matrixCapabilities.length}
                                className="py-8 text-center text-sm text-muted-foreground"
                              >
                                {locale === "fr"
                                  ? "Aucun provider ne correspond aux filtres."
                                  : "No provider matches the current filters."}
                              </td>
                            </tr>
                          )}
                        </tbody>
                      </table>
                    </div>
                  </CardContent>
                </Card>

                <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader>
                      <CardTitle className="text-lg">
                        {locale === "fr"
                          ? "Risques de couverture"
                          : "Coverage risks"}
                      </CardTitle>
                      <CardDescription>
                        {locale === "fr"
                          ? "Trou = aucune source active. Single-source = une seule source active pour cette capacité."
                          : "Missing means no active source. Single-source means only one active source for this capability."}
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      {coverageRisks.length === 0 ? (
                        <div className="text-sm text-muted-foreground">
                          {locale === "fr"
                            ? "Aucun risque détecté."
                            : "No coverage risks detected."}
                        </div>
                      ) : (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b text-muted-foreground text-left">
                                <th className="py-2 pr-3">
                                  {locale === "fr" ? "Type" : "Type"}
                                </th>
                                <th className="py-2 pr-3">
                                  {locale === "fr" ? "Capacite" : "Capability"}
                                </th>
                                <th className="py-2 pr-3">
                                  {locale === "fr" ? "Providers" : "Providers"}
                                </th>
                                <th className="py-2 pr-3">
                                  {locale === "fr" ? "Configurés" : "Configured"}
                                </th>
                                <th className="py-2">
                                  {locale === "fr" ? "Risque" : "Risk"}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {coverageRisks.map((risk) => (
                                <tr
                                  key={`${risk.type}-${risk.capability}`}
                                  className="border-b"
                                >
                                  <td className="py-2 pr-3">
                                    {typeLabel(risk.type)}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {capabilityLabel(risk.capability)}
                                  </td>
                                  <td className="py-2 pr-3 font-mono">
                                    {risk.providers.join(", ") || "-"}
                                  </td>
                                  <td className="py-2 pr-3">
                                    {risk.configuredCount}
                                  </td>
                                  <td className="py-2">
                                    {risk.risk === "missing" ? (
                                      <Badge variant="destructive">
                                        {locale === "fr" ? "Trou" : "Missing"}
                                      </Badge>
                                    ) : (
                                      <Badge className="bg-amber-500/10 text-amber-600 border-amber-500/20">
                                        {locale === "fr"
                                          ? "Single-source"
                                          : "Single-source"}
                                      </Badge>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </CardContent>
                  </Card>

                  <Card className="border bg-card/60 shadow-md">
                    <CardHeader>
                      <div className="flex items-center justify-between gap-3">
                        <CardTitle className="text-lg">
                          {locale === "fr"
                            ? "Vue couverture par type"
                            : "Coverage by media type"}
                        </CardTitle>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowCoverageByType((prev) => !prev)}
                        >
                          {showCoverageByType ? (
                            <ChevronUp className="size-4" />
                          ) : (
                            <ChevronDown className="size-4" />
                          )}
                        </Button>
                      </div>
                    </CardHeader>
                    {showCoverageByType && (
                      <CardContent className="space-y-4">
                        {(providerRegistry?.coverage || []).map((entry) => (
                          <div key={entry.type} className="rounded-lg border p-3">
                            <div className="font-semibold mb-2">
                              {typeLabel(entry.type)}
                            </div>
                            <div className="flex flex-wrap gap-1.5">
                              {entry.capabilities.map((cell) => (
                                <Badge
                                  key={`${entry.type}-${cell.capability}`}
                                  variant="outline"
                                  className={
                                    cell.risk === "missing"
                                      ? "border-destructive/30 text-destructive"
                                      : cell.risk === "single-source"
                                        ? "border-amber-500/30 text-amber-600"
                                        : cell.risk === "n/a"
                                          ? "text-muted-foreground"
                                          : ""
                                  }
                                >
                                  {capabilityLabel(cell.capability)} (
                                  {cell.risk === "n/a"
                                    ? locale === "fr"
                                      ? "n/a"
                                      : "n/a"
                                    : `${cell.configuredCount}/${cell.providers.length}`}
                                  )
                                </Badge>
                              ))}
                            </div>
                          </div>
                        ))}
                      </CardContent>
                    )}
                  </Card>
                </div>
              </>
            )}
          </TabsContent>

        </Tabs>
      </div>
    </div>
  );
}

export default function AdminDashboardPage() {
  const { t } = useLocale();

  return (
    <Suspense
      fallback={
        <div className="flex flex-col h-screen bg-background text-foreground items-center justify-center p-4">
          <Activity className="size-10 text-primary animate-pulse mb-4" />
          <p className="text-muted-foreground text-sm">{t("common.loading")}</p>
        </div>
      }
    >
      <AdminDashboardComponent />
    </Suspense>
  );
}
