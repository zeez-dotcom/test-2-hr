import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import {
  Users,
  BarChart3,
  DollarSign,
  Building,
  Calendar,
  CreditCard,
  Car,
  Bell,
  FileText,
  TrendingUp,
  Award,
  Package,
  MessageSquare
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Globe, Moon, Sun } from "lucide-react";

const navigation = [
  { key: "dashboard", href: "/", icon: BarChart3 },
  { key: "people", href: "/people", icon: Users, roles: ["admin", "hr"] },
  { key: "finance", href: "/finance", icon: DollarSign, roles: ["admin", "hr"] },
  { key: "reports", href: "/reports", icon: TrendingUp },
  { key: "assetsFleet", href: "/assets-fleet", icon: Package, roles: ["admin", "hr"] },
  { key: "compliance", href: "/compliance", icon: FileText },
  { key: "settings", href: "/settings", icon: FileText, roles: ["admin"] },
  { key: "chatbot", href: "/chat", icon: MessageSquare }
];

export default function Sidebar({ role }: { role: string }) {
  const [location] = useLocation();
  const { t, i18n } = useTranslation();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm border-r border-gray-200 hidden lg:block dark:bg-gray-900 dark:border-gray-800">
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Users className="text-white text-sm" size={16} />
          </div>
          <span className="ml-3 text-xl font-semibold text-gray-900 dark:text-gray-100">HR Pro</span>
        </div>
      </div>

      <nav className="mt-6">
        <div className="px-3">
          <ul className="space-y-1">
            {navigation
              .filter(item => !item.roles || item.roles.includes(role))
              .map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;

              return (
                <li key={item.key}>
                  <Link
                    href={item.href}
                    className={cn(
                      "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                      isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100 dark:text-gray-200 dark:hover:bg-gray-800"
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

      {/* Footer controls */}
      <div className="absolute bottom-0 left-0 right-0 p-3 border-t border-gray-200 dark:border-gray-800">
        <div className="flex items-center justify-between">
          <button
            title="Toggle language"
            onClick={() => {
              const next = (i18n.language === 'ar') ? 'en' : 'ar';
              i18n.changeLanguage(next);
              try { localStorage.setItem('language', next); } catch {}
            }}
            className="flex items-center gap-2 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
          >
            <Globe size={14} /> {i18n.language?.toUpperCase() || 'EN'}
          </button>
          <button
            title="Toggle theme"
            onClick={() => {
              const root = document.documentElement;
              const isDark = root.classList.toggle('dark');
              try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
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
