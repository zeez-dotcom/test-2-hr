import { useState } from "react";
import {
  Menu,
  X,
  Users,
  BarChart3,
  Building,
  DollarSign,
  Calendar,
  CreditCard,
  Car,
  FileText,
  Bell,
  Award,
  TrendingUp,
  Package,
  MessageSquare,
  Globe,
  Moon,
  Sun,
} from "lucide-react";
import { useTranslation } from "react-i18next";
import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import Sidebar from "./sidebar";
import { Button } from "@/components/ui/button";
import type { User } from "@shared/schema";

interface LayoutProps {
  children: React.ReactNode;
  user: User;
}

export default function Layout({ children, user }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const { i18n } = useTranslation();

  return (
    <div className="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
      {/* Mobile sidebar overlay */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 z-40 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        >
          <div className="fixed inset-0 bg-gray-600 bg-opacity-75"></div>
        </div>
      )}

      {/* Mobile sidebar */}
      <div className={`fixed inset-y-0 left-0 z-50 w-64 bg-white dark:bg-gray-900 shadow-lg transform transition-transform duration-300 ease-in-out lg:hidden ${
        sidebarOpen ? 'translate-x-0' : '-translate-x-full'
      }`}>
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-800">
          <div className="flex items-center">
            <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center overflow-hidden">
              {typeof window !== 'undefined' && (window as any).__companyLogo ? (
                <img src={(window as any).__companyLogo} alt="Logo" className="w-8 h-8 object-cover" />
              ) : (
                <span className="text-white text-sm font-bold">HR</span>
              )}
            </div>
            <span className="ml-3 text-xl font-semibold text-gray-900">{typeof window !== 'undefined' && (window as any).__companyName ? (window as any).__companyName : 'HR Pro'}</span>
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
          role={user.role}
        />
      </div>

      {/* Desktop sidebar */}
      <Sidebar role={user.role} />

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Mobile header */}
        <div className="sticky top-0 z-10 lg:hidden bg-white dark:bg-gray-900 shadow-sm border-b border-gray-200 dark:border-gray-800 px-4 py-3">
          <div className="flex items-center justify-between">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setSidebarOpen(true)}
              className="lg:hidden"
            >
              <Menu size={20} />
            </Button>
            <div className="flex items-center">
              <div className="w-6 h-6 bg-primary rounded flex items-center justify-center">
                <span className="text-white text-xs font-bold">HR</span>
              </div>
              <span className="ml-2 text-lg font-semibold text-gray-900">HR Pro</span>
            </div>
            <div className="flex items-center gap-3">
              <button
                title="Toggle language"
                onClick={() => {
                  const next = (i18n.language === 'ar') ? 'en' : 'ar';
                  i18n.changeLanguage(next);
                  try { localStorage.setItem('language', next); } catch {}
                }}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                <Globe size={16} /> {i18n.language?.toUpperCase() || 'EN'}
              </button>
              <button
                title="Toggle theme"
                onClick={() => {
                  const root = document.documentElement;
                  const isDark = root.classList.toggle('dark');
                  try { localStorage.setItem('theme', isDark ? 'dark' : 'light'); } catch {}
                }}
                className="flex items-center gap-1 text-xs text-gray-600 hover:text-gray-900 dark:text-gray-300 dark:hover:text-white"
              >
                <Moon size={16} className="hidden dark:block" />
                <Sun size={16} className="dark:hidden" />
              </button>
            </div>
          </div>
        </div>

        {/* Page content */}
        <main className="p-6">
          {children}
        </main>
      </div>
    </div>
  );
}

// Mobile sidebar content component
function MobileSidebarContent({
  setSidebarOpen,
  role,
}: {
  setSidebarOpen: (open: boolean) => void;
  role: string;
}) {
  const [location] = useLocation();

  const navigation = [
    { name: "Dashboard", href: "/", icon: BarChart3 },
    { name: "People", href: "/people", icon: Users, roles: ["admin", "hr"] },
    { name: "Finance", href: "/finance", icon: DollarSign, roles: ["admin", "hr"] },
    { name: "Reports", href: "/reports", icon: TrendingUp },
    { name: "Assets & Fleet", href: "/assets-fleet", icon: Package, roles: ["admin", "hr"] },
    { name: "Compliance", href: "/compliance", icon: FileText },
    ...(role === 'admin' ? [{ name: "Settings", href: "/settings", icon: FileText }] : []),
    { name: "Chatbot", href: "/chat", icon: MessageSquare },
  ];

  const filteredNav = navigation.filter(
    (item) => !item.roles || item.roles.includes(role),
  );

  return (
    <nav className="mt-6">
      <div className="px-3">
        <ul className="space-y-1">
          {filteredNav.map((item) => {
            const Icon = item.icon;
            const isActive = location === item.href;

            return (
              <li key={item.name}>
                <Link
                  href={item.href}
                  className={cn(
                    "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-700 hover:bg-gray-100",
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  <Icon className="mr-3" size={16} />
                  {item.name}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}
