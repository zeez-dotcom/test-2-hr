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
  Package
} from "lucide-react";

const navigation = [
  { name: "Dashboard", href: "/", icon: BarChart3 },
  { name: "Employees", href: "/employees", icon: Users },
  { name: "Departments", href: "/departments", icon: Building },
  { name: "Payroll", href: "/payroll", icon: DollarSign },
  { name: "Employee Events", href: "/employee-events", icon: Award },
  { name: "Reports", href: "/reports", icon: TrendingUp },
  { name: "Vacations", href: "/vacations", icon: Calendar },
  { name: "Loans", href: "/loans", icon: CreditCard },
  { name: "Assets", href: "/assets", icon: Package },
  { name: "Fleet", href: "/cars", icon: Car },
  { name: "Documents", href: "/documents", icon: FileText },
  { name: "Notifications", href: "/notifications", icon: Bell },
];

export default function Sidebar() {
  const [location] = useLocation();

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
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = location === item.href;
              
              return (
                <li key={item.name}>
                  <Link href={item.href} className={cn(
                    "group flex items-center px-3 py-2 text-sm font-medium rounded-md transition-colors",
                    isActive
                      ? "bg-primary text-white"
                      : "text-gray-700 hover:bg-gray-100"
                  )}>
                    <Icon className="mr-3" size={16} />
                    {item.name}
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
