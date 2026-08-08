"use client";

import { useEffect, useRef, useState, type ChangeEvent } from "react";
import {
  Cable,
  CheckCircle2,
  FolderUp,
  Loader2,
  Network,
  Smartphone,
  Upload,
} from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { cn } from "@/lib/shared/utils";

type PackId = "lorcana" | "pokemon";
type Source = "upload" | "tcp" | "webusb";

const PACKAGE_BY_PACK: Record<PackId, string> = {
  lorcana: "com.ravensburger.disney.lorcana",
  pokemon: "com.pokemon.pokemontcgl",
};

function formatMo(bytes: number): string {
  return `${(bytes / (1024 * 1024)).toFixed(1)} Mo`;
}

function packLabel(id: PackId): string {
  return id === "lorcana" ? "Lorcana" : "Pokémon";
}

type Props = {
  locale?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Prefill pack for file upload (e.g. the one missing APKs). */
  initialPack?: PackId;
  /** Hide pack switcher — upload always goes to `initialPack`. */
  lockPack?: boolean;
  onUploaded?: () => void;
};

/**
 * Modal: put APKs on disk only (files / ADB IP / USB). Extract lives outside.
 */
export function WebAdbApkLab({
  locale = "fr",
  open,
  onOpenChange,
  initialPack = "lorcana",
  lockPack = false,
  onUploaded,
}: Props) {
  const fr = locale === "fr";
  const [source, setSource] = useState<Source>("upload");
  const [uploadPack, setUploadPack] = useState<PackId>(initialPack);
  const [serial, setSerial] = useState("127.0.0.1:26624");
  const [devices, setDevices] = useState<{ serial: string; state: string }[]>(
    [],
  );
  const [log, setLog] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLPreElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  const append = (line: string) => {
    setLog((prev) => [...prev, line]);
  };

  useEffect(() => {
    if (open) setUploadPack(initialPack);
  }, [open, initialPack]);

  useEffect(() => {
    const el = logRef.current;
    if (!el) return;
    el.scrollTop = el.scrollHeight;
  }, [log]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch("/api/admin/foil-apk/adb-tcp");
        const body = (await res.json()) as {
          devices?: { serial: string; state: string }[];
          mumuDefault?: string;
        };
        if (cancelled || !res.ok) return;
        setDevices(body.devices ?? []);
        const preferred =
          body.devices?.find((d) => d.state === "device")?.serial ||
          body.mumuDefault;
        if (preferred) setSerial(preferred);
      } catch {
        /* adb may be missing */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  const runTcp = async () => {
    const packIds = Object.keys(PACKAGE_BY_PACK) as PackId[];
    append(`adb-tcp ${serial}`);
    const res = await fetch("/api/admin/foil-apk/adb-tcp", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ packs: packIds, serial, connect: true }),
    });
    const body = (await res.json()) as {
      error?: string;
      log?: string[];
      saved?: { path: string; bytes: number }[];
      packs?: { pack: string; status: string }[];
    };
    for (const line of body.log ?? []) append(line);
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    for (const outcome of body.packs ?? []) {
      if (outcome.status === "missing") {
        append(`${fr ? "Absent" : "Missing"}: ${outcome.pack}`);
      }
    }
    for (const saved of body.saved ?? []) {
      append(
        `${fr ? "Sauvé" : "Saved"} ${saved.path} (${formatMo(saved.bytes)})`,
      );
    }
  };

  const runWebUsb = async () => {
    const webadb = await import("@/lib/webadb/pullPackageApks");
    if (!webadb.webUsbSupported()) {
      throw new Error(
        fr
          ? "WebUSB non supporté — utilise Chrome/Edge."
          : "WebUSB unsupported — use Chrome/Edge.",
      );
    }
    append(fr ? "Sélection USB…" : "USB picker…");
    const adb = await webadb.connectAdbDaemon();
    append(`${fr ? "Connecté" : "Connected"}: ${adb.serial}`);

    let anySaved = false;
    for (const pack of Object.keys(PACKAGE_BY_PACK) as PackId[]) {
      const packageId = PACKAGE_BY_PACK[pack];
      append(`── ${pack} (${packageId})`);
      let pulled;
      try {
        pulled = await webadb.pullPackageApks(adb, packageId, append);
      } catch (error) {
        append(
          `skip: ${error instanceof Error ? error.message : String(error)}`,
        );
        continue;
      }
      if (pulled.length === 0) {
        append(fr ? `skip: non installé` : `skip: not installed`);
        continue;
      }
      const form = new FormData();
      form.set("pack", pack);
      for (const apk of pulled) {
        form.append(
          "apk",
          new Blob([new Uint8Array(apk.bytes)], {
            type: "application/vnd.android.package-archive",
          }),
          apk.fileName,
        );
      }
      const res = await fetch("/api/admin/foil-apk", {
        method: "POST",
        body: form,
      });
      const body = (await res.json()) as {
        error?: string;
        saved?: { path: string; bytes: number }[];
      };
      if (!res.ok) {
        append(
          `${fr ? "Erreur" : "Error"} ${pack}: ${body.error || res.status}`,
        );
        continue;
      }
      anySaved = true;
      for (const saved of body.saved ?? []) {
        append(
          `${fr ? "Sauvé" : "Saved"} ${saved.path} (${formatMo(saved.bytes)})`,
        );
      }
    }
    await adb.close();
    if (!anySaved) {
      throw new Error(
        fr
          ? "Aucun pack installé sur l’appareil"
          : "No packs installed on the device",
      );
    }
  };

  const runUpload = async (files: FileList | File[]) => {
    const list = [...files].filter((file) =>
      file.name.toLowerCase().endsWith(".apk"),
    );
    if (list.length === 0) {
      throw new Error(fr ? "Choisis au moins un .apk" : "Pick at least one .apk");
    }
    append(`upload ${uploadPack} ×${list.length}`);
    const form = new FormData();
    form.set("pack", uploadPack);
    for (const file of list) form.append("apk", file, file.name);
    const res = await fetch("/api/admin/foil-apk", {
      method: "POST",
      body: form,
    });
    const body = (await res.json()) as {
      error?: string;
      saved?: { path: string; bytes: number }[];
    };
    if (!res.ok) throw new Error(body.error || `HTTP ${res.status}`);
    for (const saved of body.saved ?? []) {
      append(
        `${fr ? "Sauvé" : "Saved"} ${saved.path} (${formatMo(saved.bytes)})`,
      );
    }
  };

  const finishOk = async () => {
    toast.success(fr ? "APKs à jour" : "APKs updated");
    onUploaded?.();
  };

  const runObtain = async () => {
    if (source === "upload") {
      fileRef.current?.click();
      return;
    }
    setBusy(true);
    setLog([]);
    try {
      if (source === "tcp") await runTcp();
      else await runWebUsb();
      await finishOk();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`${fr ? "Erreur" : "Error"}: ${message}`);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onFilesPicked = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = event.target.files;
    event.target.value = "";
    if (!files?.length) return;
    setBusy(true);
    setLog([]);
    try {
      await runUpload(files);
      await finishOk();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      append(`${fr ? "Erreur" : "Error"}: ${message}`);
      toast.error(message);
    } finally {
      setBusy(false);
    }
  };

  const onlineDevices = devices.filter((d) => d.state === "device");

  const sources: {
    id: Source;
    icon: typeof Upload;
    title: string;
  }[] = [
    { id: "upload", icon: FolderUp, title: fr ? "Fichiers" : "Files" },
    { id: "tcp", icon: Network, title: fr ? "ADB local" : "Local ADB" },
    { id: "webusb", icon: Cable, title: "USB" },
  ];

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (busy) return;
        onOpenChange(next);
        if (!next) setLog([]);
      }}
    >
      <DialogContent
        className="flex max-h-[min(90vh,560px)] flex-col gap-0 overflow-hidden p-0 sm:max-w-2xl"
        showClose={!busy}
      >
        <DialogHeader className="border-b px-5 py-4 text-left">
          <DialogTitle className="flex items-center gap-2 text-base">
            <Upload className="h-4 w-4" />
            {fr ? "Upload APKs" : "Upload APKs"}
            {lockPack ? ` · ${packLabel(initialPack)}` : ""}
          </DialogTitle>
          <DialogDescription>
            {fr
              ? "Dépose les .apk sur le disque — extract des foils ensuite, hors de cette fenêtre."
              : "Put .apk files on disk — foil extract happens outside this dialog."}
          </DialogDescription>
        </DialogHeader>

        <input
          ref={fileRef}
          type="file"
          accept=".apk,application/vnd.android.package-archive"
          multiple
          className="hidden"
          onChange={(event) => void onFilesPicked(event)}
        />

        <div className="grid min-h-0 flex-1 sm:grid-cols-[minmax(0,1fr)_minmax(12rem,16rem)]">
          <div className="space-y-3 overflow-y-auto px-5 py-4">
            {source === "upload" && !lockPack ? (
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(PACKAGE_BY_PACK) as PackId[]).map((id) => (
                  <button
                    key={id}
                    type="button"
                    disabled={busy}
                    onClick={() => setUploadPack(id)}
                    className={cn(
                      "rounded-md border px-2 py-1 text-xs transition-colors",
                      uploadPack === id
                        ? "border-foreground/40 bg-muted"
                        : "border-border/60 text-muted-foreground hover:bg-muted/40",
                    )}
                  >
                    {packLabel(id)}
                  </button>
                ))}
              </div>
            ) : null}

            <div className="grid grid-cols-3 gap-1.5">
              {sources.map((entry) => {
                const Icon = entry.icon;
                return (
                  <button
                    key={entry.id}
                    type="button"
                    disabled={busy}
                    onClick={() => setSource(entry.id)}
                    className={cn(
                      "flex items-center justify-center gap-1.5 rounded-md border px-2 py-2 text-xs font-medium transition-colors",
                      source === entry.id
                        ? "border-foreground/35 bg-muted/50"
                        : "border-border/70 text-muted-foreground hover:bg-muted/30",
                    )}
                  >
                    <Icon className="h-3.5 w-3.5 shrink-0" />
                    {entry.title}
                  </button>
                );
              })}
            </div>

            {source === "tcp" ? (
              <div className="space-y-1.5">
                <p className="text-xs text-muted-foreground">
                  {fr
                    ? "Tire Lorcana + Pokémon s’ils sont installés."
                    : "Pulls Lorcana + Pokémon when installed."}
                </p>
                <div className="flex items-center justify-between gap-2">
                  <Label htmlFor="adb-serial" className="text-xs">
                    host:port
                  </Label>
                  {onlineDevices.length > 0 ? (
                    <span className="text-[11px] text-muted-foreground">
                      {onlineDevices.length} online
                    </span>
                  ) : null}
                </div>
                <Input
                  id="adb-serial"
                  value={serial}
                  onChange={(event) => setSerial(event.target.value)}
                  placeholder="127.0.0.1:26624"
                  disabled={busy}
                  list="adb-devices-upload"
                  className="font-mono text-sm"
                />
                <datalist id="adb-devices-upload">
                  {devices.map((device) => (
                    <option key={device.serial} value={device.serial}>
                      {`${device.serial} (${device.state})`}
                    </option>
                  ))}
                </datalist>
                {devices.length > 0 ? (
                  <div className="flex flex-wrap gap-1">
                    {devices.map((device) => (
                      <button
                        key={device.serial}
                        type="button"
                        disabled={busy}
                        onClick={() => setSerial(device.serial)}
                        className={cn(
                          "rounded border px-1.5 py-0.5 font-mono text-[10px]",
                          serial === device.serial
                            ? "border-foreground/40 bg-muted"
                            : "border-border/60 text-muted-foreground",
                          device.state !== "device" && "opacity-50",
                        )}
                      >
                        {device.serial}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
            ) : null}

            {source === "webusb" ? (
              <p className="text-xs text-muted-foreground">
                {fr
                  ? "Chrome/Edge · téléphone USB — tire les deux packs installés."
                  : "Chrome/Edge · USB phone — pulls both installed packs."}
              </p>
            ) : null}

            {source === "upload" ? (
              <p className="text-xs text-muted-foreground">
                {fr
                  ? `Fichiers .apk → ${packLabel(uploadPack)}.`
                  : `.apk files → ${packLabel(uploadPack)}.`}
              </p>
            ) : null}
          </div>

          <aside className="flex min-h-40 flex-col border-t bg-muted/20 sm:min-h-0 sm:border-t-0 sm:border-l">
            <div className="flex items-center gap-1.5 border-b px-3 py-2">
              <Label className="text-xs font-medium tracking-wide text-muted-foreground uppercase">
                {fr ? "Journal" : "Log"}
              </Label>
              {log.length > 0 && !busy ? (
                <CheckCircle2 className="h-3 w-3 text-emerald-600 dark:text-emerald-400" />
              ) : null}
              {busy ? (
                <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
              ) : null}
            </div>
            <pre
              ref={logRef}
              className="min-h-0 flex-1 overflow-auto p-3 font-mono text-[11px] leading-relaxed whitespace-pre-wrap text-muted-foreground"
            >
              {log.length > 0
                ? log.join("\n")
                : fr
                  ? "En attente…"
                  : "Waiting…"}
            </pre>
          </aside>
        </div>

        <DialogFooter className="border-t px-5 py-3 sm:justify-end">
          <Button
            type="button"
            variant="ghost"
            disabled={busy}
            onClick={() => onOpenChange(false)}
          >
            {fr ? "Fermer" : "Close"}
          </Button>
          <Button
            type="button"
            disabled={busy || (source === "tcp" && !serial.trim())}
            onClick={() => void runObtain()}
          >
            {busy ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : source === "upload" ? (
              <Upload className="mr-2 h-4 w-4" />
            ) : (
              <Smartphone className="mr-2 h-4 w-4" />
            )}
            {busy
              ? fr
                ? "En cours…"
                : "Working…"
              : source === "upload"
                ? fr
                  ? "Choisir des .apk"
                  : "Choose .apk files"
                : fr
                  ? "Récupérer"
                  : "Pull"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
