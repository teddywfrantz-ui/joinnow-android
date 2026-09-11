import { useEffect, useCallback, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useUser } from './use-user';
import { useToast } from './use-toast';

// Define the appearance settings type
interface AppearanceSettings {
  darkMode: boolean;
  highContrastMode: boolean;
  fontSize: 'small' | 'medium' | 'large';
}

// Default appearance settings
const defaultAppearance: AppearanceSettings = {
  darkMode: false,
  highContrastMode: false,
  fontSize: 'medium',
};

/**
 * Hook to fetch and apply user appearance settings
 * This automatically applies the settings to the document
 */
export function useAppearance() {
  const { user } = useUser();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  
  // Fetch user settings from the API
  const { data: settings, isLoading } = useQuery({
    queryKey: ['/api/users', user?.id, 'settings'],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user?.id}/settings`);
      
      if (!res.ok) {
        if (res.status === 404) {
          return { appearance: defaultAppearance };
        }
        console.error('Settings fetch error:', await res.text());
        throw new Error(await res.text());
      }
      
      const data = await res.json();
      return data;
    },
    enabled: !!user?.id,
  });
  
  // Mutation to update appearance settings
  const updateSettingsMutation = useMutation({
    mutationFn: async (newAppearance: AppearanceSettings) => {
      if (!user?.id) return newAppearance;
      
      const res = await fetch(`/api/users/${user.id}/settings/appearance`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(newAppearance),
      });
      
      if (!res.ok) {
        const errorText = await res.text();
        throw new Error(errorText || 'Failed to update appearance settings');
      }
      
      return newAppearance;
    },
    onSuccess: (newAppearance) => {
      // Update the localStorage
      localStorage.setItem('appearance', JSON.stringify(newAppearance));
      
      // Update the cache
      queryClient.setQueryData(['/api/users', user?.id, 'settings'], (oldData: any) => {
        return {
          ...oldData,
          appearance: newAppearance
        };
      });
      
      // Apply settings to the DOM
      applyAppearanceSettings(newAppearance);
    },
    onError: (error) => {
      console.error('Failed to update appearance settings:', error);
      toast({
        title: "Settings Error",
        description: "Could not update appearance settings. Please try again.",
        variant: "destructive",
      });
    }
  });
  
  // Apply the appearance settings whenever they change
  useEffect(() => {
    if (settings?.appearance) {
      applyAppearanceSettings(settings.appearance);
    } else {
      // Try to get from localStorage if no server settings
      const storedAppearance = localStorage.getItem('appearance');
      if (storedAppearance) {
        try {
          const parsedAppearance = JSON.parse(storedAppearance);
          applyAppearanceSettings(parsedAppearance);
        } catch (e) {
          console.error('Failed to parse appearance settings from localStorage', e);
        }
      }
    }
  }, [settings]);
  
  // Function to apply appearance settings to the document
  const applyAppearanceSettings = useCallback((appearance: AppearanceSettings) => {
    // Apply dark mode
    if (appearance.darkMode) {
      document.documentElement.classList.add('dark');
      
      // Force preload dark logo
      const darkLogo = new Image();
      darkLogo.src = "/images/joinup-logo-dark.png"; 
    } else {
      document.documentElement.classList.remove('dark');
      
      // Force preload light logo
      const lightLogo = new Image();
      lightLogo.src = "/images/joinup-logo.png";
    }

    // Apply high contrast mode
    if (appearance.highContrastMode) {
      document.documentElement.classList.add('high-contrast');
    } else {
      document.documentElement.classList.remove('high-contrast');
    }

    // Apply font size
    document.documentElement.classList.remove('text-sm', 'text-base', 'text-lg');
    switch (appearance.fontSize) {
      case 'small':
        document.documentElement.classList.add('text-sm');
        break;
      case 'medium':
        document.documentElement.classList.add('text-base');
        break;
      case 'large':
        document.documentElement.classList.add('text-lg');
        break;
    }

    // Store preference in localStorage for persistence
    localStorage.setItem('appearance', JSON.stringify(appearance));
  }, []);
  
  // Function to toggle dark mode
  const toggleDarkMode = useCallback(() => {
    const currentAppearance = settings?.appearance || 
      JSON.parse(localStorage.getItem('appearance') || 'null') || 
      defaultAppearance;
    
    const newAppearance = {
      ...currentAppearance,
      darkMode: !currentAppearance.darkMode
    };
    
    // Apply immediately for responsive UX
    applyAppearanceSettings(newAppearance);
    
    // Always update localStorage
    localStorage.setItem('appearance', JSON.stringify(newAppearance));
    
    // Force update cache
    queryClient.setQueryData(['/api/users', user?.id, 'settings'], (oldData: any) => {
      return oldData ? {
        ...oldData,
        appearance: newAppearance
      } : { appearance: newAppearance };
    });
    
    // If user is logged in, update on server
    if (user?.id) {
      updateSettingsMutation.mutate(newAppearance);
    }
  }, [settings, user, applyAppearanceSettings, updateSettingsMutation, queryClient]);
  
  // Create a local state value for appearance that updates immediately
  const [currentAppearance, setCurrentAppearance] = useState<AppearanceSettings>(
    settings?.appearance || 
    JSON.parse(localStorage.getItem('appearance') || 'null') || 
    defaultAppearance
  );
  
  // Update local state when settings change
  useEffect(() => {
    if (settings?.appearance) {
      setCurrentAppearance(settings.appearance);
    }
  }, [settings]);
  
  // Force update appearance state when toggle is called
  const updateLocalAppearance = useCallback((newAppearance: AppearanceSettings) => {
    setCurrentAppearance(newAppearance);
  }, []);
  
  // Modify toggleDarkMode to update local state
  const wrappedToggleDarkMode = useCallback(() => {
    const newAppearance = {
      ...currentAppearance,
      darkMode: !currentAppearance.darkMode
    };
    
    // Update local state first
    updateLocalAppearance(newAppearance);
    
    // Then run original toggle function
    toggleDarkMode();
  }, [currentAppearance, toggleDarkMode, updateLocalAppearance]);
  
  return {
    appearance: currentAppearance,
    isLoading,
    applyAppearanceSettings,
    toggleDarkMode: wrappedToggleDarkMode,
    updateAppearance: (newAppearance: Partial<AppearanceSettings>) => {
      const currentAppearance = settings?.appearance || 
        JSON.parse(localStorage.getItem('appearance') || 'null') || 
        defaultAppearance;
      
      const mergedAppearance = {
        ...currentAppearance,
        ...newAppearance
      };
      
      // Apply immediately
      applyAppearanceSettings(mergedAppearance);
      
      // Update server if user is logged in
      if (user?.id) {
        updateSettingsMutation.mutate(mergedAppearance);
      }
    }
  };
}

/**
 * Apply appearance settings from localStorage on initial load
 * This can be called from anywhere in the app, typically in _app.tsx or similar
 */
export function initializeAppearanceFromStorage() {
  try {
    // Preload both logo images regardless of current theme
    const lightLogo = new Image();
    lightLogo.src = "/images/joinup-logo.png";
    const darkLogo = new Image();
    darkLogo.src = "/images/joinup-logo-dark.png";
    
    const storedAppearance = localStorage.getItem('appearance');
    if (storedAppearance) {
      const appearance = JSON.parse(storedAppearance) as AppearanceSettings;
      
      // Apply settings without waiting for API
      if (appearance.darkMode) {
        document.documentElement.classList.add('dark');
      }
      
      if (appearance.highContrastMode) {
        document.documentElement.classList.add('high-contrast');
      }
      
      document.documentElement.classList.remove('text-sm', 'text-base', 'text-lg');
      switch (appearance.fontSize) {
        case 'small':
          document.documentElement.classList.add('text-sm');
          break;
        case 'medium':
          document.documentElement.classList.add('text-base');
          break;
        case 'large':
          document.documentElement.classList.add('text-lg');
          break;
      }
    }
  } catch (error) {
    console.error('Error initializing appearance from storage:', error);
  }
}