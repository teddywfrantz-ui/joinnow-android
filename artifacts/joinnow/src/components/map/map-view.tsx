import { type Meetup } from '@db/schema';
import { Code, Users, School, Dumbbell, Palette, Gamepad, Music, Utensils, LayoutGrid, Loader2, Calendar, MapPin, Clock, AlertTriangle, User } from 'lucide-react';
import { cn } from "@/lib/utils";
import { GoogleMap, InfoWindow, Circle, useJsApiLoader } from '@react-google-maps/api';
const isJoinNowAndroid =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('JoinNowAndroid/');

import { useState, useCallback, useEffect, useRef } from 'react';
import { formatDistanceToNow } from 'date-fns';
import { GOOGLE_MAPS_CONFIG } from '@/utils/google-maps';
import { useQueryClient } from '@tanstack/react-query';
import { Button } from "@/components/ui/button";
import { UserProfileModal } from "@/components/users/user-profile-modal";
import { GroupMembersDialog } from "@/components/groups/group-members-dialog";

function escapeHtml(value: unknown): string {
  return String(value ?? "").replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

// Define a consistent location type
export interface UserLocation {
  latitude: number;
  longitude: number;
}

interface MapViewProps {
  meetups: Meetup[];
  onMeetupSelect: (meetup: Meetup) => void;
  onCenterChanged?: (map: google.maps.Map) => void;
  zipCode: string;
  userLocation: UserLocation | null;
  searchRadius: number; 
  activeMeetupId?: number;
  pendingRequestIds?: number[];
  currentUserId?: number;
}

// Function to calculate distance between two coordinates in miles
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

// Center point of continental US
const US_CENTER = {
  lat: 39.8283,
  lng: -98.5795
};

const mapContainerStyle = {
  width: '100%',
  height: '100%'
};

function getMarkerColor(currentParticipants: number, maxParticipants: number): string {
  const percentage = (currentParticipants / maxParticipants) * 100;
  if (percentage >= 100) return "#ef4444"; 
  if (percentage >= 75) return "#f97316"; 
  if (percentage >= 50) return "#eab308"; 
  return "#22c55e"; 
}

function getThemeIconPath(theme: string): string {
  const iconPaths: Record<string, string> = {
    technology: 'M10 4H4c-1.1 0-1.99.9-1.99 2L2 18c0 1.1.9 2 2 2h16c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2h-8l-2-2z',
    social: 'M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z',
    education: 'M5 13.18v4L12 21l7-3.82v-4L12 17l-7-3.82zM12 3L1 9l11 6 9-4.91V17h2V9L12 3z',
    sports: 'M20.57 14.86L22 13.43 20.57 12 17 15.57 8.43 7 12 3.43 10.57 2 9.14 3.43 7.71 2 5.57 4.14 4.14 2.71 2.71 4.14l1.43 1.43L2 7.71l1.43 1.43L2 10.57 3.43 12 7 8.43 15.57 17 12 20.57 13.43 22l1.43-1.43L16.29 22l2.14-2.14 1.43 1.43 1.43-1.43-1.43-1.43L22 16.29z',
    arts: 'M12 3c-4.97 0-9 4.03-9 9s4.03 9 9 9c.83 0 1.5-.67 1.5-1.5 0-.39-.15-.74-.39-1.01-.23-.26-.38-.61-.38-.99 0-.83.67-1.5 1.5-1.5H16c2.76 0 5-2.24 5-5 0-4.42-4.03-8-9-8zm-5.5 9c-.83 0-1.5-.67-1.5-1.5S5.67 9 6.5 9 8 9.67 8 10.5 7.33 12 6.5 12zm3-4C8.67 8 8 7.33 8 6.5S8.67 5 9.5 5s1.5.67 1.5 1.5S10.33 8 9.5 8zm5 0c-.83 0-1.5-.67-1.5-1.5S13.67 5 14.5 5s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    gaming: 'M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z',
    music: 'M12 3v10.55c-.59-.34-1.27-.55-2-.55-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4V7h4V3h-6z',
    food: 'M8.1 13.34l2.83-2.83L3.91 3.5c-1.56 1.56-1.56 4.09 0 5.66l4.19 4.18zm6.78-1.81c1.53.71 3.68.21 5.27-1.38 1.91-1.91 2.28-4.65.81-6.12-1.46-1.46-4.2-1.1-6.12.81-1.59 1.59-2.09 3.74-1.38 5.27L3.7 19.87l1.41 1.41L12 14.41l6.88 6.88 1.41-1.41L13.41 13l1.47-1.47z',
    other: 'M4 8h4V4H4v4zm6 12h4v-4h-4v4zm-6 0h4v-4H4v4zm0-6h4v-4H4v4zm6 0h4v-4h-4v4zm6-10v4h4V4h-4zm-6 4h4V4h-4v4zm6 6h4v-4h-4v4zm0 6h4v-4h-4v4z',
  };

  return iconPaths[theme.toLowerCase()] || iconPaths.other;
}

function getThemeIcon(theme: string) {
  const iconProps = { className: "h-4 w-4 text-primary" };
  switch (theme.toLowerCase()) {
    case 'technology': return <Code {...iconProps} />;
    case 'social': return <Users {...iconProps} />;
    case 'education': return <School {...iconProps} />;
    case 'sports': return <Dumbbell {...iconProps} />;
    case 'arts': return <Palette {...iconProps} />;
    case 'gaming': return <Gamepad {...iconProps} />;
    case 'music': return <Music {...iconProps} />;
    case 'food': return <Utensils {...iconProps} />;
    default: return <LayoutGrid {...iconProps} />;
  }
}

function getParticipantStatus(current: number, max: number) {
  const percentage = (current / max) * 100;
  if (percentage >= 100) return "Full";
  if (percentage >= 75) return "Almost Full";
  if (percentage >= 50) return "Filling Up";
  return "Open";
}

function getParticipantStatusColor(current: number, max: number) {
  const percentage = (current / max) * 100;
  if (percentage >= 100) return "#ef4444"; 
  if (percentage >= 75) return "#f97316"; 
  if (percentage >= 50) return "#eab308"; 
  return "#22c55e"; 
}

function createMarkerIcon(color: string, theme: string, isActive: boolean, hasPendingRequest: boolean) {
  const svgString = `
    <svg xmlns="http://www.w3.org/2000/svg" width="96" height="128" viewBox="0 0 96 128">
      <defs>
        <filter id="shadow" x="-150%" y="-150%" width="400%" height="400%">
          <feDropShadow dx="0" dy="4" stdDeviation="6" flood-opacity="0.8" flood-color="rgba(0,0,0,0.9)"/>
        </filter>
        ${isActive ? `
        <filter id="glow" x="-100%" y="-100%" width="300%" height="300%">
          <feGaussianBlur stdDeviation="10" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
        ` : ''}
        <filter id="pendingGlow" x="-50%" y="-50%" width="200%" height="200%">
          <feGaussianBlur stdDeviation="2" result="coloredBlur"/>
          <feMerge>
            <feMergeNode in="coloredBlur"/>
            <feMergeNode in="SourceGraphic"/>
          </feMerge>
        </filter>
      </defs>
      <g transform="translate(48, 40)" filter="url(#shadow)">
        ${isActive ? `
        <circle cx="0" cy="0" r="28" fill="black" opacity="0.2">
          <animate attributeName="r" values="28;34;28" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.2;0.3;0.2" dur="2s" repeatCount="indefinite" />
        </circle>
        <circle cx="0" cy="0" r="26" fill="#00ffff" opacity="0.6" filter="url(#glow)">
          <animate attributeName="r" values="26;32;26" dur="2s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="0.6;0.8;0.6" dur="2s" repeatCount="indefinite" />
        </circle>
        ` : ''}
        <circle cx="0" cy="0" r="20" fill="white" stroke="${color}" stroke-width="2"/>
        <g transform="translate(-10, -10) scale(0.75)">
          <path d="${getThemeIconPath(theme)}" fill="#000000"/>
        </g>
        <path d="M-10 18 L0 34 L10 18 Z" fill="${color}"/>
      </g>
      ${hasPendingRequest ? `
      <g transform="translate(65, 20)">
        <circle cx="0" cy="0" r="8" fill="#3b82f6" stroke="white" stroke-width="2">
          <animate attributeName="r" values="8;9;8" dur="1.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.9;1" dur="1.5s" repeatCount="indefinite" />
        </circle>
        <g transform="translate(-6, -6) scale(0.5)">
          <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm0 18c-4.4 0-8-3.6-8-8s3.6-8 8-8 8 3.6 8 8-3.6 8-8 8zm.5-13h-1v6l5.2 3.2.8-1.3-4-2.4V7z" fill="white">
            <animateTransform
              attributeName="transform"
              type="rotate"
              from="0 12 12"
              to="360 12 12"
              dur="4s"
              repeatCount="indefinite"
            />
          </path>
        </g>
      </g>
      ` : ''}
    </svg>
  `;

  return {
    url: 'data:image/svg+xml;charset=UTF-8,' + encodeURIComponent(svgString),
    scaledSize: new google.maps.Size(96, 128),
    anchor: new google.maps.Point(48, 74),
  };
}

export function MapView({
  meetups,
  onMeetupSelect,
  onCenterChanged,
  zipCode,
  userLocation,
  searchRadius,
  activeMeetupId,
  pendingRequestIds = [],
  currentUserId,
}: MapViewProps) {
  // State for user profile modal
  const [map, setMap] = useState<google.maps.Map | null>(null);
  const [hoveredMeetup, setHoveredMeetup] = useState<Meetup | null>(null);
  const [circleCenter, setCircleCenter] = useState<google.maps.LatLngLiteral | null>(null);
  const [mapLoaded, setMapLoaded] = useState(false);
  const [selectedUserId, setSelectedUserId] = useState<number | null>(null);
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false);
  const [selectedGroupId, setSelectedGroupId] = useState<number | null>(null);
  const [selectedGroupName, setSelectedGroupName] = useState<string | null>(null);
  const markersRef = useRef<Map<number, google.maps.Marker>>(new Map());
  const infoWindowsRef = useRef<Map<number, google.maps.InfoWindow>>(new Map());
  const queryClient = useQueryClient(); 
  const currentZipCodeRef = useRef(zipCode);
  const [locationSelectionMade, setLocationSelectionMade] = useState(false); 

  const bindInfoWindowActions = useCallback((content: HTMLElement, meetup: Meetup) => {
    const creatorButton = content.querySelector<HTMLButtonElement>(
      `#view-creator-${meetup.id}`,
    );
    creatorButton?.addEventListener("click", (event) => {
      event.preventDefault();
      event.stopPropagation();
      setSelectedUserId(meetup.creator_id);
      setIsProfileModalOpen(true);
    });

    const groupButton = content.querySelector<HTMLButtonElement>(
      `#view-group-${meetup.id}`,
    );
    if (groupButton && meetup.group_id) {
      groupButton.addEventListener("click", (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedGroupId(meetup.group_id ?? null);
        setSelectedGroupName(
          meetup.creator_group_name ||
            meetup.creator_displayName ||
            meetup.creator_username ||
            "Group",
        );
      });
    }
  }, []);

  const { isLoaded } = useJsApiLoader(GOOGLE_MAPS_CONFIG);

  const clearAllMarkers = useCallback(() => {
    // Clear all markers
    markersRef.current.forEach((marker) => {
      google.maps.event.clearInstanceListeners(marker);
      marker.setMap(null);
    });
    markersRef.current.clear();
    
    // Clear all InfoWindows
    infoWindowsRef.current.forEach((infoWindow) => {
      infoWindow.close();
    });
    infoWindowsRef.current.clear();
    
    console.log('Cleared all markers and InfoWindows');
  }, []);

  // We're no longer updating map center when user location changes directly
  // This prevents the map from "jumping" when user location is set
  // Instead, we rely on the zip code geocoding to set the map center

  // Update map center when zip code changes
  useEffect(() => {
    if (!map || !zipCode || zipCode.trim() === '') { 
      return;
    }

    console.log('Processing zipCode change:', zipCode);

    // Only process if this is an actual change (not just from input changing)
    // or if we have a zip code format (which should be geocoded immediately)
    const isZipCode = /^\d{5}(-\d{4})?$/.test(zipCode);
    console.log('Is zipCode in 5-digit format?', isZipCode);

    // Store the current zip code for comparison in next updates
    if (zipCode !== currentZipCodeRef.current || isZipCode) {
      currentZipCodeRef.current = zipCode;

      const geocoder = new google.maps.Geocoder();

      const geocodeRequest: google.maps.GeocoderRequest = { 
        address: zipCode,
        componentRestrictions: { 
          country: 'US'
        }
      };

      console.log('Geocoding zipCode with request:', geocodeRequest);

      // If it's specifically a 5-digit ZIP code, add the postalCode restriction
      if (isZipCode) {
        console.log('Adding postal code restriction for ZIP:', zipCode);
        geocodeRequest.componentRestrictions = {
          ...geocodeRequest.componentRestrictions,
          postalCode: zipCode
        };
      }
      
      // Perform geocoding for any location input
      // This will work for both ZIP codes and address strings
      performGeocoding(geocoder, geocodeRequest);
    }
  }, [zipCode, map, userLocation]);

  // Helper function to perform geocoding
  const performGeocoding = (geocoder: google.maps.Geocoder, request: google.maps.GeocoderRequest) => {
    geocoder.geocode(request)
      .then(result => {
        if (!result || !result.results || result.results.length === 0) {
          console.warn("No valid results found for location:", request.address);
          return;
        }

        const location = result.results[0].geometry.location;
        if (!location || typeof location.lat !== "function" || typeof location.lng !== "function") {
          console.error("Geocode response missing lat/lng functions:", result);
          return;
        }

        const newCenter = { lat: location.lat(), lng: location.lng() };
        console.log("Setting new circle center:", newCenter);

        setCircleCenter(newCenter);
        map?.panTo(newCenter);
        map?.setZoom(11);
      })
      .catch(error => {
        console.error("Geocoding error:", error);
      });
  };

  const onLoad = useCallback((map: google.maps.Map) => {
    console.log("Map loaded successfully");
    setMap(map);
    setMapLoaded(true); // Set mapLoaded state to true

    // Set initial position based on zip code first, with user location as fallback
    if (zipCode) {
      // If we have a zip code but no user location, trigger the zip code geocoding
      const geocoder = new google.maps.Geocoder();

      // Use the same geocoding approach as in the useEffect
      const isZipCode = /^\d{5}(-\d{4})?$/.test(zipCode);
      const geocodeRequest: google.maps.GeocoderRequest = { 
        address: zipCode,
        componentRestrictions: { 
          country: 'US'
        }
      };

      if (isZipCode) {
        geocodeRequest.componentRestrictions = {
          ...geocodeRequest.componentRestrictions,
          postalCode: zipCode
        };
      }

      // We'll only set the initial circle center from the geocoding results
      // This helps ensure we don't briefly show the user's actual location before 
      // centering on the ZIP code location
      
      // We intentionally don't set circleCenter to userLocation here
      // to prevent map from starting at user's physical location
      
      geocoder.geocode(geocodeRequest)
        .then(result => {
          if (result.results[0]?.geometry?.location) {
            const location = result.results[0].geometry.location;
            const newCenter = { lat: location.lat(), lng: location.lng() };
            
            // Important: Set circleCenter first to prevent flickering
            setCircleCenter(newCenter);
            
            // Then update the map display
            map.setCenter(newCenter);
            map.setZoom(11);
          } else {
            map.setCenter(US_CENTER);
            map.setZoom(4);
          }
        })
        .catch(() => {
          map.setCenter(US_CENTER);
          map.setZoom(4);
        });
    } else {
      map.setCenter(US_CENTER);
      map.setZoom(4);
    }

    // Add listener for center changes
    if (onCenterChanged) {
      map.addListener('idle', () => onCenterChanged(map));
    }
  }, [userLocation, zipCode, onCenterChanged, setMapLoaded]);

  const onUnmount = useCallback(() => {
    clearAllMarkers();
    setMap(null);
    setMapLoaded(false); // Reset map loaded state
  }, [clearAllMarkers, setMapLoaded]);

  // Add debug logging for pending requests
  useEffect(() => {
    console.log('MapView component - Processing props:', {
      pendingRequestIds,
      numberOfMeetups: meetups.length,
      meetupIds: meetups.map(m => m.id)
    });
  }, [meetups, pendingRequestIds]);
  
  // Debug log for mapLoaded state changes
  useEffect(() => {
    console.log('MapView - mapLoaded state changed:', { mapLoaded });
  }, [mapLoaded]);

  // Add a specific effect to handle pendingRequestIds changes
  // This ensures markers are updated when pending request status changes
  useEffect(() => {
    if (!map || !isLoaded || !mapLoaded) return;
    
    console.log('PendingRequestIds changed, updating markers:', {
      pendingRequestIds,
      markerCount: markersRef.current.size,
      meetupIds: Array.from(markersRef.current.keys())
    });
    
    // Update marker styles for all existing markers
    markersRef.current.forEach((marker, meetupId) => {
      const meetup = meetups.find(m => m.id === meetupId);
      if (meetup) {
        const markerColor = getMarkerColor(meetup.participantCount || 0, meetup.maxParticipants || 0);
        const isActive = meetup.id === activeMeetupId;
        const hasPendingRequest = pendingRequestIds.includes(meetup.id);
        
        console.log(`Updating marker for meetup ${meetupId}:`, {
          hasPendingRequest,
          isActive,
          theme: meetup.theme,
          title: meetup.title,
          participants: `${meetup.participantCount || 0}/${meetup.maxParticipants || 0}`
        });
        
        // Update the marker icon to reflect the current state
        const updatedIcon = createMarkerIcon(markerColor, meetup.theme, isActive, hasPendingRequest);
        marker.setIcon(updatedIcon);
        
        // Update animation based on active state
        marker.setAnimation(isActive ? google.maps.Animation.BOUNCE : null);
        
        // Update marker title to show pending status
        let title = meetup.title;
        if (hasPendingRequest) {
          title += ' [Pending Request]';
        }
        if (isActive) {
          title += ' [Active]';
        }
        marker.setTitle(title);
        
        // Ensure the InfoWindow content is updated
        const infoWindow = infoWindowsRef.current.get(meetupId);
        if (infoWindow) {
          const canViewExactLocation =
            meetup.creator_id === currentUserId ||
            activeMeetupId === meetup.id;
          const content = document.createElement('div');
          content.innerHTML = `
            <div class="info-window">
              <h3 class="text-lg font-semibold">${escapeHtml(meetup.title)}</h3>
              <p class="text-sm">${escapeHtml(meetup.theme)} · ${escapeHtml(meetup.participantCount || 0)}/${escapeHtml(meetup.maxParticipants || 0)} participants</p>
              ${hasPendingRequest ? '<p class="text-blue-500 font-medium">Request Pending</p>' : ''}
              ${canViewExactLocation && meetup.exactLocation ? `<p class="text-xs mt-1">${escapeHtml(meetup.exactLocation)}</p>` : ''}
               <p class="text-xs font-medium mt-1">Created by: ${meetup.group_id ? `<button id="view-group-${escapeHtml(meetup.id)}" class="font-medium text-blue-600 hover:underline">${escapeHtml(meetup.creator_group_name || meetup.creator_displayName || meetup.creator_username || 'Group')}</button>` : escapeHtml(meetup.creator_displayName || meetup.creator_username || 'Unknown')}</p>
               ${meetup.group_id ? `<div class="mt-2">
                 <span class="text-xs text-muted-foreground">View the group members above</span>
               </div>` : `<div class="mt-2">
                 <button id="view-creator-${escapeHtml(meetup.id)}" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                   View Creator Profile
                 </button>
               </div>`}
            </div>
          `;
          infoWindow.setContent(content);
          bindInfoWindowActions(content, meetup);
        }
      }
    });
  }, [
    pendingRequestIds,
    map,
    isLoaded,
    mapLoaded,
    meetups,
    activeMeetupId,
    currentUserId,
    bindInfoWindowActions,
  ]);

  useEffect(() => {
    if (!map || !isLoaded) return;

    // Force clear all markers and recreate them
    clearAllMarkers();
    
    // Use effectiveCircleCenter to ensure consistency with the displayed circle
    // Only use circleCenter (ZIP code location) for consistency
    // This enforces that we only show meetups around the ZIP code location, not user's physical location
    const effectiveCircleCenter = circleCenter;
    
    // Safely extract user location for logging
    const safeUserLocation = userLocation && 
      typeof userLocation === 'object' && 
      userLocation !== null ? {
        lat: (userLocation as UserLocation).latitude,
        lng: (userLocation as UserLocation).longitude
      } : null;
      
    console.log("Filtering meetups with:", {
      searchRadius,
      effectiveCircleCenter,
      meetupCount: meetups.length,
      userLocation: safeUserLocation
    });

    // Filter meetups by distance only if we have a center point
    // Otherwise, we use the filterMeetups function in home.tsx which already handles the empty location case
    const visibleMeetups = effectiveCircleCenter 
      ? meetups.filter(meetup => {
          if (!meetup.latitude || !meetup.longitude) return false;
          
          // Calculate distance between meetup and circle center
          const distance = calculateDistance(
            meetup.latitude,
            meetup.longitude,
            effectiveCircleCenter.lat,
            effectiveCircleCenter.lng
          );
          
          // Only show meetups within the radius
          return distance <= searchRadius;
        })
      : []; // If no center, show no meetups
    
    // Update or create markers for visible meetups
    console.log(`Creating markers for ${visibleMeetups.length} meetups`);
    
    // Create new markers for all meetups
    visibleMeetups.forEach(meetup => {
      if (!meetup.latitude || !meetup.longitude) {
        console.error(`Meetup ${meetup.id} is missing lat/lng coordinates:`, meetup);
        return; // Skip this meetup
      }
      
      const markerColor = getMarkerColor(meetup.participantCount || 0, meetup.maxParticipants || 0);
      const isActive = meetup.id === activeMeetupId;
      const hasPendingRequest = pendingRequestIds.includes(meetup.id);
      
      console.log(`Creating marker for meetup ${meetup.id}:`, {
        position: { lat: meetup.latitude, lng: meetup.longitude },
        title: meetup.title
      });

      try {
        const markerIcon = createMarkerIcon(markerColor, meetup.theme, isActive, hasPendingRequest);
        
        const newMarker = new google.maps.Marker({
          position: {
            lat: meetup.latitude,
            lng: meetup.longitude
          },
          map,
          icon: markerIcon,
          animation: isActive ? google.maps.Animation.BOUNCE : null,
          title: meetup.title || `Meetup ${meetup.id}`
        });

        const canHover = window.matchMedia('(hover: hover) and (pointer: fine)').matches;
        if (canHover) {
          newMarker.addListener('mouseover', () => {
            setHoveredMeetup(meetup);
            if (!isActive) {
              newMarker.setAnimation(google.maps.Animation.BOUNCE);
            }
          });

          newMarker.addListener('mouseout', () => {
            setHoveredMeetup(null);
            if (!isActive) {
              newMarker.setAnimation(null);
            }
          });
        }

        // Create InfoWindow for this meetup
        const infoWindow = new google.maps.InfoWindow({
          maxWidth: Math.min(300, window.innerWidth - 48),
          disableAutoPan: false
        });
        
        // Generate content for the InfoWindow
        const content = document.createElement('div');
        const canViewExactLocation =
          meetup.creator_id === currentUserId || activeMeetupId === meetup.id;
        content.innerHTML = `
          <div class="info-window">
            <h3 class="text-lg font-semibold">${escapeHtml(meetup.title)}</h3>
            <p class="text-sm">${escapeHtml(meetup.theme)} · ${escapeHtml(meetup.participantCount || 0)}/${escapeHtml(meetup.maxParticipants || 0)} participants</p>
            ${hasPendingRequest ? '<p class="text-blue-500 font-medium">Request Pending</p>' : ''}
            ${canViewExactLocation && meetup.exactLocation ? `<p class="text-xs mt-1">${escapeHtml(meetup.exactLocation)}</p>` : ''}
             <p class="text-xs font-medium mt-1">Created by: ${meetup.group_id ? `<button id="view-group-${escapeHtml(meetup.id)}" class="font-medium text-blue-600 hover:underline">${escapeHtml(meetup.creator_group_name || meetup.creator_displayName || meetup.creator_username || 'Group')}</button>` : escapeHtml(meetup.creator_displayName || meetup.creator_username || 'Unknown')}</p>
             ${meetup.group_id ? `<div class="mt-2">
               <span class="text-xs text-muted-foreground">View the group members above</span>
             </div>` : `<div class="mt-2">
               <button id="view-creator-${escapeHtml(meetup.id)}" class="text-xs px-2 py-1 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors">
                 View Creator Profile
               </button>
             </div>`}
          </div>
        `;
        infoWindow.setContent(content);
        bindInfoWindowActions(content, meetup);
        
        // Store both the marker and infoWindow in refs
        markersRef.current.set(meetup.id, newMarker);
        infoWindowsRef.current.set(meetup.id, infoWindow);
        
        // Add click listener to show InfoWindow
        newMarker.addListener('click', () => {
          // Close any open InfoWindows first
          infoWindowsRef.current.forEach((window) => {
            window.close();
          });
          
          // Open this InfoWindow
          infoWindow.open({
            map,
            anchor: newMarker
          });
          
          // Then call the select handler
          onMeetupSelect(meetup);
        });
        
        console.log(`Successfully created marker and infoWindow for meetup ${meetup.id}`);
      } catch (error) {
        console.error(`Error creating marker for meetup ${meetup.id}:`, error);
      }
    });

    // Only clear markers when component unmounts
    return () => {
      clearAllMarkers();
    };
  }, [
    map,
    meetups,
    isLoaded,
    searchRadius,
    circleCenter,
    activeMeetupId,
    currentUserId,
    pendingRequestIds,
    onMeetupSelect,
    clearAllMarkers,
    userLocation,
    mapLoaded,
    bindInfoWindowActions,
  ]);

  // We need to define hooks at the top level, not inside conditionals
  const [showMapLoadingError, setShowMapLoadingError] = useState(false);
  
  // Set up effect for showing the error after a timeout
  useEffect(() => {
    if (!isLoaded) {
      const timer = setTimeout(() => {
        setShowMapLoadingError(true);
      }, 5000);
      
      return () => clearTimeout(timer);
    }
  }, [isLoaded]);
  
  // Create a fallback display for when Google Maps doesn't load properly
  if (!isLoaded) {
    console.log("Google Maps API is still loading or failed to load...");
    
    return (
      <div className="flex flex-col items-center justify-center h-full bg-slate-100">
        <Loader2 className="h-8 w-8 animate-spin text-primary mb-4" />
        <p className="text-sm text-muted-foreground">Loading Google Maps...</p>
        <p className="text-xs text-muted-foreground mt-1">This may take a moment...</p>
        
        {showMapLoadingError && (
          <div className="mt-8 w-full max-w-md p-4 border border-red-300 rounded-md bg-red-50 text-center">
            <AlertTriangle className="h-6 w-6 text-red-500 mx-auto mb-2" />
            <h3 className="font-semibold text-red-700">Map Failed to Load</h3>
            <p className="text-sm text-red-600 mt-1">
              There was an issue loading the Google Maps API. Please try refreshing the page.
            </p>
            <Button 
              variant="outline" 
              className="mt-4"
              onClick={() => window.location.reload()}
            >
              Refresh Page
            </Button>
          </div>
        )}
      </div>
    );
  }

  // Debug log for circle rendering
  console.log("Rendering MapView with circleCenter:", circleCenter, "and searchRadius:", searchRadius);

  // Force the circle center to be a valid object if we have user location
  // This will be used for the map center and circle
  const userLatLng = userLocation && 
    typeof userLocation === 'object' && 
    userLocation !== null ? {
      lat: (userLocation as UserLocation).latitude,
      lng: (userLocation as UserLocation).longitude
    } : null;
    
  // Debug log to identify why meetups are showing with null userLocation
  console.log("Map location debug:", {
    hasUserLocation: userLocation !== null,
    hasCircleCenter: circleCenter !== null,
    userLatLng,
    circleCenter,
    searchRadius
  });
  
  

  // Create a map container with explicit height and width
  const fullMapContainerStyle = {
    width: '100%',
    height: '85vh', // Increased height to fill more of the viewport
    minHeight: '600px', // Increased minimum height for better visibility
    position: 'relative' as const,
    overflow: 'hidden' as const,
    border: '1px solid #e5e7eb',
    borderRadius: '0.375rem',
    marginBottom: '-20px', // Negative margin to remove the gap at the bottom
  };

  // Log circle rendering details for debugging
  console.log("CIRCLE RENDERING DETAILS:", {
    userLocation,
    searchRadius,
    metersRadius: searchRadius > 0 ? searchRadius * 1609.34 : 0,
    circleVisible: !!(circleCenter && searchRadius > 0) // Only show circle when we have ZIP code location
  });

  return (
    <div style={fullMapContainerStyle}>
      <GoogleMap
        mapContainerStyle={{ width: '100%', height: '100%' }}
        center={circleCenter || US_CENTER} // Prioritize zip code location (circleCenter) over user's physical location
        zoom={circleCenter ? 11 : 4} // Higher zoom for better visibility of search area
        onLoad={onLoad}
        onUnmount={onUnmount}
        options={{
          streetViewControl: false,
          mapTypeControl: false,
          fullscreenControl: false,
          zoomControl: !isJoinNowAndroid,
          keyboardShortcuts: !isJoinNowAndroid,
          panControl: false,
          rotateControl: false,
          scaleControl: false,
          gestureHandling: "greedy",
          styles: [
            {
              featureType: "poi",
              elementType: "labels",
              stylers: [{ visibility: "off" }],
            },
          ],
          mapTypeId: "roadmap",
          minZoom: 2,
          maxZoom: 18,
        }}
      >
        {/* Display search radius circle when location and radius are available */}
        {mapLoaded && circleCenter && searchRadius > 0 && (
          <Circle
            center={circleCenter}
            radius={searchRadius * 1609.34} // Convert miles to meters
            options={{
              strokeColor: "#3b82f6",
              strokeOpacity: 0.9,
              strokeWeight: 2,
              fillColor: "#3b82f6",
              fillOpacity: 0.1,
              clickable: false,
              zIndex: 1,
              visible: true
            }}
          />
        )}
        
        {/* Render this circle as a fallback for development/debugging */}
        {mapLoaded && circleCenter && searchRadius <= 0 && (
          <Circle
            center={circleCenter}
            radius={10 * 1609.34} // Default 10 mile radius
            options={{
              strokeColor: "#ef4444",
              strokeOpacity: 0.7,
              strokeWeight: 1,
              fillColor: "#ef4444",
              fillOpacity: 0.05,
              clickable: false,
              zIndex: 1,
              visible: true
            }}
          />
        )}

        {hoveredMeetup && (
          <InfoWindow
            position={{ lat: hoveredMeetup.latitude, lng: hoveredMeetup.longitude }}
            options={{
              pixelOffset: new google.maps.Size(0, -60),
              disableAutoPan: false,
              maxWidth: Math.min(320, window.innerWidth - 48),
            }}
          >
            <div className="w-[min(280px,calc(100vw-48px))] p-4 rounded-lg shadow-lg bg-white dark:bg-slate-900">
              <h3 className="font-semibold text-lg mb-2 text-foreground">{hoveredMeetup.title}</h3>
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-sm">
                  {getThemeIcon(hoveredMeetup.theme)}
                  <span className="capitalize text-muted-foreground">{hoveredMeetup.theme}</span>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Users className="h-4 w-4 text-muted-foreground" />
                  <div className="flex-1">
                    <div className="flex justify-between items-center">
                      <span className="text-muted-foreground">
                        {hoveredMeetup.participantCount || 0}/{hoveredMeetup.maxParticipants || 0}
                      </span>
                      <span className="text-xs font-medium" style={{
                        color: getParticipantStatusColor(hoveredMeetup.participantCount || 0, hoveredMeetup.maxParticipants || 0)
                      }}>
                        {getParticipantStatus(hoveredMeetup.participantCount || 0, hoveredMeetup.maxParticipants || 0)}
                      </span>
                    </div>
                    <div className="w-full bg-slate-200 dark:bg-slate-700 rounded-full h-1.5 mt-1">
                      <div
                        className="h-1.5 rounded-full transition-all duration-300"
                        style={{
                          width: `${((hoveredMeetup.participantCount || 0) / (hoveredMeetup.maxParticipants || 1)) * 100}%`,
                          backgroundColor: getMarkerColor(hoveredMeetup.participantCount || 0, hoveredMeetup.maxParticipants || 0)
                        }}
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center gap-2 text-sm">
                  <Clock className="h-4 w-4 text-muted-foreground" />
                  <span className="text-muted-foreground">
                    Expires {formatDistanceToNow(new Date(hoveredMeetup.expiresAt), { addSuffix: true })}
                  </span>
                </div>
              </div>
            </div>
          </InfoWindow>
        )}
      </GoogleMap>
      
      {/* User Profile Modal */}
      <UserProfileModal 
        userId={selectedUserId}
        open={isProfileModalOpen}
        onOpenChange={setIsProfileModalOpen}
      />
      <GroupMembersDialog
        groupId={selectedGroupId}
        groupName={selectedGroupName}
        open={selectedGroupId !== null}
        onOpenChange={(open) => {
          if (!open) {
            setSelectedGroupId(null);
            setSelectedGroupName(null);
          }
        }}
      />
    </div>
  );
}