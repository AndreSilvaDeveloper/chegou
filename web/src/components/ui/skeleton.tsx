import * as React from "react";
import { cn } from "@/lib/utils";

function Skeleton({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "animate-pulse rounded-lg bg-primary/10 dark:bg-primary/5",
        className
      )}
      {...props}
    />
  );
}

export { Skeleton };
