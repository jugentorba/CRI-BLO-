import { Link, useRouterState } from "@tanstack/react-router";
import { Home, History, Settings, ChevronLeft, Bot, Globe } from "lucide-react";
import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { PermissionSetupDialog } from "@/components/PermissionSetupDialog";

const navItems = [
  { to: "/", label: "Accueil", icon: Home },
  { to: "/assistant", label: "Assistant", icon: Bot },
  { to: "/navigateur", label: "Navigateur", icon: Globe },
  { to: "/historique", label: "Historique", icon: History },
  { to: "/parametres", label: "Réglages", icon: Settings },
] as const;

interface AppShellProps {
  title: string;
  subtitle?: string;
  children: ReactNode;
  showBack?: boolean;
}

export function AppShell({ title, subtitle, children, showBack = false }: AppShellProps) {
  const pathname = useRouterState({ select: (s) => s.location.pathname });

  return (
    <div className="cri-app flex min-h-screen flex-col bg-background">
      <PermissionSetupDialog />
      <header className="sticky top-0 z-30 border-b border-border/60 bg-surface/95 backdrop-blur supports-[backdrop-filter]:bg-surface/80">
        <div className="mx-auto flex h-16 w-full max-w-3xl items-center gap-3 px-4">
          {showBack ? (
            <Link
              to="/"
              className="-ml-1 inline-flex h-8 w-8 items-center justify-center rounded-lg text-foreground transition hover:bg-muted active:scale-95"
              aria-label="Retour"
            >
              <ChevronLeft className="h-3.5 w-3.5" />
            </Link>
          ) : (
            <div
              aria-label="Orange"
              className="flex h-9 w-9 items-center justify-center rounded-[10px] bg-primary text-[11px] font-extrabold uppercase tracking-tight text-primary-foreground shadow-[var(--shadow-elevated)]"
            >
              orange
            </div>
          )}
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-bold leading-tight text-foreground">{title}</h1>
            {subtitle && <p className="truncate text-xs text-muted-foreground">{subtitle}</p>}
          </div>
        </div>
      </header>

      <main className="mx-auto w-full max-w-3xl flex-1 px-4 pb-28 pt-5 animate-fade-in">{children}</main>

      <nav
        aria-label="Navigation principale"
        className="safe-bottom fixed inset-x-0 bottom-0 z-40 border-t border-border/60 bg-surface/95 backdrop-blur"
      >
        <ul className="mx-auto flex w-full max-w-3xl items-stretch justify-around px-2 pt-1">
          {navItems.map(({ to, label, icon: Icon }) => {
            const active = to === "/" ? pathname === "/" : pathname.startsWith(to);
            return (
              <li key={to} className="flex-1">
                <Link
                  to={to}
                  className={cn(
                    "group flex h-12 flex-col items-center justify-center gap-0.5 rounded-xl text-[10px] font-medium leading-none transition active:scale-95",
                    active ? "text-primary" : "text-muted-foreground hover:text-foreground",
                  )}
                >
                  <span
                    className={cn(
                      "inline-flex h-6 w-8 items-center justify-center rounded-full transition",
                      active && "bg-primary/10",
                    )}
                  >
                    <Icon className={cn("h-3 w-3", active && "stroke-[2.5]")} />
                  </span>
                  <span>{label}</span>
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
