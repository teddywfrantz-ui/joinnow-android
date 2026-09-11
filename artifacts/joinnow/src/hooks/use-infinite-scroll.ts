import { useState, useEffect, useRef, useCallback } from 'react';

/**
 * A custom hook that implements infinite scrolling
 * 
 * @param initialItems - The initial array of items to display
 * @param itemsPerPage - Number of items to add per "page" load
 * @param threshold - How close to the bottom (in pixels) to trigger the next load
 * @returns An object with visible items and a reference to attach to the scrollable container
 */
export function useInfiniteScroll<T>(
  initialItems: T[],
  itemsPerPage = 20,
  threshold = 200
) {
  const [visibleItems, setVisibleItems] = useState<T[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [allItemsLoaded, setAllItemsLoaded] = useState(false);

  // Initialize with the first page of items
  useEffect(() => {
    if (initialItems && initialItems.length > 0) {
      setVisibleItems(initialItems.slice(0, itemsPerPage));
      setAllItemsLoaded(initialItems.length <= itemsPerPage);
      setCurrentPage(1);
    } else {
      setVisibleItems([]);
      setAllItemsLoaded(true);
    }
  }, [initialItems, itemsPerPage]);

  // Function to load more items
  const loadMoreItems = useCallback(() => {
    if (allItemsLoaded) return;
    
    const nextPage = currentPage + 1;
    const nextBatch = initialItems.slice(0, nextPage * itemsPerPage);
    
    setVisibleItems(nextBatch);
    setCurrentPage(nextPage);
    
    // Check if we've loaded all items
    if (nextBatch.length >= initialItems.length) {
      setAllItemsLoaded(true);
    }
  }, [initialItems, currentPage, itemsPerPage, allItemsLoaded]);

  // Scroll event handler
  const handleScroll = useCallback(() => {
    if (!containerRef.current) return;
    
    const { scrollTop, scrollHeight, clientHeight } = containerRef.current;
    
    // If we're close to the bottom, load more items
    if (scrollHeight - scrollTop - clientHeight < threshold) {
      loadMoreItems();
    }
  }, [loadMoreItems, threshold]);

  // Set up scroll event listener
  useEffect(() => {
    const currentContainer = containerRef.current;
    if (!currentContainer) return;
    
    currentContainer.addEventListener('scroll', handleScroll);
    
    return () => {
      currentContainer.removeEventListener('scroll', handleScroll);
    };
  }, [handleScroll]);

  return {
    visibleItems,
    containerRef,
    allItemsLoaded,
    loadMoreItems
  };
}