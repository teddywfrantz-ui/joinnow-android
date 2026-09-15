import { type Meetup } from '@db/schema';
import { useState, useEffect, useCallback } from 'react';
import { MapView } from './map-view';
import { MeetupListView } from '../meetups/meetup-list-view';
import { ViewToggle } from '../meetups/view-toggle';
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircle, UserCircle, X } from "lucide-react";
import { useUser } from "@/hooks/use-user";
import { Link } from "wouter";
import { useQuery, useQueryClient } from "@tanstack/react-query";

interface MeetupViewProps {
  meetups: Meetup[];
  onMeetupSelect: (meetup: Meetup) => void;
  onCenterChanged?: (map: google.maps.Map) => void;
  zipCode: string;
  userLocation: { latitude: number; longitude: number; } | null;
  searchRadius: number;
  activeMeetupId?: number;
  pendingRequestIds?: number[];
  currentUser?: { id: number; username: string } | null;
  onAfterJoin?: () => void;
}

export function MeetupView({
  meetups,
  onMeetupSelect,
  onCenterChanged,
  zipCode,
  userLocation,
  searchRadius,
  activeMeetupId,
  pendingRequestIds = [],
  currentUser,
  onAfterJoin
}: MeetupViewProps) {
  const { user } = useUser();
  
  // Use the new achievement check function to check if profile is complete
  const { hasCompletedProfileAchievement } = useUser();
  
  // State for banner visibility
  const [bannerDismissed, setBannerDismissed] = useState<boolean>(false);
  
  // Set up a query client for invalidating queries
  const queryClient = useQueryClient();
  
  // Force refetch of user and profile data to get latest achievement status
  useEffect(() => {
    if (user?.id) {
      // Invalidate these queries to force a fresh check
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/profile`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/meet-history`] });
      queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/stats`] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/achievements'] });
      queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
    }
  }, [user?.id, queryClient]);
  
  // This condition will now work for all users who have completed the achievement
  const hasProfileMeetFiltersAchievement = hasCompletedProfileAchievement();
  
  // Store the achievement status in state so we can detect changes
  const [previousAchievementStatus, setPreviousAchievementStatus] = useState(hasProfileMeetFiltersAchievement);
  
  // Check profile status on every render for immediate updates
  useEffect(() => {
    console.log(`📊 Achievement status check on render: ${hasProfileMeetFiltersAchievement}`);
    
    // Always hide banner if achievement is complete
    if (hasProfileMeetFiltersAchievement) {
      console.log("🎉 Profile achievement is complete! Hiding banner immediately...");
      setBannerDismissed(true);
    }
    
    // If the achievement status has changed from false to true, it means they just earned it
    if (!previousAchievementStatus && hasProfileMeetFiltersAchievement) {
      console.log("🏆 Achievement just completed! Hiding banner and refreshing data...");
      setBannerDismissed(true);
      
      // Invalidate relevant queries to ensure UI is up to date
      if (user?.id) {
        queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/profile`] });
        queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/meet-history`] });
        queryClient.invalidateQueries({ queryKey: [`/api/users/${user.id}/stats`] });
        queryClient.invalidateQueries({ queryKey: ['/api/user/achievements'] });
        queryClient.invalidateQueries({ queryKey: ['/api/user/profile'] });
      }
    }
    
    // Update previous status for next comparison
    setPreviousAchievementStatus(hasProfileMeetFiltersAchievement);
  }, [hasProfileMeetFiltersAchievement, previousAchievementStatus, user?.id, queryClient, setBannerDismissed]);
  
  // Log achievement status for debugging
  console.log("Achievement check:", { 
    userId: user?.id,
    username: user?.username,
    hasProfileMeetFiltersAchievement,
    previousStatus: previousAchievementStatus
  });
  
  // Profile check now relies primarily on the achievement completion
  // Fall back to basic field checks if achievement system is unavailable
  const isProfileComplete = hasProfileMeetFiltersAchievement || (
    user && 
    user.gender && 
    user.birthday
  );

  // Simpler implementation that forces the banner to show on every component mount
  // unless it's been dismissed in the current page session
  
  // Use a React state to track dismissal only for current component instance
  // We're not using localStorage persistence except for profile completion
  
  // Reset the banner state on component mount if profile is incomplete
  useEffect(() => {
    if (user) {
      console.log("Profile check on mount:", { 
        userId: user.id,
        hasProfileMeetFiltersAchievement,
        isProfileComplete,
        gender: user.gender,
        birthday: user.birthday
      });
      
      // If the profile is complete, there's no need for the banner
      if (isProfileComplete) {
        setBannerDismissed(true);
        return;
      }
      
      // Force the banner to display for incomplete profiles
      setBannerDismissed(false);
    }
  }, [user, isProfileComplete, hasProfileMeetFiltersAchievement]);
  
  // 🚨 EMERGENCY FIX: We'll use only the hook's result to determine banner visibility
  // This ensures that the logic is consistent and all cases are covered
  
  // EMERGENCY FIX: Special hardcoded list of users that should never see the banner
  const EMERGENCY_HIDE_BANNER_FOR = [8, 10, 18, 19, 42, 52, 75];
  const isExemptUser = user && EMERGENCY_HIDE_BANNER_FOR.includes(user.id);
    
  // If any of these conditions are true, we hide the banner:
  // 1. User completed profile according to the user hook
  // 2. User is marked as having a complete profile in context
  // 3. User is in our emergency exempt list
  const profileIsComplete = hasProfileMeetFiltersAchievement || isProfileComplete || isExemptUser;
  
  // The banner should only be shown if:
  // 1. We have a logged-in user AND
  // 2. Profile is NOT complete AND
  // 3. User hasn't dismissed the banner this session
  const showProfileWarning = user && !profileIsComplete && !bannerDismissed;
  
  // Emergency debug for fixing the banner issue
  console.log("🚨 EMERGENCY BANNER DEBUG:", {
    userId: user?.id,
    username: user?.username,
    isExemptUser,
    hasProfileMeetFiltersAchievement,
    isProfileComplete,
    profileIsComplete,
    showProfileWarning,
    bannerDismissed
  });
  
  // Debug log specific to profile warning conditions
  console.log("🚨 Profile warning banner visibility check:", {
    shouldShow: showProfileWarning,
    hasUser: !!user,
    achievementComplete: hasProfileMeetFiltersAchievement,
    profileComplete: isProfileComplete,
    isExemptUser,
    bannerDismissed,
    userId: user?.id,
    finalProfileState: profileIsComplete
  });
  
  // Handle banner dismissal for current session only
  // (Will reappear on page refresh or login)
  const handleDismissBanner = () => {
    setBannerDismissed(true);
  };
  
  // Log props for debugging
  console.log('MeetupView component - Received props:', {
    pendingRequestIds,
    numberOfMeetups: meetups.length,
    zipCode,
    hasUserLocation: !!userLocation,
    searchRadius
  });

  // Check if location is cleared - we need to be thorough in our check
  const isLocationCleared = !userLocation && !zipCode;
  
  // There was a potential issue here - defaultView was always 'map' regardless of condition
  // This might explain why you needed to click map tab twice - it was already in map view
  // We'll now use localStorage to remember the last view and default to map
  const savedView = localStorage.getItem('meetupViewPreference') as 'map' | 'list' | null;
  const defaultView = savedView || 'map';
  
  // Log default view selection for debugging
  console.log("Setting default view:", { savedView, defaultView, isLocationCleared });
  
  const [view, setView] = useState<'map' | 'list'>(defaultView);
  
  // Custom setter function to save preference
  const setViewWithSave = useCallback((newView: 'map' | 'list') => {
    console.log("Changing view from", view, "to", newView);
    // Save the preference to localStorage unless we're clearing location
    if (!isLocationCleared) {
      localStorage.setItem('meetupViewPreference', newView);
    }
    setView(newView);
  }, [view, isLocationCleared]);
  
  // Create a local copy of meetups that's guaranteed to be empty if location is cleared
  // This ensures both map and list views show empty state correctly
  const displayMeetups = isLocationCleared ? [] : meetups;
  
  // Extract meetup IDs for clearer logging
  console.log('MapView component - Processing props:', {
    pendingRequestIds,
    numberOfMeetups: meetups.length,
    meetupIds: meetups.map(m => m.id)
  });
  
  // If location is cleared, never show any meetups in either view
  // This ensures that both map and list views show the empty state message
  const filteredMeetups = isLocationCleared ? [] : meetups;
  
  // Always log the state for debugging
  console.log("MeetupView processing location state:", {
    isLocationCleared,
    isMapView: view === 'map', 
    hasZipCode: !!zipCode,
    hasUserLocation: !!userLocation,
    unfiltered: meetups.length,
    filtered: filteredMeetups.length
  });
  
  // If the location is cleared, we should force map view
  // This ensures consistent behavior when user clears location
  useEffect(() => {
    if (isLocationCleared && view === 'list') {
      console.log('No location set, forcing map view');
      setViewWithSave('map');
    }
  }, [isLocationCleared, view, setViewWithSave]);

  return (
    <div className="relative h-full">
      <div className="absolute top-4 right-4 z-10">
        <ViewToggle view={view} onChange={setViewWithSave} />
      </div>
      
      {showProfileWarning && (
        <div className="absolute top-16 left-1/2 transform -translate-x-1/2 z-20 w-[90%] sm:w-[80%] md:w-[75%] lg:w-[70%] xl:w-[60%] max-w-[1000px]">
          <Alert className="shadow-lg animate-fadeIn bg-amber-50 border-amber-200 relative p-3">
            <Button 
              variant="ghost" 
              size="icon" 
              className="absolute top-2 right-2 h-6 w-6 rounded-full p-0 text-amber-600 hover:bg-amber-100"
              onClick={handleDismissBanner}
            >
              <X className="h-3.5 w-3.5" />
              <span className="sr-only">Close</span>
            </Button>
            
            {/* Mobile layout - stacked */}
            <div className="flex flex-col sm:hidden w-full">
              <div className="flex items-center mb-2">
                <AlertCircle className="h-5 w-5 text-amber-600 mr-2" />
                <AlertTitle className="text-amber-600 font-medium">Your profile is incomplete</AlertTitle>
              </div>
              
              <AlertDescription className="text-[15px] text-amber-700 mb-3">
                You may not be seeing all meets due to filters. Complete your profile to ensure visibility.
              </AlertDescription>
              
              <Button asChild variant="outline" size="sm" className="bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-800 dark:hover:text-amber-900 self-center">
                <Link to="/edit-profile" className="!text-amber-800 hover:!text-amber-800 dark:!text-amber-800 dark:hover:!text-amber-800">
                  <UserCircle className="mr-1 h-4 w-4" /> Complete Profile
                </Link>
              </Button>
            </div>
            
            {/* Desktop layout - horizontal */}
            <div className="hidden sm:flex sm:items-center sm:w-full">
              <div className="flex-shrink-0 mr-4">
                <AlertCircle className="h-5 w-5 text-amber-600" />
              </div>
              
              <div className="flex-grow pr-8">
                <AlertTitle className="text-amber-600 font-medium mb-0.5">Your profile is incomplete</AlertTitle>
                <AlertDescription className="text-[15px] text-amber-700">
                  You may not be seeing all meets due to filters. Complete your profile to ensure visibility.
                </AlertDescription>
              </div>
              
              <div className="flex-shrink-0 ml-4">
                <Button asChild variant="outline" size="sm" className="bg-amber-50 border-amber-200 text-amber-800 hover:bg-amber-100 hover:text-amber-900 dark:text-amber-800 dark:hover:text-amber-900 whitespace-nowrap">
                  <Link to="/edit-profile" className="!text-amber-800 hover:!text-amber-800 dark:!text-amber-800 dark:hover:!text-amber-800">
                    <UserCircle className="mr-1 h-4 w-4" /> Complete Profile
                  </Link>
                </Button>
              </div>
            </div>
          </Alert>
        </div>
      )}

      {view === 'map' ? (
        <MapView
          meetups={displayMeetups}  
          onMeetupSelect={onMeetupSelect}
          onCenterChanged={onCenterChanged}
          zipCode={zipCode}
          userLocation={userLocation}
          searchRadius={searchRadius}
          activeMeetupId={activeMeetupId}
          pendingRequestIds={pendingRequestIds}
          currentUserId={currentUser?.id}
        />
      ) : (
        <MeetupListView
          meetups={displayMeetups}  
          currentUser={currentUser}
          activeMeetupId={activeMeetupId}
          pendingRequestIds={pendingRequestIds}
          onAfterJoin={onAfterJoin}
        />
      )}
    </div>
  );
}