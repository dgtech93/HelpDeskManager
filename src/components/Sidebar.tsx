import { NavLink } from "react-router-dom";
import {
  BookUser,
  CalendarDays,
  CalendarRange,
  HardDrive,
  LayoutDashboard,
  Settings,
  UserCog,
  Users,
} from "lucide-react";
import { cn } from "@/lib/utils";
import appIconUrl from "@/assets/app-icon.png";
import { APP_DISPLAY_NAME, APP_VERSION } from "@/lib/appInfo";

import {
  PlanningSidebarReminderAlerts,
} from "@/components/PlanningSidebarReminderAlerts";

const links = [
  { to: "/", label: "Dashboard", icon: LayoutDashboard },
  { to: "/clients", label: "Clienti", icon: Users },
  { to: "/rubrica", label: "Rubrica", icon: BookUser },
  { to: "/collaboratori", label: "Collaboratori", icon: UserCog },
  { to: "/pianificazione", label: "Pianificazione", icon: CalendarDays },
  { to: "/agenda", label: "Agenda", icon: CalendarRange, sub: true },
  { to: "/backup", label: "Backup", icon: HardDrive },
  { to: "/settings", label: "Impostazioni", icon: Settings },
];

export function Sidebar() {
  return (
    <aside className="flex h-full w-56 shrink-0 flex-col border-r border-slate-400/35 bg-[rgb(var(--surface))] shadow-[1px_0_0_rgba(148,163,184,0.08)] backdrop-blur-sm dark:border-slate-800 dark:bg-slate-950/90 dark:shadow-none">
      <div className="flex items-center gap-2 border-b border-slate-400/30 px-5 py-4 dark:border-slate-800">
        <img
          src={appIconUrl}
          alt=""
          width={36}
          height={36}
          className="h-9 w-9 shrink-0 rounded-lg object-cover shadow-sm"
        />
        <div>
          <div className="text-sm font-semibold text-slate-900 dark:text-slate-50">{APP_DISPLAY_NAME}</div>
          <div className="text-xs tabular-nums text-slate-500 dark:text-slate-400">v{APP_VERSION}</div>
        </div>
      </div>
      <nav className="flex min-h-0 flex-1 flex-col p-3">
        <div className="flex shrink-0 flex-col gap-1">
          {links.map(({ to, label, icon: Icon, sub }) => (
            <NavLink
              key={to}
              to={to}
              end={to === "/"}
              className={({ isActive }) =>
                cn(
                  "flex items-center gap-2 rounded-lg py-2 text-sm font-medium transition",
                  sub ? "ml-2 border-l border-slate-300/50 pl-5 pr-2 dark:border-slate-700" : "px-3",
                  isActive
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "text-slate-600 hover:bg-slate-200/55 dark:text-slate-300 dark:hover:bg-slate-900",
                )
              }
            >
              <Icon size={sub ? 16 : 18} />
              {label}
            </NavLink>
          ))}
        </div>
        <div className="min-h-[1rem] flex-1" aria-hidden />
        <PlanningSidebarReminderAlerts />
      </nav>
    </aside>
  );
}
