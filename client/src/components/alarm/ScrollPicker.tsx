import React, { useState, useRef, useEffect, useCallback, TouchEvent } from 'react';

interface ScrollPickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  itemHeight?: number;
}

export const ScrollPicker: React.FC<ScrollPickerProps> = ({
  items,
  selectedIndex,
  onChange,
  itemHeight = 48,
}) => {
  const [offset, setOffset] = useState(-selectedIndex * itemHeight);
  const [isDragging, setIsDragging] = useState(false);
  const [startY, setStartY] = useState(0);
  const [startOffset, setStartOffset] = useState(0);
  const [velocity, setVelocity] = useState(0);
  const [lastTime, setLastTime] = useState(0);
  const [lastY, setLastY] = useState(0);
  
  const containerRef = useRef<HTMLDivElement>(null);
  const animationRef = useRef<number>(0);
  const snapTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const minOffset = -(items.length - 1) * itemHeight;
  const maxOffset = 0;

  useEffect(() => {
    if (!isDragging && Math.abs(velocity) < 0.1) {
      setOffset(-selectedIndex * itemHeight);
    }
  }, [selectedIndex, itemHeight, isDragging, velocity]);

  const snapToClosest = useCallback((currentOffset: number) => {
    const index = Math.round(-currentOffset / itemHeight);
    const clampedIndex = Math.max(0, Math.min(items.length - 1, index));
    const targetOffset = -clampedIndex * itemHeight;
    setOffset(targetOffset);
    if (clampedIndex !== selectedIndex) {
      onChange(clampedIndex);
    }
  }, [itemHeight, items.length, selectedIndex, onChange]);

  useEffect(() => {
    let currentOffset = offset;
    let currentVelocity = velocity;
    
    const animate = () => {
      if (Math.abs(currentVelocity) > 0.1) {
        currentOffset += currentVelocity;
        
        if (currentOffset > maxOffset) {
          currentOffset = maxOffset;
          currentVelocity = 0;
        } else if (currentOffset < minOffset) {
          currentOffset = minOffset;
          currentVelocity = 0;
        }
        
        setOffset(currentOffset);
        currentVelocity *= 0.95; // Friction
        
        if (Math.abs(currentVelocity) < 0.5) {
          currentVelocity = 0;
          snapToClosest(currentOffset);
          setVelocity(0);
        } else {
          animationRef.current = requestAnimationFrame(animate);
        }
      }
    };

    if (!isDragging && Math.abs(velocity) > 0) {
      animationRef.current = requestAnimationFrame(animate);
    } else if (!isDragging && velocity === 0 && offset % itemHeight !== 0) {
      snapToClosest(offset);
    }

    return () => cancelAnimationFrame(animationRef.current);
  }, [isDragging, velocity, snapToClosest, minOffset, maxOffset, itemHeight]);

  const handleTouchStart = (e: TouchEvent | React.MouseEvent) => {
    cancelAnimationFrame(animationRef.current);
    if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    
    setIsDragging(true);
    setVelocity(0);
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    setStartY(clientY);
    setLastY(clientY);
    setStartOffset(offset);
    setLastTime(Date.now());
  };

  const handleTouchMove = (e: TouchEvent | React.MouseEvent) => {
    if (!isDragging) return;
    
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;
    const deltaY = clientY - startY;
    
    let newOffset = startOffset + deltaY;
    if (newOffset > maxOffset) {
      newOffset = maxOffset + (newOffset - maxOffset) * 0.3;
    } else if (newOffset < minOffset) {
      newOffset = minOffset + (newOffset - minOffset) * 0.3;
    }
    
    setOffset(newOffset);
    
    const now = Date.now();
    const timeDelta = now - lastTime;
    if (timeDelta > 0) {
      const v = (clientY - lastY) / timeDelta;
      setVelocity(v * 15);
    }
    setLastY(clientY);
    setLastTime(now);
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    cancelAnimationFrame(animationRef.current);
    if (snapTimeoutRef.current) clearTimeout(snapTimeoutRef.current);
    
    const newOffset = offset - e.deltaY * 0.5;
    let clampedOffset = Math.max(minOffset, Math.min(maxOffset, newOffset));
    setOffset(clampedOffset);
    
    snapTimeoutRef.current = setTimeout(() => {
      snapToClosest(clampedOffset);
    }, 150);
  };

  const visibleCount = 3;
  const containerHeight = itemHeight * visibleCount;
  
  return (
    <div 
      className="relative overflow-hidden select-none touch-none w-full"
      style={{ height: containerHeight }}
      ref={containerRef}
      onMouseDown={handleTouchStart}
      onMouseMove={handleTouchMove}
      onMouseUp={handleTouchEnd}
      onMouseLeave={handleTouchEnd}
      onTouchStart={handleTouchStart}
      onTouchMove={handleTouchMove}
      onTouchEnd={handleTouchEnd}
      onWheel={handleWheel}
    >
      {/* Highlight band */}
      <div 
        className="absolute w-full bg-white/10 rounded-xl pointer-events-none"
        style={{ 
          height: itemHeight,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 0
        }}
      />
      
      {/* Items */}
      <div 
        className="absolute w-full"
        style={{
          top: '50%',
          marginTop: -itemHeight / 2, // Centered
          transform: `translateY(${offset}px)`,
          transition: isDragging || Math.abs(velocity) > 0 ? 'none' : 'transform 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
          zIndex: 1
        }}
      >
        {items.map((item, index) => {
          const itemOffset = index * itemHeight + offset;
          const distance = Math.abs(itemOffset);
          const ratio = Math.min(1, distance / (itemHeight * 2));
          
          const scale = 1 - ratio * 0.25;
          const opacity = 1 - ratio * 0.7;
          const rotateX = (itemOffset / (itemHeight * 2)) * 45;
          
          return (
            <div
              key={index}
              className="flex items-center justify-center font-tabular pointer-events-none"
              style={{
                height: itemHeight,
                transform: `scale(${scale}) rotateX(${rotateX}deg)`,
                opacity: opacity,
                transition: isDragging || Math.abs(velocity) > 0 ? 'none' : 'all 0.3s cubic-bezier(0.2, 0.8, 0.2, 1)',
                transformOrigin: 'center center',
              }}
            >
              <span className="text-4xl font-extrabold text-white">
                {item}
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
};
