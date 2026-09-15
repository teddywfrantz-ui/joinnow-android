import { Libraries } from '@react-google-maps/api';

// Define the shared Google Maps configuration
export const GOOGLE_MAPS_CONFIG = {
  id: 'google-map-script',
  googleMapsApiKey: import.meta.env.VITE_GOOGLE_MAPS_API_KEY || '',
  libraries: ['places', 'geometry'] as Libraries,
  version: 'weekly'
};