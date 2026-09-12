import { useState, useCallback, useEffect, useRef } from 'react';
import { GoogleMap, Circle, useJsApiLoader } from '@react-google-maps/api';
const isJoinNowAndroid =
  typeof navigator !== 'undefined' && navigator.userAgent.includes('JoinNowAndroid/');

import { Search, Loader2 } from 'lucide-react';
import { GOOGLE_MAPS_CONFIG } from '@/utils/google-maps';

interface LocationPickerProps {
  onChange: (location: { latitude: number; longitude: number; address?: string }) => void;
  radius: number;
  isAdjusting?: boolean;
  initialLocation?: { latitude: number; longitude: number } | null;
  defaultZoom?: number;
}

const mapContainerStyle = {
  width: '100%',
  height: '300px'
};

export function LocationPicker({ onChange, radius, isAdjusting = false, initialLocation, defaultZoom = 14 }: LocationPickerProps) {
  const [selectedLocation, setSelectedLocation] = useState({
    lat: initialLocation?.latitude ?? 41.4993,
    lng: initialLocation?.longitude ?? -81.6944
  });
  const inputRef = useRef<HTMLInputElement>(null);
  const [autocomplete, setAutocomplete] = useState<google.maps.places.Autocomplete | null>(null);
  const mapRef = useRef<google.maps.Map | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);
  const lastSelectedAddressRef = useRef<string | null>(null);

  const { isLoaded } = useJsApiLoader({
    ...GOOGLE_MAPS_CONFIG,
    libraries: ['places', 'geometry']
  });

  // Initialize Geocoder when Google Maps is loaded
  useEffect(() => {
    if (isLoaded && !geocoder.current) {
      geocoder.current = new google.maps.Geocoder();
    }
  }, [isLoaded]);

  // Initialize Autocomplete with custom styles
  useEffect(() => {
    if (!isLoaded || !inputRef.current) return;

    console.log("Setting up autocomplete");

    // Add custom styles for the autocomplete dropdown
    const styles = document.createElement('style');
    styles.textContent = `
      .pac-container {
        z-index: 99999 !important;
      }
    `;
    document.head.appendChild(styles);

    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ['address_components', 'geometry', 'formatted_address'],
      types: ['geocode', 'establishment'],
      componentRestrictions: { country: 'US' }
    });

    console.log("Autocomplete instance created");

    // This event is only triggered when a selection is made from the dropdown
    autocomplete.addListener('place_changed', () => {
      const place = autocomplete.getPlace();
      console.log("Dropdown selection made:", place);

      if (place.geometry?.location) {
        const newLocation = {
          lat: place.geometry.location.lat(),
          lng: place.geometry.location.lng()
        };

        console.log("New location selected from dropdown:", newLocation);
        setSelectedLocation(newLocation);
        lastSelectedAddressRef.current = place.formatted_address || null;

        // Update marker position
        if (markerRef.current) {
          markerRef.current.setPosition(newLocation);
        }

        // Center map on the selected location
        if (mapRef.current) {
          mapRef.current.panTo(newLocation);
          mapRef.current.setZoom(15);
        }

        // Notify parent component about the location change
        // This is critical - it sends the new location to the parent component
        onChange({
          latitude: newLocation.lat,
          longitude: newLocation.lng,
          address: place.formatted_address
        });
      }
    });

    setAutocomplete(autocomplete);

    return () => {
      console.log("Cleaning up autocomplete and styles");
      if (autocomplete) {
        google.maps.event.clearInstanceListeners(autocomplete);
      }
      if (styles.parentNode) {
        styles.parentNode.removeChild(styles);
      }
    };
  }, [isLoaded, onChange]);

  const updateLocation = useCallback(async (location: google.maps.LatLngLiteral, address?: string) => {
    if (!address && geocoder.current) {
      try {
        const result = await geocoder.current.geocode({ location });
        if (result.results[0]) {
          address = result.results[0].formatted_address;
          if (inputRef.current) {
            inputRef.current.value = address;
          }
          lastSelectedAddressRef.current = address;
        }
      } catch (error) {
        console.error('Geocoding error:', error);
      }
    } else if (address && inputRef.current) {
      inputRef.current.value = address;
      lastSelectedAddressRef.current = address;
    }

    // Update marker position
    if (markerRef.current) {
      markerRef.current.setPosition(location);
    }

    if (mapRef.current) {
      mapRef.current.panTo(location);
    }

    setSelectedLocation(location);

    // Always call onChange when the location is updated manually (via map click or marker drag)
    // This ensures the parent component always has the latest coordinates
    onChange({
      latitude: location.lat,
      longitude: location.lng,
      address
    });
  }, [onChange]);

  const onMapClick = useCallback((e: google.maps.MapMouseEvent) => {
    if (e.latLng) {
      e.stop();
      const newLocation = {
        lat: e.latLng.lat(),
        lng: e.latLng.lng()
      };
      updateLocation(newLocation);
    }
  }, [updateLocation]);

  const onLoad = useCallback((map: google.maps.Map) => {
    mapRef.current = map;
    map.setCenter(selectedLocation);
    map.setZoom(defaultZoom);

    // Create marker
    markerRef.current = new google.maps.Marker({
      position: selectedLocation,
      map: map,
      draggable: true
    });

    // Add drag end listener
    markerRef.current.addListener('dragend', () => {
      const position = markerRef.current?.getPosition();
      if (position) {
        const newLocation = {
          lat: position.lat(),
          lng: position.lng()
        };
        updateLocation(newLocation);
      }
    });
  }, [selectedLocation, updateLocation, defaultZoom]);

  const onUnmount = useCallback(() => {
    if (markerRef.current) {
      google.maps.event.clearInstanceListeners(markerRef.current);
      markerRef.current.setMap(null);
      markerRef.current = null;
    }
    mapRef.current = null;
  }, []);

  if (!isLoaded) {
    return (
      <div className="flex items-center justify-center h-[300px] bg-slate-100 rounded-md">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="space-y-4" onClick={(e) => e.stopPropagation()}>
      <div className="flex gap-2" onMouseDown={(e) => e.stopPropagation()}>
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <input
            ref={inputRef}
            type="text"
            placeholder="Search for a location or click on the map"
            className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 pl-8"
            onKeyDown={(e) => {
              // Prevent form submission on Enter key
              if (e.key === 'Enter') {
                e.preventDefault();
                e.stopPropagation();
              }
            }}
            onClick={(e) => {
              e.preventDefault();
              e.stopPropagation();
            }}
            onMouseDown={(e) => e.stopPropagation()}
          />
        </div>
      </div>

      <div
        className="rounded-md overflow-hidden border"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <GoogleMap
          mapContainerStyle={mapContainerStyle}
          center={selectedLocation}
          zoom={defaultZoom}
          onLoad={onLoad}
          onUnmount={onUnmount}
          onClick={onMapClick}
          options={{
            streetViewControl: false,
            mapTypeControl: false,
            fullscreenControl: false,
            zoomControl: !isJoinNowAndroid,
            keyboardShortcuts: !isJoinNowAndroid,
            panControl: false,
            rotateControl: false,
            scaleControl: false,
            clickableIcons: false,
            draggable: true,
            gestureHandling: "greedy"
          }}
        >
          <Circle
            center={selectedLocation}
            radius={radius * 1609.34}
            options={{
              fillColor: '#3b82f6',
              fillOpacity: 0.1,
              strokeColor: '#3b82f6',
              strokeOpacity: 0.8,
              strokeWeight: 2,
              visible: true,
              zIndex: 1
            }}
          />
        </GoogleMap>
      </div>
    </div>
  );
}