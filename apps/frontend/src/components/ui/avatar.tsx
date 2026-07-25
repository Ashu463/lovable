import { cn } from "@/lib/utils";

function Avatar({
  name,
  className,
}: {
  name: string;
  className?: string;
}) {
  const initial = name.trim().charAt(0).toUpperCase();
  return (
    <div
      className={cn(
        "flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-gradient-accent text-sm font-semibold text-accent-foreground",
        className,
      )}
    >
      {initial}
    </div>
  );
}

export { Avatar };
