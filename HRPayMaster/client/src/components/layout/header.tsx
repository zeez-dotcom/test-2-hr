import { Menu, Bell, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  title: string;
  onToggleSidebar?: () => void;
}

export default function Header({ title, onToggleSidebar }: HeaderProps) {
  return (
    <header className="bg-white shadow-sm border-b border-gray-200">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden text-gray-500 hover:text-gray-700"
              onClick={onToggleSidebar}
            >
              <Menu size={20} />
            </Button>
            <h1 className="ml-4 lg:ml-0 text-2xl font-semibold text-gray-900">{title}</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <div className="relative">
              <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              </Button>
            </div>
            
            <div className="flex items-center space-x-3">
              <div className="w-8 h-8 bg-gray-300 rounded-full flex items-center justify-center">
                <User className="text-gray-600" size={16} />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-gray-900">Sarah Johnson</p>
                <p className="text-xs text-gray-500">HR Manager</p>
              </div>
              <Button variant="ghost" size="sm" className="text-gray-500 hover:text-gray-700">
                <ChevronDown size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
