import { useState, useEffect, useRef } from 'react';
import { MainLayout } from '@/components/layout/main-layout';
import { MeetupView } from '@/components/map/meetup-view';
import { MeetupCard } from '@/components/meetups/meetup-card';
import { CreateMeetupDialog } from '@/components/meetups/create-meetup-dialog';
import { ActiveMeetupPanel } from '@/components/meetups/active-meetup-panel';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useLocation, Link } from 'wouter';
import { useUser } from '@/hooks/use-user';
import { useMeetups } from '@/hooks/use-meetups';
import { usePendingRequests } from '@/hooks/use-pending-requests';
import { useActiveMeetup } from '@/hooks/use-active-meetup';
import { Loader2, Users, MapPin, LogIn, UserCircle2, StarIcon, Medal, ThumbsUp, Plus } from 'lucide-react';
import type { Meetup } from '@db/schema';
import { useToast } from '@/hooks/use-toast';
import { MeetupFilters, type MeetupFilters as MeetupFiltersType } from '@/components/meetups/meetup-filters';
import { formatDistanceToNow } from 'date-fns';
import { cn } from '@/lib/utils';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { FriendsTab } from '@/components/friends/friends-tab';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Card } from '@/components/ui/card';
import { Avatar } from '@/components/ui/avatar';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { LocationSearch } from "@/components/search/location-search";
import { GroupsTab } from "@/components/groups/groups-tab";


interface TraitCardProps {
  trait: any;
}

