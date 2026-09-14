import { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
// Keep Avatar import for legacy compatibility until all instances are migrated
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar';
import { ProfileAvatar } from '@/components/common/profile-avatar';
import { Badge } from '@/components/ui/badge';

// This function is kept for legacy code that hasn't been migrated to ProfileAvatar yet
// Will be removed once migration is complete
function getInitials(name: string = ""): string {
  return name
    .split(" ")
    .map((n) => n[0])
    .join("")
    .toUpperCase()
    .substring(0, 2);
}
import { cva } from 'class-variance-authority';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Slider } from '@/components/ui/slider';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useInfiniteScroll } from '@/hooks/use-infinite-scroll';
import { 
  Trophy, Users, Star, TrendingUp, Crown, 
  ChefHat, BookOpen, Award, Map, Calendar, MapPin,
  Search, X, UserPlus, Globe, User, MapIcon, Filter,
  AlertCircle, Info, Sparkles, ThumbsUp
} from 'lucide-react';
import { LocationSearch } from '@/components/search/location-search';
import { useQuery } from '@tanstack/react-query';
import { useUser } from '@/hooks/use-user';
import { useIsMobile } from '@/hooks/use-mobile';
import { useToast } from '@/hooks/use-toast';
// Link imports removed as we're using modal triggers instead
import { GOOGLE_MAPS_CONFIG } from '@/utils/google-maps';
import { MainLayout } from '@/components/layout/main-layout';
import { UserProfileModal } from '@/components/users/user-profile-modal';

// Define time period type and options
type TimePeriod = 'week' | 'month' | 'all';

// Define user location type
interface UserLocation {
  latitude: number;
  longitude: number;
}

// Define leaderboard entry interfaces for different categories
interface LeaderboardEntry {
  userId: number;
  username: string;
  displayName?: string;
  count: number;
  latitude?: number;
  longitude?: number;
  profilePicture?: string | null;
}

interface TopHostEntry extends LeaderboardEntry {}

interface MostActiveEntry extends LeaderboardEntry {}

interface TopTrait {
  traitId: number;
  traitName: string;
  traitCategory: string;
  endorsements: number;
  totalRatings: number;
  uniqueEndorsers: number;
  totalDistinctTraits: number;
}

interface TraitByUserEntry {
  userId: number;
  username: string;
  displayName?: string;
  traitId: number;
  traitName: string;
  traitCategory: string;
  totalVotes: number;
  netRating: number;
  traitRank: number;
}

interface HighestRatedEntry extends LeaderboardEntry {
  endorsements: number;
  totalRatings: number;
  distinctTraits?: number;
  topTrait?: TopTrait | null;
}

interface TraitLeaderEntry extends LeaderboardEntry {
  traitCount: number;
}

interface WeeklyClimberEntry extends LeaderboardEntry {
  lastWeekCount: number;
  thisWeekCount: number;
  growth: number;
  growthPercent: number;
}

// Define select options
const periodOptions = [
  { value: 'week', label: 'This Week' },
  { value: 'month', label: 'This Month' },
  { value: 'all', label: 'All Time' },
];

const radiusOptions = [
  { value: 5, label: '5 miles' },
  { value: 10, label: '10 miles' },
  { value: 25, label: '25 miles' },
  { value: 50, label: '50 miles' },
  { value: 100, label: '100 miles' },
  { value: 200, label: '200 miles' },
  { value: 20000, label: 'Worldwide' },
];

