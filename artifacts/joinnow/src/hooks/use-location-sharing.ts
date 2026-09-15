import { useState, useEffect, useRef } from 'react';
import { useWebSocket } from './use-websocket';
import { useToast } from '@/hooks/use-toast';

interface Location {
  latitude: number;
  longitude: number;
}

interface ParticipantLocation {
  userId: number | null;
  username: string;
  location: Location;
}

const MAX_RETRIES = 3;
const RETRY_DELAY = 5000; // 5 seconds
const LOCATION_TIMEOUT = 20000; // 20 seconds

export function useLocationSharing(meetupId: number, userId: number | null, username: string | null) {
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [locations, setLocations] = useState<Map<number | null, ParticipantLocation>>(new Map());
  const { sendMessage } = useWebSocket(meetupId);
  const { toast } = useToast();
  const watchId = useRef<number | null>(null);
  const retryCount = useRef(0);

  const startWatchingLocation = async () => {
    if (!userId) {
      setIsLoading(false);
      return;
    }

    try {
      const settingsResponse = await fetch(`/api/users/${userId}/settings`, {
        credentials: "include",
      });
      if (!settingsResponse.ok) {
        throw new Error("Unable to verify location privacy setting");
      }
      const settings = await settingsResponse.json();
      if (settings?.privacy?.allowLocationSharing === false) {
        setIsLoading(false);
        setError(null);
        return;
      }
    } catch {
      setIsLoading(false);
      setError("Location sharing is unavailable until your privacy settings can be verified.");
      return;
    }

    if (!('geolocation' in navigator)) {
      setError('Your browser does not support location sharing');
      setIsLoading(false);
      toast({
        title: "Location Error",
        description: "Your browser doesn't support location sharing",
        variant: "destructive"
      });
      return;
    }

    const effectiveUsername = username || 'Anonymous';

    try {
      const permission = await navigator.permissions.query({ name: 'geolocation' });

      if (permission.state === 'denied') {
        setError('Location access was denied. Please enable location access in your browser settings.');
        setIsLoading(false);
        toast({
          title: "Location Access Required",
          description: "Please enable location access in your browser settings to use this feature",
          variant: "destructive"
        });
        return;
      }

      // Clear existing watch if any
      if (watchId.current) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }

      watchId.current = navigator.geolocation.watchPosition(
        (position) => {
          setError(null);
          setIsLoading(false);
          retryCount.current = 0;

          const location = {
            latitude: position.coords.latitude,
            longitude: position.coords.longitude
          };

          setLocations(prev => {
            const next = new Map(prev);
            next.set(userId, {
              userId,
              username: effectiveUsername,
              location
            });
            return next;
          });

          // Send location update through WebSocket
          sendMessage({
            type: 'location_update',
            meetupId,
            userId,
            username: effectiveUsername,
            location
          });
        },
        async (error) => {
          console.error('Location error:', error);
          let errorMessage = 'Location sharing failed';

          switch (error.code) {
            case error.PERMISSION_DENIED:
              errorMessage = 'Location permission denied';
              break;
            case error.POSITION_UNAVAILABLE:
              errorMessage = 'Location information unavailable';
              break;
            case error.TIMEOUT:
              errorMessage = 'Location request timed out. Retrying...';

              if (retryCount.current < MAX_RETRIES) {
                retryCount.current++;
                setTimeout(() => {
                  startWatchingLocation();
                }, RETRY_DELAY);
                return;
              } else {
                errorMessage = 'Unable to get location after several attempts. Please try again.';
              }
              break;
          }

          setError(errorMessage);
          setIsLoading(false);
          toast({
            title: "Location Error",
            description: errorMessage,
            variant: "destructive"
          });
        },
        {
          enableHighAccuracy: true,
          timeout: LOCATION_TIMEOUT,
          maximumAge: 0
        }
      );
    } catch (error) {
      console.error('Location setup error:', error);
      setError('Failed to setup location sharing');
      setIsLoading(false);
      toast({
        title: "Location Error",
        description: "Failed to setup location sharing",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    startWatchingLocation();

    return () => {
      if (watchId.current) {
        navigator.geolocation.clearWatch(watchId.current);
        watchId.current = null;
      }
    };
  }, [meetupId, userId, username]);

  return {
    error,
    isLoading,
    locations,
    setLocations
  };
}