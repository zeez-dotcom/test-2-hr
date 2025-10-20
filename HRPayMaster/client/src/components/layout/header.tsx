import { Menu, Bell, ChevronDown, User } from "lucide-react";
import { Button } from "@/components/ui/button";
import LanguageSwitcher from "@/components/language-switcher";

interface HeaderProps {
  title: string;
  onToggleSidebar?: () => void;
}

export default function Header({ title, onToggleSidebar }: HeaderProps) {
  return (
    <header className="border-b border-border bg-card text-foreground shadow-sm">
      <div className="px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center py-4">
          <div className="flex items-center">
            <Button
              variant="ghost"
              size="sm"
              className="lg:hidden text-muted-foreground hover:text-foreground"
              onClick={onToggleSidebar}
            >
              <Menu size={20} />
            </Button>
            <h1 className="ml-4 lg:ml-0 text-2xl font-semibold text-foreground">{title}</h1>
          </div>
          
          <div className="flex items-center space-x-4">
            <LanguageSwitcher />
            <div className="relative">
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <Bell size={20} />
                <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">
                  3
                </span>
              </Button>
            </div>

            <div className="flex items-center space-x-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-full bg-muted">
                <User className="text-muted-foreground" size={16} />
              </div>
              <div className="hidden sm:block">
                <p className="text-sm font-medium text-foreground">Sarah Johnson</p>
                <p className="text-xs text-muted-foreground">HR Manager</p>
              </div>
              <Button variant="ghost" size="sm" className="text-muted-foreground hover:text-foreground">
                <ChevronDown size={16} />
              </Button>
            </div>
          </div>
        </div>
      </div>
    </header>
  );
}
