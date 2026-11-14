import { prisma } from "@/lib/db/prisma";

function isTruthyEnv(value?: string | null): boolean {
  const raw = value?.trim().toLowerCase();
  return raw === "1" || raw === "true" || raw === "yes";
}

/** Open only for bootstrap (no accounts yet) or when ALLOW_REGISTRATION is set. */
export async function isRegistrationOpen(): Promise<{
  open: boolean;
  bootstrap: boolean;
}> {
  const userCount = await prisma.user.count();
  const bootstrap = userCount === 0;
  const open = bootstrap || isTruthyEnv(process.env.ALLOW_REGISTRATION);
  return { open, bootstrap };
}
