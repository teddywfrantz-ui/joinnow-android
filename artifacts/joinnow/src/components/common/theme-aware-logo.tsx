import React, { useEffect } from 'react';
import { useAppearance } from '@/hooks/use-appearance';

interface ThemeAwareLogoProps {
  className?: string;
  lightSrc: string;
  darkSrc: string;
  alt: string;
  height?: number;
}

// Preload images to ensure they're instantly available
function preloadImage(src: string): void {
  const img = new Image();
  img.src = src;
}

/**
 * A component that displays the correct logo based on the current theme
 * Uses a CSS-based approach for instant switching with zero flicker
 */
export function ThemeAwareLogo({ 
  className = '', 
  lightSrc, 
  darkSrc, 
  alt, 
  height = 40 
}: ThemeAwareLogoProps) {
  // Preload both images immediately
  useEffect(() => {
    preloadImage(lightSrc);
    preloadImage(darkSrc);
  }, [lightSrc, darkSrc]);
  
  return (
    <div 
      className={`theme-aware-logo ${className}`}
      style={{ height: `${height}px`, width: 'auto' }}
      aria-label={alt}
    >
      <img 
        src={lightSrc} 
        alt={alt}
        className="light-logo" 
        style={{ height: `${height}px` }}
      />
      <img 
        src={darkSrc} 
        alt={alt}
        className="dark-logo" 
        style={{ height: `${height}px` }}
      />
    </div>
  );
}