const LeaderboardPage: React.FC = () => {
  const { toast } = useToast();
  const { user: currentUser } = useUser();
  const isMobile = useIsMobile();
  
  // State for filters
  const [activeTab, setActiveTab] = useState<string>('hosts');
  const [period, setPeriod] = useState<TimePeriod>('all');
  const [radius, setRadius] = useState<number>(50); // Start with a larger area to show more records for 44142
  const [radiusMiles, setRadiusMiles] = useState<number>(50); // Match radius for display
  const [userLocation, setUserLocation] = useState<UserLocation | null>(null);
  const [zipCode, setZipCode] = useState<string>('');
  const [showFriendsOnly, setShowFriendsOnly] = useState<boolean>(false);
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchResults, setSearchResults] = useState<{users: Array<{id: number, username: string, displayName?: string|null}>}>({users: []});
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [page, setPage] = useState<number>(1);
  const [hasMoreData, setHasMoreData] = useState<boolean>(true);
  
  // State for user profile modal
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [profileModalOpen, setProfileModalOpen] = useState<boolean>(false);
  
  // References for infinite scrolling
  const leaderboardContainerRef = useRef<HTMLDivElement>(null);
  const loadingMoreRef = useRef<boolean>(false);
  
  // Helper function to check if a user is a friend of the current user
  const isUserFriend = useCallback((userId: number): boolean => {
    // If not showing friends only, always return true
    if (!showFriendsOnly) return true;
    
    // If no current user, don't show anyone when filter is active
    if (!currentUser) return false;
    
    // The current user should always see themselves
    if (userId === currentUser.id) return true;
    
    // Check if this user is a friend
    return currentUser.friends?.some(friend => friend.id === userId) === true;
  }, [showFriendsOnly, currentUser]);

  // Function to open the user profile modal
  const handleOpenProfile = (userId: number) => {
    setSelectedUserId(userId);
    setProfileModalOpen(true);
  };

  // Function to update location and get ZIP code
  const updateLocationAndZipCode = async (latitude: number, longitude: number) => {
    console.log("updateLocationAndZipCode called with coordinates:", { latitude, longitude });
    
    try {
      // First set the location info
      const locationObj = {
        latitude,
        longitude
      };
      
      setUserLocation(locationObj);
      
      // Make sure Google Maps API is loaded
      if (!window.google?.maps) {
        console.log("Waiting for Google Maps API to load...");
        await new Promise(resolve => setTimeout(resolve, 2000));
        
        if (!window.google?.maps) {
          console.error("Google Maps API failed to load after waiting");
          throw new Error("Google Maps API not available");
        }
      }
      
      // Then get the ZIP code
      const geocoder = new google.maps.Geocoder();
      
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
          
          // Set the zip code
          setZipCode(newZip);
          localStorage.setItem('lastZipCode', newZip);
        } else {
          // If no ZIP found but we have coordinates, create a fallback
          console.log("No ZIP code component found in geocoding results");
          
          // Create a fallback ZIP code from first 5 digits of latitude/longitude
          const fallbackZip = Math.abs(Math.floor(latitude * 100)) % 100000;
          const formattedZip = fallbackZip.toString().padStart(5, '0');
          console.log("Using fallback ZIP:", formattedZip);
          
          setZipCode(formattedZip);
          localStorage.setItem('leaderboard_zipCode', formattedZip);
        }
      } else {
        console.warn("No results found from geocoding");
        // Use fallback ZIP code generation
        const fallbackZip = Math.abs(Math.floor(latitude * 100)) % 100000;
        const formattedZip = fallbackZip.toString().padStart(5, '0');
        console.log("Using fallback ZIP:", formattedZip);
        
        setZipCode(formattedZip);
      }
    } catch (error) {
      console.error('Error getting ZIP from coordinates:', error);
      toast({
        title: "Location Error",
        description: "Could not determine your ZIP code.",
        variant: "destructive"
      });
    }
  };

  // Get user's current location on mount
  useEffect(() => {
    // First check if we have a stored ZIP code from localStorage - use leaderboard-specific keys
    const storedZipCode = localStorage.getItem('leaderboard_zipCode') || localStorage.getItem('lastZipCode');
    const storedLat = localStorage.getItem('leaderboard_lat') || localStorage.getItem('userLocationLat');
    const storedLng = localStorage.getItem('leaderboard_lng') || localStorage.getItem('userLocationLng');
    
    // If we have stored values, use them first (for immediate display)
    if (storedZipCode && storedLat && storedLng) {
      console.log("Using stored location and ZIP code from localStorage for leaderboard");
      setZipCode(storedZipCode);
      
      const lat = parseFloat(storedLat);
      const lng = parseFloat(storedLng);
      
      if (!isNaN(lat) && !isNaN(lng)) {
        setUserLocation({
          latitude: lat,
          longitude: lng,
        });
      }
    }
    
    // Then try to get current location
    if ('geolocation' in navigator) {
      navigator.geolocation.getCurrentPosition(
        (position) => {
          const { latitude, longitude } = position.coords;
          console.log('Got user location for leaderboards:', position.coords);
          
          // Update both location and ZIP code using the centralized function
          updateLocationAndZipCode(latitude, longitude);
        },
        (error) => {
          console.error('Error getting location:', error);
          // Only show error if we don't have any stored location
          if (!storedZipCode) {
            toast({
              title: 'Location Access Denied',
              description: 'Enable location services to see local leaderboards.',
              variant: 'destructive',
            });
          }
        }
      );
    } else if (!storedZipCode) { // Only show this message if we don't have a stored location
      toast({
        title: 'Location Not Supported',
        description: 'Your browser does not support geolocation.',
        variant: 'destructive',
      });
    }
  }, [toast]);

  // Function to search for users by username or display name
  const searchUsers = useCallback(async (query: string) => {
    // Always set isSearching, even for empty query to show "no results found" message
    setIsSearching(true);
    
    // For empty queries, just show empty results
    if (!query.trim()) {
      setSearchResults({users: []});
      setIsSearching(false);
      return;
    }

    try {
      // Add context=leaderboard parameter to allow non-authenticated search in this public context
      const response = await fetch(`/api/users/search?q=${encodeURIComponent(query)}&limit=20&context=leaderboard`);
      
      // Handle 400 errors (for short queries) without showing error toast
      if (response.status === 400) {
        console.log('Search query too short - server returned 400');
        setSearchResults({users: []});
        return;
      }
      
      if (!response.ok) {
        throw new Error('Failed to search users');
      }
      
      const data = await response.json();
      console.log('Search results:', data);
      
      // Store the complete search results to filter the leaderboard entries while keeping rank numbers
      // Ensure data has the proper structure with users array
      if (data && Array.isArray(data)) {
        setSearchResults({ users: data });
      } else if (data && data.users && Array.isArray(data.users)) {
        setSearchResults({ users: data.users });
      } else {
        console.error('Unexpected search response format:', data);
        setSearchResults({ users: [] });
      }
    } catch (error) {
      console.error('Error searching users:', error);
      // Only show toast for unexpected errors, not 400 errors
      if (!error.message.includes('400')) {
        toast({
          title: 'Error',
          description: 'Failed to search for users. Please try again.',
          variant: 'destructive'
        });
      }
      setSearchResults({users: []});
    } finally {
      setIsSearching(false);
    }
  }, [toast]);

  // Query functions for different leaderboard types
  const fetchTopHosts = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    const response = await fetch(`/api/leaderboards/hosts?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch top hosts');
    }
    return response.json();
  }, [period, radius, userLocation, zipCode, showFriendsOnly]);

  const fetchMostActive = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    const response = await fetch(`/api/leaderboards/active?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch most active users');
    }
    return response.json();
  }, [period, radius, userLocation, zipCode, showFriendsOnly]);

  const fetchHighestRated = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    const response = await fetch(`/api/leaderboards/rated?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch highest rated users');
    }
    return response.json();
  }, [period, radius, userLocation, zipCode, showFriendsOnly]);

  const fetchTraitLeaders = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    const response = await fetch(`/api/leaderboards/traits?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch trait leaders');
    }
    return response.json();
  }, [period, radius, userLocation, zipCode, showFriendsOnly]);
  
  const fetchTraitsByUser = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('period', period);
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    console.log("Fetching traits-by-user with params:", params.toString());
    console.log(`Full URL: /api/leaderboards/traits-by-user?${params.toString()}`);
    
    const response = await fetch(`/api/leaderboards/traits-by-user?${params.toString()}`);
    if (!response.ok) {
      console.error("Error fetching traits by user:", response.status, response.statusText);
      throw new Error('Failed to fetch traits by user');
    }
    
    const data = await response.json();
    console.log("Traits by user API response:", data);
    console.log("Number of traits found:", data.length);
    
    if (data.length > 0) {
      console.log("First trait sample:", data[0]);
      console.log("Last trait sample:", data[data.length - 1]);
      
      // Log traitRank distribution
      const ranks = data.map(item => parseInt(item.traitRank));
      const uniqueRanks = [...new Set(ranks)].sort((a, b) => a - b);
      console.log("Unique trait ranks:", uniqueRanks);
      
      // Look for Test9999 user specifically
      const test9999Traits = data.filter(item => item.username === "Test9999");
      if (test9999Traits.length > 0) {
        console.log("Found Test9999 traits:", test9999Traits);
      } else {
        console.log("Test9999 user not found in results");
      }
    }
    
    return data;
  }, [period, radius, userLocation, zipCode, showFriendsOnly]);

  const fetchWeeklyClimbers = useCallback(async () => {
    const params = new URLSearchParams();
    params.append('limit', '0'); // Set to 0 to fetch all entries
    
    // Only filter by location if radius is less than 100 miles
    if (userLocation && radius < 100) {
      params.append('latitude', userLocation.latitude.toString());
      params.append('longitude', userLocation.longitude.toString());
      params.append('radius', radius.toString());
    } else {
      // Get worldwide results for large radius searches
      params.append('worldwide', 'true');
    }
    
    // Add ZIP code if available
    if (zipCode) {
      params.append('zipCode', zipCode);
    }
    
    // Add friends only filter if enabled
    if (showFriendsOnly) {
      params.append('friends_only', 'true');
    }
    
    const response = await fetch(`/api/leaderboards/weekly-climbers?${params.toString()}`);
    if (!response.ok) {
      throw new Error('Failed to fetch weekly climbers');
    }
    return response.json();
  }, [radius, userLocation, zipCode, showFriendsOnly]);

  // React Query hooks for data fetching
  const { 
    data: topHosts, 
    isLoading: isLoadingHosts,
    error: hostsError
  } = useQuery({
    queryKey: ['leaderboards', 'hosts', period, radius, zipCode, userLocation, showFriendsOnly], 
    queryFn: fetchTopHosts,
    enabled: activeTab === 'hosts' || activeTab === 'all',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { 
    data: mostActive, 
    isLoading: isLoadingActive,
    error: activeError 
  } = useQuery({
    queryKey: ['leaderboards', 'active', period, radius, zipCode, userLocation, showFriendsOnly],
    queryFn: fetchMostActive,
    enabled: activeTab === 'active' || activeTab === 'all',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { 
    data: highestRated, 
    isLoading: isLoadingRated,
    error: ratedError
  } = useQuery({
    queryKey: ['leaderboards', 'rated', period, radius, zipCode, userLocation, showFriendsOnly],
    queryFn: fetchHighestRated,
    enabled: activeTab === 'rated' || activeTab === 'all',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  const { 
    data: traitLeaders, 
    isLoading: isLoadingTraits,
    error: traitsError
  } = useQuery({
    queryKey: ['leaderboards', 'traits', period, radius, zipCode, userLocation, showFriendsOnly],
    queryFn: fetchTraitLeaders,
    enabled: activeTab === 'traits' || activeTab === 'all',
    refetchOnWindowFocus: false,
    retry: 1,
  });
  
  const { 
    data: traitsByUser, 
    isLoading: isLoadingTraitsByUser,
    error: traitsByUserError,
    refetch: refetchTraitsByUser
  } = useQuery({
    queryKey: ['leaderboards', 'traits-by-user', period, radius, zipCode, userLocation, showFriendsOnly],
    queryFn: fetchTraitsByUser,
    enabled: activeTab === 'traits-by-user' || activeTab === 'all',
    refetchOnWindowFocus: true,
    staleTime: 5 * 1000, // Only 5 seconds for traits to ensure new ratings appear quickly
    retry: 1,
  });

  const { 
    data: weeklyClimbers, 
    isLoading: isLoadingClimbers,
    error: climbersError
  } = useQuery({
    queryKey: ['leaderboards', 'weekly-climbers', radius, zipCode, userLocation, showFriendsOnly],
    queryFn: fetchWeeklyClimbers,
    enabled: activeTab === 'climbers' || activeTab === 'all',
    refetchOnWindowFocus: false,
    retry: 1,
  });

  // Use ProfileAvatar component instead of custom initials function

  const getRankBadgeColor = (rank: number) => {
    if (rank === 1) return 'bg-yellow-500';
    if (rank === 2) return 'bg-gray-400';
    if (rank === 3) return 'bg-amber-700';
    return 'bg-slate-700';
  };
  
  // Helper function to return badge variant based on approval percentage
  const getApprovalVariant = (endorsements: number, totalRatings: number) => {
    const approvalPercent = (endorsements / totalRatings) * 100;
    if (approvalPercent >= 90) return "success" as const; // Green for excellent approval
    if (approvalPercent >= 70) return "default" as const; // Default color for good approval
    if (approvalPercent >= 50) return "secondary" as const; // Secondary color for moderate approval
    if (approvalPercent >= 30) return "outline" as const; // Outline for low approval
    return "destructive" as const; // Red for poor approval
  };

  // Log errors if any query fails
  useEffect(() => {
    if (hostsError) console.error('Error fetching hosts:', hostsError);
    if (activeError) console.error('Error fetching active users:', activeError);
    if (ratedError) console.error('Error fetching rated users:', ratedError);
    if (traitsError) console.error('Error fetching trait leaders:', traitsError);
    if (climbersError) console.error('Error fetching weekly climbers:', climbersError);
  }, [hostsError, activeError, ratedError, traitsError, climbersError]);
  
  // Debug effect for friends filter
  useEffect(() => {
    if (showFriendsOnly && currentUser) {
      console.log("Friends filter debug data:", {
        username: currentUser.username,
        userId: currentUser.id,
        hasFriends: Array.isArray(currentUser.friends),
        friendsCount: currentUser.friends?.length || 0,
        friendIds: currentUser.friends?.map(f => f.id) || [],
        friendUsernames: currentUser.friends?.map(f => f.username) || []
      });
    }
  }, [showFriendsOnly, currentUser]);
  
  // Implement scroll handler for infinite scrolling
  useEffect(() => {
    const handleScroll = () => {
      if (!leaderboardContainerRef.current || loadingMoreRef.current || !hasMoreData) return;
      
      const container = leaderboardContainerRef.current;
      const { scrollTop, scrollHeight, clientHeight } = container;
      
      // Load more when user scrolls to bottom (with a small threshold)
      if (scrollHeight - scrollTop - clientHeight < 200) {
        loadingMoreRef.current = true;
        
        // Increment page and load next batch of data
        setPage(prevPage => prevPage + 1);
        
        // Reset loading flag after a short delay to prevent multiple triggers
        setTimeout(() => {
          loadingMoreRef.current = false;
        }, 500);
      }
    };
    
    const containerElement = leaderboardContainerRef.current;
    if (containerElement) {
      containerElement.addEventListener('scroll', handleScroll);
      
      return () => {
        containerElement.removeEventListener('scroll', handleScroll);
      };
    }
  }, [hasMoreData, activeTab]);

  return (
    <MainLayout>
      <div className="container mx-auto pt-2 pb-0">
        <div className="max-w-[1200px] mx-auto py-0">
          {/* Page Title - Exactly as shown in mockup */}
          <div className="mb-2 text-center md:text-left">
            <h1 className="text-2xl font-bold">Leaderboards</h1>
            <p className="text-muted-foreground text-sm">
              See who's topping the charts in your area
            </p>
          </div>
          
          {/* Desktop view - everything on a single line */}
          <div className="hidden md:flex flex-wrap items-center gap-8 mb-6">
            {/* Location Search Box */}
            <div className="bg-card rounded-lg p-2 border flex items-center gap-2">
              <div className="flex items-center">
                <MapIcon className="h-4 w-4 mr-1 text-muted-foreground" />
                <span className="text-sm font-medium">Location</span>
              </div>
              
              <div className="w-[120px]">
                <LocationSearch 
                  value={zipCode}
                  onChange={setZipCode}
                  onLocationSelect={(location) => {
                    if (location) {
                      // Update user location with the new coordinates
                      setUserLocation(location);
                      
                      // Use geocoder to get the zip code
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
                            setZipCode(newZip);
                            localStorage.setItem('leaderboard_zipCode', newZip);
                            localStorage.setItem('leaderboard_lat', location.latitude.toString());
                            localStorage.setItem('leaderboard_lng', location.longitude.toString());
                          }
                        }
                      }).catch(error => {
                        console.error('Error geocoding location:', error);
                      });
                    }
                  }}
                  isLoading={false}
                />
              </div>
            </div>

            {/* Time Period */}
            <Select value={period} onValueChange={(value) => setPeriod(value as TimePeriod)}>
              <SelectTrigger className="w-[110px] h-9 relative z-10">
                <SelectValue placeholder="Time Period" />
              </SelectTrigger>
              <SelectContent>
                {periodOptions.map(option => (
                  <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>

            {/* Distance Filter */}
            <Select value={radius.toString()} onValueChange={(value) => setRadius(Number(value))}>
              <SelectTrigger className="w-[110px] h-9 relative z-10">
                <SelectValue placeholder="Distance" />
              </SelectTrigger>
              <SelectContent>
                {radiusOptions.map(option => (
                  <SelectItem key={option.value} value={option.value.toString()}>{option.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            
            {/* Friends/Everyone Dropdown */}
            {currentUser && (
              <Select value={showFriendsOnly ? "friends" : "everyone"} onValueChange={(value) => setShowFriendsOnly(value === "friends")}>
                <SelectTrigger className="w-[110px] h-9 relative z-10">
                  <SelectValue placeholder="Show" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="everyone">
                    <div className="flex items-center">
                      <Globe className="h-4 w-4 mr-2" />
                      <span>Everyone</span>
                    </div>
                  </SelectItem>
                  <SelectItem value="friends">
                    <div className="flex items-center">
                      <UserPlus className="h-4 w-4 mr-2" />
                      <span>Friends</span>
                    </div>
                  </SelectItem>
                </SelectContent>
              </Select>
            )}
            
            {/* Search Box */}
            <div className="relative flex-1 max-w-xs">
              <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search users"
                className="pl-8 pr-8 h-9"
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  // If query is at least 3 characters, search immediately
                  if (e.target.value.trim().length >= 3) {
                    setIsSearching(true);
                    searchUsers(e.target.value);
                  } else if (e.target.value.trim().length === 0) {
                    // Clear search results if query is empty
                    setSearchResults({users: []});
                    setIsSearching(false);
                  }
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && searchQuery.trim().length > 0) {
                    setIsSearching(true);
                    searchUsers(searchQuery);
                  }
                }}
              />
              {searchQuery && (
                <button
                  onClick={() => {
                    setSearchQuery('');
                    setIsSearching(false);
                    setSearchResults({users: []});
                  }}
                  className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                >
                  <X className="h-4 w-4" />
                </button>
              )}
            </div>
          </div>

          {/* Mobile view layout */}
          <div className="md:hidden">
            {/* Location Search Box - Styled to match mockup */}
            <div className="bg-card rounded-lg p-2 border mb-1 max-w-full text-center">
              <div className="inline-flex items-center justify-center gap-1">
                <div className="inline-flex items-center">
                  <MapIcon className="h-4 w-4 mr-1 text-muted-foreground" />
                  <span className="text-sm font-medium">Location</span>
                </div>
                
                <div className="w-[130px]">
                  <LocationSearch 
                    value={zipCode}
                    onChange={setZipCode}
                    onLocationSelect={(location) => {
                      if (location) {
                        // Update user location with the new coordinates
                        setUserLocation(location);
                        
                        // Use geocoder to get the zip code
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
                              setZipCode(newZip);
                              localStorage.setItem('leaderboard_zipCode', newZip);
                              localStorage.setItem('leaderboard_lat', location.latitude.toString());
                              localStorage.setItem('leaderboard_lng', location.longitude.toString());
                            }
                          }
                        }).catch(error => {
                          console.error('Error geocoding location:', error);
                        });
                      }
                    }}
                    isLoading={false}
                  />
                </div>
              </div>
            </div>
            
            {/* Filtering Options Row - Compact and matches mockup */}
            <div className="flex flex-wrap justify-center gap-2 mb-1">
              {/* Time Period */}
              <Select value={period} onValueChange={(value) => setPeriod(value as TimePeriod)}>
                <SelectTrigger className="w-[110px] h-9">
                  <SelectValue placeholder="Time Period" />
                </SelectTrigger>
                <SelectContent>
                  {periodOptions.map(option => (
                    <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              {/* Distance Filter */}
              <Select value={radius.toString()} onValueChange={(value) => setRadius(Number(value))}>
                <SelectTrigger className="w-[110px] h-9">
                  <SelectValue placeholder="Distance" />
                </SelectTrigger>
                <SelectContent>
                  {radiusOptions.map(option => (
                    <SelectItem key={option.value} value={option.value.toString()}>{option.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              
              {/* Friends/Everyone Dropdown */}
              {currentUser && (
                <Select value={showFriendsOnly ? "friends" : "everyone"} onValueChange={(value) => setShowFriendsOnly(value === "friends")}>
                  <SelectTrigger className="w-[110px] h-9">
                    <SelectValue placeholder="Show" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="everyone">
                      <div className="flex items-center">
                        <Globe className="h-4 w-4 mr-2" />
                        <span>Everyone</span>
                      </div>
                    </SelectItem>
                    <SelectItem value="friends">
                      <div className="flex items-center">
                        <UserPlus className="h-4 w-4 mr-2" />
                        <span>Friends</span>
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
              )}
              
              {/* Search Box */}
              <div className="relative flex-1 max-w-xs mx-auto">
                <Search className="absolute left-2 top-2.5 h-4 w-4 text-muted-foreground" />
                <Input
                  placeholder="Search users"
                  className="pl-8 pr-8 h-9"
                  value={searchQuery}
                  onChange={(e) => {
                    setSearchQuery(e.target.value);
                    // If query is at least 3 characters, search immediately
                    if (e.target.value.trim().length >= 3) {
                      setIsSearching(true);
                      searchUsers(e.target.value);
                    } else if (e.target.value.trim().length === 0) {
                      // Clear search results if query is empty
                      setSearchResults({users: []});
                      setIsSearching(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' && searchQuery.trim().length > 0) {
                      setIsSearching(true);
                      searchUsers(searchQuery);
                    }
                  }}
                />
                {searchQuery && (
                  <button
                    onClick={() => {
                      setSearchQuery('');
                      setIsSearching(false);
                      setSearchResults({users: []});
                    }}
                    className="absolute right-2 top-2.5 text-muted-foreground hover:text-foreground"
                  >
                    <X className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Main Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="max-w-[1200px] mx-auto">
          <TabsList className="grid grid-cols-4 w-full mb-2 relative z-0">
            <TabsTrigger value="hosts">
              {isMobile ? (
                <div className="w-full flex justify-center">
                  <Trophy size={18} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Trophy size={16} />
                  <span>Top Hosts</span>
                </div>
              )}
            </TabsTrigger>
            <TabsTrigger value="active">
              {isMobile ? (
                <div className="w-full flex justify-center">
                  <Users size={18} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Users size={16} />
                  <span>Most Active</span>
                </div>
              )}
            </TabsTrigger>
            <TabsTrigger value="traits-by-user">
              {isMobile ? (
                <div className="w-full flex justify-center">
                  <Sparkles size={18} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <Sparkles size={16} />
                  <span>Top Traits</span>
                </div>
              )}
            </TabsTrigger>
            <TabsTrigger value="climbers">
              {isMobile ? (
                <div className="w-full flex justify-center">
                  <TrendingUp size={18} />
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <TrendingUp size={16} />
                  <span>Weekly Climbers</span>
                </div>
              )}
            </TabsTrigger>
          </TabsList>

          {/* Top Hosts Tab */}
          <TabsContent value="hosts">
            <Card className="shadow-sm">
              <CardHeader className="py-3">
                <CardTitle className="flex items-center gap-2">
                  <Trophy className="h-5 w-5 text-yellow-500" />
                  Top Hosts
                </CardTitle>
                <CardDescription>
          Users who've created the most Meets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="space-y-4 max-h-[70vh] overflow-y-auto p-1" 
                  ref={leaderboardContainerRef}
                >
                  {isLoadingHosts ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={`hosts-skeleton-${i}`} className="flex items-center gap-4 p-2">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : searchResults?.users?.length > 0 && searchQuery ? (
                    // Create a filtered array of hosts that match the search results
                    (() => {
                      // Get the user IDs from search results
                      // The search API returns users with 'id' property (not 'userId')
                      const searchUserIds = searchResults.users.map((user: { id: number, username: string, displayName?: string|null }) => user.id);
                      
                      // Filter the hosts to only show those in search results
                      // Also apply friends filter if enabled
                      const filteredHosts = topHosts?.filter(host => {
                        const matchesSearch = searchUserIds.includes(host.userId);
                        const matchesFriends = !showFriendsOnly || 
                          (currentUser && currentUser.friends?.some(friend => friend.id === host.userId));
                        return matchesSearch && matchesFriends;
                      }) || [];
                      
                      return filteredHosts.length > 0 ? (
                        <>
                          {/* Filter notification */}
                          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs p-2 mb-2 rounded-md flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <p>Showing {filteredHosts.length} search {filteredHosts.length === 1 ? 'result' : 'results'} for "{searchQuery}" (maintaining original rankings)</p>
                            <button 
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearching(false);
                                setSearchResults({users: []});
                              }}
                              className="ml-auto text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Filtered results */}
                          {filteredHosts.map((host: TopHostEntry) => {
                            // Find the original index of this host in the complete array
                            const originalIndex = topHosts?.findIndex(
                              (h: TopHostEntry) => h.userId === host.userId
                            ) || 0;
                            
                            return (
                              <div 
                                key={host.userId} 
                                className={`flex items-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors`}
                                onClick={() => handleOpenProfile(host.userId)}
                              >
                                <div className={`${getRankBadgeColor(originalIndex + 1)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                                  {originalIndex + 1}
                                </div>
                                <ProfileAvatar
                                  profilePicture={host.profilePicture}
                                  username={host.username}
                                  displayName={host.displayName}
                                  size="md"
                                  className="mr-4"
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium">
                                    {host.displayName || host.username}
                                  </div>
                                  <p className="text-xs text-muted-foreground">@{host.username}</p>
                                </div>
                                <Badge variant="secondary" className="ml-auto">
              {host.count} {host.count === 1 ? 'Meet' : 'Meets'}
                                </Badge>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>No users found matching "{searchQuery}"</p>
                        </div>
                      );
                    })()
                  ) : topHosts && Array.isArray(topHosts) && topHosts.length > 0 ? (
                    (() => {
                      // First add original position to each host
                      const hostsWithRank = topHosts.map((host, originalIndex) => ({
                        ...host,
                        originalRank: originalIndex + 1
                      }));
                      
                      // Then filter if friends-only is selected
                      const filteredHosts = hostsWithRank.filter(host => isUserFriend(host.userId));
                        
                      // Now filter by search if needed and highlight matches
                      return filteredHosts.map((host, index) => {
                        const matchesSearch = !searchQuery || searchQuery.length < 3 || 
                          host.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (host.displayName && host.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
                        
                        const isHighlighted = searchQuery && searchQuery.length >= 3 && matchesSearch;
                        
                        return (
                          <div 
                            key={host.userId} 
                            className={`flex items-center p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${host.userId === currentUser?.id ? 'bg-muted/50' : ''} ${isHighlighted ? 'bg-primary/10 border border-primary/20' : ''}`}
                            onClick={() => {
                              setSelectedUserId(host.userId);
                              setProfileModalOpen(true);
                            }}
                          >
                            <div className={`${getRankBadgeColor(host.originalRank)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                              {host.originalRank}
                            </div>
                            <ProfileAvatar
                              profilePicture={host.profilePicture}
                              username={host.username}
                              displayName={host.displayName}
                              size="md"
                              className="mr-4"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium hover:underline">
                                {host.displayName || host.username}
                              </div>
                              <p className="text-xs text-muted-foreground">@{host.username}</p>
                            </div>
                            <Badge variant="secondary" className="ml-auto">
              {host.count} {host.count === 1 ? 'Meet' : 'Meets'}
                            </Badge>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Trophy className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No data available for this time period and location</p>
                      {showFriendsOnly && <p className="text-sm mt-2">Try switching to "Everyone" view</p>}
                    </div>
                  )}
                  
                  {/* Scroll loading indicator */}
                  {!isLoadingHosts && topHosts && topHosts.length > 20 && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Scroll down to see more users
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Most Active Tab */}
          <TabsContent value="active">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Users className="h-5 w-5 text-green-500" />
                  Most Active Users
                </CardTitle>
                <CardDescription>
          Users who've joined the most Meets
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="space-y-4 max-h-[70vh] overflow-y-auto p-1" 
                  ref={activeTab === 'active' ? leaderboardContainerRef : undefined}
                >
                  {isLoadingActive ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={`active-skeleton-${i}`} className="flex items-center gap-4 p-2">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : searchResults?.users?.length > 0 && searchQuery ? (
                    // Create a filtered array of active users that match the search results
                    (() => {
                      // Get the user IDs from search results
                      // The search API returns users with 'id' property (not 'userId')
                      const searchUserIds = searchResults.users.map((user: { id: number, username: string, displayName?: string|null }) => user.id);
                      
                      // Filter the active users to only show those in search results
                      // Also apply friends filter if enabled
                      const filteredUsers = mostActive?.filter(user => {
                        const matchesSearch = searchUserIds.includes(user.userId);
                        const matchesFriends = !showFriendsOnly || 
                          (currentUser && currentUser.friends?.some(friend => friend.id === user.userId));
                        return matchesSearch && matchesFriends;
                      }) || [];
                      
                      return filteredUsers.length > 0 ? (
                        <>
                          {/* Filter notification */}
                          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs p-2 mb-2 rounded-md flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <p>Showing {filteredUsers.length} search {filteredUsers.length === 1 ? 'result' : 'results'} for "{searchQuery}" (maintaining original rankings)</p>
                            <button 
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearching(false);
                                setSearchResults({users: []});
                              }}
                              className="ml-auto text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Filtered results */}
                          {filteredUsers.map((user: MostActiveEntry) => {
                            // Find the original index of this user in the complete array
                            const originalIndex = mostActive?.findIndex(
                              (u: MostActiveEntry) => u.userId === user.userId
                            ) || 0;
                            
                            return (
                              <div 
                                key={`user-${user.userId}`} 
                                className={`flex items-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors`}
                                onClick={() => handleOpenProfile(user.userId)}
                              >
                                <div className={`${getRankBadgeColor(originalIndex + 1)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                                  {originalIndex + 1}
                                </div>
                                <ProfileAvatar
                                  profilePicture={user.profilePicture}
                                  username={user.username}
                                  displayName={user.displayName}
                                  className="mr-4"
                                  size="md"
                                />
                                <div className="flex-1">
                                  <div className="text-sm font-medium hover:underline cursor-pointer" onClick={() => handleOpenProfile(user.userId)}>
                                    {user.displayName || user.username}
                                  </div>
                                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                                </div>
                                <Badge variant="secondary" className="ml-auto">
              {user.count} {user.count === 1 ? 'Meet' : 'Meets'}
                                </Badge>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>No users found matching "{searchQuery}"</p>
                        </div>
                      );
                    })()
                  ) : mostActive && Array.isArray(mostActive) && mostActive.length > 0 ? (
                    (() => {
                      // First add original position to each user
                      const usersWithRank = mostActive.map((user, originalIndex) => ({
                        ...user,
                        originalRank: originalIndex + 1
                      }));
                      
                      // Then filter if friends-only is selected
                      const filteredUsers = usersWithRank.filter(user => isUserFriend(user.userId));
                        
                      // Now return the list with original ranks preserved
                      return filteredUsers.map((user, index) => {
                        const matchesSearch = !searchQuery || searchQuery.length < 3 || 
                          user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
                        
                        const isHighlighted = searchQuery && searchQuery.length >= 3 && matchesSearch;
                        
                        return (
                          <div 
                            key={`active-${user.userId}`} 
                            className={`flex items-center p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${user.userId === currentUser?.id ? 'bg-muted/50' : ''} ${isHighlighted ? 'bg-primary/10 border border-primary/20' : ''}`}
                            onClick={() => {
                              setSelectedUserId(user.userId);
                              setProfileModalOpen(true);
                            }}
                          >
                            <div className={`${getRankBadgeColor(user.originalRank)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                              {user.originalRank}
                            </div>
                            <ProfileAvatar
                              profilePicture={user.profilePicture}
                              username={user.username}
                              displayName={user.displayName}
                              size="md"
                              className="mr-4"
                            />
                            <div className="flex-1">
                              <div className="text-sm font-medium hover:underline">
                                {user.displayName || user.username}
                              </div>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                            <Badge variant="secondary" className="ml-auto">
              {user.count} {user.count === 1 ? 'Meet' : 'Meets'}
                            </Badge>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Users className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No data available for this time period and location</p>
                      {showFriendsOnly && <p className="text-sm mt-2">Try switching to "Everyone" view</p>}
                    </div>
                  )}
                  
                  {/* Scroll loading indicator */}
                  {!isLoadingActive && mostActive && mostActive.length > 20 && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Scroll down to see more users
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Highest Rated Tab */}
          <TabsContent value="rated">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Star className="h-5 w-5 text-amber-500" />
                  Highest Trait Ratings
                </CardTitle>
                <CardDescription>
                  Users who've received the most positive ratings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="space-y-4 max-h-[70vh] overflow-y-auto p-1" 
                  ref={activeTab === 'rated' ? leaderboardContainerRef : undefined}
                >
                  {isLoadingRated ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={`rated-skeleton-${i}`} className="flex items-center gap-4 p-2">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : searchResults?.users?.length > 0 && searchQuery ? (
                    // Create a filtered array of highest rated users that match the search results
                    (() => {
                      // Get the user IDs from search results
                      const searchUserIds = searchResults.users.map((user: { id: number, username: string, displayName?: string|null }) => user.id);
                      
                      // Filter the highest rated users to only show those in search results
                      // Also apply friends filter if enabled
                      const filteredUsers = highestRated?.filter(user => {
                        const matchesSearch = searchUserIds.includes(user.userId);
                        const matchesFriends = !showFriendsOnly || 
                          (currentUser && currentUser.friends?.some(friend => friend.id === user.userId));
                        return matchesSearch && matchesFriends;
                      }) || [];
                      
                      return filteredUsers.length > 0 ? (
                        <>
                          {/* Filter notification */}
                          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs p-2 mb-2 rounded-md flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <p>Showing {filteredUsers.length} search {filteredUsers.length === 1 ? 'result' : 'results'} for "{searchQuery}" (maintaining original rankings)</p>
                            <button 
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearching(false);
                                setSearchResults({users: []});
                              }}
                              className="ml-auto text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Filtered results */}
                          {filteredUsers.map((user: HighestRatedEntry) => {
                            // Find the original index of this user in the complete array
                            const originalIndex = highestRated?.findIndex(
                              (u: HighestRatedEntry) => u.userId === user.userId
                            ) || 0;
                            
                            return (
                              <div 
                                key={`rated-${user.userId}-${user.topTrait?.traitId || 'no-trait'}`} 
                                className={`flex items-center p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20 transition-colors`}
                                onClick={() => handleOpenProfile(user.userId)}
                              >
                                <div className={`${getRankBadgeColor(originalIndex + 1)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                                  {originalIndex + 1}
                                </div>
                                <ProfileAvatar
                                  profilePicture={user.profilePicture}
                                  username={user.username}
                                  displayName={user.displayName}
                                  className="mr-4"
                                  size="md"
                                />
                                <div className="flex-1">
                                  <Button 
                                    variant="link"
                                    className="text-sm font-medium hover:underline p-0 h-auto"
                                    onClick={() => handleOpenProfile(user.userId)}
                                  >
                                    {user.displayName || user.username}
                                  </Button>
                                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                                </div>
                                
                                {/* Desktop view layout - all in one row */}
                                <div className="hidden md:flex items-center gap-3 ml-auto">
                                  {user.topTrait && (
                                    <>
                                      <div className="text-sm whitespace-nowrap">
                                        <span className="font-medium">{user.topTrait.traitName}</span>
                                        <span className="text-primary ml-1">{user.topTrait.endorsements || user.endorsements}</span>
                                        <span className="text-muted-foreground text-xs ml-1">
                                          ({user.topTrait.totalRatings || user.totalRatings || 0} total ratings)
                                        </span>
                                      </div>
                                      <div>
                                        {(user.topTrait.endorsements || user.endorsements) > 0 ? (
                                          <Badge 
                                            variant={getApprovalVariant(
                                              user.topTrait.endorsements || user.endorsements, 
                                              user.topTrait.totalRatings || user.totalRatings || 1
                                            )}
                                            className="text-xs px-2 py-1 whitespace-nowrap"
                                          >
                                            {Math.round(((user.topTrait.endorsements || user.endorsements) / (user.topTrait.totalRatings || user.totalRatings || 1)) * 100)}% Approval
                                          </Badge>
                                        ) : (
                                          <Badge variant="outline" className="text-xs">
                                            0% Approval
                                          </Badge>
                                        )}
                                      </div>
                                    </>
                                  )}
                                </div>
                                
                                {/* Mobile view layout - stacked */}
                                <div className="flex md:hidden flex-col gap-1 ml-auto">
                                  {user.topTrait && (
                                    <div className="text-right text-sm">
                                      <div className="flex items-center justify-end">
                                        <span className="font-medium">{user.topTrait.traitName}</span>
                                        <span className="text-primary ml-1">{user.topTrait.endorsements || user.endorsements}</span>
                                      </div>
                                      <div className="text-muted-foreground text-xs">
                                        ({user.topTrait.totalRatings || user.totalRatings || 0} total {(user.topTrait.totalRatings || user.totalRatings || 0) === 1 ? 'rating' : 'ratings'})
                                      </div>
                                    </div>
                                  )}
                                  <div className="flex justify-end mt-1">
                                    {(user.topTrait?.endorsements || user.endorsements) > 0 && user.topTrait ? (
                                      <Badge 
                                        variant={getApprovalVariant(user.topTrait.endorsements || user.endorsements, user.topTrait.totalRatings || user.totalRatings || 1)}
                                        className="text-xs px-2 py-1 whitespace-nowrap"
                                      >
                                        {Math.round(((user.topTrait.endorsements || user.endorsements) / (user.topTrait.totalRatings || user.totalRatings || 1)) * 100)}% Approval
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        0% Approval
                                      </Badge>
                                    )}
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>No users found matching "{searchQuery}"</p>
                        </div>
                      );
                    })()
                  ) : highestRated && Array.isArray(highestRated) && highestRated.length > 0 ? (
                    highestRated
                      // Add original rank to each user
                      .map((user, originalIndex) => ({
                        ...user,
                        originalRank: originalIndex + 1
                      }))
                      // Filter for friends only if needed
                      .filter(user => isUserFriend(user.userId))
                      // Map to UI components with original rank preserved
                      .map(user => {
                        const matchesSearch = !searchQuery || searchQuery.length < 3 || 
                          user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
                        
                        const isHighlighted = searchQuery && searchQuery.length >= 3 && matchesSearch;
                        
                        return (
                          <div 
                            key={`rated-${user.userId}-${user.topTrait?.traitId || 'no-trait'}`} 
                            className={`flex items-center p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${user.userId === currentUser?.id ? 'bg-muted/50' : ''} ${isHighlighted ? 'bg-primary/10 border border-primary/20' : ''}`}
                            onClick={() => {
                              setSelectedUserId(user.userId);
                              setProfileModalOpen(true);
                            }}
                          >
                            <div className={`${getRankBadgeColor(user.originalRank)} text-white font-bold w-8 h-8 rounded-full flex items-center justify-center mr-4`}>
                              {user.originalRank}
                            </div>
                            <ProfileAvatar
                              profilePicture={user.profilePicture}
                              username={user.username}
                              displayName={user.displayName}
                              size="md"
                              className="mr-4"
                            />
                            <div className="flex-1">
                              <Button 
                                variant="link"
                                className="text-sm font-medium hover:underline p-0 h-auto"
                                onClick={() => handleOpenProfile(user.userId)}
                              >
                                {user.displayName || user.username}
                              </Button>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                            {/* Desktop view layout - all in one row */}
                            <div className="hidden md:flex items-center gap-3 ml-auto">
                              {user.topTrait && (
                                <>
                                  <div className="text-sm whitespace-nowrap">
                                    <span className="font-medium">{user.topTrait.traitName}</span>
                                    <span className="text-primary ml-1">{user.topTrait.endorsements || user.endorsements}</span>
                                    <span className="text-muted-foreground text-xs ml-1">
                                      ({user.topTrait.totalRatings || user.totalRatings || 0} total ratings)
                                    </span>
                                  </div>
                                  <div>
                                    {(user.topTrait.endorsements || user.endorsements) > 0 ? (
                                      <Badge 
                                        variant={getApprovalVariant(
                                          user.topTrait.endorsements || user.endorsements, 
                                          user.topTrait.totalRatings || user.totalRatings || 1
                                        )}
                                        className="text-xs px-2 py-1 whitespace-nowrap"
                                      >
                                        {Math.round(((user.topTrait.endorsements || user.endorsements) / (user.topTrait.totalRatings || user.totalRatings || 1)) * 100)}% Approval
                                      </Badge>
                                    ) : (
                                      <Badge variant="outline" className="text-xs">
                                        0% Approval
                                      </Badge>
                                    )}
                                  </div>
                                </>
                              )}
                            </div>
                            
                            {/* Mobile view layout - stacked */}
                            <div className="flex md:hidden flex-col gap-1 ml-auto">
                              {user.topTrait && (
                                <div className="text-right text-sm">
                                  <div className="flex items-center justify-end">
                                    <span className="font-medium">{user.topTrait.traitName}</span>
                                    <span className="text-primary ml-1">{user.topTrait.endorsements || user.endorsements}</span>
                                  </div>
                                  <div className="text-muted-foreground text-xs">
                                    ({user.topTrait.totalRatings || user.totalRatings || 0} total {(user.topTrait.totalRatings || user.totalRatings || 0) === 1 ? 'rating' : 'ratings'})
                                  </div>
                                </div>
                              )}
                              <div className="flex justify-end mt-1">
                                {(user.topTrait.endorsements || user.endorsements) > 0 && user.topTrait ? (
                                  <Badge 
                                    variant={getApprovalVariant(
                                      user.topTrait.endorsements || user.endorsements,
                                      user.topTrait.totalRatings || user.totalRatings || 1
                                    )}
                                    className="text-xs px-2 py-1 whitespace-nowrap"
                                  >
                                    {Math.round(((user.topTrait.endorsements || user.endorsements) / (user.topTrait.totalRatings || user.totalRatings || 1)) * 100)}% Approval
                                  </Badge>
                                ) : (
                                  <Badge variant="outline" className="text-xs">
                                    0% Approval
                                  </Badge>
                                )}
                              </div>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Star className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No data available for this time period and location</p>
                      {showFriendsOnly && <p className="text-sm mt-2">Try switching to "Everyone" view</p>}
                    </div>
                  )}
                  
                  {/* Scroll loading indicator */}
                  {!isLoadingRated && highestRated && highestRated.length > 20 && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Scroll down to see more users
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>





          {/* Top Traits By User Tab */}
          <TabsContent value="traits-by-user">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Sparkles className="h-5 w-5 text-purple-500" />
                  Top Trait Leaders
                </CardTitle>
                <CardDescription>
                  Individual trait ratings per user, sorted by highest ratings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="space-y-4 max-h-[70vh] overflow-y-auto p-1" 
                  ref={activeTab === 'traits-by-user' ? leaderboardContainerRef : undefined}
                >
                  {isLoadingTraitsByUser ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={`traits-by-user-skeleton-${i}`} className="flex items-center gap-4 p-2">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : searchResults?.users?.length > 0 && searchQuery ? (
                    (() => {
                      // Get the user IDs from search results
                      const searchUserIds = searchResults.users.map((user: { id: number, username: string, displayName?: string|null }) => user.id);
                      
                      console.log('Search user IDs:', searchUserIds);
                      console.log('Available traits:', traitsByUser?.slice(0, 3));
                      
                      // Filter the traits to only show those in search results
                      // Also apply friends filter if enabled
                      const filteredTraits = traitsByUser?.filter(trait => {
                        // Make sure we're comparing the same types (numbers)
                        const traitUserId = typeof trait.userId === 'string' ? parseInt(trait.userId) : trait.userId;
                        const matchesSearch = searchUserIds.includes(traitUserId);
                        const matchesFriends = !showFriendsOnly || 
                          (currentUser && currentUser.friends?.some(friend => friend.id === traitUserId));
                          
                        return matchesSearch && matchesFriends;
                      }) || [];
                      
                      return filteredTraits.length > 0 ? (
                        <>
                          {/* Filter notification */}
                          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs p-2 mb-2 rounded-md flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <p>Showing {filteredTraits.length} search {filteredTraits.length === 1 ? 'result' : 'results'} for "{searchQuery}" (maintaining original rankings)</p>
                            <button 
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearching(false);
                                setSearchResults({users: []});
                              }}
                              className="ml-auto text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Filtered results */}
                          {filteredTraits.map((traitData, index) => (
                            <div 
                              key={`trait-${traitData.userId}-${traitData.traitId}`} 
                              className={`flex p-2 rounded-lg cursor-pointer hover:bg-muted transition-colors ${traitData.userId === currentUser?.id ? 'bg-muted/50' : ''} items-start md:items-center`}
                              onClick={() => {
                                setSelectedUserId(typeof traitData.userId === 'string' ? parseInt(traitData.userId) : traitData.userId);
                                setProfileModalOpen(true);
                              }}
                            >
                              {/* Rank badge and avatar - same for both mobile and desktop */}
                              <div className="flex items-center">
                                <div className={`${getRankBadgeColor(parseInt(traitData.traitRank))} text-white font-bold w-7 h-7 md:w-8 md:h-8 rounded-full flex flex-shrink-0 items-center justify-center mr-2 md:mr-4`}>
                                  {parseInt(traitData.traitRank)}
                                </div>
                                <ProfileAvatar
                                  profilePicture={traitData.profilePicture}
                                  username={traitData.username}
                                  size="md"
                                  className="h-9 w-9 md:h-10 md:w-10 mr-2 md:mr-4 flex-shrink-0"
                                />
                              </div>
                              
                              {/* Mobile view - stacked layout */}
                              <div className="flex-1 min-w-0 md:hidden">
                                <div className="flex flex-col">
                                  <div className="flex items-center mb-1">
                                    <div 
                                      className="text-sm font-medium hover:underline truncate cursor-pointer"
                                      onClick={() => handleOpenProfile(traitData.userId)}
                                    >
                                      {traitData.displayName || traitData.username}
                                    </div>
                                  </div>
                                  <div className="flex flex-col xs:flex-row gap-1">
                                    <Badge className="flex items-center gap-1 mr-auto" variant="outline">
                                      <span className="truncate max-w-[110px] xs:max-w-[150px]">{traitData.traitName}</span>
                                      <ThumbsUp className="h-3 w-3 ml-1 flex-shrink-0" />
                                      <span className="text-xs flex-shrink-0">{traitData.netRating}</span>
                                    </Badge>
                                    <Badge 
                                      variant={getApprovalVariant(
                                        parseInt(traitData.netRating), 
                                        parseInt(traitData.totalVotes) || 1
                                      )}
                                      className="text-xs px-1.5 py-0.5 text-[10px] whitespace-nowrap w-fit"
                                    >
                                      {Math.round((parseInt(traitData.netRating) / (parseInt(traitData.totalVotes) || 1)) * 100)}% Approval
                                    </Badge>
                                  </div>
                                  <div className="flex items-start mt-1">
                                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                                      <Users className="h-3 w-3 flex-shrink-0" />
                                      <span>{traitData.totalVotes} total ratings</span>
                                    </div>
                                  </div>
                                </div>
                              </div>
                              
                              {/* Desktop view - single line layout like the reference image */}
                              <div className="hidden md:flex md:flex-1 items-center">
                                <div className="flex-shrink-0 mr-4">
                                  <div 
                                    className="text-sm font-medium hover:underline truncate cursor-pointer"
                                    onClick={() => handleOpenProfile(traitData.userId)}
                                  >
                                    {traitData.username}
                                  </div>
                                </div>
                                <div className="flex-1 flex justify-end items-center gap-4">
                                  <Badge className="flex items-center gap-1" variant="outline">
                                    <span className="truncate max-w-[150px]">{traitData.traitName}</span>
                                    <ThumbsUp className="h-3 w-3 ml-1 flex-shrink-0" />
                                    <span className="text-xs flex-shrink-0">{traitData.netRating}</span>
                                  </Badge>
                                  <div className="text-xs text-muted-foreground flex items-center">
                                    <Users className="h-3 w-3 mr-1 flex-shrink-0" />
                                    <span>{traitData.totalVotes} ratings</span>
                                  </div>
                                  <Badge 
                                    variant={getApprovalVariant(
                                      parseInt(traitData.netRating), 
                                      parseInt(traitData.totalVotes) || 1
                                    )}
                                    className="text-xs px-1.5 py-0.5 text-[10px] whitespace-nowrap"
                                  >
                                    {Math.round((parseInt(traitData.netRating) / (parseInt(traitData.totalVotes) || 1)) * 100)}% Approval
                                  </Badge>
                                </div>
                              </div>
                            </div>
                          ))}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>No traits found for "{searchQuery}"</p>
                          <button 
                            onClick={() => {
                              setSearchQuery('');
                              setIsSearching(false);
                              setSearchResults({users: []});
                            }}
                            className="mt-2 text-sm text-blue-500 hover:text-blue-700 dark:text-blue-400 dark:hover:text-blue-300"
                          >
                            Clear search
                          </button>
                        </div>
                      );
                    })()
                  ) : traitsByUser && Array.isArray(traitsByUser) && traitsByUser.length > 0 ? (
                    (() => {
                      // Filter if friends-only is selected
                      const filteredTraitsByUser = traitsByUser.filter(trait => isUserFriend(trait.userId));
                        
                      return filteredTraitsByUser.map((traitData, index) => {
                        return (
                          <div 
                            key={`trait-${traitData.userId}-${traitData.traitId}`} 
                            className={`flex p-2 rounded-lg ${traitData.userId === currentUser?.id ? 'bg-muted/50' : ''} items-start md:items-center cursor-pointer hover:bg-muted/40`}
                            onClick={() => handleOpenProfile(traitData.userId)}
                          >
                            {/* Rank badge and avatar - same for both mobile and desktop */}
                            <div className="flex items-center">
                              <div className={`${getRankBadgeColor(parseInt(traitData.traitRank))} text-white font-bold w-7 h-7 md:w-8 md:h-8 rounded-full flex flex-shrink-0 items-center justify-center mr-2 md:mr-4`}>
                                {parseInt(traitData.traitRank)}
                              </div>
                              <ProfileAvatar
                                profilePicture={traitData.profilePicture}
                                username={traitData.username}
                                size="md"
                                className="h-9 w-9 md:h-10 md:w-10 mr-2 md:mr-4 flex-shrink-0"
                              />
                            </div>
                            
                            {/* Mobile view - stacked layout */}
                            <div className="flex-1 min-w-0 md:hidden">
                              <div className="flex flex-col">
                                <div className="flex items-center mb-1">
                                  <div 
                                    className="text-sm font-medium hover:underline truncate cursor-pointer"
                                    onClick={() => {
                                      setSelectedUserId(traitData.userId);
                                      setProfileModalOpen(true);
                                    }}
                                  >
                                    {traitData.displayName || traitData.username}
                                  </div>
                                  <span className="text-xs text-muted-foreground ml-1">@{traitData.username}</span>
                                </div>

                                <div className="flex items-center gap-2">
                                  <Badge className="flex items-center gap-1" variant="outline">
                                    <span className="truncate max-w-[110px] xs:max-w-[150px]">{traitData.traitName}</span>
                                    <ThumbsUp className="h-3 w-3 ml-1 flex-shrink-0" />
                                    <span className="text-xs flex-shrink-0">{traitData.netRating}</span>
                                  </Badge>
                                  <Badge 
                                    variant={getApprovalVariant(
                                      parseInt(traitData.netRating), 
                                      parseInt(traitData.totalVotes) || 1
                                    )}
                                    className="text-xs px-1.5 py-0.5 text-[10px] whitespace-nowrap flex-shrink-0"
                                  >
                                    {Math.round((parseInt(traitData.netRating) / (parseInt(traitData.totalVotes) || 1)) * 100)}% Approval
                                  </Badge>
                                </div>
                                <div className="flex items-start mt-1">
                                  <div className="text-xs text-muted-foreground flex items-center gap-1">
                                    <Users className="h-3 w-3 flex-shrink-0" />
                                    <span>{traitData.totalVotes} total ratings</span>
                                  </div>
                                </div>
                              </div>
                            </div>
                            
                            {/* Desktop view - single line layout like the reference image */}
                            <div className="hidden md:flex md:flex-1 items-center">
                              <div className="flex-shrink-0 mr-4">
                                <div className="flex flex-col">
                                  <div 
                                    className="text-sm font-medium hover:underline truncate cursor-pointer"
                                    onClick={() => {
                                      setSelectedUserId(traitData.userId);
                                      setProfileModalOpen(true);
                                    }}
                                  >
                                    {traitData.displayName || traitData.username}
                                  </div>
                                  <span className="text-xs text-muted-foreground">@{traitData.username}</span>
                                </div>
                              </div>
                              <div className="flex-1 flex justify-end items-center gap-4">
                                <Badge className="flex items-center gap-1" variant="outline">
                                  <span className="truncate max-w-[150px]">{traitData.traitName}</span>
                                  <ThumbsUp className="h-3 w-3 ml-1 flex-shrink-0" />
                                  <span className="text-xs flex-shrink-0">{traitData.netRating}</span>
                                </Badge>
                                <div className="text-xs text-muted-foreground flex items-center">
                                  <Users className="h-3 w-3 mr-1 flex-shrink-0" />
                                  <span>{traitData.totalVotes} ratings</span>
                                </div>
                                <Badge 
                                  variant={getApprovalVariant(
                                    parseInt(traitData.netRating), 
                                    parseInt(traitData.totalVotes) || 1
                                  )}
                                  className="text-xs px-1.5 py-0.5 text-[10px] whitespace-nowrap"
                                >
                                  {Math.round((parseInt(traitData.netRating) / (parseInt(traitData.totalVotes) || 1)) * 100)}% Approval
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      });
                    })()
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <Sparkles className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No trait data available for this time period and location</p>
                      {showFriendsOnly && <p className="text-sm mt-2">Try switching to "Everyone" view</p>}
                    </div>
                  )}
                  
                  {/* Scroll loading indicator */}
                  {!isLoadingTraitsByUser && traitsByUser && traitsByUser.length > 20 && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Scroll down to see more traits
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Weekly Climbers Tab */}
          <TabsContent value="climbers">
            <Card className="shadow-sm">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <TrendingUp className="h-5 w-5 text-blue-500" />
                  Weekly Climbers
                </CardTitle>
                <CardDescription>
                  Users who've increased their activity the most this week
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div 
                  className="space-y-4 max-h-[70vh] overflow-y-auto p-1"
                  ref={activeTab === 'climbers' ? leaderboardContainerRef : undefined}
                >
                  {isLoadingClimbers ? (
                    Array(5).fill(0).map((_, i) => (
                      <div key={`climbers-skeleton-${i}`} className="flex items-center gap-4 p-2">
                        <Skeleton className="w-10 h-10 rounded-full" />
                        <div className="space-y-2 flex-1">
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-3 w-16" />
                        </div>
                        <Skeleton className="h-6 w-12" />
                      </div>
                    ))
                  ) : searchResults?.users?.length > 0 && searchQuery ? (
                    // Create a filtered array of climbers that match the search results
                    (() => {
                      // Get the user IDs from search results
                      const searchUserIds = searchResults.users.map((user: { id: number, username: string, displayName?: string|null }) => user.id);
                      
                      // Filter the weekly climbers to only show those in search results
                      // Also apply friends filter if enabled
                      const filteredUsers = weeklyClimbers?.filter(user => {
                        const matchesSearch = searchUserIds.includes(user.userId);
                        const matchesFriends = !showFriendsOnly || 
                          (currentUser && currentUser.friends?.some(friend => friend.id === user.userId));
                        return matchesSearch && matchesFriends;
                      }) || [];
                      
                      return filteredUsers.length > 0 ? (
                        <>
                          {/* Filter notification */}
                          <div className="bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200 text-xs p-2 mb-2 rounded-md flex items-center">
                            <AlertCircle className="h-4 w-4 mr-2" />
                            <p>Showing {filteredUsers.length} search {filteredUsers.length === 1 ? 'result' : 'results'} for "{searchQuery}" (maintaining original rankings)</p>
                            <button 
                              onClick={() => {
                                setSearchQuery('');
                                setIsSearching(false);
                                setSearchResults({users: []});
                              }}
                              className="ml-auto text-yellow-700 dark:text-yellow-300 hover:text-yellow-900 dark:hover:text-yellow-100"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                          
                          {/* Filtered results */}
                          {filteredUsers.map((user: WeeklyClimberEntry) => {
                            // Find the original index of this user in the complete array
                            const originalIndex = weeklyClimbers?.findIndex(
                              (u: WeeklyClimberEntry) => u.userId === user.userId
                            ) || 0;
                            
                            return (
                              <div 
                                key={`climber-${user.userId}`} 
                                className={`flex items-start p-2 rounded-lg bg-yellow-50 dark:bg-yellow-900/10 border border-yellow-200 dark:border-yellow-800 cursor-pointer hover:bg-yellow-100 dark:hover:bg-yellow-900/20`}
                                onClick={() => handleOpenProfile(user.userId)}
                              >
                                <div className="flex items-center">
                                  <div className={`${getRankBadgeColor(originalIndex + 1)} text-white font-bold w-7 h-7 md:w-8 md:h-8 rounded-full flex flex-shrink-0 items-center justify-center mr-2 md:mr-4`}>
                                    {originalIndex + 1}
                                  </div>
                                  <ProfileAvatar
                                    profilePicture={user.profilePicture}
                                    username={user.username}
                                    displayName={user.displayName}
                                    size="md"
                                    className="h-9 w-9 md:h-10 md:w-10 mr-2 md:mr-4 flex-shrink-0"
                                  />
                                </div>
                                <div className="flex-1">
                                  <Button 
                                    variant="link"
                                    className="text-sm font-medium hover:underline p-0 h-auto"
                                    onClick={() => handleOpenProfile(user.userId)}
                                  >
                                    {user.displayName || user.username}
                                  </Button>
                                  <p className="text-xs text-muted-foreground">@{user.username}</p>
                                </div>
                                <div className="text-right ml-auto">
                                  <div className="flex flex-col md:flex-row md:items-center md:gap-3">
                                    <p className="text-xs text-muted-foreground mb-1 md:mb-0 md:order-1">
                                      <span className="hidden md:inline-block">{user.thisWeekCount} this week</span>
                                      <span className="inline-block md:hidden">{user.thisWeekCount} this week</span>
                                    </p>
                                    <Badge variant="outline" className={`${user.growthPercent > 0 ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}`}>
                                      {user.growthPercent === Infinity ? 'New' : `${user.growthPercent > 0 ? '+' : ''}${Math.round(user.growthPercent)}%`}
                                    </Badge>
                                  </div>
                                </div>
                              </div>
                            );
                          })}
                        </>
                      ) : (
                        <div className="text-center py-8 text-muted-foreground">
                          <User className="h-10 w-10 mx-auto mb-2 opacity-20" />
                          <p>No users found matching "{searchQuery}"</p>
                        </div>
                      );
                    })()
                  ) : weeklyClimbers && Array.isArray(weeklyClimbers) && weeklyClimbers.length > 0 ? (
                    weeklyClimbers
                      // Add original rank to each user
                      .map((user, originalIndex) => ({
                        ...user,
                        originalRank: originalIndex + 1
                      }))
                      // Filter for friends only if needed
                      .filter(user => isUserFriend(user.userId))
                      // Map to UI components with original rank preserved
                      .map(user => {
                        const matchesSearch = !searchQuery || searchQuery.length < 3 || 
                          user.username.toLowerCase().includes(searchQuery.toLowerCase()) ||
                          (user.displayName && user.displayName.toLowerCase().includes(searchQuery.toLowerCase()));
                        
                        const isHighlighted = searchQuery && searchQuery.length >= 3 && matchesSearch;
                        
                        return (
                          <div 
                            key={`climber-${user.userId}`} 
                            className={`flex items-start p-2 rounded-lg ${user.userId === currentUser?.id ? 'bg-muted/50' : ''} ${isHighlighted ? 'bg-primary/10 border border-primary/20' : ''} cursor-pointer hover:bg-muted/40`}
                            onClick={() => handleOpenProfile(user.userId)}
                          >
                            <div className="flex items-center">
                              <div className={`${getRankBadgeColor(user.originalRank)} text-white font-bold w-7 h-7 md:w-8 md:h-8 rounded-full flex flex-shrink-0 items-center justify-center mr-2 md:mr-4`}>
                                {user.originalRank}
                              </div>
                              <ProfileAvatar
                                profilePicture={user.profilePicture}
                                username={user.username}
                                displayName={user.displayName}
                                size="md"
                                className="h-9 w-9 md:h-10 md:w-10 mr-2 md:mr-4 flex-shrink-0"
                              />
                            </div>
                            <div className="flex-1">
                              <Button 
                                variant="link"
                                className="text-sm font-medium hover:underline p-0 h-auto"
                                onClick={() => handleOpenProfile(user.userId)}
                              >
                                {user.displayName || user.username}
                              </Button>
                              <p className="text-xs text-muted-foreground">@{user.username}</p>
                            </div>
                            <div className="text-right ml-auto">
                              <div className="flex flex-col md:flex-row md:items-center md:gap-3">
                                <p className="text-xs text-muted-foreground mb-1 md:mb-0 md:order-1">
                                  <span className="hidden md:inline-block">{user.thisWeekCount} this week</span>
                                  <span className="inline-block md:hidden">{user.thisWeekCount} this week</span>
                                </p>
                                <Badge variant="outline" className={`${user.growthPercent > 0 ? 'text-green-600 border-green-600' : 'text-red-600 border-red-600'}`}>
                                  {user.growthPercent === Infinity ? 'New' : `${user.growthPercent > 0 ? '+' : ''}${Math.round(user.growthPercent)}%`}
                                </Badge>
                              </div>
                            </div>
                          </div>
                        );
                      })
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      <TrendingUp className="h-10 w-10 mx-auto mb-2 opacity-20" />
                      <p>No data available for this time period and location</p>
                      {showFriendsOnly && <p className="text-sm mt-2">Try switching to "Everyone" view</p>}
                    </div>
                  )}
                  
                  {/* Scroll loading indicator */}
                  {!isLoadingClimbers && weeklyClimbers && weeklyClimbers.length > 20 && (
                    <div className="py-2 text-center text-sm text-muted-foreground">
                      Scroll down to see more users
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
      {/* User Profile Modal */}
      <UserProfileModal 
        userId={selectedUserId}
        open={profileModalOpen}
        onOpenChange={setProfileModalOpen}
      />
    </MainLayout>
  );
};

export default LeaderboardPage;