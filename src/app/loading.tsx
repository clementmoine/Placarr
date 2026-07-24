import { Skeleton } from "@/components/ui/skeleton";

export default function Loading() {
  return (
    <div className="w-full space-y-4 p-4">
      <Skeleton className="h-10 w-48" />
      <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 lg:grid-cols-4">
        {Array.from({ length: 8 }).map((_, i) => (
          <Skeleton key={i} className="aspect-[2/3] w-full rounded-lg" />
        ))}
      </div>
    </div>
  );
}
