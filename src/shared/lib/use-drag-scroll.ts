import { useRef, useState, useCallback } from 'react';

/**
 * Reusable hook enabling smooth mouse drag-and-pull scrolling on horizontal containers
 * with click suppression when dragging is performed.
 */
export function useDragScroll() {
  const sliderRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const isDown = useRef(false);
  const startX = useRef(0);
  const scrollLeftStart = useRef(0);
  const draggedDistance = useRef(0);

  const onMouseDown = useCallback((e: React.MouseEvent) => {
    // Only respond to left click
    if (e.button !== 0 || !sliderRef.current) return;
    isDown.current = true;
    startX.current = e.pageX - sliderRef.current.offsetLeft;
    scrollLeftStart.current = sliderRef.current.scrollLeft;
    draggedDistance.current = 0;
  }, []);

  const onMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDown.current || !sliderRef.current) return;
    e.preventDefault();
    const x = e.pageX - sliderRef.current.offsetLeft;
    const walk = (x - startX.current) * 1.5;
    draggedDistance.current = Math.abs(x - startX.current);
    if (draggedDistance.current > 5 && !isDragging) {
      setIsDragging(true);
    }
    sliderRef.current.scrollLeft = scrollLeftStart.current - walk;
  }, [isDragging]);

  const stopDrag = useCallback(() => {
    isDown.current = false;
    // Keep isDragging active briefly so child click handler can be suppressed
    setTimeout(() => {
      setIsDragging(false);
      draggedDistance.current = 0;
    }, 60);
  }, []);

  // Intercept click on children if drag occurred
  const onClickCapture = useCallback((e: React.MouseEvent) => {
    if (draggedDistance.current > 6) {
      e.stopPropagation();
      e.preventDefault();
    }
  }, []);

  const scrollByAmount = useCallback((amount: number) => {
    if (sliderRef.current) {
      sliderRef.current.scrollBy({ left: amount, behavior: 'smooth' });
    }
  }, []);

  return {
    sliderRef,
    isDragging,
    scrollLeft: () => scrollByAmount(-440),
    scrollRight: () => scrollByAmount(440),
    dragEvents: {
      onMouseDown,
      onMouseMove,
      onMouseUp: stopDrag,
      onMouseLeave: stopDrag,
      onClickCapture,
    },
  };
}
