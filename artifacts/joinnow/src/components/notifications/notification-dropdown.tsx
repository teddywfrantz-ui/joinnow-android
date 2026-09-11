import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useNotifications } from "@/hooks/use-notifications";
import { formatDistanceToNow } from "date-fns";
import { ScrollArea } from "@/components/ui/scroll-area";
import { useLocation } from "wouter";
import { useToast } from "@/hooks/use-toast";

export function NotificationDropdown() {
  const { notifications, unseenCount, isLoading, handleNotificationClick, markAllAsRead } = useNotifications();
  const [open, setOpen] = useState(false);
  const [isMarkingAllRead, setIsMarkingAllRead] = useState(false);
  const [, setLocation] = useLocation();
  const { toast } = useToast();

  const handleMarkAllAsRead = async () => {
    try {
      setIsMarkingAllRead(true);
      const result = await markAllAsRead();
      toast({
        title: "Success",
        description: `Marked ${result.count} notifications as read`,
      });
    } catch (error) {
      toast({
        title: "Error",
        description: "Failed to mark notifications as read",
        variant: "destructive",
      });
    } finally {
      setIsMarkingAllRead(false);
    }
  };

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unseenCount > 0 && (
            <span className="absolute -top-1 -right-1 h-5 w-5 rounded-full bg-primary text-primary-foreground text-xs flex items-center justify-center">
              {unseenCount}
            </span>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2 font-medium border-b flex items-center justify-between">
          <span>Notifications</span>
          {notifications?.length > 0 && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-xs gap-1"
              onClick={handleMarkAllAsRead}
              disabled={isMarkingAllRead}
            >
              <Check className="h-3 w-3" />
              Mark all as read
            </Button>
          )}
        </div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <DropdownMenuItem disabled>Loading notifications...</DropdownMenuItem>
          ) : !notifications?.length ? (
            <div className="flex items-center justify-center text-sm text-muted-foreground p-8">
              <div className="text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>No notifications</p>
              </div>
            </div>
          ) : (
            notifications.map((notification) => (
              <DropdownMenuItem
                key={notification.id}
                className={`flex flex-col items-start gap-1 p-4 cursor-pointer ${!notification.isSeen ? 'bg-primary/5' : ''}`}
                onSelect={() => {
                  setOpen(false);
                  if (notification.link) {
                    // Remove the leading slash if present
                    const path = notification.link.startsWith('/') 
                      ? notification.link.substring(1) 
                      : notification.link;
                    setLocation(path);
                  }
                  handleNotificationClick(notification);
                }}
              >
                <div className="font-semibold">{notification.title}</div>
                <div className="text-sm text-muted-foreground">{notification.message}</div>
                <div className="text-xs text-muted-foreground">
                  {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                </div>
              </DropdownMenuItem>
            ))
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}