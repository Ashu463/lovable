import { NavLink } from "react-router-dom";
import { Sparkles, Home, Search, Compass, Layers, BookOpen, Star, Users } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";

function SidebarLink({
  to,
  icon: Icon,
  label,
}: {
  to: string;
  icon: typeof Home;
  label: string;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex h-10 w-10 items-center justify-center rounded-xl transition-colors",
          isActive ? "bg-surface-hover text-foreground" : "text-muted hover:bg-surface-hover hover:text-foreground",
        )
      }
    >
      <Icon className="h-[18px] w-[18px]" />
    </NavLink>
  );
}

function DecorativeIcon({ icon: Icon, label }: { icon: typeof Home; label: string }) {
  return (
    <button
      title={label}
      className="flex h-10 w-10 items-center justify-center rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
    >
      <Icon className="h-[18px] w-[18px]" />
    </button>
  );
}

export function Sidebar() {
  const { session } = useAuth();

  return (
    <aside className="flex h-screen w-16 shrink-0 flex-col items-center justify-between border-r border-border bg-surface/40 py-4">
      <div className="flex flex-col items-center gap-4">
        <NavLink to="/" className="flex h-8 w-8 items-center justify-center rounded-lg bg-gradient-accent">
          <Sparkles className="h-4 w-4 text-accent-foreground" />
        </NavLink>

        <div className="flex flex-col items-center gap-1">
          <SidebarLink to="/" icon={Home} label="Home" />
          <DecorativeIcon icon={Search} label="Search" />
          <DecorativeIcon icon={Compass} label="Explore" />
          <SidebarLink to="/architecture" icon={Layers} label="Architecture" />
          <SidebarLink to="/docs" icon={BookOpen} label="Docs" />
          <DecorativeIcon icon={Star} label="Favorites" />
          <DecorativeIcon icon={Users} label="Team" />
        </div>
      </div>

      <div>{session && <Avatar name={session.user.name ?? session.user.email} className="h-9 w-9" />}</div>
    </aside>
  );
}