function TraitCard({ trait }: TraitCardProps) {
  const [showEndorsers, setShowEndorsers] = useState(false);

  return (
    <Card key={trait.traitId} className="p-4">
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-2">
            <h3 className="font-semibold text-lg">{trait.traitName}</h3>
            <Badge variant="secondary">{trait.traitCategory}</Badge>
          </div>
          <button
            onClick={() => setShowEndorsers(!showEndorsers)}
            className="flex items-center gap-2 mt-2 text-sm text-muted-foreground hover:text-foreground transition-colors"
          >
            <ThumbsUp className="w-4 h-4" />
            <span>{trait.endorsements}</span>
          </button>
          {showEndorsers && trait.endorsers?.length > 0 && (
            <div className="flex flex-wrap gap-1 mt-2">
              {trait.endorsers.map((endorser: string, i: number) => (
                <Badge key={i} variant="outline" className="text-xs">
                  {endorser}
                </Badge>
              ))}
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 3959; // Earth's radius in miles
  const lat1Rad = lat1 * Math.PI / 180;
  const lat2Rad = lat2 * Math.PI / 180;
  const deltaLat = (lat2 - lat1) * Math.PI / 180;
  const deltaLon = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(deltaLat / 2) * Math.sin(deltaLat / 2) +
    Math.cos(lat1Rad) * Math.cos(lat2Rad) *
    Math.sin(deltaLon / 2) * Math.sin(deltaLon / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in miles
}

interface Location {
  latitude: number;
  longitude: number;
}

function filterMeetups(
  meetups: Meetup[],
  filters: MeetupFiltersType,
  userLocation: Location | null,
  currentMapCenter: Location | null
): Meetup[] {
  // If no location is provided, return an empty array
  // This ensures that when location is cleared, both map and list views show no meetups
  if (!userLocation || !currentMapCenter) {
    console.log("No location available, returning empty meetups list");
    return [];
  }

  return meetups.filter(meetup => {
    // Filter by search query
    if (filters.searchQuery) {
      const searchQuery = filters.searchQuery.toLowerCase();
      const matchesTitle = meetup.title.toLowerCase().includes(searchQuery);
      const matchesDescription = meetup.description.toLowerCase().includes(searchQuery);
      if (!matchesTitle && !matchesDescription) return false;
    }

    // Filter by full meetups
    if (filters.hideFullMeetups && 
        meetup.participantCount !== undefined && 
        meetup.maxParticipants !== undefined && 
        meetup.participantCount >= meetup.maxParticipants) {
      return false;
    }

    // Filter by theme
    if (filters.selectedTheme && meetup.theme !== filters.selectedTheme) {
      return false;
    }

    // Filter by distance (always apply this filter when we have location)
    const distance = calculateDistance(
      meetup.latitude,
      meetup.longitude,
      currentMapCenter.latitude,
      currentMapCenter.longitude
    );
    
    if (distance > filters.searchRadiusMiles) return false;

    return true;
  });
}

interface ShowMeetupOptions {
  meetup: Meetup;
  showPendingRequests?: boolean;
}

function formatDate(dateInput: string | Date | null | undefined): string {
  if (!dateInput) return 'Unknown date';
  try {
    const date = typeof dateInput === 'string' ? new Date(dateInput) : dateInput;
    // Format: Mar 2, 2025 at 11:45 AM
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: 'numeric',
      minute: 'numeric',
      hour12: true
    }).format(date);
  } catch (error) {
    console.error('Error formatting date:', error);
    return 'Invalid date';
  }
}

export default function Home() {
  const queryClient = useQueryClient();
  // State hooks
  const [selectedMeetup, setSelectedMeetup] = useState<Meetup | null>(null);
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [groupIdForCreate, setGroupIdForCreate] = useState<number | null>(null);
  const [filters, setFilters] = useState<MeetupFiltersType>({
    searchQuery: '',
    hideFullMeetups: false,
    selectedTheme: undefined,
    searchRadiusMiles: 7
  });
  const [zipCode, setZipCode] = useState(() => localStorage.getItem('lastZipCode') || '');
  const [userLocation, setUserLocation] = useState<Location | null>(null);
  const [currentMapCenter, setCurrentMapCenter] = useState<Location | null>(null);
  const [isLoadingLocation, setIsLoadingLocation] = useState(true);
  const [locationError, setLocationError] = useState<string | null>(null);
  const [selectedMeetupOptions, setSelectedMeetupOptions] = useState<ShowMeetupOptions | null>(null);
  const [validPendingRequestIds, setValidPendingRequestIds] = useState<number[]>([]);
  const [isInitialLocationSet, setIsInitialLocationSet] = useState(false);

  // Custom hooks with proper user state handling
  const { user } = useUser();
  const [location, setLocation] = useLocation();
  const { meetups, isLoading: isLoadingMeetups } = useMeetups();
  const { activeMeetup, participants: activeMeetupParticipants, isLoading: isActiveMeetupLoading } = useActiveMeetup();
  const { toast } = useToast();
  const { pendingRequests } = usePendingRequests();
  const { data: currentGroups = [] } = useQuery<Array<{
    pendingMeetupRequests?: Array<{ meetupId: number }>;
  }>>({
    queryKey: ["/api/groups"],
    queryFn: async () => {
      const response = await fetch("/api/groups", { credentials: "include" });
      if (response.status === 401) return [];
      if (!response.ok) throw new Error("Failed to load current group");
      return response.json();
    },
    enabled: Boolean(user),
    staleTime: 0,
    refetchOnMount: true,
  });

  // Group creation arrives here through a real route intent rather than a
  // timeout tied to a component that may already have unmounted.  Consume the
  // query once the map route is active, then clean the URL without changing
  // the current screen.
  useEffect(() => {
    if (location.split("?")[0] !== "/map") return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("createMeetup") !== "1") return;
    const parsedGroupId = Number(params.get("groupId"));
    const nextGroupId =
      Number.isInteger(parsedGroupId) && parsedGroupId > 0
        ? parsedGroupId
        : null;
    setGroupIdForCreate(nextGroupId);
    setShowCreateDialog(true);
    window.history.replaceState({}, "", "/map");
  }, [location]);

  // Initialize location from stored geolocation-derived coordinates on component mount
  useEffect(() => {
    console.log('Initializing location - current state:', {
      isInitialLocationSet,
      currentZipCode: zipCode,
      hasUserLocation: !!userLocation
    });
    
    // Create a cleanup function for the beforeunload event
    const handleBeforeUnload = () => {
      // Only save location if it's from geolocation (not manually entered)
      if (userLocation && zipCode) {
        console.log('Storing user location for future sessions:', {
          zipCode, 
          latitude: userLocation.latitude, 
          longitude: userLocation.longitude
        });
        
        localStorage.setItem('lastZipCode', zipCode);
        localStorage.setItem('userLocationLat', userLocation.latitude.toString());
        localStorage.setItem('userLocationLng', userLocation.longitude.toString());
        localStorage.setItem('locationTimestamp', Date.now().toString());
      }
      
      // Clean up any manually entered zip codes
      if (!localStorage.getItem('userLocationLat') || !localStorage.getItem('userLocationLng')) {
        // If we don't have coordinates, we don't want to keep a zip that wasn't geolocation-derived
        localStorage.removeItem('lastZipCode');
      }
    };
    
    // Add event listener for page close/refresh
    window.addEventListener('beforeunload', handleBeforeUnload);
    
    // Only initialize location if it's not already set
    const initializeLocation = async () => {
      // Skip if location is already initialized
      if (isInitialLocationSet) return;
      
      console.log("Initializing location (not set yet)");
      
      // Try to restore the geocoded location from localStorage
      const storedZip = localStorage.getItem('lastZipCode');
      const storedLat = localStorage.getItem('userLocationLat');
      const storedLng = localStorage.getItem('userLocationLng');
      const storedTimestamp = localStorage.getItem('locationTimestamp');
      
      console.log('Retrieved values from localStorage:', {
        storedZip,
        storedLat,
        storedLng,
        storedTimestamp,
        hasAllValues: !!(storedZip && storedLat && storedLng)
      });
      
      // Only restore location if we have all values and they're recent (less than 24 hours old)
      const isRecent = storedTimestamp && (Date.now() - parseInt(storedTimestamp)) < 24 * 60 * 60 * 1000;
      
      if (storedZip && storedLat && storedLng && isRecent) {
        console.log('Restoring location from geolocation-derived coordinates', { storedZip, storedLat, storedLng });
        
        // Create location object from stored coordinates
        const restoredLocation = {
          latitude: parseFloat(storedLat),
          longitude: parseFloat(storedLng)
        };
        
        // Set all location states
        setZipCode(storedZip);
        setUserLocation(restoredLocation);
        setCurrentMapCenter(restoredLocation);
        setLocationError(null); // Clear any previous location errors
        
        console.log('Location restored from local storage:', {
          zip: storedZip,
          location: restoredLocation
        });
        
        // Mark as initialized immediately since we successfully loaded from storage
        setIsInitialLocationSet(true);
        setIsLoadingLocation(false);
        return; // Exit early - no need to try browser geolocation
      } else {
        console.log('No complete or recent location data found in localStorage, using browser geolocation');
        
        // Clean up any stale or partial location data
        if (!isRecent || (storedZip && (!storedLat || !storedLng))) {
          localStorage.removeItem('lastZipCode');
          localStorage.removeItem('userLocationLat');
          localStorage.removeItem('userLocationLng');
          localStorage.removeItem('locationTimestamp');
        }
        
        tryBrowserGeolocation();
      }
    };
    
    // Function to try browser geolocation
    // This is a separate function so we can call it both during initialization and when permission changes
    const tryBrowserGeolocation = async () => {
      // Try to get user's location automatically if browser supports it
      if (navigator.geolocation) {
        try {
          setIsLoadingLocation(true);
          console.log("Requesting browser geolocation...");
          
          // Wrap the geolocation call in a promise for cleaner handling
          const position = await new Promise<GeolocationPosition>((resolve, reject) => {
            // Set a longer timeout for geolocation to avoid quick failures
            navigator.geolocation.getCurrentPosition(
              resolve,
              reject,
              { timeout: GEOLOCATION_TIMEOUT, enableHighAccuracy: true, maximumAge: 0 }
            );
          });
          
          console.log('Successfully retrieved current position from browser:', {
            lat: position.coords.latitude,
            lng: position.coords.longitude
          });
          
          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };
          
          // Set the location immediately so the map can update
          setUserLocation(location);
          setCurrentMapCenter(location);
          setLocationError(null); // Clear any previous location errors
          console.log("User location set from browser geolocation");
          
          // Get ZIP code from coordinates - We'll use updateLocationAndZip instead
          // as it already has all the logic we need and is more robust
          await updateLocationAndZip(
            position.coords.latitude,
            position.coords.longitude
          );
        } catch (error) {
          console.error('Geolocation error:', error);
          setLocationError("Could not access your location. Please enter a ZIP code.");
          
          // If there's an error, try to load from localStorage as a fallback
          const storedZip = localStorage.getItem('lastZipCode');
          const storedLat = localStorage.getItem('userLocationLat');
          const storedLng = localStorage.getItem('userLocationLng');
          
          if (storedZip && storedLat && storedLng) {
            console.log('Falling back to stored location data after geolocation error');
            setZipCode(storedZip);
            setUserLocation({
              latitude: parseFloat(storedLat),
              longitude: parseFloat(storedLng)
            });
            setCurrentMapCenter({
              latitude: parseFloat(storedLat),
              longitude: parseFloat(storedLng)
            });
          } else {
            // Prompt user to enter ZIP code
            toast({
              title: "Location Error",
              description: "Could not determine your location. Please enter a ZIP code.",
              variant: "destructive",
              duration: 5000
            });
          }
        } finally {
          setIsLoadingLocation(false);
        }
      } else {
        console.log('Geolocation not supported by this browser');
        setLocationError("Your browser doesn't support geolocation. Please enter a ZIP code.");
        setIsLoadingLocation(false);
        
        // Show a more helpful message to the user
        toast({
          title: "Location Not Supported",
          description: "Your browser doesn't support geolocation. Please enter a ZIP code manually.",
          variant: "destructive",
          duration: 5000
        });
      }
      
      // Mark location as initialized regardless of success or failure
      setIsInitialLocationSet(true);
    };
    
    // Watch for permission changes
    const handlePermissionChange = (event: any) => {
      if (event.name === 'geolocation' && event.state === 'granted') {
        console.log('Geolocation permission just granted! Retrying geolocation...');
        // If not initialized yet, skip - the regular initialization will handle it
        if (!isInitialLocationSet) return;
        
        // If we suddenly got permission, try again to get the user's location
        tryBrowserGeolocation();
      }
    };
    
    // Add permission change listener and check initial permission state
    if (navigator.permissions && navigator.permissions.query) {
      navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
        console.log('Current geolocation permission state:', permissionStatus.state);
        
        // Set up change listener for future permission changes
        permissionStatus.addEventListener('change', handlePermissionChange);
        
        // If permission is already granted but we're initializing (like after a page refresh),
        // we should force a location check rather than relying on localStorage
        if (permissionStatus.state === 'granted' && !isInitialLocationSet) {
          console.log('Permission is already granted, prioritizing geolocation over localStorage');
          // Clear any stale localStorage data to force fresh geolocation
          localStorage.removeItem('lastZipCode');
          localStorage.removeItem('userLocationLat');
          localStorage.removeItem('userLocationLng');
          localStorage.removeItem('locationTimestamp');
        }
      }).catch(error => {
        console.error('Error setting up permission change listener:', error);
      });
    }
    
    // Call the initialization function
    initializeLocation();
    
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      
      // Remove permission change listener
      if (navigator.permissions && navigator.permissions.query) {
        navigator.permissions.query({ name: 'geolocation' }).then(permissionStatus => {
          permissionStatus.removeEventListener('change', handlePermissionChange);
        }).catch(() => {
          // Ignore errors on cleanup
        });
      }
    };
  }, [isInitialLocationSet]);


  // Get user's outgoing requests
  const { data: myPendingRequests = [] } = useQuery({
    queryKey: ['/api/my-pending-requests', user?.id],
    queryFn: async () => {
      console.log('Fetching my pending requests for user:', user?.id);
      if (!user) return [];

      try {
        const response = await fetch('/api/my-pending-requests', {
          credentials: 'include'
        });

        if (!response.ok) {
          if (response.status === 401) {
            console.log('Unauthorized to fetch pending requests');
            return [];
          }
          const errorText = await response.text();
          console.error('Failed to fetch pending requests:', errorText);
          throw new Error(errorText);
        }

        const data = await response.json();
        console.log('My pending requests API response:', {
          data,
          userId: user.id,
          endpoint: '/api/my-pending-requests'
        });
        return data;
      } catch (error) {
        console.error('Error in my pending requests query:', error);
        return [];
      }
    },
    enabled: !!user,
    placeholderData: [],
    gcTime: 0, // Don't keep stale data between sessions
  });

  // Update the useEffect that processes pending requests
  useEffect(() => {
    if (user) {
      console.log('Processing pending requests in Home:', {
        myPendingRequests,
        userId: user.id,
        activeMeetupId: activeMeetup?.id
      });

      // Check the structure of the pending request objects
      const requestIds = myPendingRequests.map((req: { meetup_id?: number; meetupId?: number }) => {
        console.log('Processing pending request:', req);
        // Try both possible field names
        const meetupId = req.meetup_id || req.meetupId;
        if (!meetupId) {
          console.warn('Missing meetup ID in pending request:', req);
        }
        return meetupId;
      }).filter(Boolean); // Remove any undefined values

      console.log('Setting pending request IDs in Home component:', {
        requestIds,
        myPendingRequests,
        user: user.id
      });

      // Always set the valid pending request IDs, even if there's an active meetup
      // This ensures the map markers and list items show the correct state
      setValidPendingRequestIds(requestIds);
    } else {
      console.log('Clearing pending request IDs: no user');
      setValidPendingRequestIds([]);
    }
  }, [user, myPendingRequests]);

  const groupPendingRequestIds = currentGroups.flatMap((group) =>
    (group.pendingMeetupRequests ?? []).map((request) => request.meetupId),
  );
  const allPendingRequestIds = Array.from(
    new Set([...validPendingRequestIds, ...groupPendingRequestIds]),
  );
  
  // Log current validPendingRequestIds for debugging
  useEffect(() => {
    console.log('Current validPendingRequestIds:', validPendingRequestIds);
  }, [validPendingRequestIds]);

  // Constants
  const GEOLOCATION_TIMEOUT = 10000; // Increased from 5000 to give more time for geolocation

  const updateLocationAndZip = async (
    latitude: number,
    longitude: number,
  ) => {
    // Log debugging information
    console.log("updateLocationAndZip called with coordinates:", { latitude, longitude });
    
    try {
      // First set the location info to avoid map jumps
      const locationObj = {
        latitude,
        longitude
      };
      
      setUserLocation(locationObj);
      setCurrentMapCenter(locationObj);
      setLocationError(null); // Clear any location errors
      
      // Make sure Google Maps API is loaded
      if (!window.google?.maps) {
        console.log("Waiting for Google Maps API to load...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!window.google?.maps) {
          console.error("Google Maps API failed to load after waiting");
          throw new Error("Google Maps API not available");
        }
      }
      
      // Then get the ZIP code if needed
      const geocoder = new google.maps.Geocoder();
      
      // Try with a specific format
      const geocodeRequest = {
        location: { lat: latitude, lng: longitude }
      };
      
      console.log("Sending geocode request:", geocodeRequest);
      const result = await geocoder.geocode(geocodeRequest);
      console.log("Geocode result:", result);

      if (result.results && result.results.length > 0) {
        console.log("Found address components:", result.results[0].address_components);
        
        const zipComponent = result.results[0].address_components.find(
          component => component.types.includes('postal_code')
        );
        
        if (zipComponent) {
          const newZip = zipComponent.short_name;
          console.log("Found ZIP code:", newZip);
          
          // Set the zip code first
          setZipCode(newZip);
          localStorage.setItem('lastZipCode', newZip);
          
          // Mark as initialized
          setIsInitialLocationSet(true);
          
          // Store the location values
          localStorage.setItem('userLocationLat', latitude.toString());
          localStorage.setItem('userLocationLng', longitude.toString());
          localStorage.setItem('locationTimestamp', Date.now().toString());
        } else {
          // If no ZIP found but we have coordinates, that's still a successful result
          // We'll manually set to a placeholder ZIP code in this case
          console.log("No ZIP code component found in geocoding results");
          
          // Create a fallback ZIP code from first 5 digits of latitude/longitude
          // This is just a placeholder that will be consistently generated for a given location
          const fallbackZip = Math.abs(Math.floor(latitude * 100)) % 100000;
          const formattedZip = fallbackZip.toString().padStart(5, '0');
          console.log("Using fallback ZIP:", formattedZip);
          
          setZipCode(formattedZip);
          localStorage.setItem('lastZipCode', formattedZip);
          
          // Mark as initialized
          setIsInitialLocationSet(true);
          
          // Store the location values
          localStorage.setItem('userLocationLat', latitude.toString());
          localStorage.setItem('userLocationLng', longitude.toString());
          localStorage.setItem('locationTimestamp', Date.now().toString());
        }
      } else {
        console.warn("No results found from geocoding");
        // Use fallback ZIP code generation in this case too
        const fallbackZip = Math.abs(Math.floor(latitude * 100)) % 100000;
        const formattedZip = fallbackZip.toString().padStart(5, '0');
        console.log("Using fallback ZIP:", formattedZip);
        
        setZipCode(formattedZip);
        setIsInitialLocationSet(true);
      }
    } catch (error) {
      console.error('Error getting ZIP from coordinates:', error);
      // Don't show error toast if we already have a valid coordinate
      if (!userLocation) {
        toast({
          title: "Location Error",
          description: "Could not determine your ZIP code. Please enter it manually.",
          variant: "destructive"
        });
      }
    }
  };

  const handleZipCodeChange = async (zip: string) => {
    console.log('handleZipCodeChange called with zip:', zip);
    
    // First update the UI to show the new zip code
    setZipCode(zip);

    // If zip is empty, reset the location
    if (zip === '') {
      console.log('ZIP code cleared, resetting location data');
      
      // Clear location state
      setUserLocation(null);
      setCurrentMapCenter(null);
      
      // Force filters update to trigger list view refresh
      setFilters({
        ...filters,
        searchQuery: '',  // Reset search query too
        searchRadiusMiles: 5  // Reset radius to default
      });
      
      // Also clear from localStorage to avoid automatic restoration
      localStorage.removeItem('lastZipCode');
      localStorage.removeItem('userLocationLat');
      localStorage.removeItem('userLocationLng');
      localStorage.removeItem('locationTimestamp');
      
      // Force map view by directly updating the DOM
      // This ensures that Map View is always the active view when location is cleared
      
      // 1. Wait until the next render cycle
      setTimeout(() => {
        // 2. Check if we need to force map view in the DOM
        const mapViewButton = document.querySelector('[value="map"]');
        const listViewButton = document.querySelector('[value="list"]');
        
        if (mapViewButton instanceof HTMLElement) {
          // Get the aria-pressed attribute to see if it's already selected
          const isMapViewSelected = mapViewButton.getAttribute('aria-pressed') === 'true';
          
          if (!isMapViewSelected && listViewButton instanceof HTMLElement) {
            console.log('IMPORTANT: Forcing map view after location cleared');
            mapViewButton.click();
          }
        }
      }, 50);
      
      // Force re-render by updating filters to trigger all downstream updates
      setFilters(prev => ({
        ...prev,
        searchRadiusMiles: prev.searchRadiusMiles 
      }));
      
      console.log('Location data has been reset, meetups should now be empty');
      return;
    }

    // Only proceed with geocoding for valid zip codes
    if (/^\d{5}(-\d{4})?$/.test(zip)) {
      try {
        // Show loading indicator while geocoding
        setIsLoadingLocation(true);
        
        const geocoder = new google.maps.Geocoder();
        const result = await geocoder.geocode({
          address: zip,
          componentRestrictions: {
            country: 'US',
            postalCode: zip
          }
        });

        if (result.results[0]?.geometry?.location) {
          const location = result.results[0].geometry.location;
          
          // Create the location object from geocoded coordinates
          const newLocation = {
            latitude: location.lat(),
            longitude: location.lng()
          };
          
          console.log('Successfully geocoded zip code to location:', newLocation);
          
          // Set all location states at once to avoid multiple renders
          // But DO NOT save manually entered zip codes to localStorage
          setUserLocation(newLocation);
          setCurrentMapCenter(newLocation);
          setIsInitialLocationSet(true);
          
          // DO NOT store manually entered zip codes
          // localStorage.setItem('lastZipCode', zip);
          // localStorage.setItem('userLocationLat', newLocation.latitude.toString());
          // localStorage.setItem('userLocationLng', newLocation.longitude.toString());
        } else {
          // Reset location if geocoding didn't find a valid result
          setUserLocation(null);
          setCurrentMapCenter(null);
          
          console.warn('Could not find location for zip code:', zip);
          
          toast({
            title: "Invalid ZIP Code",
            description: "Could not find location for the provided ZIP code.",
            variant: "destructive"
          });
        }
      } catch (error) {
        console.error('Error geocoding zip code:', error);
        setUserLocation(null);
        setCurrentMapCenter(null);
        
        toast({
          title: "Geocoding Error",
          description: "There was an error finding this location. Please try a different ZIP code.",
          variant: "destructive"
        });
      } finally {
        setIsLoadingLocation(false);
      }
    }
  };

  // Request location permissions on component mount
  useEffect(() => {
    if (isInitialLocationSet) return;

    // We will use real geolocation now, debugging code left for reference
    /* 
    const forceTestLocation = () => {
      console.log("FORCING TEST LOCATION FOR DEBUGGING");
      // Cleveland, OH coordinates for testing
      const testLocation = {
        latitude: 41.4993,
        longitude: -81.6944
      };
      
      // Set key state variables
      setUserLocation(testLocation);
      setCurrentMapCenter(testLocation);
      setIsInitialLocationSet(true);
      setIsLoadingLocation(false);
      setLocationError(null);
      
      // Force a 15-mile radius for testing
      const updatedFilters = {
        ...filters,
        searchRadiusMiles: 15 // Set explicit radius for testing
      };
      setFilters(updatedFilters);
      
      // Set default radius in filters
      if (!zipCode) {
        setZipCode('');
      }
    };
    // forceTestLocation(); 
    */

    const requestLocation = async () => {
      setIsLoadingLocation(true);

      if (!('geolocation' in navigator)) {
        setIsLoadingLocation(false);
        setLocationError('Geolocation is not supported');
        return;
      }

      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(
            resolve,
            reject,
            {
              enableHighAccuracy: true,
              timeout: GEOLOCATION_TIMEOUT,
              maximumAge: 0
            }
          );
        });

        await updateLocationAndZip(
          position.coords.latitude,
          position.coords.longitude
        );
        setLocationError(null);
        setIsInitialLocationSet(true);
      } catch (error: any) {
        console.error('Error getting location:', error);
        setLocationError(
          error.code === 1
            ? 'Location access was denied. Enable location access to find nearby meetups.'
            : 'Could not get your location. Using default map view.'
        );

        // Try to load last saved location if geolocation fails
        const lastZip = localStorage.getItem('lastZipCode');
        if (lastZip) {
          setZipCode(lastZip);
          handleZipCodeChange(lastZip);
        }

        if (error.code === 1) {
          toast({
            title: 'Enable Location Access',
            description: 'Allow location access to find nearby meetups. Click here to enable.',
            action: (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  navigator.geolocation.getCurrentPosition(() => {}, () => {});
                }}
              >
                Enable
              </Button>
            ),
            duration: 10000
          });
        }
      } finally {
        setIsLoadingLocation(false);
      }
    };

    requestLocation();
  }, []);

  const handleCreateMeetupClick = () => {
    if (activeMeetup) {
      toast({
        title: "Cannot Create Meet",
        description: "You can only be in one Meet at a time. Leave your current Meet first.",
        variant: "destructive"
      });
    } else {
      setGroupIdForCreate(null);
      setShowCreateDialog(true);
    }
  };

  const handleAfterMeetupCreate = () => {
    setShowCreateDialog(false);
    setGroupIdForCreate(null);
    // Navigate immediately after the mutation settles; no timeout race with
    // the dialog or route lifecycle.
    setLocation('/active-meet');
  };

  // Add profile related queries
  const {
    data: traits = [],
    isLoading: isTraitsLoading,
    error: traitsError
  } = useQuery({
    queryKey: ['/api/users', user?.id, 'traits'],
    queryFn: async () => {
      if (!user) return [];
      const res = await fetch(`/api/users/${user.id}/traits`);
      if (!res.ok) throw new Error(await res.text());
      return res.json();
    },
    enabled: !!user
  });

  const { data: notifications = [], isLoading: isNotificationsLoading } = useQuery({
    queryKey: ['/api/notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications', {
        credentials: 'include'
      });
      if (!res.ok) throw new Error(await res.text());
      const notificationsData = await res.json();

      return notificationsData.map((notification: any) => ({
        ...notification,
        link: notification.link?.startsWith('/')
          ? notification.link.substring(1)
          : notification.link
      }));
    },
    enabled: !!user
  });


  if (isLoadingMeetups || isActiveMeetupLoading) {
    return (
      <div className="h-screen flex items-center justify-center">
        <div className="flex flex-col items-center gap-2">
          <Loader2 className="h-8 w-8 animate-spin" />
          <p className="text-sm text-muted-foreground">
            Loading Meets...
          </p>
        </div>
      </div>
    );
  }

  // Get filtered meetups
  // Fix the location cleared logic - require a complete valid ZIP code AND valid location
  // Only show meetups when we have both a complete valid ZIP code and location coordinates
  const isCompleteZipCode = /^\d{5}(-\d{4})?$/.test(zipCode); // Check for valid 5-digit or 9-digit ZIP
  const isLocationCleared = !isCompleteZipCode || !userLocation;
  
  // Explicit override to fix stale data bug - use empty array when location is cleared
  // This guarantees that we never try to show meetups without location
  const meetupsToDisplay = isLocationCleared ? [] : meetups;
  
  // Debug log to track location state
  console.log('Filtering meetups - location state:', {
    hasZipCode: !!zipCode, 
    isCompleteZipCode,
    zipCode, // Show actual ZIP for debugging
    hasUserLocation: !!userLocation,
    hasCurrentMapCenter: !!currentMapCenter,
    isLocationCleared,
    meetupsCount: meetups?.length || 0,
    displayCount: meetupsToDisplay?.length || 0
  });
  
  const filteredMeetups = isLocationCleared 
    ? []
    : (meetupsToDisplay ? filterMeetups(meetupsToDisplay, filters, userLocation, currentMapCenter) : []);

  // Add debug logging for pending requests
  console.log('Current validPendingRequestIds:', validPendingRequestIds);

  // Render different content based on the current route
  const renderContent = () => {
    const path = location.split('/')[1];

    switch (path) {
      case 'map':
        return (
          <div className="flex flex-col h-full">
            <div className="border-b bg-background sticky top-0 z-10">
              <div className="p-4">
                <div className="flex flex-col gap-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <div className="relative flex items-center">
                      <LocationSearch
                        value={zipCode}
                        onChange={setZipCode}
                        onLocationSelect={(location) => {
                          console.log('Location selected from search:', location);
                          // Update userLocation directly for immediate map update
                          if (location) {
                            // First set the location to update the map immediately
                            setUserLocation(location);
                            setCurrentMapCenter(location);
                            
                            // Then get the zip code for that location
                            const geocoder = new google.maps.Geocoder();
                            geocoder.geocode({
                              location: {
                                lat: location.latitude,
                                lng: location.longitude
                              }
                            }).then(result => {
                              if (result.results[0]) {
                                const zipComponent = result.results[0].address_components.find(
                                  component => component.types.includes('postal_code')
                                );
                                
                                if (zipComponent) {
                                  const newZip = zipComponent.short_name;
                                  console.log('Found zip code for selected location:', newZip);
                                  
                                  // Update UI with the correct zip code
                                  setZipCode(newZip);
                                  
                                  // DO NOT store user-selected locations in localStorage
                                  // We only store locations derived from geolocation API
                                }
                              }
                            }).catch(err => {
                              console.error("Error getting zip from location:", err);
                            });
                          }
                        }}
                        isLoading={isLoadingLocation}
                      />
                      {/*{isLoadingLocation && (
                        <div className="absolute right-2">
                          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
                        </div>
                      )}*/}
                    </div>
                    <div className="flex-1 min-w-0">
                      <MeetupFilters
                        filters={filters}
                        onFiltersChange={setFilters}
                      />
                    </div>
                    {user && (
                      <Button
                        onClick={handleCreateMeetupClick}
                        size="sm"
                        className="h-9 w-9 shrink-0 px-0 text-xs sm:w-auto sm:px-3"
                        aria-label="Create Meet"
                      >
                        <Plus className="h-4 w-4 sm:mr-1.5" />
                        <span className="hidden sm:inline">Create Meet</span>
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </div>
            <div className="flex-1 relative">
              <MeetupView
                meetups={isLocationCleared ? [] : filteredMeetups}
                onMeetupSelect={onMeetupSelect}
                zipCode={zipCode}
                userLocation={userLocation}
                searchRadius={filters.searchRadiusMiles}
                activeMeetupId={activeMeetup?.id}
                 pendingRequestIds={allPendingRequestIds}
                currentUser={user}
                onAfterJoin={() => {
                  queryClient.invalidateQueries({ queryKey: ['/api/meetups'] });
                }}
              />
            </div>
          </div>
        );

      case 'notifications':
        return (
          <div className="p-4">
            <h2 className="text-2xl font-bold mb-4">Notifications</h2>
            {isNotificationsLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : notifications.length === 0 ? (
              <div className="text-center text-muted-foreground p-8">
                No new notifications
              </div>
            ) : (
              <div className="space-y-4">
                {notifications.map((notification: { id: number; link?: string; message: string; createdAt?: string }) => (
                  <a href={notification.link} key={notification.id} target="_blank" rel="noopener noreferrer" className="p-4 border rounded-lg hover:bg-accent/50 cursor-pointer transition-colors">
                    <div className="font-medium">
                      {notification.message}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {notification.createdAt && formatDistanceToNow(new Date(notification.createdAt), { addSuffix: true })}
                    </div>
                  </a>
                ))}
              </div>
            )}
          </div>
        );

      case 'active-meet':
        return (
          <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">Active Meet</h2>
            {/* Log for debugging */}
            {(() => { 
              console.log('Active Meet Tab:', { activeMeetup, user, isActiveMeetupLoading });
              return null; 
            })()}
            {isActiveMeetupLoading ? (
              <div className="flex items-center justify-center p-8">
                <Loader2 className="h-6 w-6 animate-spin" />
              </div>
            ) : activeMeetup ? (
              <ActiveMeetupPanel
                meetup={activeMeetup}
                participants={activeMeetupParticipants}
                initialTab={new URLSearchParams(window.location.search).get('tab')}
              />
            ) : (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <div className="rounded-full bg-primary/10 p-6 mb-6">
                  <Users className="h-12 w-12 text-primary" />
                </div>
                <h3 className="text-lg font-semibold">No Active Meet</h3>
                {user ? (
                  <>
                    <p className="text-muted-foreground mb-8">
                      Create a new meet or join an existing one to start connecting with people around you.
                    </p>
                    <div className="flex gap-4">
                      <Button
                        className="gap-2"
                        onClick={() => {
                          setLocation('/map');
                          setShowCreateDialog(true);
                        }}
                      >
                        <Users className="h-4 w-4" />
                        Create Meet
                      </Button>
                      <Button
                        variant="outline"
                        className="gap-2"
                        onClick={() => setLocation('/map')}
                      >
                        <MapPin className="h-4 w-4" />
                        Join Meet
                      </Button>
                    </div>
                  </>
                ) : (
                  <>
                    <p className="text-muted-foreground mb-8">
                      Sign in to create or join meets and connect with people in your area.
                    </p>
                    <Link to="/auth" className="inline-flex">
                      <Button className="gap-2">
                        <LogIn className="h-4 w-4" />
                        Sign in to Create or Join Meets
                      </Button>
                    </Link>
                  </>
                )}
              </div>
            )}
          </div>
        );

      case 'groups':
        return user ? (
          <GroupsTab />
        ) : (
          <div className="flex flex-col items-center justify-center p-8 text-center">
            <UserCircle2 className="mb-4 h-12 w-12 text-muted-foreground" />
            <h3 className="text-lg font-semibold">Sign in to access groups</h3>
            <p className="mb-4 text-muted-foreground">
              Connect with friends and join group activities
            </p>
            <Link to="/auth" className="inline-flex">
              <Button className="gap-2">
                <LogIn className="h-4 w-4" />
                Sign In
              </Button>
            </Link>
          </div>
        );
      case 'friends':
        return (
          <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">Friends</h2>
            {!user ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <UserCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Sign in to see your friends</h3>
                <p className="text-muted-foreground mb-4">
                  Connect with friends and see their active meets
                </p>
                <Link to="/auth" className="inline-flex">
                  <Button className="gap-2">
                    <LogIn className="h-4 w-4" />
                    Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <FriendsTab />
            )}
          </div>
        );
      case 'profile':
        return (
          <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">My Profile</h2>
            {!user ? (
              <div className="flex flex-col items-center justify-center p-8 text-center">
                <UserCircle2 className="h-12 w-12 text-muted-foreground mb-4" />
                <h3 className="text-lg font-semibold">Sign in to view your profile</h3>
                <p className="text-muted-foreground mb-4">
                  Access your profile settings and preferences
                </p>
                <Link to="/auth" className="inline-flex">
                  <Button className="gap-2">
                    <LogIn className="w-4 h-4" />
                    Sign In
                  </Button>
                </Link>
              </div>
            ) : (
              <div className="space-y-6">
                <Card className="p-6">
                  <div className="flex flex-col sm:flex-row gap-6">
                    <div className="flex flex-col items-center gap-4">
                      <Avatar className="h-24 w-24">
                        <div className="w-full h-full flex items-center justify-center bg-primary/10 text-primary text-2xl font-semibold">
                          {user.username?.[0]?.toUpperCase() || '?'}
                        </div>
                      </Avatar>
                      <Button
                        variant="outline"
                        size="sm"
                        className="w-full hidden sm:block">
                        Edit Profile
                      </Button>
                    </div>
                    <div className="flex-1 flex flex-col sm:flex-row justify-between gap-4">
                      <div className="flex-1">
                        <h1 className="text-2xl font-bold truncate text-center sm:text-left">
                          {user.displayName || user.username}
                        </h1>
                        {user.displayName && (
                          <p className="text-muted-foreground text-center sm:text-left">@{user.username}</p>
                        )}
                        <p className="mt-2 text-muted-foreground text-center sm:text-left">
                          {user.bio || 'No bio yet'}
                        </p>
                      </div>
                      <div className="flex flex-col items-center sm:items-end">
                        <Button
                          variant="outline"
                          size="sm"
                          className="w-full sm:hidden mb-4">
                          Edit Profile
                        </Button>
                        <div className="w-full flex flex-wrap justify-center sm:justify-end items-center text-center gap-x-6 gap-y-2">
                          <div className="flex items-center gap-1 text-sm">
                            <Users className="w-4 h-4" />
                            <span>{user.friends?.length || 0} Friends</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <Medal className="w-4 h-4" />
                            <span>{user.meetsAttendedCount || 0} Meets</span>
                          </div>
                          <div className="flex items-center gap-1 text-sm">
                            <ThumbsUp className="w-4 h-4" />
                            <span>{traits?.length || 0} Traits</span>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </Card>

                <Tabs defaultValue="traits" className="mt-6">
                  <TabsList className="grid w-full grid-cols-2">
                    <TabsTrigger value="traits" className="flex items-center gap-2">
                      <Medal className="w-4 h-4" />
                      Traits
                    </TabsTrigger>
                    <TabsTrigger value="history" className="flex items-center gap-2">
                      <MapPin className="w-4 h-4" />
                      Meet History
                    </TabsTrigger>
                  </TabsList>

                  <TabsContent value="traits" className="mt-4">
                    <div className="space-y-4">
                      {traits?.length ? (
                        traits.map((trait: any) => (
                          <TraitCard key={trait.traitId} trait={trait} />
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No traits yet
                        </div>
                      )}
                    </div>
                  </TabsContent>

                  <TabsContent value="history" className="mt-4">
                    <div className="space-y-2">
                      <div className="flex justify-end">
                        <Badge variant="secondary">
                          {user.meetsAttendedCount || 0} Total Meets
                        </Badge>
                      </div>
                      {user.meetHistory?.length ? (
                        user.meetHistory.map((history) => (
                          <Card key={history.id} className="p-4">
                            <div className="flex items-center justify-between">
                              <div>
                                <p className="font-medium">{history.meetup?.title}</p>
                                <p className="text-sm text-muted-foreground">
                                  {history.joined_at && formatDate(history.joined_at)}
                                </p>
                              </div>
                              <Badge>{history.meetup?.theme}</Badge>
                            </div>
                          </Card>
                        ))
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          No meet history yet
                        </div>
                      )}
                    </div>
                  </TabsContent>
                </Tabs>
              </div>
            )}
          </div>
        );

      case 'settings':
        return (
          <div className="p-4 space-y-4">
            <h2 className="text-2xl font-bold">Settings</h2>
            <div className="text-center text-muted-foreground">
              Settings page coming soon
            </div>
          </div>
        );

      default:
        return (
          <div className="flex items-center justify-center h-full">
            <p className="text-muted-foreground">Select a section from the sidebar</p>
          </div>
        );
    }
  };

  const onMeetupSelect = (meetup: Meetup) => {
    setSelectedMeetupOptions({ meetup });
  };

  return (
    <MainLayout>
      {renderContent()}
      <Dialog
        open={selectedMeetupOptions !== null}
        onOpenChange={(open) => !open && setSelectedMeetupOptions(null)}
      >
        <DialogContent className="sm:max-w-[425px]">
          <DialogHeader>
            <DialogTitle>Meet Details</DialogTitle>
          </DialogHeader>
          {selectedMeetupOptions && (
            <MeetupCard
              meetup={selectedMeetupOptions.meetup}
              currentUser={user}
              showPendingRequests={selectedMeetupOptions.showPendingRequests}
              onAfterJoin={() => {
                setSelectedMeetupOptions(null);
                // Invalidate queries to refresh data
                queryClient.invalidateQueries({ queryKey: ['/api/my-pending-requests'] });
                queryClient.invalidateQueries({ queryKey: ['/api/pending-requests'] });
                queryClient.invalidateQueries({ queryKey: ['/api/meetups'] });
              }}
            />
          )}
        </DialogContent>
      </Dialog>

      <CreateMeetupDialog
        open={showCreateDialog}
        onOpenChange={(open) => {
          setShowCreateDialog(open);
          if (!open) setGroupIdForCreate(null);
        }}
        initialLocation={currentMapCenter}
        groupId={groupIdForCreate}
        onAfterCreate={handleAfterMeetupCreate}
      />
    </MainLayout>
  );
}