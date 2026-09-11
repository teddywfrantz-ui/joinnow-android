import { useState } from 'react';
import { Bell } from 'lucide-react';
import { formatDistanceToNow } from 'date-fns';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Loader2 } from 'lucide-react';
import { useNotifications } from '@/hooks/use-notifications';
import { useUser } from '@/hooks/use-user';

export function NotificationsDropdown() {
  const { notifications, unseenCount, isLoading, handleNotificationClick } = useNotifications();
  const { user } = useUser();
  const [open, setOpen] = useState(false);

  // Don't render anything if user is not logged in
  if (!user) return null;

  return (
    <DropdownMenu open={open} onOpenChange={setOpen}>
      <DropdownMenuTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-5 w-5" />
          {unseenCount > 0 && (
            <div className="absolute -top-1 -right-1 h-4 w-4 rounded-full bg-primary text-[10px] font-medium text-primary-foreground flex items-center justify-center">
              {unseenCount}
            </div>
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <div className="p-2 font-medium border-b">Notifications</div>
        <ScrollArea className="h-[300px]">
          {isLoading ? (
            <div className="flex items-center justify-center p-4">
              <Loader2 className="h-4 w-4 animate-spin" />
            </div>
          ) : !notifications || notifications.length === 0 ? (
            <div className="flex items-center justify-center text-sm text-muted-foreground p-8">
              <div className="text-center">
                <Bell className="h-8 w-8 mx-auto mb-2 text-muted-foreground/50" />
                <p>No new notifications</p>
              </div>
            </div>
          ) : (
            <div className="px-2">
              {notifications.map((notification) => (
                <DropdownMenuItem
                  key={notification.id}
                  className="flex flex-col items-start gap-1 p-2 cursor-pointer"
                  onSelect={() => handleNotificationClick(notification)}
                >
                  <div className="font-medium">
                    {notification.title}
                  </div>
                  <div className="text-sm text-foreground/80">
                    {notification.message}
                  </div>
                  <div className="text-xs text-muted-foreground">
                    {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                  </div>
                </DropdownMenuItem>
              ))}
            </div>
          )}
        </ScrollArea>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}