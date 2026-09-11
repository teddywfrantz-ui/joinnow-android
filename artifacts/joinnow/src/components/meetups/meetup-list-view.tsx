import { type Meetup } from '@db/schema';
import { MeetupCard } from './meetup-card';
import { ScrollArea } from "@/components/ui/scroll-area";

interface MeetupListViewProps {
  meetups: Meetup[];
  currentUser?: { id: number; username: string } | null;
  activeMeetupId?: number;
  pendingRequestIds?: number[];
  onAfterJoin?: () => void;
}

export function MeetupListView({
  meetups,
  currentUser,
  activeMeetupId,
  pendingRequestIds = [],
  onAfterJoin
}: MeetupListViewProps) {
  
  // Debug log for meetups in list view
  console.log("MeetupListView rendering with:", {
    meetupCount: meetups.length,
    meetupIds: meetups.map(m => m.id)
  });
  // Additional debug log
  console.log("MeetupListView rendering with meetups:", {
    meetupCount: meetups?.length || 0,
    meetupIds: meetups?.map(m => m.id) || []
  });
  
  if (!meetups || meetups.length === 0) {
    console.log("Showing empty list view message - no meetups available");
    return (
      <div className="flex items-center justify-center h-[calc(100vh-10rem)] bg-muted/50">
        <p className="text-muted-foreground">No Meets found in this area</p>
      </div>
    );
  }

  // Sort meetups: active meetup first, then the rest in their original order
  const sortedMeetups = [...meetups].sort((a, b) => {
    if (a.id === activeMeetupId) return -1;
    if (b.id === activeMeetupId) return 1;
    return 0;
  });

  return (
    <ScrollArea className="h-[calc(100vh-10rem)]">
      <div className="space-y-4 p-4">
        {sortedMeetups.map((meetup) => (
          <MeetupCard
            key={meetup.id}
            meetup={meetup}
            currentUser={currentUser}
            onAfterJoin={onAfterJoin}
            showPendingRequests={pendingRequestIds?.includes(meetup.id)}
            activeMeetupId={activeMeetupId}
          />
        ))}
      </div>
    </ScrollArea>
  );
}