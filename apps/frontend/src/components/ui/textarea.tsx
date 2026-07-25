import * as React from "react";
import { cn } from "@/lib/utils";

function Textarea({ className, ...props }: React.ComponentProps<"textarea">) {
  return (
    <textarea
      className={cn(
        "w-full resize-none rounded-xl border-none bg-transparent text-sm text-foreground placeholder:text-muted-foreground outline-none",
        className,
      )}
      {...props}
    />
  );
}

export { Textarea };
