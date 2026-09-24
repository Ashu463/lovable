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
  Menu,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useAuth } from "@/lib/auth";
import { Avatar } from "@/components/ui/avatar";
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
  onNavigate,
}: {
  to: string;
  icon: typeof Home;
  label: string;
  expanded: boolean;
  onNavigate: () => void;
}) {
  return (
    <NavLink
      to={to}
      title={label}
      onClick={onNavigate}
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
  // Below md, the sidebar is an off-canvas drawer rather than the persistent
  // collapse/expand rail — independent state, and always shows full labels
  // when open since there's no reason to open a drawer just to see icons.
  const [mobileOpen, setMobileOpen] = useState(false);
  const showFull = expanded || mobileOpen;
  const closeMobile = () => setMobileOpen(false);

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      localStorage.setItem(STORAGE_KEY, next ? "1" : "0");
      return next;
    });
  };

  return (
    <>
      <button
        onClick={() => setMobileOpen(true)}
        title="Open menu"
        className="fixed left-2 top-2 z-30 flex h-9 w-9 items-center justify-center rounded-lg border border-border bg-surface text-muted md:hidden"
      >
        <Menu className="h-[18px] w-[18px]" />
      </button>

      {mobileOpen && (
        <div
          onClick={closeMobile}
          className="fixed inset-0 z-40 bg-black/50 md:hidden"
        />
      )}

      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 flex h-full w-60 shrink-0 flex-col border-r border-border bg-surface transition-transform duration-200 md:static md:z-auto md:w-auto md:translate-x-0 md:transition-[width]",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
          expanded ? "md:w-60" : "md:w-16 md:items-center",
        )}
      >
        <div
          className={cn(
            "flex h-[46px] shrink-0 items-center border-b border-border",
            showFull ? "justify-between px-3.5" : "justify-center",
          )}
        >
          {showFull && (
            <button
              onClick={() => {
                navigate("/");
                closeMobile();
              }}
              className="flex items-center gap-2 font-display text-[16px] font-semibold tracking-tight"
            >
              <img src="/favicon.svg" alt="" className="h-5 w-5" />
              Praxis
            </button>
          )}
          <button
            onClick={toggle}
            title={expanded ? "Collapse sidebar" : "Expand sidebar"}
            className="hidden h-8 w-8 items-center justify-center rounded-lg text-muted transition-colors hover:bg-surface-hover hover:text-foreground md:flex"
          >
            {expanded ? <PanelLeftClose className="h-[18px] w-[18px]" /> : <PanelLeftOpen className="h-[18px] w-[18px]" />}
          </button>
        </div>

        <nav className={cn("flex flex-col gap-1 overflow-y-auto px-2.5 py-3", showFull ? "" : "items-center px-0")}>
          <NavItem to="/" icon={Home} label="Dashboard" expanded={showFull} onNavigate={closeMobile} />
          <NavItem to="/search" icon={Search} label="Search" expanded={showFull} onNavigate={closeMobile} />
          <NavItem to="/resources" icon={Compass} label="Resources" expanded={showFull} onNavigate={closeMobile} />

          <SectionLabel expanded={showFull}>System</SectionLabel>
          <NavItem to="/architecture" icon={Layers} label="Architecture" expanded={showFull} onNavigate={closeMobile} />
          <NavItem to="/docs" icon={BookOpen} label="Docs" expanded={showFull} onNavigate={closeMobile} />

          <SectionLabel expanded={showFull}>Projects</SectionLabel>
          <NavItem to="/projects" icon={Folder} label="All projects" expanded={showFull} onNavigate={closeMobile} />
          <NavItem to="/projects?filter=starred" icon={Star} label="Starred" expanded={showFull} onNavigate={closeMobile} />
        </nav>

        <div className="flex-1" />

        <div className={cn("flex flex-col gap-1 border-t border-border p-2.5", showFull ? "" : "items-center px-0")}>
          {showFull && <AccentPicker expanded={showFull} />}

          {session && (
            <DropdownMenu>
              <DropdownMenuTrigger
                className={cn(
                  "flex items-center gap-2 rounded-lg transition-colors hover:bg-surface-hover",
                  showFull ? "px-1.5 py-1.5" : "h-10 w-10 justify-center",
                )}
              >
                <Avatar name={session.user.name ?? session.user.email} className="h-8 w-8 text-sm" />
                {showFull && (
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
    </>
  );
}
