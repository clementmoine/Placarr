import Image from "next/image";
import { Shelf } from "@prisma/client";

import { Skeleton } from "./ui/skeleton";

interface ShelfBadgeProps {
  shelf?: Shelf;
  isFetching?: boolean;
}

export function ShelfBadge(props: ShelfBadgeProps) {
  const { shelf, isFetching } = props;

  return isFetching ? (
    <Skeleton
      className="flex rounded w-8 items-center justify-center p-0.5 border overflow-hidden shrink-0"
      style={{
        aspectRatio: "1.61792 / 1",
      }}
    />
  ) : (
    <span
      className="flex rounded w-8 items-center justify-center p-1 border overflow-hidden shrink-0"
      style={{
        aspectRatio: "1.61792 / 1",
        backgroundColor: shelf?.color || "white",
      }}
    >
      {shelf?.imageUrl && (
        <Image
          src={shelf.imageUrl}
          alt={shelf.name}
          width={32}
          height={32}
          className="w-full h-full object-contain"
        />
      )}
    </span>
  );
}
