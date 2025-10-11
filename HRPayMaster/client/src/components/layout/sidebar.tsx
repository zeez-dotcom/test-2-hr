import { useMemo } from "react";
import { Link, useLocation } from "wouter";
import { useTranslation } from "react-i18next";
import {
  BarChart3,
  Users,
  DollarSign,
  Package,
  FileText,
  MessageSquare,
  ShieldCheck,
  Globe,
  Moon,
  Sun,
  type LucideIcon,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { PermissionKey, SessionUser } from "@shared/schema";

type NavigationItem = {
  key: string;
  href: string;
  icon: LucideIcon;
  /** User must have every permission listed. */
  allPermissions?: PermissionKey[];
  /** User must have at least one permission listed. */
  anyPermissions?: PermissionKey[];
  /** Fallback role-based visibility. */
  roles?: string[];
};

const navigation: NavigationItem[] = [
  { key: "dashboard", href: "/", icon: BarChart3 },
  { key: "people", href: "/people", icon: Users, roles: ["admin", "hr"] },
  {
    key: "finance",
    href: "/finance",
    icon: DollarSign,
    anyPermissions: [
      "payroll:view",
      "payroll:manage",
      "payroll:approve",
      "loans:view",
      "loans:manage",
      "loans:approve",
    ],
  },
  {
    key: "reports",
    href: "/reports",
    icon: FileText,
    anyPermissions: ["reports:view", "reports:finance"],
  },
  {
    key: "assetsFleet",
    href: "/assets-fleet",
    icon: Package,
    anyPermissions: ["assets:view", "assets:manage"],
  },
  { key: "compliance", href: "/compliance", icon: FileText, roles: ["admin", "hr"] },
  { key: "settings", href: "/settings", icon: FileText, roles: ["admin"] },
  {
    key: "security",
    href: "/security",
    icon: ShieldCheck,
    anyPermissions: [
      "security:audit:view",
      "security:access:request",
      "security:access:review",
    ],
  },
  { key: "chatbot", href: "/chat", icon: MessageSquare },
];

const hasAllPermissions = (user: SessionUser, required: PermissionKey[]): boolean =>
  required.every(permission => user.permissions.includes(permission));

const hasAnyPermission = (user: SessionUser, required: PermissionKey[]): boolean =>
  required.some(permission => user.permissions.includes(permission));

const canAccessNavItem = (user: SessionUser, item: NavigationItem): boolean => {
  if (item.roles && !item.roles.includes(user.role)) {
    return false;
  }

  if (item.allPermissions && !hasAllPermissions(user, item.allPermissions)) {
    return false;
  }

  if (item.anyPermissions && !hasAnyPermission(user, item.anyPermissions)) {
    return false;
  }

  if (!item.roles && !item.allPermissions && !item.anyPermissions) {
    return true;
  }

  return true;
};

export const getNavigationItemsForUser = (user: SessionUser): NavigationItem[] =>
  navigation.filter(item => canAccessNavItem(user, item));

interface SidebarProps {
  user: SessionUser;
}

export default function Sidebar({ user }: SidebarProps) {
  const [location] = useLocation();
  const { t, i18n } = useTranslation();
  const navItems = useMemo(() => getNavigationItemsForUser(user), [user]);

  return (
    <aside className="fixed inset-y-0 left-0 hidden w-64 border-r border-gray-200 bg-white shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:block">
      <div className="flex items-center border-b border-gray-200 px-6 py-4 dark:border-gray-800">
        <div className="flex items-center">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Users className="text-white" size={16} />
          </div>
          <span className="ml-3 text-xl font-semibold text-gray-900 dark:text-gray-100">HR Pro</span>
        </div>
      </div>

      <nav className="mt-6">
        <div className="px-3">
          <ul className="space-y-1">
            {navItems.map(item => {
              const Icon = item.icon;
              const isActive = location === item.href;

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center rounded-md px-3 py-2 text-sm font-medium transition-colors",
                      isActive
                        ? "bg-primary text-white"
                        : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800",
                    )}
                  >
                    <Icon className="mr-3" size={16} />
                    {t(`nav.${item.key}`)}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      </nav>

      <div className="absolute bottom-0 left-0 right-0 border-t border-gray-200 p-3 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <button
            title="Toggle language"
            onClick={() => {
              const next = i18n.language === "ar" ? "en" : "ar";
              i18n.changeLanguage(next);
              try {
                localStorage.setItem("language", next);
              } catch {}
            }}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <Globe size={14} /> {i18n.language?.toUpperCase() || "EN"}
          </button>
          <button
            title="Toggle theme"
            onClick={() => {
              const root = document.documentElement;
              const isDark = root.classList.toggle("dark");
              try {
                localStorage.setItem("theme", isDark ? "dark" : "light");
              } catch {}
            }}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <Moon size={14} className="hidden dark:block" />
            <Sun size={14} className="dark:hidden" />
            <span className="uppercase">Theme</span>
          </button>
        </div>
      </div>
    </aside>
  );
}

export type { NavigationItem };
