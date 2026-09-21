import { useState } from 'react';
import { Link, useLocation } from 'react-router-dom';
import {
  Menu,
  X,
  LayoutDashboard,
  Activity,
  FileBarChart,
  Bell,
  Settings,
  Zap,
  Moon,
  Sun,
  Wrench,
  Thermometer,
  Radio
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { useTheme } from '@/hooks/useTheme';

const navigation = [
  { name: 'Dashboard', href: '/', icon: LayoutDashboard },
  { name: 'Function Test Module', href: '/function-test', icon: Wrench },
  { name: 'Calorie Meter Room', href: '/calorie-meter', icon: Thermometer },
  { name: 'EMC Testing', href: '/emc', icon: Radio },
  { name: 'Historical Data & Reports', href: '/reports', icon: FileBarChart },
  { name: 'Real-time Monitoring', href: '/monitoring', icon: Activity },
  { name: 'Alerts & Notifications', href: '/alerts', icon: Bell },
  { name: 'Settings', href: '/settings', icon: Settings },
];

interface LayoutProps {
  children: React.ReactNode;
}

export function Layout({ children }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const location = useLocation();
  const { theme, toggleTheme } = useTheme();

  return (
    <div className="min-h-screen bg-background">
      {/* Mobile sidebar backdrop */}
      {sidebarOpen && (
        <div 
          className="fixed inset-0 bg-black/50 z-40 lg:hidden backdrop-blur-sm"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          "fixed top-0 left-0 h-full w-64 glass-effect border-r border-border/50 z-50 transition-transform duration-300 ease-out",
          "lg:translate-x-0",
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center gap-2 px-6 py-5 border-b border-border/50 relative overflow-hidden">
            <div className="absolute inset-0 bg-gradient-to-r from-primary/10 to-transparent" />
            <div className="p-2 rounded-lg bg-primary/10 relative z-10">
              <Zap className="w-6 h-6 text-primary" />
            </div>
            <div className="relative z-10">
              <h1 className="text-lg font-bold bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">Saijo Denki</h1>
              <p className="text-xs text-muted-foreground">Smart Factory</p>
            </div>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
            {navigation.map((item) => {
              const isActive = location.pathname === item.href;
              return (
                <Link
                  key={item.name}
                  to={item.href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 relative group",
                    isActive
                      ? "gradient-primary text-white shadow-lg glow-effect"
                      : "text-foreground hover:bg-accent/10"
                  )}
                  onClick={() => setSidebarOpen(false)}
                >
                  {isActive && (
                    <div className="absolute inset-0 bg-gradient-to-r from-primary to-accent opacity-10 rounded-lg" />
                  )}
                  <item.icon className="w-5 h-5 relative z-10" />
                  <span className="relative z-10">{item.name}</span>
                </Link>
              );
            })}
          </nav>

          {/* Footer with Theme Toggle */}
          <div className="px-3 py-4 border-t border-border/50 space-y-2">
            <Button
              variant="ghost"
              className="w-full justify-start gap-3"
              onClick={toggleTheme}
            >
              {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
              <span className="text-sm">{theme === 'dark' ? 'Light Mode' : 'Dark Mode'}</span>
            </Button>
            <p className="text-xs text-muted-foreground px-3">
              Power Meter Admin v1.0
            </p>
          </div>
        </div>
      </aside>

      {/* Main content */}
      <div className="lg:pl-64">
        {/* Top bar */}
        <header className="sticky top-0 z-30 glass-effect border-b border-border/50 backdrop-blur-xl">
          <div className="flex items-center justify-between px-4 py-3 lg:px-6">
            <Button
              variant="ghost"
              size="icon"
              className="lg:hidden"
              onClick={() => setSidebarOpen(true)}
            >
              <Menu className="w-6 h-6" />
            </Button>

            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              <span>Home</span>
              <span>/</span>
              <span className="text-foreground font-medium">
                {navigation.find(n => n.href === location.pathname)?.name || 'Dashboard'}
              </span>
            </div>

            <Button
              variant="ghost"
              size="icon"
              onClick={toggleTheme}
              className="transition-transform hover:scale-110"
            >
              {theme === 'dark' ? <Sun className="w-5 h-5" /> : <Moon className="w-5 h-5" />}
            </Button>
          </div>
        </header>

        {/* Page content */}
        <main className="p-4 lg:p-6 animate-in fade-in duration-500">
          {children}
        </main>
      </div>
    </div>
  );
}
