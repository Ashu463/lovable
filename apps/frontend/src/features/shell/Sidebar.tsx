import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
  Sparkles,
  Home,
  Search,
  Compass,
  Folder,
  Star,
  PanelLeftClose,
  PanelLeftOpen,
  BookOpen,
  Layers,
  LogOut,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
import { ThemeToggle } from "@/components/ui/theme-toggle";
import { AccentPicker } from "@/components/ui/accent-picker";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const STORAGE_KEY = "lovable.sidebarExpanded";

function NavItem({
  to,
  icon: Icon,
  label,
  expanded,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  expanded: boolean;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      className={({ isActive }) =>
        cn(
          "flex items-center gap-3 rounded-xl text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
          expanded ? "px-3 py-2 text-sm" : "h-10 w-10 justify-center",
          isActive && "bg-surface-hover text-foreground",
        )
      }
    >
      <Icon className="h-[18px] w-[18px] shrink-0" />
      {expanded && <span>{label}</span>}
    </NavLink>
  );
}

export function Sidebar() {
  const { session, signOut } = useAuth();
  const navigate = useNavigate();
  const [expanded, setExpanded] = useState(() => localStorage.getItem(STORAGE_KEY) === "1");

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <aside
      className={cn(
        "flex h-full shrink-0 flex-col border-r border-border bg-surface/40 py-4 transition-[width] duration-150",
        expanded ? "w-60 px-3" : "w-16 items-center",
      )}
    >
      <div className={cn("flex items-center", expanded ? "justify-between px-1" : "flex-col gap-3")}>
        <button
          onClick={() => navigate("/")}
          className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-gradient-accent"
          title="Dashboard"
        >
          <Sparkles className="h-4 w-4 text-accent-foreground" />
        </button>
        <button
          onClick={toggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {expanded ? <PanelLeftClose className="h-4 w-4" /> : <PanelLeftOpen className="h-4 w-4" />}
        </button>
      </div>

      <nav className={cn("mt-6 flex flex-col gap-1", expanded ? "" : "items-center")}>
        <NavItem to="/" icon={Home} label="Dashboard" expanded={expanded} />
        <NavItem to="/search" icon={Search} label="Search" expanded={expanded} />
        <NavItem to="/resources" icon={Compass} label="Resources" expanded={expanded} />
      </nav>

      {expanded && <p className="mt-6 px-3 text-xs tracking-widest text-muted-foreground">PROJECTS</p>}
      <nav className={cn("mt-2 flex flex-col gap-1", expanded ? "" : "items-center")}>
        <NavItem to="/projects" icon={Folder} label="All projects" expanded={expanded} />
        <NavItem to="/projects?filter=starred" icon={Star} label="Starred" expanded={expanded} />
      </nav>

      <div className="flex-1" />

      <div className={cn("flex flex-col gap-1", expanded ? "" : "items-center")}>
        <ThemeToggle expanded={expanded} />
        <AccentPicker expanded={expanded} />

        {session && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex items-center gap-2 rounded-xl transition-colors hover:bg-surface-hover",
                expanded ? "px-2 py-2" : "h-10 w-10 justify-center",
              )}
            >
              <Avatar name={session.user.name ?? session.user.email} className="h-8 w-8 text-sm" />
              {expanded && (
                <span className="truncate text-sm text-foreground">
                  {session.user.name ?? session.user.email}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{session.user.name ?? "Account"}</p>
                <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
              </div>
              <DropdownMenuItem onSelect={() => navigate("/architecture")}>
                <Layers className="mr-2 h-4 w-4" /> Architecture
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={() => navigate("/docs")}>
                <BookOpen className="mr-2 h-4 w-4" /> Documentation
              </DropdownMenuItem>
              <DropdownMenuItem onSelect={signOut}>
                <LogOut className="mr-2 h-4 w-4" /> Sign out
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
    </aside>
  );
}
