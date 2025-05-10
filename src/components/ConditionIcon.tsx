import { Star, Recycle, Skull } from "lucide-react";
import type { Condition } from "@prisma/client";

type ConditionIconProps = {
  condition: Condition;
};

export function ConditionIcon({ condition }: ConditionIconProps) {
  switch (condition) {
    case "new":
      return <Star className="size-4 text-green-600" />;
    case "used":
      return <Recycle className="size-4 text-yellow-500" />;
    case "damaged":
      return <Skull className="size-4 text-red-600" />;
    default:
      return null;
  }
}
