import { Link, useLocation } from "wouter";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Map,
  Settings,
  Star,
  Users2,
  UserCircle2,
  UserCircle,
  Trophy,
  MessageSquare,
} from "lucide-react";

interface SidebarNavProps extends React.HTMLAttributes<HTMLElement> {
  className?: string;
  onNavigate?: () => void;
}

export function SidebarNav({ className, onNavigate, ...props }: SidebarNavProps) {
  const [location] = useLocation();

  const navItems = [
    {
      title: "Map",
      icon: Map,
      href: "map",
      description: "Discover nearby Meets",
      iconColor: "text-blue-500"
    },
    {
      title: "Active",
      icon: Star,
      href: "active-meet",
      description: "Current Meet details",
      iconColor: "text-yellow-500"
    },
    {
      title: "Messages",
      icon: MessageSquare,
      href: "messages",
      description: "Group and Meet conversations",
      iconColor: "text-indigo-500"
    },
    {
      title: "Profile",
      icon: UserCircle,
      href: "profile",
      description: "Your profile settings",
      iconColor: "text-cyan-500"
    },
    {
      title: "Friends",
      icon: UserCircle2,
      href: "friends",
      description: "View and manage friends",
      iconColor: "text-green-500"
    },
    {
      title: "Group",
      icon: Users2,
      href: "groups",
      description: "Your Meet groups",
      iconColor: "text-purple-500"
    },
    {
      title: "Leaderboards",
      icon: Trophy,
      href: "leaderboards",
      description: "View top users and rankings",
      iconColor: "text-amber-500"
    },
    {
      title: "Settings",
      icon: Settings,
      href: "settings",
      description: "Manage your account",
      iconColor: "text-gray-400"
    }
  ];

  const handleClick = () => {
    // Force a small delay to ensure the navigation state updates properly
    setTimeout(() => {
      if (onNavigate) {
        onNavigate();
      }
    }, 10);
  };

  return (
    <nav
      className={cn(
        "flex flex-col h-full bg-background",
        className
      )}
      {...props}
    >
      <div className="flex flex-col space-y-1 p-3">
        {navItems.map((item) => (
          <Link key={item.href} href={item.href}>
            <Button
              variant={location === `/${item.href}` ? "secondary" : "ghost"}
              className={cn(
                "w-full justify-start gap-2",
                location === `/${item.href}` && "bg-muted"
              )}
              onClick={handleClick}
            >
              <item.icon className={cn("h-4 w-4", item.iconColor)} />
              <span>{item.title}</span>
            </Button>
          </Link>
        ))}
      </div>
    </nav>
  );
}