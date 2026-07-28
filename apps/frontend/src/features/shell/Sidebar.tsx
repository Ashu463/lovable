import { useState } from "react";
import { NavLink, useNavigate } from "react-router-dom";
import {
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
import { AccentPicker } from "@/components/ui/accent-picker";
import { BrandMark } from "@/features/shell/BrandMark";
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
          "flex items-center gap-3 rounded-lg font-mono text-[13.5px] text-muted transition-colors hover:bg-surface-hover hover:text-foreground",
          expanded ? "px-2.5 py-2" : "h-10 w-10 justify-center",
          isActive && "bg-surface-hover text-foreground [&_svg]:text-accent",
        )
      }
    >
      <Icon className="h-[17px] w-[17px] shrink-0 text-muted-foreground" />
      {expanded && <span>{label}</span>}
    </NavLink>
  );
}

function SectionLabel({ expanded, children }: { expanded: boolean; children: string }) {
  if (!expanded) return null;
  return (
    <p className="mt-4 px-2.5 pb-1.5 font-mono text-[10px] tracking-[0.16em] text-muted-foreground uppercase">
      {children}
    </p>
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
        "flex h-full shrink-0 flex-col border-r border-border bg-surface transition-[width] duration-150",
        expanded ? "w-60" : "w-16 items-center",
      )}
    >
      <div
        className={cn(
          "flex h-[46px] shrink-0 items-center border-b border-border",
          expanded ? "justify-between px-3.5" : "flex-col justify-center gap-2 py-2",
        )}
      >
        <button onClick={() => navigate("/")} className="flex items-center gap-2.5" title="Dashboard">
          <BrandMark className="h-[26px] w-[26px]" />
          {expanded && <span className="font-display text-[15px] font-semibold tracking-tight">Lovable</span>}
        </button>
        <button
          onClick={toggle}
          title={expanded ? "Collapse sidebar" : "Expand sidebar"}
          className="flex h-7 w-7 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground"
        >
          {expanded ? <PanelLeftClose className="h-3.5 w-3.5" /> : <PanelLeftOpen className="h-3.5 w-3.5" />}
        </button>
      </div>

      <nav className={cn("flex flex-col gap-1 overflow-y-auto px-2.5 py-3", expanded ? "" : "items-center px-0")}>
        <NavItem to="/" icon={Home} label="Dashboard" expanded={expanded} />
        <NavItem to="/search" icon={Search} label="Search" expanded={expanded} />
        <NavItem to="/resources" icon={Compass} label="Resources" expanded={expanded} />

        <SectionLabel expanded={expanded}>System</SectionLabel>
        <NavItem to="/architecture" icon={Layers} label="Architecture" expanded={expanded} />
        <NavItem to="/docs" icon={BookOpen} label="Docs" expanded={expanded} />

        <SectionLabel expanded={expanded}>Projects</SectionLabel>
        <NavItem to="/projects" icon={Folder} label="All projects" expanded={expanded} />
        <NavItem to="/projects?filter=starred" icon={Star} label="Starred" expanded={expanded} />
      </nav>

      <div className="flex-1" />

      <div className={cn("flex flex-col gap-1 border-t border-border p-2.5", expanded ? "" : "items-center px-0")}>
        {expanded && <AccentPicker expanded={expanded} />}

        {session && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "flex items-center gap-2 rounded-lg transition-colors hover:bg-surface-hover",
                expanded ? "px-1.5 py-1.5" : "h-10 w-10 justify-center",
              )}
            >
              <Avatar name={session.user.name ?? session.user.email} className="h-8 w-8 text-sm" />
              {expanded && (
                <span className="truncate font-mono text-xs text-foreground">
                  {session.user.name ?? session.user.email}
                </span>
              )}
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start" side="right">
              <div className="px-3 py-2">
                <p className="text-sm font-medium">{session.user.name ?? "Account"}</p>
                <p className="truncate text-xs text-muted-foreground">{session.user.email}</p>
              </div>
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
