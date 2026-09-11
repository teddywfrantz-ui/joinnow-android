import { useState } from "react";
import { Dialog, DialogContent } from "@/components/ui/dialog";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ProfilePictureFullScreenModalProps {
  profilePictureUrl?: string | null;
  username: string;
  displayName?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfilePictureFullScreenModal({
  profilePictureUrl,
  username,
  displayName,
  open,
  onOpenChange
}: ProfilePictureFullScreenModalProps) {
  if (!profilePictureUrl) return null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent 
        className="sm:max-w-[90vw] sm:max-h-[90vh] md:max-w-[80vw] md:max-h-[80vh] p-0 border-none bg-transparent shadow-none"
        aria-describedby="profile-picture-fullscreen-description"
      >
        <div 
          id="profile-picture-fullscreen-description" 
          className="sr-only"
        >
          Full screen view of profile picture for {displayName || username}
        </div>
        
        {/* Close button positioned in the top-right corner */}
        <Button
          variant="outline"
          size="icon"
          className="absolute top-2 right-2 z-10 bg-background/80 backdrop-blur-sm border rounded-full hover:bg-background/90"
          onClick={() => onOpenChange(false)}
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </Button>
        
        {/* The image container with centering and responsive sizing */}
        <div className="w-full h-full flex items-center justify-center bg-black/50 backdrop-blur-md p-4 rounded-lg">
          <img
            src={profilePictureUrl}
            alt={`${displayName || username}'s profile picture`}
            className="max-w-full max-h-[70vh] object-contain rounded-md border-2 border-white/20"
          />
        </div>
      </DialogContent>
    </Dialog>
  );
}