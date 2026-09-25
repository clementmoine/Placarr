import { Star, Recycle, Disc3, Skull } from "lucide-react";
import type { Condition } from "@/generated/prisma/browser";

type ConditionIconProps = {
  condition: Condition;
};

export function ConditionIcon({ condition }: ConditionIconProps) {
  switch (condition) {
    case "new":
      return <Star className="size-4 text-green-600" />;
    case "used":
      return <Recycle className="size-4 text-yellow-500" />;
    case "loose":
      return <Disc3 className="size-4 text-sky-500" />;
    case "damaged":
      return <Skull className="size-4 text-red-600" />;
    default:
      return null;
  }
}

/** Active toggle styles for condition pickers (item modal, bulk add, …). */
export function conditionToggleActiveClass(condition: Condition): string {
  switch (condition) {
    case "new":
      return "bg-white text-emerald-600 dark:bg-zinc-800 dark:text-emerald-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-emerald-500/10";
    case "used":
      return "bg-white text-amber-600 dark:bg-zinc-800 dark:text-amber-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-amber-500/10";
    case "loose":
      return "bg-white text-sky-600 dark:bg-zinc-800 dark:text-sky-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-sky-500/10";
    case "damaged":
      return "bg-white text-rose-600 dark:bg-zinc-800 dark:text-rose-400 border-zinc-200/50 dark:border-zinc-700/50 shadow-sm ring-1 ring-rose-500/10";
    default:
      return "";
  }
}
