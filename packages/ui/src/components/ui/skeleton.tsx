import * as React from "react";

import { cn } from "../../lib/utils.js";

export type SkeletonProps = React.ComponentPropsWithoutRef<"div">;

/** Loading placeholder with a shimmer sweep (styles in apps/web `index.css`). */
export function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn("rounded-md bg-muted okkey-skeleton-shimmer", className)}
      aria-hidden
      {...props}
    />
  );
}
