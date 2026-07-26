import { cn } from "@/lib/utils";

function Avatar({
  name,
  src,
  className,
}: {
  name: string;
  src?: string;
  className?: string;
}) {
  if (src) {
    return (
      <img
        src={src}
        alt={name}
        className={cn("h-10 w-10 shrink-0 rounded-full object-cover", className)}
      />
    );
  }

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
