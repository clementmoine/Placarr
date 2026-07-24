import React from "react";
import {
  Gamepad2,
  Clapperboard,
  BookOpen,
  Disc,
  Dices,
  Joystick,
  Layers,
  ToyBrick,
  LucideProps,
} from "lucide-react";

interface ShelfTypeIconProps extends Omit<LucideProps, "ref" | "type"> {
  type: string | null | undefined;
}

// Map statique : la sélection est une lecture de référence, jamais une
// création de composant pendant le render (règle react-hooks/static-components).
export const SHELF_TYPE_ICONS: Record<
  string,
  React.ComponentType<LucideProps>
> = {
  games: Gamepad2,
  movies: Clapperboard,
  books: BookOpen,
  musics: Disc,
  boardgames: Dices,
  hardware: Joystick,
  tcg: Layers,
  toys: ToyBrick,
};

export const DEFAULT_SHELF_TYPE_ICON = Gamepad2;

export function ShelfTypeIcon({ type, ...props }: ShelfTypeIconProps) {
  // Lecture inline de la map (pas d'appel de fonction) : le compilateur React
  // voit une référence stable, pas une création de composant.
  const IconComponent = SHELF_TYPE_ICONS[type ?? ""] ?? DEFAULT_SHELF_TYPE_ICON;
  return <IconComponent {...props} />;
}

export function getShelfTypeIconComponent(type: string | null | undefined) {
  return SHELF_TYPE_ICONS[type ?? ""] ?? Gamepad2;
}
