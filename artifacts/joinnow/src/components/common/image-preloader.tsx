import { useEffect } from 'react';

/**
 * A component that preloads images without displaying them
 * This ensures that images are cached by the browser before they're needed
 */
export function ImagePreloader({ imagePaths }: { imagePaths: string[] }) {
  useEffect(() => {
    // Create image elements for each path and set their src
    // This forces the browser to load the images without displaying them
    imagePaths.forEach(path => {
      const img = new Image();
      img.src = path;
    });
  }, [imagePaths]);

  // This component doesn't render anything visible
  return null;
}