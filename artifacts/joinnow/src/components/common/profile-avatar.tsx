import React from 'react';
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';

// Helper function to get initials from a name string
function getInitials(name: string = ''): string {
  return name
    .split(' ')
    .map(part => part[0])
    .join('')
    .toUpperCase()
    .substring(0, 2);
}

interface ProfileAvatarProps {
  profilePicture?: string | null;
  username: string;
  displayName?: string | null;
  className?: string;
  size?: 'sm' | 'md' | 'lg';
  onClick?: () => void;
}

/**
 * A reusable component that displays a user's profile picture or their initials as a fallback
 */
export function ProfileAvatar({ 
  profilePicture, 
  username, 
  displayName, 
  className = "", 
  size = 'md',
  onClick
}: ProfileAvatarProps) {
  // Determine the size class
  const sizeClass = {
    'sm': 'h-8 w-8',
    'md': 'h-10 w-10',
    'lg': 'h-12 w-12'
  }[size];
  
  // Handle null values for displayName and profilePicture
  const safeName = displayName || username;
  const safePicture = profilePicture || undefined;
  
  return (
    <Avatar 
      className={`${sizeClass} ${className}`} 
      onClick={onClick}
      style={onClick ? { cursor: 'pointer' } : undefined}
    >
      {safePicture ? (
        <AvatarImage 
          src={safePicture} 
          alt={safeName}
          className="object-cover"
        />
      ) : null}
      <AvatarFallback>{getInitials(safeName)}</AvatarFallback>
    </Avatar>
  );
}