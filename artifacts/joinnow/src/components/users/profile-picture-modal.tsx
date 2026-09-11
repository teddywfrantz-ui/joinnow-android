import { useState } from "react";
import { User } from "lucide-react";
import { ProfileAvatar } from "@/components/common/profile-avatar";
import { UserProfileModal } from "@/components/users/user-profile-modal";

interface ProfilePictureModalProps {
  profilePictureUrl?: string | null;
  username: string;
  displayName?: string;
  size?: "sm" | "md" | "lg" | "xl";
  trigger?: React.ReactNode;
  userId?: number | null;
  onClick?: () => void;
}

export function ProfilePictureModal({
  profilePictureUrl,
  username,
  displayName,
  size = "md",
  trigger,
  userId,
  onClick
}: ProfilePictureModalProps) {
  const [showUserProfile, setShowUserProfile] = useState(false);
  
  const sizeClasses = {
    sm: "h-10 w-10",
    md: "h-16 w-16",
    lg: "h-24 w-24",
    xl: "h-32 w-32"
  };

  // Handle click without triggering modals if custom onClick is provided
  const handleClick = () => {
    if (onClick) {
      onClick();
    } else if (userId) {
      setShowUserProfile(true);
    }
  };

  // If we don't have a userId, this will just show a profile picture without opening a modal
  if (!userId && !onClick) {
    return trigger || (
      <div className="relative">
        <ProfileAvatar
          profilePicture={profilePictureUrl}
          username={username}
          displayName={displayName}
          className={`${sizeClasses[size]} border-2 border-primary/20 transition duration-200 ease-in-out hover:border-primary/50`}
          size={size === "sm" ? "sm" : size === "md" ? "md" : "lg"}
        />
      </div>
    );
  }

  return (
    <>
      {trigger || (
        <div 
          className="cursor-pointer relative group"
          onClick={handleClick}
        >
          <ProfileAvatar
            profilePicture={profilePictureUrl}
            username={username}
            displayName={displayName}
            className={`${sizeClasses[size]} border-2 border-primary/20 transition duration-200 ease-in-out group-hover:border-primary/50`}
            size={size === "sm" ? "sm" : size === "md" ? "md" : "lg"}
          />
          {userId && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/30 rounded-full opacity-0 group-hover:opacity-100 transition-opacity">
              <User className="h-5 w-5 text-white" />
            </div>
          )}
        </div>
      )}
      
      {userId && (
        <UserProfileModal
          userId={userId}
          open={showUserProfile}
          onOpenChange={setShowUserProfile}
        />
      )}
    </>
  );
}