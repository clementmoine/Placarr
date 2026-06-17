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
import { Switch } from "@/components/ui/switch";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import {
  Activity,
  ArrowLeft,
  Coins,
  Database,
  Key,
  RefreshCw,
  AlertTriangle,
  Barcode,
  CheckCircle2,
  XCircle,
  ChevronDown,
  ChevronUp,
  Cpu,
  ExternalLink,
  Settings,
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
  type: "serp" | "metadata";
  configured: boolean;
  status: "up" | "down" | "unconfigured";
  latency: number | null;
  error: string | null;
  credits: { remaining: number; limit: number } | null;
}

interface UnresolvedBarcodeScan {
  id: number;
  barcode: string;
  shelfType: string;
  reason: string;
  status: string;
  seenCount: number;
  providers: string[];
  rawNames: string[];
  rawPayload: Array<{
    providerName: string;
    name: string;
    isAlias?: boolean;
    region?: string | null;
  }>;
  firstSeenAt: string;
  lastSeenAt: string;
}

interface BarcodeRegressionCase {
  id: string;
  label: string;
  barcode: string;
  type?: string;
  expected: Record<string, unknown>;
}

interface BarcodeRegressionResult {
  case: BarcodeRegressionCase;
  passed: boolean;
  status: number;
  durationMs: number;
  received: {
    cleanName: string;
    platformKey: string | null;
    shelfType: string | null;
    provider: string | null;
    matchesCount: number;
    topConfidence: number | null;
    suggestions: string[];
  };
  assertions: Array<{
    label: string;
    expected: unknown;
    received: unknown;
    passed: boolean;
  }>;
  error?: string;
}

interface BarcodeRegressionReport {
  passed: boolean;
  passedCount: number;
  failedCount: number;
  totalCount: number;
  durationMs: number;
  refresh: boolean;
  results: BarcodeRegressionResult[];
}

