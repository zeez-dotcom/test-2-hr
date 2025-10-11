import { useMemo, useState } from "react";
import { Menu, X, Globe, Moon, Sun } from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import Sidebar, {
  type NavigationItem,
  getNavigationItemsForUser,
} from "./sidebar";
import { Button } from "@/components/ui/button";
import type { SessionUser } from "@shared/schema";

interface LayoutProps {
  children: React.ReactNode;
  user: SessionUser;
}

export default function Layout({ children, user }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { i18n } = useTranslation();
  const navItems = useMemo(() => getNavigationItemsForUser(user), [user]);

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75" />
        </div>
      )}

      <div
        className={`fixed inset-y-0 left-0 z-50 w-64 transform bg-white shadow-lg transition-transform duration-300 ease-in-out dark:bg-gray-900 lg:hidden ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}
      >
        <div className="flex items-center justify-between border-b border-gray-200 px-6 py-4 dark:border-gray-800">
          <div className="flex items-center">
            <div className="flex h-8 w-8 items-center justify-center overflow-hidden rounded-lg bg-primary">
              {typeof window !== "undefined" && (window as any).__companyLogo ? (
                <img src={(window as any).__companyLogo} alt="Logo" className="h-8 w-8 object-cover" />
              ) : (
                <span className="text-sm font-bold text-white">HR</span>
              )}
            </div>
            <span className="ml-3 text-xl font-semibold text-gray-900 dark:text-gray-100">
              {typeof window !== "undefined" && (window as any).__companyName
                ? (window as any).__companyName
                : "HR Pro"}
            </span>
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(false)}
            className="lg:hidden"
          >
            <X size={20} />
          </Button>
        </div>
        <MobileSidebarContent
          setSidebarOpen={setSidebarOpen}
          items={navItems}
        />
      </div>

      <Sidebar user={user} />

      <div className="lg:pl-64">
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-gray-200 bg-white px-4 py-3 shadow-sm dark:border-gray-800 dark:bg-gray-900 lg:hidden">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setSidebarOpen(true)}
            className="lg:hidden"
          >
            <Menu size={20} />
          </Button>
          <div className="flex items-center">
            <div className="flex h-6 w-6 items-center justify-center rounded bg-primary">
              <span className="text-xs font-bold text-white">HR</span>
            </div>
            <span className="ml-2 text-lg font-semibold text-gray-900 dark:text-gray-100">HR Pro</span>
          </div>
          <div className="flex items-center gap-3">
            <button
              title="Toggle language"
              onClick={() => {
                const next = i18n.language === "ar" ? "en" : "ar";
                i18n.changeLanguage(next);
                try {
                  localStorage.setItem("language", next);
                } catch {}
              }}
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              <Globe size={16} /> {i18n.language?.toUpperCase() || "EN"}
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
              className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
            >
              <Moon size={16} className="hidden dark:block" />
              <Sun size={16} className="dark:hidden" />
            </button>
          </div>
        </div>

        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}

interface MobileSidebarContentProps {
  setSidebarOpen: (open: boolean) => void;
  items: NavigationItem[];
}

function MobileSidebarContent({ setSidebarOpen, items }: MobileSidebarContentProps) {
  const [location] = useLocation();
  const { t } = useTranslation();

  if (!items.length) {
    return null;
  }

  return (
    <nav className="mt-6">
      <div className="px-3">
        <ul className="space-y-1">
          {items.map(item => {
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
                  onClick={() => setSidebarOpen(false)}
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
  );
}
