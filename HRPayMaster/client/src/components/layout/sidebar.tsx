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

const navigation = [
  { key: "dashboard", href: "/", icon: BarChart3 },
  { key: "employees", href: "/employees", icon: Users, roles: ["admin", "hr"] },
  { key: "departments", href: "/departments", icon: Building, roles: ["admin", "hr"] },
  { key: "payroll", href: "/payroll", icon: DollarSign, roles: ["admin", "hr"] },
  { key: "employeeEvents", href: "/employee-events", icon: Award, roles: ["admin", "hr"] },
  { key: "reports", href: "/reports", icon: TrendingUp },
  { key: "vacations", href: "/vacations", icon: Calendar },
  { key: "loans", href: "/loans", icon: CreditCard, roles: ["admin", "hr"] },
  { key: "assets", href: "/assets", icon: Package, roles: ["admin", "hr"] },
  { key: "cars", href: "/cars", icon: Car, roles: ["admin", "hr"] },
  { key: "documents", href: "/documents", icon: FileText },
  { key: "notifications", href: "/notifications", icon: Bell },
  { key: "chatbot", href: "/chat", icon: MessageSquare }
];

export default function Sidebar({ role }: { role: string }) {
  const [location] = useLocation();
  const { t } = useTranslation();

  return (
    <aside className="fixed inset-y-0 left-0 w-64 bg-white shadow-sm border-r border-gray-200 hidden lg:block">
      <div className="flex items-center px-6 py-4 border-b border-gray-200">
        <div className="flex items-center">
          <div className="w-8 h-8 bg-primary rounded-lg flex items-center justify-center">
            <Users className="text-white text-sm" size={16} />
          </div>
          <span className="ml-3 text-xl font-semibold text-gray-900">HR Pro</span>
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
                      isActive ? "bg-primary text-white" : "text-gray-700 hover:bg-gray-100"
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
    </aside>
  );
}
