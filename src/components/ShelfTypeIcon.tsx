import React from "react";
import {
  Gamepad2,
  Clapperboard,
  BookOpen,
  Disc,
  Dices,
  LucideProps,
} from "lucide-react";

interface ShelfTypeIconProps extends Omit<LucideProps, "ref" | "type"> {
  type: string | null | undefined;
}

export function ShelfTypeIcon({ type, ...props }: ShelfTypeIconProps) {
  const IconComponent = getShelfTypeIconComponent(type);
  return <IconComponent {...props} />;
}

export function getShelfTypeIconComponent(type: string | null | undefined) {
  switch (type) {
    case "games":
      return Gamepad2;
    case "movies":
      return Clapperboard;
    case "books":
      return BookOpen;
    case "musics":
      return Disc;
    case "boardgames":
      return Dices;
    default:
      return Gamepad2;
  }
}
