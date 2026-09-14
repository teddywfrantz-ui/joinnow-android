import { Link, useLocation } from "wouter";
import {
  Map,
  MessageSquare,
  MoreHorizontal,
  Settings,
  Star,
  Trophy,
  UserCircle,
  UserCircle2,
  Users2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from "@/components/ui/sheet";
import { useState } from "react";

const primaryItems = [
  { title: "Map", href: "/map", icon: Map },
  { title: "Active", href: "/active-meet", icon: Star },
  { title: "Messages", href: "/messages", icon: MessageSquare },
  { title: "Group", href: "/groups", icon: Users2 },
];

const moreItems = [
  { title: "Profile", href: "/profile", icon: UserCircle },
  { title: "Friends", href: "/friends", icon: UserCircle2 },
  { title: "Leaderboards", href: "/leaderboards", icon: Trophy },
  { title: "Settings", href: "/settings", icon: Settings },
];

export function MobileBottomNav() {
  const [location] = useLocation();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreIsActive = moreItems.some((item) => location === item.href);

  return (
    <nav
      data-join-now-mobile-bottom-nav
      className="fixed inset-x-0 bottom-0 z-[60] grid h-[calc(4rem+env(safe-area-inset-bottom))] grid-cols-5 border-t bg-background/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-2px_10px_rgba(0,0,0,0.06)] backdrop-blur md:hidden"
    >
      {primaryItems.map((item) => {
        const isActive =
          location === item.href || (item.href === "/map" && location === "/");
        return (
          <Link key={item.href} href={item.href}>
            <Button
              variant="ghost"
              className={cn(
                "h-16 w-full min-w-0 flex-col gap-1 rounded-none px-1 text-[11px]",
                isActive
                  ? "bg-primary/5 text-primary"
                  : "text-muted-foreground"
              )}
            >
              <item.icon className="h-5 w-5" />
              <span className="truncate">{item.title}</span>
            </Button>
          </Link>
        );
      })}

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            className={cn(
              "h-16 w-full min-w-0 flex-col gap-1 rounded-none px-1 text-[11px]",
              moreIsActive
                ? "bg-primary/5 text-primary"
                : "text-muted-foreground"
            )}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span>More</span>
          </Button>
        </SheetTrigger>
        <SheetContent side="bottom" className="rounded-t-2xl pb-8">
          <SheetHeader>
            <SheetTitle>More</SheetTitle>
          </SheetHeader>
          <div className="mt-4 grid grid-cols-2 gap-3">
            {moreItems.map((item) => (
              <Link key={item.href} href={item.href}>
                <Button
                  variant={location === item.href ? "secondary" : "outline"}
                  className="h-14 w-full justify-start gap-3"
                  onClick={() => setMoreOpen(false)}
                >
                  <item.icon className="h-5 w-5" />
                  {item.title}
                </Button>
              </Link>
            ))}
          </div>
        </SheetContent>
      </Sheet>
    </nav>
  );
}