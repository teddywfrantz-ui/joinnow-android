import { Libraries } from '@react-google-maps/api';

// Emergency fallback API key for development/testing only
// In production, always use environment variables
const EMERGENCY_FALLBACK_API_KEY = 'AIzaSyB7MK8cbQn_MM-S7lGqRtTk1Mk5iOXK-6E';

// Define the shared Google Maps configuration
export const GOOGLE_MAPS_CONFIG = {
  id: 'google-map-script',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || EMERGENCY_FALLBACK_API_KEY,
  libraries: ['places', 'geometry'] as Libraries,
  version: 'weekly'
};