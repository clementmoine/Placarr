import { cn } from "@/lib/shared/utils";

function Skeleton({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <span
      data-slot="skeleton"
      className={cn("flex bg-accent animate-pulse rounded-md", className)}
      {...props}
    />
  );
}

export { Skeleton };
