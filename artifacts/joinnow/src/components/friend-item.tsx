import { UserX } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { User } from "@db/schema";
import { ProfileAvatar } from "@/components/common/profile-avatar";

interface FriendItemProps {
  friend: User;
  onRemove: (friendId: number) => void;
}

export function FriendItem({ friend, onRemove }: FriendItemProps) {
  return (
    <div className="flex items-center justify-between py-2 px-4">
      <div className="flex items-center gap-2">
        <ProfileAvatar
          profilePicture={friend.profilePicture}
          username={friend.username}
          size="sm"
          className="flex-shrink-0"
        />
        <p className="font-medium">{friend.username}</p>
      </div>
      <Button
        variant="destructive"
        size="sm"
        className="flex-shrink-0 h-7 w-7 p-0"
        onClick={() => onRemove(friend.id)}
      >
        <UserX className="h-4 w-4" />
      </Button>
    </div>
  );
}