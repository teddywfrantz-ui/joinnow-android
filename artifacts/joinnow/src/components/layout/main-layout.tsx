import { ReactNode, useEffect, useState } from "react";
import { SidebarNav } from "./sidebar-nav";
import { Button } from "@/components/ui/button";
import { LogIn, UserIcon, Settings, LogOut, ChevronDown, Sun, Moon, Menu } from "lucide-react";
import { Link } from "wouter";
import { useUser } from "@/hooks/use-user";
import { useToast } from "@/hooks/use-toast";
import { useAppearance, initializeAppearanceFromStorage } from "@/hooks/use-appearance";
import { NotificationDropdown } from "@/components/notifications/notification-dropdown";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetTrigger } from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

interface MainLayoutProps {
  children: ReactNode;
}

export function MainLayout({ children }: MainLayoutProps) {
  const [menuOpen, setMenuOpen] = useState(false);
  const isAndroidWrapper = /JoinNowAndroid\//.test(navigator.userAgent);
  const { user, logout } = useUser();
  const { toast } = useToast();
  const { appearance, toggleDarkMode } = useAppearance();
  
  // Initialize appearance from localStorage on component mount
  useEffect(() => {
    initializeAppearanceFromStorage();
    
    // Preload both logo images to prevent lag when switching
    const lightLogo = new Image();
    lightLogo.src = "/images/joinup-logo.png";
    const darkLogo = new Image();
    darkLogo.src = "/images/joinup-logo-dark.png";
  }, []);

  const handleLogout = async () => {
    try {
      // Show loading toast
      toast({
        title: "Logging out...",
        description: "Please wait while we sign you out",
      });
      
      // Execute logout
      await logout();
      
      // No need for additional navigation since we've added a redirect in the logout function
    } catch (error) {
      console.error('Logout failed:', error);
      toast({
        title: "Logout error",
        description: "There was a problem signing you out. Please try again.",
        variant: "destructive",
      });
    }
  };

  return (
    <div className="flex flex-col h-dvh">
      <header className="shrink-0 border-b px-4 py-2 bg-background">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            {!isAndroidWrapper && (
              <Sheet open={menuOpen} onOpenChange={setMenuOpen}>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" aria-label="Open navigation menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="flex flex-col overflow-y-auto">
                  <SheetHeader><SheetTitle>Navigation</SheetTitle></SheetHeader>
                  <SidebarNav onNavigate={() => setMenuOpen(false)} />
                </SheetContent>
              </Sheet>
            )}
            <Link href="/">
              <div className="h-10 w-auto cursor-pointer hover:scale-105">
                {appearance?.darkMode ? (
                  <img 
                    src="/images/joinup-logo-dark.png"
                    alt="JoinUp Logo - Dark Mode"
                    className="h-10"
                  />
                ) : (
                  <img 
                    src="/images/joinup-logo.png"
                    alt="JoinUp Logo - Light Mode"
                    className="h-10"
                  />
                )}
              </div>
            </Link>
          </div>

          <div className="flex items-center gap-2">
            {/* Dark mode toggle button */}
            <Button 
              variant="ghost" 
              size="icon" 
              onClick={toggleDarkMode}
              title={appearance?.darkMode ? "Switch to light mode" : "Switch to dark mode"}
            >
              {appearance?.darkMode ? (
                <Sun className="h-5 w-5" />
              ) : (
                <Moon className="h-5 w-5" />
              )}
            </Button>
            
            {user ? (
              <>
                <NotificationDropdown />
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button variant="outline" className="gap-2">
                      <UserIcon className="w-4 h-4" />
                      <span className="hidden sm:inline">{user.username}</span>
                      <ChevronDown className="w-4 h-4" />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="end" className="w-48">
                    <DropdownMenuLabel className="flex flex-col">
                      <span>Hello, {user.displayName || user.username}!</span>
                      {user.displayName && (
                        <span className="text-xs text-muted-foreground">@{user.username}</span>
                      )}
                    </DropdownMenuLabel>
                    <DropdownMenuSeparator />
                    <Link href="profile">
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <UserIcon className="w-4 h-4" />
                        Profile
                      </DropdownMenuItem>
                    </Link>
                    <Link href="settings">
                      <DropdownMenuItem className="gap-2 cursor-pointer">
                        <Settings className="w-4 h-4" />
                        Settings
                      </DropdownMenuItem>
                    </Link>
                    <DropdownMenuItem onClick={handleLogout} className="gap-2 text-destructive cursor-pointer">
                      <LogOut className="w-4 h-4" />
                      Sign Out
                    </DropdownMenuItem>
                  </DropdownMenuContent>
                </DropdownMenu>
              </>
            ) : (
              <Link href="auth">
                <Button variant="outline" size="sm" className="gap-2">
                  <LogIn className="w-4 h-4" />
                  <span className="hidden sm:inline">Sign In</span>
                  <span className="sm:hidden">Login</span>
                </Button>
              </Link>
            )}
          </div>
        </div>
      </header>
      <div className="flex flex-1 min-h-0 overflow-hidden">
        {!isAndroidWrapper && <SidebarNav className="hidden md:flex w-64 flex-shrink-0" />}
        <main className="flex-1 min-w-0 overflow-auto">
          {children}
        </main>
      </div>
    </div>
  );
}