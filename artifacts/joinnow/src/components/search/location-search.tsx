import { useState, useRef, useEffect } from 'react';
import { Input } from "@/components/ui/input";
import { Loader2, Search } from "lucide-react";

interface LocationSearchProps {
  value: string;
  onChange: (value: string) => void;
  onLocationSelect: (location: { latitude: number; longitude: number }) => void;
  isLoading?: boolean;
}

export function LocationSearch({ value, onChange, onLocationSelect, isLoading }: LocationSearchProps) {
  const [isGoogleMapsLoaded, setIsGoogleMapsLoaded] = useState(false);
  const autocompleteService = useRef<google.maps.places.AutocompleteService | null>(null);
  const geocoder = useRef<google.maps.Geocoder | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const stylesRef = useRef<HTMLStyleElement | null>(null);
  const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
  const [search, setSearch] = useState(value);

  useEffect(() => {
    const checkGoogleMapsLoaded = () => {
      if (window.google?.maps) {
        try {
          console.log('Google Maps API loaded successfully');
          autocompleteService.current = new google.maps.places.AutocompleteService();
          geocoder.current = new google.maps.Geocoder();
          setIsGoogleMapsLoaded(true);
        } catch (error) {
          console.error('Error initializing Google Maps services:', error);
        }
      } else {
        console.log('Waiting for Google Maps API to load...');
        setTimeout(checkGoogleMapsLoaded, 100);
      }
    };

    checkGoogleMapsLoaded();
  }, []);

  useEffect(() => {
    setSearch(value);
  }, [value]);

  // Initialize Autocomplete with custom styles
  useEffect(() => {
    if (!isGoogleMapsLoaded || !inputRef.current) {
      console.log('Skipping autocomplete setup - dependencies not ready', {
        isGoogleMapsLoaded,
        hasInputRef: !!inputRef.current
      });
      return;
    }

    console.log('Setting up autocomplete and styles');

    // Create and add custom styles
    const styles = document.createElement('style');
    styles.textContent = `
      /* We're not going to override Google's positioning behavior, just style it */
      .pac-container {
        width: 230px !important;
        z-index: 9999 !important;
        border: 1px solid hsl(var(--border)) !important;
        box-shadow: 0 4px 8px rgba(0,0,0,0.15) !important;
        background-color: hsl(var(--card)) !important;
        border-radius: 0.375rem !important;
        pointer-events: auto !important;
        font-family: inherit !important;
        overflow: hidden !important;
      }
      
      @media (max-width: 640px) {
        .pac-container {
          min-width: 230px !important;
          font-size: 14px !important;
        }
        .pac-item {
          padding: 10px !important;
        }
      }
      .pac-item {
        padding: 8px 12px !important;
        cursor: pointer !important;
        font-family: inherit !important;
        pointer-events: auto !important;
        border-top: 1px solid hsl(var(--border)) !important;
        white-space: normal !important;
        line-height: 1.4 !important;
        color: hsl(var(--foreground)) !important;
      }
      .pac-item:first-child {
        border-top: none !important;
      }
      .pac-item:hover {
        background-color: hsl(var(--accent)) !important;
      }
      .pac-item-selected {
        background-color: hsl(var(--accent)) !important;
      }
      .pac-icon {
        margin-right: 8px !important;
      }
      .pac-item-query {
        font-size: 14px !important;
        color: hsl(var(--foreground)) !important;
        font-family: inherit !important;
      }
      @media (max-width: 640px) {
        .pac-item-query {
          font-size: 14px !important;
        }
      }
      .pac-matched {
        font-weight: 600 !important;
      }
      .pac-container:after {
        display: none !important;
      }
    `;
    document.head.appendChild(styles);
    stylesRef.current = styles;

    // Initialize autocomplete with appropriate configuration
    const autocomplete = new google.maps.places.Autocomplete(inputRef.current, {
      fields: ['address_components', 'geometry', 'formatted_address'],
      types: ['(regions)'], // This includes localities, postal codes, and other regions
      componentRestrictions: { country: 'US' }
    });

    console.log('Autocomplete instance created');

    autocomplete.addListener('place_changed', () => {
      console.log('Place selected from dropdown');
      const place = autocomplete.getPlace();
      console.log('Selected place:', place);

      if (place.geometry?.location) {
        const location = {
          latitude: place.geometry.location.lat(),
          longitude: place.geometry.location.lng()
        };
        console.log('Location data:', location);
        
        // Extract ZIP code from address components if available
        let zipCode = '';
        if (place.address_components && place.address_components.length > 0) {
          const zipComponent = place.address_components.find(
            component => component.types.includes('postal_code')
          );
          
          if (zipComponent) {
            zipCode = zipComponent.short_name;
            console.log('Found zip code for selected location:', zipCode);
          }
        }
        
        // If we found a ZIP code, use it instead of the formatted address
        // This will ensure consistency with the map filtering logic
        if (zipCode) {
          setSearch(zipCode);
          onChange(zipCode);
        } else {
          setSearch(place.formatted_address || '');
          onChange(place.formatted_address || '');
        }
        
        onLocationSelect(location);
      } else {
        console.warn('No geometry data in selected place');
      }
    });

    autocompleteRef.current = autocomplete;

    return () => {
      console.log('Cleaning up autocomplete and styles');
      if (autocompleteRef.current) {
        google.maps.event.clearInstanceListeners(autocompleteRef.current);
      }
      if (stylesRef.current && stylesRef.current.parentNode) {
        stylesRef.current.parentNode.removeChild(stylesRef.current);
      }
    };
  }, [isGoogleMapsLoaded, onChange, onLocationSelect]);

  const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const searchTerm = e.target.value;
    // Only update the search field visually without triggering location changes
    setSearch(searchTerm);
    
    // Don't trigger any location changes while typing
    // This prevents the map from changing while typing
  };
  
  // Handle Enter key press to support manual ZIP code entry
  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      
      const searchTerm = search;
      // Only process ZIP codes on Enter since they're a standard format
      if (/^\d{5}$/.test(searchTerm) && geocoder.current) {
        console.log('Processing ZIP code on Enter:', searchTerm);
        
        // Try to use a more specific query for postal codes
        geocoder.current.geocode({
          address: searchTerm, 
          componentRestrictions: { 
            country: 'US',
            postalCode: searchTerm 
          }
        }).then(response => {
          if (response.results && response.results.length > 0) {
            const location = response.results[0].geometry.location;
            console.log('ZIP code location found:', {
              lat: location.lat(),
              lng: location.lng(),
              formatted_address: response.results[0].formatted_address
            });
            
            // For ZIP codes, update both search display and parent component
            onChange(searchTerm);
            
            // Send the coordinates back to the parent component
            onLocationSelect({
              latitude: location.lat(),
              longitude: location.lng()
            });
          } else {
            console.warn('No results found for ZIP code:', searchTerm);
          }
        }).catch(error => {
          console.error('Error geocoding ZIP code:', error);
        });
      }
    }
  };

  return (
    <div className="relative">
      <Search className="absolute left-2 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
      <Input
        ref={inputRef}
        type="text"
        value={search}
        onChange={handleInputChange}
        placeholder="Location"
        className="w-[110px] sm:w-[120px] text-sm pl-8 pr-6"
        onKeyDown={handleKeyDown}
      />
      {isLoading && (
        <div className="absolute right-2 top-1/2 -translate-y-1/2">
          <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />
        </div>
      )}
    </div>
  );
}