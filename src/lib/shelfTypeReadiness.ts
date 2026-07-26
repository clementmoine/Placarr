import { Type } from "@/generated/prisma/browser";

export type ShelfTypeReadiness = "ready" | "comingSoon";

const SHELF_TYPE_READINESS: Record<Type, ShelfTypeReadiness> = {
  games: "ready",
  movies: "ready",
  musics: "ready",
  books: "ready",
  boardgames: "ready",
  hardware: "ready",
  tcg: "ready",
  toys: "comingSoon",
};

export function shelfTypeReadiness(type: string): ShelfTypeReadiness {
  return SHELF_TYPE_READINESS[type as Type] ?? "comingSoon";
}

export function isShelfTypeReady(type: string): boolean {
  return shelfTypeReadiness(type) === "ready";
}

export function isShelfTypeComingSoon(type: string): boolean {
  return shelfTypeReadiness(type) === "comingSoon";
}
