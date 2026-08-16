/**
 * Browser-side WebUSB ADB helpers (Tango / ya-webadb).
 * Only import from client components — needs WebUSB + user gesture.
 */

import { Adb, AdbDaemonTransport } from "@yume-chan/adb";
import { AdbDaemonWebUsbDeviceManager } from "@yume-chan/adb-daemon-webusb";
import AdbWebCredentialStore from "@yume-chan/adb-credential-web";

export const LORCANA_PACKAGE = "com.ravensburger.disney.lorcana";
export const TCGLIVE_PACKAGE = "com.pokemon.pokemontcgl";

export type PulledApk = {
  remotePath: string;
  fileName: string;
  bytes: Uint8Array;
};

export function webUsbSupported(): boolean {
  return typeof navigator !== "undefined" && "usb" in navigator;
}

type ReadableBytes = {
  getReader(options?: { mode?: string }): {
    read(): Promise<{ done: boolean; value?: Uint8Array }>;
    releaseLock(): void;
  };
};

async function readAll(stream: ReadableBytes): Promise<Uint8Array> {
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      if (!value) continue;
      chunks.push(value);
      total += value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
  const out = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    out.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return out;
}

/** Parse `pm path` / `cmd package path` output into remote APK paths. */
export function parsePmPathOutput(text: string): string[] {
  const paths: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^package:(.+)$/i);
    if (match?.[1]) {
      paths.push(match[1].trim());
      continue;
    }
    if (trimmed.startsWith("/") && trimmed.endsWith(".apk")) {
      paths.push(trimmed);
    }
  }
  return [...new Set(paths)];
}

export async function connectAdbDaemon(): Promise<Adb> {
  const manager = AdbDaemonWebUsbDeviceManager.BROWSER;
  if (!manager) {
    throw new Error("WebUSB indisponible (Chrome/Edge + HTTPS ou localhost).");
  }
  const device = await manager.requestDevice();
  if (!device) {
    throw new Error("Aucun appareil sélectionné.");
  }
  const connection = await device.connect();
  const transport = await AdbDaemonTransport.authenticate({
    serial: device.serial,
    connection,
    credentialStore: new AdbWebCredentialStore("placarr"),
  });
  return new Adb(transport);
}

export async function pullPackageApks(
  adb: Adb,
  packageId: string,
  onProgress?: (message: string) => void,
): Promise<PulledApk[]> {
  onProgress?.(`pm path ${packageId}…`);
  const pathText = await adb.subprocess.noneProtocol.spawnWaitText([
    "pm",
    "path",
    packageId,
  ]);
  const remotePaths = parsePmPathOutput(pathText);
  if (remotePaths.length === 0) {
    throw new Error(
      `Package introuvable ou non installé: ${packageId}\n${pathText.trim() || "(sortie vide)"}`,
    );
  }

  const sync = await adb.sync();
  const pulled: PulledApk[] = [];
  try {
    for (const remotePath of remotePaths) {
      const fileName = remotePath.split("/").pop() || "base.apk";
      onProgress?.(`Pull ${fileName}…`);
      const bytes = await readAll(sync.read(remotePath));
      pulled.push({ remotePath, fileName, bytes });
      onProgress?.(
        `OK ${fileName} (${(bytes.byteLength / (1024 * 1024)).toFixed(1)} Mo)`,
      );
    }
  } finally {
    await sync.dispose();
  }
  return pulled;
}
