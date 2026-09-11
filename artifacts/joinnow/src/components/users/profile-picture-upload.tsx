import { useState, useRef } from "react";
import { Camera, Upload, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Avatar, AvatarImage, AvatarFallback } from "@/components/ui/avatar";
import { useToast } from "@/hooks/use-toast";
import { ProfileAvatar } from "@/components/common/profile-avatar";

interface ProfilePictureUploadProps {
  currentProfilePicture?: string | null;
  onChange: (pictureUrl: string | null) => void;
  username: string;
}

export function ProfilePictureUpload({
  currentProfilePicture,
  onChange,
  username,
}: ProfilePictureUploadProps) {
  const [previewUrl, setPreviewUrl] = useState<string | null>(currentProfilePicture || null);
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleFileChange = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    // Validate file type
    const validTypes = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!validTypes.includes(file.type)) {
      toast({
        title: "Invalid file type",
        description: "Please upload a valid image file (JPEG, PNG, GIF, or WEBP).",
        variant: "destructive",
      });
      return;
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast({
        title: "File too large",
        description: "Please upload an image smaller than 5MB.",
        variant: "destructive",
      });
      return;
    }

    // Create a preview URL
    const objectUrl = URL.createObjectURL(file);
    setPreviewUrl(objectUrl);

    // Upload the file
    await uploadFile(file);

    // Clean up the preview URL when component unmounts
    return () => URL.revokeObjectURL(objectUrl);
  };

  const uploadFile = async (file: File) => {
    setIsUploading(true);
    try {
      // Convert file to base64 to send in JSON payload
      const reader = new FileReader();
      
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          if (typeof reader.result === 'string') {
            resolve(reader.result);
          } else {
            reject(new Error('Failed to convert image to base64'));
          }
        };
        reader.onerror = () => {
          reject(new Error('Failed to read file'));
        };
      });
      
      reader.readAsDataURL(file);
      const base64Image = await base64Promise;
      
      const response = await fetch("/api/users/profile-picture", {
        method: "POST",
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ profilePicture: base64Image }),
      });

      if (!response.ok) {
        throw new Error("Failed to upload profile picture");
      }

      const data = await response.json();
      // Use the actual profile picture URL from the response or the base64 data
      onChange(data.profilePicture || base64Image);
      
      toast({
        title: "Profile picture updated",
        description: "Your profile picture has been updated successfully.",
      });
    } catch (error) {
      console.error("Error uploading profile picture:", error);
      toast({
        title: "Upload failed",
        description: error instanceof Error ? error.message : "Failed to upload profile picture",
        variant: "destructive",
      });
      // Reset the preview if upload fails
      setPreviewUrl(currentProfilePicture || null);
    } finally {
      setIsUploading(false);
    }
  };

  const handleRemovePicture = async () => {
    setIsUploading(true);
    try {
      const response = await fetch("/api/users/profile-picture", {
        method: "DELETE",
      });

      if (!response.ok) {
        throw new Error("Failed to remove profile picture");
      }

      setPreviewUrl(null);
      onChange(null);
      
      toast({
        title: "Profile picture removed",
        description: "Your profile picture has been removed.",
      });
    } catch (error) {
      console.error("Error removing profile picture:", error);
      toast({
        title: "Failed to remove profile picture",
        description: error instanceof Error ? error.message : "An error occurred",
        variant: "destructive",
      });
    } finally {
      setIsUploading(false);
    }
  };

  const triggerFileInput = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="flex flex-col items-center py-4">
      <div className="relative mb-4">
        {previewUrl ? (
          <div className="cursor-pointer group">
            <div className="relative">
              <ProfileAvatar
                profilePicture={previewUrl}
                username={username}
                className="h-24 w-24 border-2 border-primary/20 group-hover:border-primary/50 transition duration-200"
                size="lg"
              />
            </div>
            <Button
              type="button"
              size="icon"
              variant="destructive"
              className="absolute -top-2 -right-2 h-7 w-7 rounded-full"
              onClick={handleRemovePicture}
              disabled={isUploading}
            >
              <X className="h-4 w-4" />
              <span className="sr-only">Remove profile picture</span>
            </Button>
          </div>
        ) : (
          <ProfileAvatar
            profilePicture={null}
            username={username}
            className="h-24 w-24 border-2 border-primary/20"
            size="lg"
          />
        )}
      </div>

      <div className="space-y-2 text-center">
        <input
          ref={fileInputRef}
          type="file"
          accept="image/*"
          onChange={handleFileChange}
          className="hidden"
          aria-label="Upload profile picture"
        />
        
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="flex gap-2"
          onClick={triggerFileInput}
          disabled={isUploading}
        >
          {isUploading ? (
            <div className="animate-spin">◌</div>
          ) : (
            <Camera className="h-4 w-4" />
          )}
          {previewUrl ? "Change picture" : "Upload picture"}
        </Button>
        
        <p className="text-xs text-muted-foreground">
          JPG, PNG or GIF. Maximum 5MB.
        </p>
      </div>
    </div>
  );
}