const dashboardUrls: Record<string, string> = {
  "DuckDuckGo Scraper (Omkar)": "https://omkar.cloud/",
  "Value Serp": "https://app.valueserp.com/",
  "Scale Serp": "https://app.scaleserp.com/",
  "Serp Wow": "https://app.serpwow.com/",
  "Serp API": "https://serpapi.com/dashboard",
  AvesAPI: "https://app.avesapi.com/",
  DataForSEO: "https://client.dataforseo.com/",
  Deezer: "https://developers.deezer.com/",
  "Open Library": "https://openlibrary.org/",
  BoardGameGeek: "https://boardgamegeek.com/",
  "Chasse aux Livres": "https://www.chasse-aux-livres.fr/",
  TMDB: "https://www.themoviedb.org/settings/api",
  RAWG: "https://rawg.io/apikeys",
  ScreenScraper: "https://www.screenscraper.fr/",
  IGDB: "https://dev.twitch.tv/console/apps",
};

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

  const { data: settings, refetch: refetchSettings } = useQuery<{
    onlyFreeProviders: boolean;
  }>({
    queryKey: ["adminSettings"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/settings");
      return res.data;
    },
    enabled: status === "authenticated" && session?.user?.role === "admin",
    refetchOnWindowFocus: false,
  });

  const {
    data: unresolvedBarcodeData,
    isLoading: isLoadingUnresolvedBarcodes,
    isFetching: isFetchingUnresolvedBarcodes,
    refetch: refetchUnresolvedBarcodes,
  } = useQuery<{ scans: UnresolvedBarcodeScan[] }>({
    queryKey: ["adminUnresolvedBarcodes"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/unresolved-barcodes");
      return res.data;
    },
    enabled: status === "authenticated" && session?.user?.role === "admin",
    refetchOnWindowFocus: false,
  });

  const {
    data: barcodeRegressionCasesData,
    isLoading: isLoadingBarcodeRegressionCases,
  } = useQuery<{ cases: BarcodeRegressionCase[] }>({
    queryKey: ["adminBarcodeRegressionCases"],
    queryFn: async () => {
      const res = await axios.get("/api/admin/barcode-regression");
      return res.data;
    },
    enabled: status === "authenticated" && session?.user?.role === "admin",
    refetchOnWindowFocus: false,
  });

  const [isUpdatingSettings, setIsUpdatingSettings] = useState(false);

  const [testProvider, setTestProvider] = useState("omkarddg-barcode");
  const [testQuery, setTestQuery] = useState("");
  const [testType, setTestType] = useState("games");
  const [isTestingProvider, setIsTestingProvider] = useState(false);
  const [testResult, setTestResult] = useState<any>(null);
  const [testError, setTestError] = useState<string | null>(null);
  const [testResponseTime, setTestResponseTime] = useState<number | null>(null);
  const [replayingBarcodeId, setReplayingBarcodeId] = useState<number | null>(
    null,
  );
  const [barcodeReplayResults, setBarcodeReplayResults] = useState<
    Record<number, any>
  >({});
  const [isRunningBarcodeRegression, setIsRunningBarcodeRegression] =
    useState(false);
  const [barcodeRegressionReport, setBarcodeRegressionReport] =
    useState<BarcodeRegressionReport | null>(null);
  const [barcodeRegressionError, setBarcodeRegressionError] = useState<
    string | null
  >(null);
  const [customBarcodeBatch, setCustomBarcodeBatch] = useState("");
  const [customBarcodeBatchType, setCustomBarcodeBatchType] =
    useState("games");

  const formatAdminDate = (value: string) => {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return value;

    return new Intl.DateTimeFormat(locale === "fr" ? "fr-FR" : "en-US", {
      dateStyle: "short",
      timeStyle: "short",
    }).format(date);
  };

  useEffect(() => {
    if (
      settings?.onlyFreeProviders &&
      [
        "omkarddg-barcode",
        "valueserp-barcode",
        "scaleserp-barcode",
        "serpwow-barcode",
        "serpapi-barcode",
        "avesapi-barcode",
        "dataforseo-barcode",
      ].includes(testProvider)
    ) {
      setTestProvider("chasseauxlivres-barcode");
    }
  }, [settings?.onlyFreeProviders, testProvider]);

  const handleRunProviderTest = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!testQuery.trim()) {
      toast.error(
        t("admin.status.enterQueryError") || "Please enter a query or barcode",
      );
      return;
    }
    setIsTestingProvider(true);
    setTestResult(null);
    setTestError(null);
    setTestResponseTime(null);
    const start = Date.now();
    try {
      const res = await axios.post("/api/admin/test-provider", {
        provider: testProvider,
        query: testQuery,
        type: testType,
      });
      setTestResponseTime(Date.now() - start);
      if (res.data.success) {
        setTestResult(res.data);
      } else {
        setTestError(
          res.data.error ||
            t("common.somethingWentWrong") ||
            "An error occurred",
        );
      }
    } catch (err: any) {
      setTestResponseTime(Date.now() - start);
      const msg =
        err.response?.data?.error ||
        err.message ||
        t("common.somethingWentWrong") ||
        "Request failed";
      setTestError(msg);
      console.error(err);
    } finally {
      setIsTestingProvider(false);
    }
  };

  const handleToggleOnlyFreeProviders = async (checked: boolean) => {
    setIsUpdatingSettings(true);
    try {
      await axios.post("/api/admin/settings", {
        onlyFreeProviders: checked,
      });
      await refetchSettings();
      toast.success(t("admin.status.settingsUpdated") || "Settings updated");
    } catch (e) {
      console.error(e);
      toast.error(
        t("common.somethingWentWrong") || "Failed to update settings",
      );
    } finally {
      setIsUpdatingSettings(false);
    }
  };

  const handleReplayUnresolvedBarcode = async (
    scan: UnresolvedBarcodeScan,
  ) => {
    setReplayingBarcodeId(scan.id);
    try {
      const params: Record<string, string> = {
        q: scan.barcode,
        refresh: "1",
      };
      if (scan.shelfType && scan.shelfType !== "unknown") {
        params.type = scan.shelfType;
      }

      const res = await axios.get("/api/barcode", { params });
      setBarcodeReplayResults((prev) => ({
        ...prev,
        [scan.id]: res.data,
      }));

      if (res.data?.matches?.length > 0) {
        toast.success(t("admin.status.unresolvedReplayResolved"));
      } else {
        toast(t("admin.status.unresolvedReplayStillOpen"));
      }
      await refetchUnresolvedBarcodes();
    } catch (err: any) {
      console.error(err);
      toast.error(
        err.response?.data?.error ||
          t("common.somethingWentWrong") ||
          "Request failed",
      );
    } finally {
      setReplayingBarcodeId(null);
    }
  };

  const runBarcodeRegression = async (payload: Record<string, unknown>) => {
    setIsRunningBarcodeRegression(true);
    setBarcodeRegressionError(null);
    try {
      const res = await axios.post("/api/admin/barcode-regression", payload);
      setBarcodeRegressionReport(res.data);
      if (res.data.passed) {
        toast.success(t("admin.status.barcodeRegressionPassed"));
      } else {
        toast.error(
          t("admin.status.barcodeRegressionFailed", {
            count: res.data.failedCount,
          }),
        );
      }
    } catch (err: any) {
      console.error(err);
      const message =
        err.response?.data?.error ||
        err.message ||
        t("common.somethingWentWrong") ||
        "Request failed";
      setBarcodeRegressionError(message);
      toast.error(message);
    } finally {
      setIsRunningBarcodeRegression(false);
    }
  };

  const handleRunDefaultBarcodeRegression = () => {
    runBarcodeRegression({
      cases: barcodeRegressionCasesData?.cases || undefined,
      refresh: true,
      concurrency: 3,
    });
  };

  const handleRunCustomBarcodeBatch = () => {
    const barcodes = customBarcodeBatch
      .split(/[\s,;]+/)
      .map((value) => value.replace(/[^\d]/g, "").trim())
      .filter(Boolean);

    if (barcodes.length === 0) {
      toast.error(t("admin.status.batchBarcodeEmpty"));
      return;
    }

    runBarcodeRegression({
      barcodes,
      type: customBarcodeBatchType,
      refresh: true,
      concurrency: 3,
    });
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

  const serpApis = apis?.filter((a) => a.type === "serp") || [];
  const metadataApis = apis?.filter((a) => a.type === "metadata") || [];

  const healthyCount = apis?.filter((a) => a.status === "up").length || 0;
  const totalCount = apis?.length || 0;

  // Calculate total remaining credits across SERPs
  const totalRemainingCredits = serpApis.reduce((sum, api) => {
    return sum + (api.credits?.remaining || 0);
  }, 0);

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
              refetchSettings();
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

        <Tabs defaultValue="settings" className="w-full space-y-6">
          <TabsList className="grid w-full grid-cols-5 max-w-[900px]">
            <TabsTrigger value="settings" className="flex items-center gap-2">
              <Settings className="size-4" />
              {t("admin.status.settings")}
            </TabsTrigger>
            <TabsTrigger
              value="unresolved-barcodes"
              className="flex items-center gap-2"
            >
              <Barcode className="size-4" />
              {t("admin.status.unresolvedBarcodes")}
            </TabsTrigger>
            <TabsTrigger
              value="barcode-tests"
              className="flex items-center gap-2"
            >
              <CheckCircle2 className="size-4" />
              {t("admin.status.barcodeTests")}
            </TabsTrigger>
            <TabsTrigger value="status" className="flex items-center gap-2">
              <Activity className="size-4" />
              {t("admin.status.title")}
            </TabsTrigger>
            <TabsTrigger value="playground" className="flex items-center gap-2">
              <FlaskConical className="size-4" />
              {t("admin.status.playground")}
            </TabsTrigger>
          </TabsList>

          <TabsContent value="settings" className="space-y-6 outline-none">
            {/* Scraper / Search Settings */}
            <div className="space-y-4">
              <div className="flex items-center gap-2 border-b pb-2">
                <Database className="size-5 text-primary" />
                <h2 className="text-xl font-semibold tracking-tight">
                  {t("admin.status.scraperSettings")}
                </h2>
              </div>
              <Card className="border bg-card/60 backdrop-blur-sm shadow-md">
                <CardHeader className="pb-3">
                  <CardTitle className="text-base font-semibold">
                    {t("admin.status.freeUseMode")}
                  </CardTitle>
                  <CardDescription>
                    {t("admin.status.freeUseModeDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="flex items-center justify-between gap-6">
                    <div className="space-y-0.5">
                      <span className="text-sm font-medium">
                        {t("admin.status.freeUseMode")}
                      </span>
                      <p className="text-xs text-muted-foreground">
                        {(settings?.onlyFreeProviders ?? true)
                          ? t("admin.status.freeUseModeEnabled")
                          : t("admin.status.freeUseModeDisabled")}
                      </p>
                    </div>
                    <Switch
                      checked={settings?.onlyFreeProviders ?? true}
                      onCheckedChange={handleToggleOnlyFreeProviders}
                      disabled={isUpdatingSettings}
                    />
                  </div>
                  {!(settings?.onlyFreeProviders ?? true) && (
                    <div className="rounded-lg bg-amber-500/10 p-3 text-xs text-amber-500 border border-amber-500/20 flex items-start gap-2 animate-in fade-in slide-in-from-top-1 duration-200">
                      <span className="font-semibold select-none">⚠️</span>
                      <p>{t("admin.status.freeUseModeWarn")}</p>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent
            value="unresolved-barcodes"
            className="space-y-6 outline-none"
          >
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <Barcode className="size-5 text-primary" />
                  <h2 className="text-xl font-semibold tracking-tight">
                    {t("admin.status.unresolvedBarcodesTitle")}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground">
                  {t("admin.status.unresolvedBarcodesDesc")}
                </p>
              </div>
              <Button
                variant="outline"
                size="sm"
                onClick={() => refetchUnresolvedBarcodes()}
                disabled={isFetchingUnresolvedBarcodes}
                className="w-full sm:w-auto"
              >
                <RefreshCw
                  className={`size-4 ${
                    isFetchingUnresolvedBarcodes ? "animate-spin" : ""
                  }`}
                />
                {t("admin.status.refreshList")}
              </Button>
            </div>

            {isLoadingUnresolvedBarcodes ? (
              <div className="grid gap-3">
                {Array.from({ length: 4 }).map((_, index) => (
                  <Skeleton key={index} className="h-36 rounded-xl" />
                ))}
              </div>
            ) : (unresolvedBarcodeData?.scans || []).length === 0 ? (
              <Card className="border bg-card/60 shadow-md">
                <CardContent className="py-14 flex flex-col items-center justify-center text-center">
                  <Barcode className="size-12 text-muted-foreground/30 mb-4" />
                  <p className="text-sm text-muted-foreground max-w-md">
                    {t("admin.status.noUnresolvedBarcodes")}
                  </p>
                </CardContent>
              </Card>
            ) : (
              <div className="space-y-3">
                {(unresolvedBarcodeData?.scans || []).map((scan) => {
                  const replayResult = barcodeReplayResults[scan.id];
                  const replayResolved = replayResult?.matches?.length > 0;

                  return (
                    <div
                      key={scan.id}
                      className="rounded-lg border bg-card/60 p-4 shadow-sm space-y-4"
                    >
                      <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
                        <div className="space-y-2 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-mono text-lg font-semibold tracking-tight">
                              {scan.barcode}
                            </span>
                            <Badge variant="outline">
                              {scan.shelfType === "unknown"
                                ? t("admin.status.unknownType")
                                : t(`shelf.type.${scan.shelfType}`)}
                            </Badge>
                            <Badge variant="secondary">
                              {t("admin.status.seenCount", {
                                count: scan.seenCount,
                              })}
                            </Badge>
                          </div>
                          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
                            <span>
                              {t("admin.status.reason")}: {scan.reason}
                            </span>
                            <span>
                              {t("admin.status.lastSeen")}:{" "}
                              {formatAdminDate(scan.lastSeenAt)}
                            </span>
                          </div>
                          {scan.providers.length > 0 && (
                            <div className="flex flex-wrap gap-1.5">
                              {scan.providers.map((provider) => (
                                <Badge
                                  key={provider}
                                  variant="outline"
                                  className="text-[11px]"
                                >
                                  {provider}
                                </Badge>
                              ))}
                            </div>
                          )}
                        </div>

                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => handleReplayUnresolvedBarcode(scan)}
                          disabled={replayingBarcodeId === scan.id}
                          className="w-full sm:w-auto"
                        >
                          {replayingBarcodeId === scan.id ? (
                            <Loader2 className="size-4 animate-spin" />
                          ) : (
                            <RefreshCw className="size-4" />
                          )}
                          {t("admin.status.replayWithoutCache")}
                        </Button>
                      </div>

                      {scan.rawNames.length > 0 && (
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.rawNamesSeen")}
                          </span>
                          <div className="flex flex-wrap gap-2">
                            {scan.rawNames.slice(0, 10).map((name) => (
                              <span
                                key={name}
                                className="max-w-full rounded-md border bg-background px-2.5 py-1 text-xs font-mono text-muted-foreground break-words"
                              >
                                {name}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {replayResult && (
                        <div
                          className={`rounded-md border p-3 text-sm ${
                            replayResolved
                              ? "border-emerald-500/20 bg-emerald-500/10"
                              : "border-amber-500/20 bg-amber-500/10"
                          }`}
                        >
                          <div className="font-semibold mb-1">
                            {replayResolved
                              ? t("admin.status.replayResolved")
                              : t("admin.status.replayStillUnresolved")}
                          </div>
                          {replayResolved ? (
                            <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs">
                              <span>
                                {t("admin.status.cleanName")}:{" "}
                                <strong>{replayResult.cleanName}</strong>
                              </span>
                              <span>
                                {t("admin.status.resolvedProvider")}:{" "}
                                {replayResult.provider}
                              </span>
                            </div>
                          ) : (
                            <p className="text-xs text-muted-foreground">
                              {t("admin.status.replayStillUnresolvedDesc")}
                            </p>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </TabsContent>

          <TabsContent value="barcode-tests" className="space-y-6 outline-none">
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 className="size-5 text-primary" />
                  <h2 className="text-xl font-semibold tracking-tight">
                    {t("admin.status.barcodeTestsTitle")}
                  </h2>
                </div>
                <p className="text-sm text-muted-foreground max-w-3xl">
                  {t("admin.status.barcodeTestsDesc")}
                </p>
              </div>
              <Button
                onClick={handleRunDefaultBarcodeRegression}
                disabled={
                  isRunningBarcodeRegression ||
                  isLoadingBarcodeRegressionCases
                }
                className="w-full lg:w-auto"
              >
                {isRunningBarcodeRegression ? (
                  <Loader2 className="size-4 animate-spin" />
                ) : (
                  <Play className="size-4" />
                )}
                {t("admin.status.runRegressionSuite")}
              </Button>
            </div>

            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
              <Card className="border bg-card/60 shadow-md xl:col-span-1 h-fit">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("admin.status.defaultRegressionCases")}
                  </CardTitle>
                  <CardDescription>
                    {t("admin.status.defaultRegressionCasesDesc", {
                      count: barcodeRegressionCasesData?.cases?.length || 0,
                    })}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-3">
                  {isLoadingBarcodeRegressionCases ? (
                    <div className="space-y-2">
                      {Array.from({ length: 5 }).map((_, index) => (
                        <Skeleton key={index} className="h-12 rounded-lg" />
                      ))}
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[420px] overflow-y-auto pr-1">
                      {(barcodeRegressionCasesData?.cases || []).map(
                        (testCase) => (
                          <div
                            key={testCase.id}
                            className="rounded-md border bg-background/60 p-3"
                          >
                            <div className="font-medium text-sm">
                              {testCase.label}
                            </div>
                            <div className="font-mono text-xs text-muted-foreground mt-1">
                              {testCase.barcode}
                            </div>
                          </div>
                        ),
                      )}
                    </div>
                  )}
                </CardContent>
              </Card>

              <Card className="border bg-card/60 shadow-md xl:col-span-2">
                <CardHeader>
                  <CardTitle className="text-lg">
                    {t("admin.status.customBarcodeBatch")}
                  </CardTitle>
                  <CardDescription>
                    {t("admin.status.customBarcodeBatchDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div className="grid grid-cols-1 md:grid-cols-[1fr_180px] gap-3">
                    <div className="space-y-2">
                      <Label htmlFor="barcode-batch-input">
                        {t("admin.status.batchBarcodes")}
                      </Label>
                      <Textarea
                        id="barcode-batch-input"
                        value={customBarcodeBatch}
                        onChange={(event) =>
                          setCustomBarcodeBatch(event.target.value)
                        }
                        placeholder={
                          t("admin.status.batchBarcodesPlaceholder") ||
                          "0045496368104\n3307211503465"
                        }
                        className="min-h-32 font-mono text-sm"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="barcode-batch-type">
                        {t("admin.status.categoryShelfType")}
                      </Label>
                      <Select
                        value={customBarcodeBatchType}
                        onValueChange={setCustomBarcodeBatchType}
                      >
                        <SelectTrigger
                          id="barcode-batch-type"
                          className="bg-background text-foreground w-full"
                        >
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
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
                      <Button
                        variant="outline"
                        onClick={handleRunCustomBarcodeBatch}
                        disabled={isRunningBarcodeRegression}
                        className="w-full mt-4"
                      >
                        {isRunningBarcodeRegression ? (
                          <Loader2 className="size-4 animate-spin" />
                        ) : (
                          <Barcode className="size-4" />
                        )}
                        {t("admin.status.runCustomBatch")}
                      </Button>
                    </div>
                  </div>

                  {barcodeRegressionError && (
                    <div className="rounded-md border border-destructive/20 bg-destructive/10 p-3 text-sm text-destructive">
                      {barcodeRegressionError}
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>

            {barcodeRegressionReport && (
              <div className="space-y-4">
                <div
                  className={`rounded-lg border p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 ${
                    barcodeRegressionReport.passed
                      ? "border-emerald-500/20 bg-emerald-500/10"
                      : "border-destructive/20 bg-destructive/10"
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {barcodeRegressionReport.passed ? (
                      <CheckCircle2 className="size-6 text-emerald-500" />
                    ) : (
                      <XCircle className="size-6 text-destructive" />
                    )}
                    <div>
                      <div className="font-semibold">
                        {barcodeRegressionReport.passed
                          ? t("admin.status.regressionAllPassed")
                          : t("admin.status.regressionSomeFailed")}
                      </div>
                      <div className="text-xs text-muted-foreground">
                        {t("admin.status.regressionSummary", {
                          passed: barcodeRegressionReport.passedCount,
                          total: barcodeRegressionReport.totalCount,
                          duration: barcodeRegressionReport.durationMs,
                        })}
                      </div>
                    </div>
                  </div>
                  <Badge variant="outline">
                    {barcodeRegressionReport.refresh
                      ? t("admin.status.withoutCache")
                      : t("admin.status.withCache")}
                  </Badge>
                </div>

                <div className="space-y-3">
                  {barcodeRegressionReport.results.map((result) => (
                    <div
                      key={result.case.id}
                      className="rounded-lg border bg-card/60 p-4 space-y-4"
                    >
                      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-3">
                        <div className="space-y-1 min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            {result.passed ? (
                              <Badge className="bg-emerald-500/10 text-emerald-600 border-emerald-500/20">
                                <CheckCircle2 className="size-3" />
                                {t("admin.status.passed")}
                              </Badge>
                            ) : (
                              <Badge variant="destructive">
                                <XCircle className="size-3" />
                                {t("admin.status.failed")}
                              </Badge>
                            )}
                            <span className="font-semibold">
                              {result.case.label}
                            </span>
                          </div>
                          <div className="font-mono text-xs text-muted-foreground">
                            {result.case.barcode}
                          </div>
                        </div>
                        <div className="text-xs text-muted-foreground md:text-right">
                          <div>{result.durationMs} ms</div>
                          <div>HTTP {result.status}</div>
                        </div>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
                        <div className="rounded-md border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {t("admin.status.cleanName")}
                          </div>
                          <div className="font-medium">
                            {result.received.cleanName || "-"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            platformKey
                          </div>
                          <div className="font-mono">
                            {result.received.platformKey || "-"}
                          </div>
                        </div>
                        <div className="rounded-md border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {t("admin.status.matches")}
                          </div>
                          <div>{result.received.matchesCount}</div>
                        </div>
                        <div className="rounded-md border bg-background/60 p-3">
                          <div className="text-xs text-muted-foreground">
                            {t("admin.status.confidence")}
                          </div>
                          <div>{result.received.topConfidence ?? "-"}</div>
                        </div>
                      </div>

                      {result.assertions.length > 0 && (
                        <div className="overflow-x-auto">
                          <table className="w-full text-xs border-collapse">
                            <thead>
                              <tr className="border-b text-muted-foreground">
                                <th className="text-left py-2 pr-3">
                                  {t("admin.status.assertion")}
                                </th>
                                <th className="text-left py-2 pr-3">
                                  {t("admin.status.expected")}
                                </th>
                                <th className="text-left py-2 pr-3">
                                  {t("admin.status.received")}
                                </th>
                                <th className="text-left py-2">
                                  {t("admin.status.result")}
                                </th>
                              </tr>
                            </thead>
                            <tbody>
                              {result.assertions.map((assertion, index) => (
                                <tr key={index} className="border-b last:border-0">
                                  <td className="py-2 pr-3 font-medium">
                                    {assertion.label}
                                  </td>
                                  <td className="py-2 pr-3 font-mono">
                                    {String(assertion.expected)}
                                  </td>
                                  <td className="py-2 pr-3 font-mono">
                                    {String(assertion.received)}
                                  </td>
                                  <td className="py-2">
                                    {assertion.passed ? (
                                      <span className="text-emerald-600 font-semibold">
                                        OK
                                      </span>
                                    ) : (
                                      <span className="text-destructive font-semibold">
                                        KO
                                      </span>
                                    )}
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}

                      {result.received.suggestions.length > 0 && (
                        <div className="space-y-2">
                          <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            {t("admin.status.aliasesAndSuggestions")}
                          </div>
                          <div className="flex flex-wrap gap-1.5">
                            {result.received.suggestions.map((suggestion) => (
                              <Badge
                                key={suggestion}
                                variant="outline"
                                className="max-w-full whitespace-normal"
                              >
                                {suggestion}
                              </Badge>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </TabsContent>

          <TabsContent value="status" className="space-y-6 outline-none">
            {isLoading ? (
              <div className="grid gap-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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
                {/* Overview Stats */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Overall score */}
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

                  {/* Total credits */}
                  <Card className="relative overflow-hidden border bg-card/60 backdrop-blur-sm shadow-md">
                    <div className="absolute top-0 right-0 p-3 opacity-10">
                      <Coins className="size-16" />
                    </div>
                    <CardHeader className="pb-2">
                      <CardDescription className="text-xs font-medium uppercase tracking-wider">
                        {t("admin.status.remainingCredits")}
                      </CardDescription>
                      <CardTitle className="text-2xl font-bold">
                        {totalRemainingCredits}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <p className="text-xs text-muted-foreground">
                        {t("admin.status.remainingCreditsDesc")}
                      </p>
                    </CardContent>
                  </Card>

                  {/* Configured APIs */}
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

                {/* SERP APIs (Quota-limited) */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Cpu className="size-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tight">
                      {t("admin.status.serpApis")}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {serpApis.map((api) => {
                      const hasCredits = api.credits !== null;
                      const remaining = api.credits?.remaining || 0;
                      const limit = api.credits?.limit || 0;
                      const hasLimit = hasCredits && limit > 0;
                      const percent = hasLimit
                        ? Math.min(100, Math.max(0, (remaining / limit) * 100))
                        : 100;

                      const isLowCredits = hasLimit && percent < 20;
                      const isMediumCredits =
                        hasLimit && percent >= 20 && percent < 50;

                      return (
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
                          <CardHeader className="pb-3 flex flex-row items-start justify-between space-y-0">
                            <div className="space-y-1">
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

                          <CardContent className="space-y-4">
                            {/* Credits / Limit Progress Bar */}
                            {hasCredits && (
                              <div className="space-y-1.5">
                                <div className="flex items-center justify-between text-xs">
                                  <span className="text-muted-foreground flex items-center gap-1">
                                    <Coins className="size-3" />
                                    {t("admin.status.remainingCredits")}
                                  </span>
                                  <span className="font-semibold">
                                    {hasLimit
                                      ? t("admin.status.queriesRemaining", {
                                          remaining,
                                          limit,
                                        })
                                      : t(
                                          "admin.status.queriesRemainingNoLimit",
                                          {
                                            remaining,
                                          },
                                        )}
                                  </span>
                                </div>
                                {hasLimit && (
                                  <div className="w-full bg-secondary h-2 rounded-full overflow-hidden">
                                    <div
                                      className={`h-full transition-all duration-300 ${
                                        isLowCredits
                                          ? "bg-destructive animate-pulse"
                                          : isMediumCredits
                                            ? "bg-amber-500"
                                            : "bg-emerald-500"
                                      }`}
                                      style={{ width: `${percent}%` }}
                                    />
                                  </div>
                                )}
                              </div>
                            )}

                            {!hasCredits && api.configured && (
                              <p className="text-xs text-muted-foreground italic">
                                {t("admin.status.noQuotaEndpoints")}
                              </p>
                            )}

                            {/* Latency */}
                            {api.latency !== null && (
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t("admin.status.latency")}</span>
                                <span>{api.latency} ms</span>
                              </div>
                            )}

                            {/* Errors */}
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
                      );
                    })}
                  </div>
                </div>

                {/* Metadata & Public APIs */}
                <div className="space-y-4">
                  <div className="flex items-center gap-2 border-b pb-2">
                    <Database className="size-5 text-primary" />
                    <h2 className="text-xl font-semibold tracking-tight">
                      {t("admin.status.metadataApis")}
                    </h2>
                  </div>

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                    {metadataApis.map((api) => {
                      return (
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
                            {/* Latency */}
                            {api.latency !== null && (
                              <div className="flex items-center justify-between text-xs text-muted-foreground">
                                <span>{t("admin.status.latency")}</span>
                                <span>{api.latency} ms</span>
                              </div>
                            )}

                            {/* Errors */}
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
                      );
                    })}
                  </div>
                </div>
              </>
            )}
          </TabsContent>

          <TabsContent value="playground" className="space-y-6 outline-none">
            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Form Card */}
              <Card className="lg:col-span-1 border bg-card/60 backdrop-blur-sm shadow-md h-fit">
                <CardHeader>
                  <CardTitle className="text-lg font-semibold flex items-center gap-2">
                    <FlaskConical className="size-5 text-primary" />
                    {t("admin.status.playgroundTitle")}
                  </CardTitle>
                  <CardDescription>
                    {t("admin.status.playgroundDesc")}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <form onSubmit={handleRunProviderTest} className="space-y-4">
                    <div className="space-y-2">
                      <Label
                        htmlFor="playground-provider"
                        className="text-sm font-medium"
                      >
                        {t("items.editTabs.provider")}
                      </Label>
                      <Select
                        value={testProvider}
                        onValueChange={setTestProvider}
                      >
                        <SelectTrigger
                          id="playground-provider"
                          className="bg-background text-foreground w-full"
                        >
                          <SelectValue
                            placeholder={
                              t("admin.status.selectProvider") ||
                              "Select provider"
                            }
                          />
                        </SelectTrigger>
                        <SelectContent>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 rounded-sm">
                            {t("admin.status.barcodeResolvers")}
                          </div>
                          {!(settings?.onlyFreeProviders ?? true) && (
                            <>
                              <SelectItem value="omkarddg-barcode">
                                DuckDuckGo Scraper (Omkar)
                              </SelectItem>
                              <SelectItem value="valueserp-barcode">
                                Value Serp
                              </SelectItem>
                              <SelectItem value="scaleserp-barcode">
                                Scale Serp
                              </SelectItem>
                              <SelectItem value="serpwow-barcode">
                                Serp Wow
                              </SelectItem>
                              <SelectItem value="serpapi-barcode">
                                Serp API
                              </SelectItem>
                              <SelectItem value="avesapi-barcode">
                                AvesAPI
                              </SelectItem>
                              <SelectItem value="dataforseo-barcode">
                                DataForSEO
                              </SelectItem>
                            </>
                          )}
                          <SelectItem value="chasseauxlivres-barcode">
                            Chasse aux Livres
                          </SelectItem>
                          <SelectItem value="achatmoinscher-barcode">
                            AchatMoinsCher
                          </SelectItem>
                          <SelectItem value="apriloshop-barcode">
                            ApriloShop
                          </SelectItem>
                          <SelectItem value="picclick-barcode">
                            PicClick
                          </SelectItem>
                          <SelectItem value="freakxy-barcode">
                            Freakxy
                          </SelectItem>
                          <SelectItem value="openlibrary-barcode">
                            Open Library
                          </SelectItem>
                          <SelectItem value="deezer-barcode">Deezer</SelectItem>
                          <SelectItem value="screenscraper-barcode">
                            ScreenScraper
                          </SelectItem>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground bg-muted/30 rounded-sm mt-2">
                            {t("admin.status.metadataAndCovers")}
                          </div>
                          <SelectItem value="screenscraper-metadata">
                            ScreenScraper (Games)
                          </SelectItem>
                          <SelectItem value="igdb-metadata">
                            IGDB (Games)
                          </SelectItem>
                          <SelectItem value="steam-metadata">
                            Steam (Games)
                          </SelectItem>
                          <SelectItem value="hltb-metadata">
                            How Long to Beat (Games)
                          </SelectItem>
                          <SelectItem value="rawg-metadata">
                            RAWG (Games Fallback)
                          </SelectItem>
                          <SelectItem value="tmdb-metadata">
                            TMDB (Movies)
                          </SelectItem>
                          <SelectItem value="openlibrary-metadata">
                            Open Library (Books)
                          </SelectItem>
                          <SelectItem value="deezer-metadata">
                            Deezer (Music)
                          </SelectItem>
                          <SelectItem value="bgg-metadata">
                            BoardGameGeek (Boardgames)
                          </SelectItem>
                          <SelectItem value="coverproject-metadata">
                            The Cover Project (Covers)
                          </SelectItem>
                        </SelectContent>
                      </Select>
                    </div>

                    <div className="space-y-2">
                      <Label
                        htmlFor="playground-query"
                        className="text-sm font-medium"
                      >
                        {testProvider.endsWith("-barcode")
                          ? t("admin.status.barcodeLabel")
                          : t("admin.status.searchQueryLabel")}
                      </Label>
                      <Input
                        id="playground-query"
                        placeholder={
                          testProvider.endsWith("-barcode")
                            ? t("admin.status.barcodePlaceholder") ||
                              "e.g. 5021290082728"
                            : t("admin.status.queryPlaceholder") ||
                              "e.g. Zelda Breath of the Wild"
                        }
                        value={testQuery}
                        onChange={(e) => setTestQuery(e.target.value)}
                        className="bg-background text-foreground"
                      />
                    </div>

                    {testProvider.endsWith("-barcode") && (
                      <div className="space-y-2">
                        <Label
                          htmlFor="playground-type"
                          className="text-sm font-medium"
                        >
                          {t("admin.status.categoryShelfType")}
                        </Label>
                        <Select value={testType} onValueChange={setTestType}>
                          <SelectTrigger
                            id="playground-type"
                            className="bg-background text-foreground w-full"
                          >
                            <SelectValue
                              placeholder={
                                t("admin.status.selectType") || "Select type"
                              }
                            />
                          </SelectTrigger>
                          <SelectContent>
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
                    )}

                    <Button
                      id="btn-run-provider-test"
                      type="submit"
                      disabled={isTestingProvider}
                      className="w-full flex items-center justify-center gap-2 mt-4"
                    >
                      {isTestingProvider ? (
                        <>
                          <Loader2 className="size-4 animate-spin" />
                          {t("admin.status.testing")}
                        </>
                      ) : (
                        <>
                          <Play className="size-4" />
                          {t("admin.status.runTestQuery")}
                        </>
                      )}
                    </Button>
                  </form>
                </CardContent>
              </Card>

              {/* Result Card */}
              <Card className="lg:col-span-2 border bg-card/60 backdrop-blur-sm shadow-md flex flex-col min-h-[400px]">
                <CardHeader className="pb-3 border-b">
                  <div className="flex items-center justify-between">
                    <div>
                      <CardTitle className="text-lg font-semibold">
                        {t("admin.status.testResults")}
                      </CardTitle>
                      <CardDescription>
                        {t("admin.status.testResultsDesc")}
                      </CardDescription>
                    </div>
                    {testResponseTime !== null && (
                      <Badge
                        variant="secondary"
                        className="font-semibold text-xs py-1 px-2"
                      >
                        {testResponseTime} ms
                      </Badge>
                    )}
                  </div>
                </CardHeader>
                <CardContent className="flex-1 p-6 flex flex-col justify-start">
                  {isTestingProvider && (
                    <div className="flex-1 flex flex-col items-center justify-center py-12">
                      <Loader2 className="size-8 text-primary animate-spin mb-4" />
                      <p className="text-sm text-muted-foreground font-medium">
                        {t("admin.status.queryingProvider")}
                      </p>
                    </div>
                  )}

                  {!isTestingProvider && !testResult && !testError && (
                    <div className="flex-1 flex flex-col items-center justify-center py-12 text-center">
                      <Terminal className="size-12 text-muted-foreground/30 mb-4" />
                      <p className="text-sm text-muted-foreground max-w-sm">
                        {t("admin.status.playgroundInstruction")}
                      </p>
                    </div>
                  )}

                  {!isTestingProvider && testError && (
                    <div className="flex-1 p-4 rounded-xl border border-destructive/20 bg-destructive/10 text-destructive text-sm flex flex-col gap-2">
                      <div className="font-semibold flex items-center gap-2 text-base">
                        <AlertTriangle className="size-5" />
                        {t("admin.status.testFailed")}
                      </div>
                      <p className="font-mono bg-black/30 p-3 rounded border border-destructive/10 text-xs break-all">
                        {testError}
                      </p>
                    </div>
                  )}

                  {!isTestingProvider && testResult && (
                    <div className="space-y-6 flex-1 flex flex-col">
                      <div className="flex flex-wrap items-center gap-4 justify-between border-b pb-4">
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.resolvedProvider")}
                          </span>
                          <span className="text-base font-semibold">
                            {testResult.provider}
                          </span>
                        </div>
                        <div>
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.query")}
                          </span>
                          <span className="text-sm font-mono bg-muted py-0.5 px-1.5 rounded">
                            {testResult.query}
                          </span>
                        </div>
                      </div>

                      {/* Render custom UI depending on result type */}
                      {testResult.result?.matches &&
                      testResult.result.matches.length > 0 ? (
                        <div className="space-y-4">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.matchesFound", {
                              count: testResult.result.matches.length,
                            })}
                          </span>
                          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            {testResult.result.matches.map(
                              (match: any, index: number) => (
                                <Card
                                  key={index}
                                  className="border bg-background/50 relative overflow-hidden flex flex-row gap-4 p-4 items-center"
                                >
                                  {match.coverUrl && (
                                    <Image
                                      src={match.coverUrl}
                                      alt={match.cleanName}
                                      width={512}
                                      height={512}
                                      className="w-16 h-20 object-contain rounded border bg-muted/20 shadow-sm shrink-0"
                                    />
                                  )}
                                  <div className="space-y-2 flex-1 min-w-0">
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                        {t("admin.status.cleanName")}
                                      </span>
                                      <span
                                        className="text-base font-bold text-primary truncate block"
                                        title={match.cleanName}
                                      >
                                        {match.cleanName}
                                      </span>
                                    </div>
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block">
                                        {t("admin.status.rawName")}
                                      </span>
                                      <span
                                        className="text-xs text-muted-foreground font-mono truncate block"
                                        title={match.rawName}
                                      >
                                        {match.rawName}
                                      </span>
                                    </div>
                                  </div>
                                </Card>
                              ),
                            )}
                          </div>
                        </div>
                      ) : testResult.result?.extractedName ? (
                        <Card className="border bg-background/50">
                          <CardContent className="p-4 space-y-3">
                            <div>
                              <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                                {t("admin.status.extractedTitle")}
                              </span>
                              <span className="text-lg font-bold text-primary">
                                {testResult.result.extractedName}
                              </span>
                            </div>
                            {testResult.result.rawNames &&
                              testResult.result.rawNames.length > 0 && (
                                <div>
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                                    {t("admin.status.rawNamesMatched")}
                                  </span>
                                  <ul className="list-disc pl-5 text-sm text-muted-foreground space-y-1">
                                    {testResult.result.rawNames.map(
                                      (name: string, i: number) => (
                                        <li
                                          key={i}
                                          className="font-mono text-xs"
                                        >
                                          {name}
                                        </li>
                                      ),
                                    )}
                                  </ul>
                                </div>
                              )}
                          </CardContent>
                        </Card>
                      ) : null}

                      {/* Display generated suggestions pills */}
                      {testResult.result?.suggestions &&
                        testResult.result.suggestions.length > 0 && (
                          <div className="space-y-2">
                            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                              {t("admin.status.formSuggestions")}
                            </span>
                            <div className="flex flex-wrap gap-2">
                              {testResult.result.suggestions.map(
                                (sug: string, i: number) => (
                                  <span
                                    key={i}
                                    className="px-2.5 py-1 text-xs rounded-full font-medium border bg-primary/10 border-primary/20 text-primary"
                                  >
                                    {sug}
                                  </span>
                                ),
                              )}
                            </div>
                          </div>
                        )}
                      {testResult.result?.coverUrl && (
                        <div className="space-y-2">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.coverArtFound")}
                          </span>
                          <div className="flex flex-col md:flex-row gap-4 items-start">
                            <Image
                              src={testResult.result.coverUrl}
                              alt="Cover Art Preview"
                              width={512}
                              height={512}
                              className="max-h-64 object-contain rounded-lg border shadow-md bg-muted/20"
                            />
                            <div className="space-y-1 text-xs text-muted-foreground break-all">
                              <span className="font-semibold block text-foreground">
                                URL:
                              </span>
                              <a
                                href={testResult.result.coverUrl}
                                target="_blank"
                                rel="noreferrer"
                                className="text-primary hover:underline font-mono"
                              >
                                {testResult.result.coverUrl}
                              </a>
                            </div>
                          </div>
                        </div>
                      )}

                      {testResult.result?.metadata && (
                        <div className="space-y-4">
                          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                            {t("admin.status.extractedMetadata")}
                          </span>
                          <div className="flex flex-col md:flex-row gap-6">
                            {testResult.result.metadata.imageUrl && (
                              <div className="shrink-0">
                                <Image
                                  src={testResult.result.metadata.imageUrl}
                                  alt="Cover Art"
                                  width={512}
                                  height={512}
                                  className="w-36 h-48 md:w-44 md:h-56 object-cover rounded-lg border shadow-md bg-muted/20"
                                />
                              </div>
                            )}
                            <div className="space-y-3 flex-1">
                              <div>
                                <span className="text-lg font-bold text-foreground block">
                                  {testResult.result.metadata.name}
                                </span>
                                {testResult.result.metadata.releaseDate && (
                                  <span className="text-xs text-muted-foreground">
                                    {t("admin.status.released")}{" "}
                                    {testResult.result.metadata.releaseDate}
                                  </span>
                                )}
                              </div>

                              {testResult.result.metadata.description && (
                                <div>
                                  <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                                    {t("common.description")}
                                  </span>
                                  <p className="text-sm text-muted-foreground leading-relaxed line-clamp-4">
                                    {testResult.result.metadata.description}
                                  </p>
                                </div>
                              )}

                              <div className="grid grid-cols-2 gap-4 text-xs">
                                {testResult.result.metadata.publishers &&
                                  testResult.result.metadata.publishers.length >
                                    0 && (
                                    <div>
                                      <span className="font-semibold text-muted-foreground block">
                                        {t("admin.status.publishersProduction")}
                                      </span>
                                      <span>
                                        {testResult.result.metadata.publishers
                                          .map((p: any) => p.name)
                                          .join(", ")}
                                      </span>
                                    </div>
                                  )}
                                {testResult.result.metadata.directors &&
                                  testResult.result.metadata.directors.length >
                                    0 && (
                                    <div>
                                      <span className="font-semibold text-muted-foreground block">
                                        {t("admin.status.directorsAuthors")}
                                      </span>
                                      <span>
                                        {testResult.result.metadata.directors
                                          .map((d: any) => d.name)
                                          .join(", ")}
                                      </span>
                                    </div>
                                  )}
                              </div>
                            </div>
                          </div>

                          {testResult.result.metadata.attachments &&
                            testResult.result.metadata.attachments.length >
                              0 && (
                              <div className="space-y-2">
                                <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                                  {t("admin.status.attachments")}
                                </span>
                                <div className="flex flex-wrap gap-2">
                                  {testResult.result.metadata.attachments.map(
                                    (att: any, i: number) => (
                                      <Badge
                                        key={i}
                                        variant="outline"
                                        className="flex items-center gap-1.5 py-1 text-xs"
                                      >
                                        <span className="font-semibold capitalize text-primary">
                                          {att.role || att.type}
                                        </span>
                                        <span className="text-muted-foreground font-mono text-[10px] truncate max-w-[200px]">
                                          {att.url}
                                        </span>
                                      </Badge>
                                    ),
                                  )}
                                </div>
                              </div>
                            )}
                        </div>
                      )}

                      {/* Raw JSON viewer */}
                      <div className="space-y-2 pt-4 border-t mt-auto">
                        <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider block">
                          {t("admin.status.rawJsonResponse")}
                        </span>
                        <pre className="p-4 rounded-xl bg-black/90 text-green-400 font-mono text-[11px] overflow-x-auto whitespace-pre max-h-[300px] border">
                          {JSON.stringify(testResult.result, null, 2)}
                        </pre>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
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
