"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Loader2, Play, RefreshCw, ScrollText, Upload } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";

import { WebAdbApkLab } from "@/components/admin/WebAdbApkLab";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import type {
  FoilPackId,
  FoilPackStatus,
} from "@/lib/admin/foilStatusTypes";
import { getBackgroundJobs } from "@/lib/api/backgroundJobs";
import type { FoilExtractTarget } from "@/lib/client/foilExtract";

type FoilLogResponse = {
  pack: FoilExtractTarget;
  exists: boolean;
  size: number;
  mtime: string | null;
  launchedAt: string | null;
  nextOffset: number;
  text: string;
  job: { id: string; status: string; startedAt: string } | null;
  error?: string;
};

function formatWhen(iso: string | null, fr: boolean): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString(fr ? "fr-FR" : "en-GB", {
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function formatMo(bytes: number): string {
  if (bytes <= 0) return "";
  return `${(bytes / (1024 * 1024)).toFixed(0)} Mo`;
}

async function fetchFoilStatus(): Promise<FoilPackStatus[]> {
  const res = await fetch("/api/admin/foil-status");
  const body = (await res.json()) as {
    packs?: FoilPackStatus[];
    error?: string;
  };
  if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
  return body.packs ?? [];
}

function statusLine(
  status: FoilPackStatus | undefined,
  jobRunning: boolean,
  fr: boolean,
): string {
  if (!status) return "…";
  const parts: string[] = [];
  if (status.apk.present) {
    const apkBits = [
      `${status.apk.files.length} APK`,
      formatMo(status.apk.bytes),
    ].filter(Boolean);
    parts.push(apkBits.join(" · "));
  } else {
    parts.push(fr ? "pas d’APK" : "no APK");
  }
  if (!status.extract.present) {
    parts.push(fr ? "pas d’extract" : "no extract");
  } else {
    const extractBits = [
      status.extract.stale ? (fr ? "obsolète" : "stale") : null,
      status.extract.shaders != null ? `${status.extract.shaders} shaders` : null,
      formatWhen(status.extract.newestAt, fr) || null,
    ].filter(Boolean);
    parts.push(extractBits.join(" · ") || "extract");
  }
  if (jobRunning) parts.push(fr ? "en cours" : "running");
  return parts.join(" · ");
}

/**
 * Map a playroom effect-pack id to the admin extract target (same ids today).
 */
export function foilExtractTargetForPack(
  packId: string | null | undefined,
): FoilExtractTarget | null {
  if (packId === "lorcana" || packId === "pokemon") return packId;
  return null;
}

/** Compact APK / Logs / Extract bar for the active playroom pack. */
export function FoilPackSources({
  target,
  locale,
}: {
  target: FoilExtractTarget;
  locale: string;
}) {
  const fr = locale === "fr";
  const queryClient = useQueryClient();
  const apkPack: FoilPackId = target;
  const [enqueueing, setEnqueueing] = useState(false);
  const [apkOpen, setApkOpen] = useState(false);
  const [logsOpen, setLogsOpen] = useState(false);
  const [logText, setLogText] = useState("");
  const [logJobStatus, setLogJobStatus] = useState<string | null>(null);
  const [logLaunchedAt, setLogLaunchedAt] = useState<string | null>(null);
  const [logActivityAt, setLogActivityAt] = useState<string | null>(null);
  const [logLoading, setLogLoading] = useState(false);
  const logPreRef = useRef<HTMLPreElement>(null);
  const logOffsetRef = useRef(0);

  const { data: backgroundJobs } = useQuery({
    queryKey: ["backgroundJobs"],
    queryFn: getBackgroundJobs,
    refetchInterval: 2_000,
    refetchIntervalInBackground: true,
  });

  const jobRunning = (backgroundJobs?.jobs ?? []).some(
    (job) => job.kind === "foilExtract" && job.foilTarget === target,
  );

  const { data: packs = [], refetch: refetchStatus } = useQuery({
    queryKey: ["foilStatus"],
    queryFn: fetchFoilStatus,
    refetchInterval: jobRunning ? 4_000 : 30_000,
    refetchOnWindowFocus: true,
  });

  const status = packs.find((pack) => pack.id === apkPack);
  const canExtract = status?.canExtract ?? true;
  const busy = enqueueing || jobRunning;

  useEffect(() => {
    const el = logPreRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [logText]);

  const openLogs = () => {
    setLogsOpen(true);
    setLogText("");
    logOffsetRef.current = 0;
    setLogJobStatus(null);
    setLogLaunchedAt(null);
    setLogActivityAt(null);
  };

  const pollLogs = useCallback(
    async (reset: boolean) => {
      setLogLoading(true);
      try {
        const after = reset ? 0 : logOffsetRef.current;
        const res = await fetch(
          `/api/admin/foil-logs?pack=${encodeURIComponent(target)}&after=${after}`,
        );
        const body = (await res.json()) as FoilLogResponse;
        if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
        setLogJobStatus(body.job?.status ?? null);
        setLogLaunchedAt(body.launchedAt ?? body.job?.startedAt ?? null);
        setLogActivityAt(body.mtime);
        if (reset) {
          setLogText(body.text || (body.exists ? "" : "—"));
        } else if (body.text) {
          setLogText((prev) => (prev ? `${prev}${body.text}` : body.text));
        }
        logOffsetRef.current = body.nextOffset;
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        setLogText((prev) => `${prev}\n${message}`);
      } finally {
        setLogLoading(false);
      }
    },
    [target],
  );

  useEffect(() => {
    if (!logsOpen) return;
    void pollLogs(true);
    const timer = setInterval(() => {
      void pollLogs(false);
    }, 1_500);
    return () => clearInterval(timer);
  }, [logsOpen, pollLogs]);

  const runExtract = async () => {
    setEnqueueing(true);
    try {
      const { enqueueFoilExtract } = await import("@/lib/client/foilExtract");
      const done = await enqueueFoilExtract(target);
      toast.success(
        done.hint ||
          (fr ? "Extract en file d’attente" : "Extract queued"),
      );
      void queryClient.invalidateQueries({ queryKey: ["backgroundJobs"] });
      openLogs();
      void refetchStatus();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      toast.error(message);
    } finally {
      setEnqueueing(false);
    }
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="min-w-0 text-xs text-muted-foreground">
          {statusLine(status, jobRunning, fr)}
        </p>
        <div className="flex flex-wrap gap-1.5">
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={() => setApkOpen(true)}
          >
            <Upload className="h-3.5 w-3.5" />
            APK
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            onClick={openLogs}
          >
            {jobRunning ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <ScrollText className="h-3.5 w-3.5" />
            )}
            Logs
          </Button>
          <Button
            type="button"
            size="sm"
            className="h-7 gap-1 px-2 text-xs"
            disabled={busy || !canExtract}
            onClick={() => void runExtract()}
          >
            {busy ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Play className="h-3.5 w-3.5" />
            )}
            Extract
          </Button>
        </div>
      </div>

      <Dialog open={logsOpen} onOpenChange={setLogsOpen}>
        <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-2xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              Logs · {target}
              {logJobStatus ? (
                <span className="text-sm font-normal text-muted-foreground">
                  {logJobStatus}
                </span>
              ) : null}
            </DialogTitle>
          </DialogHeader>
          <pre
            ref={logPreRef}
            className="min-h-60 flex-1 overflow-auto rounded-md border border-border/60 bg-muted/30 p-3 font-mono text-[11px] leading-relaxed text-muted-foreground"
          >
            {logText || (logLoading ? "…" : "")}
          </pre>
          <div className="flex items-center justify-between gap-2">
            <p className="min-w-0 text-[11px] text-muted-foreground">
              {fr ? "Lancement" : "Launch"}{" "}
              {formatWhen(logLaunchedAt, fr) || "—"}
              <span className="text-border"> · </span>
              {fr ? "Activité" : "Activity"}{" "}
              {formatWhen(logActivityAt, fr) || "—"}
            </p>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 w-8 shrink-0 p-0"
              disabled={logLoading}
              title={fr ? "Recharger" : "Reload"}
              onClick={() => void pollLogs(true)}
            >
              {logLoading ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" />
              )}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <WebAdbApkLab
        open={apkOpen}
        onOpenChange={setApkOpen}
        locale={locale}
        initialPack={apkPack}
        lockPack
        onUploaded={() => void refetchStatus()}
      />
    </>
  );
}
