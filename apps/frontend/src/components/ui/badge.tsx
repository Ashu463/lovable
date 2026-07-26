import * as React from "react";
import { cn } from "@/lib/utils";

function Badge({ className, ...props }: React.ComponentProps<"span">) {
  return (
    <span
      className={cn(
        "inline-flex items-center rounded-full bg-surface-hover px-2.5 py-1 text-xs font-medium text-muted",
        className,
      )}
      {...props}
    />
  );
}

export { Badge };
