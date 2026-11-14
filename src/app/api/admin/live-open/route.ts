import { NextRequest, NextResponse } from "next/server";

import { requireAdmin } from "@/lib/auth";
import { consumeRateLimit } from "@/lib/http/rateLimit";
import { openCardInLive, type LiveOpenPrefer } from "@/lib/admin/liveOpen";
import {
  ensureFridaNavd,
  fridaNavAvailable,
  fridaNavdReady,
} from "@/lib/admin/liveNavFrida";

const PREFERS = new Set<LiveOpenPrefer>(["", "ph", "holo", "maxOwned"]);

function parsePrefer(value: unknown): LiveOpenPrefer | undefined {
  if (value === undefined || value === null) return undefined;
  const raw = String(value).trim() as LiveOpenPrefer;
  if (!PREFERS.has(raw)) return undefined;
  return raw;
}

/** POST — open a Live face on MuMu via Frida (`nav.py goto`). */
export async function POST(request: NextRequest) {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;

  const throttle = consumeRateLimit(`live-open:${auth.user.id}`, {
    limit: 20,
    windowMs: 60_000,
  });
  if (!throttle.allowed) {
    return NextResponse.json({ error: "Too many Live opens" }, { status: 429 });
  }

  if (!fridaNavAvailable()) {
    return NextResponse.json(
      {
        ok: false,
        error: "frida scratch missing",
        hint: "Expect ~/.cache/placarr-frida-ugui/{nav.py,agent.bundle.js}",
      },
      { status: 503 },
    );
  }

  let body: {
    bundleId?: string;
    material?: string;
    prefer?: string;
  };
  try {
    body = (await request.json()) as typeof body;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const bundleId = String(body.bundleId ?? "").trim();
  if (!bundleId || !/^[a-z0-9][a-z0-9._-]{2,64}$/i.test(bundleId)) {
    return NextResponse.json({ error: "Invalid bundleId" }, { status: 400 });
  }

  const prefer = parsePrefer(body.prefer);
  if (body.prefer !== undefined && prefer === undefined) {
    return NextResponse.json({ error: "Invalid prefer" }, { status: 400 });
  }

  const material =
    typeof body.material === "string" ? body.material.trim() : null;

  const result = openCardInLive({
    bundleId,
    material,
    prefer,
  });

  return NextResponse.json(result, { status: result.ok ? 200 : 502 });
}

/** GET — scratch present + fire-and-forget navd warm (playroom mount). */
export async function GET() {
  const auth = await requireAdmin();
  if (auth instanceof NextResponse) return auth;
  const available = fridaNavAvailable();
  let warming = false;
  if (available && !fridaNavdReady()) {
    ensureFridaNavd();
    warming = true;
  }
  return NextResponse.json({
    available,
    daemon: fridaNavdReady(),
    warming,
  });
}
