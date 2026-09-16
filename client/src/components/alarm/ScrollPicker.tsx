import React, { useState, useRef, useEffect, useCallback } from 'react';

interface ScrollPickerProps {
  items: string[];
  selectedIndex: number;
  onChange: (index: number) => void;
  itemHeight?: number;
  loop?: boolean;
}

function getNearestVirtualIndex(currentK: number, targetMod: number, length: number): number {
  const currentMod = ((currentK % length) + length) % length;
  let diff = targetMod - currentMod;
  if (diff > length / 2) diff -= length;
  if (diff < -length / 2) diff += length;
  return currentK + diff;
}

export const ScrollPicker: React.FC<ScrollPickerProps> = ({
  items,
  selectedIndex,
  onChange,
  itemHeight = 46,
  loop = true,
}) => {
  const [offset, setOffset] = useState(-selectedIndex * itemHeight);

  const offsetRef = useRef(-selectedIndex * itemHeight);
  const isDraggingRef = useRef(false);
  const startYRef = useRef(0);
  const startOffsetRef = useRef(0);
  const animFrameRef = useRef<number | null>(null);
  const pointerHistoryRef = useRef<{ y: number; time: number }[]>([]);
  const wheelTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const lastTickIndexRef = useRef<number>(selectedIndex);

  const onChangeRef = useRef(onChange);
  useEffect(() => {
    onChangeRef.current = onChange;
  }, [onChange]);

  const stopAnimation = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const checkHapticTick = useCallback(
    (currentOffset: number) => {
      const currentK = Math.round(-currentOffset / itemHeight);
      const activeIndex = ((currentK % items.length) + items.length) % items.length;
      if (activeIndex !== lastTickIndexRef.current) {
        lastTickIndexRef.current = activeIndex;
        if (typeof navigator !== 'undefined' && 'vibrate' in navigator) {
          try {
            navigator.vibrate(6);
          } catch {}
        }
      }
    },
    [itemHeight, items.length]
  );

  const notifyChange = useCallback(
    (currentOffset: number) => {
      const currentK = Math.round(-currentOffset / itemHeight);
      const activeIndex = ((currentK % items.length) + items.length) % items.length;
      onChangeRef.current(activeIndex);
    },
    [itemHeight, items.length]
  );

  const animateToOffset = useCallback(
    (targetOffset: number, duration: number = 280) => {
      stopAnimation();
      const startOffset = offsetRef.current;
      const distance = targetOffset - startOffset;

      if (Math.abs(distance) < 0.5) {
        offsetRef.current = targetOffset;
        setOffset(targetOffset);
        notifyChange(targetOffset);
        return;
      }

      const startTime = performance.now();

      const step = (currentTime: number) => {
        const elapsed = currentTime - startTime;
        const progress = Math.min(1, elapsed / duration);
        // Smooth quintic deceleration curve: 1 - (1 - t)^4
        const ease = 1 - Math.pow(1 - progress, 4);
        const newOffset = startOffset + distance * ease;

        offsetRef.current = newOffset;
        setOffset(newOffset);
        checkHapticTick(newOffset);

        if (progress < 1) {
          animFrameRef.current = requestAnimationFrame(step);
        } else {
          offsetRef.current = targetOffset;
          setOffset(targetOffset);
          animFrameRef.current = null;
          notifyChange(targetOffset);
        }
      };

      animFrameRef.current = requestAnimationFrame(step);
    },
    [checkHapticTick, notifyChange, stopAnimation]
  );

  // Synchronize with selectedIndex if it changes externally
  useEffect(() => {
    if (isDraggingRef.current) return;
    const currentK = Math.round(-offsetRef.current / itemHeight);
    const currentActiveIndex = ((currentK % items.length) + items.length) % items.length;

    if (currentActiveIndex !== selectedIndex) {
      if (loop) {
        const nearestK = getNearestVirtualIndex(currentK, selectedIndex, items.length);
        animateToOffset(-nearestK * itemHeight, 260);
      } else {
        animateToOffset(-selectedIndex * itemHeight, 260);
      }
    }
  }, [selectedIndex, itemHeight, items.length, loop, animateToOffset]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopAnimation();
      if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    };
  }, [stopAnimation]);

  const handlePointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    e.preventDefault();
    stopAnimation();

    try {
      e.currentTarget.setPointerCapture(e.pointerId);
    } catch {}

    isDraggingRef.current = true;
    startYRef.current = e.clientY;
    startOffsetRef.current = offsetRef.current;
    pointerHistoryRef.current = [{ y: e.clientY, time: performance.now() }];
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    e.preventDefault();

    const now = performance.now();
    const deltaY = e.clientY - startYRef.current;
    let newOffset = startOffsetRef.current + deltaY;

    if (!loop) {
      const minOffset = -(items.length - 1) * itemHeight;
      const maxOffset = 0;
      if (newOffset > maxOffset) {
        newOffset = maxOffset + (newOffset - maxOffset) * 0.3;
      } else if (newOffset < minOffset) {
        newOffset = minOffset + (newOffset - minOffset) * 0.3;
      }
    }

    offsetRef.current = newOffset;
    setOffset(newOffset);
    checkHapticTick(newOffset);

    // Keep last 100ms of pointer moves for accurate release velocity
    const history = pointerHistoryRef.current;
    history.push({ y: e.clientY, time: now });
    while (history.length > 1 && now - history[0].time > 100) {
      history.shift();
    }
  };

  const handlePointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isDraggingRef.current) return;
    isDraggingRef.current = false;

    try {
      e.currentTarget.releasePointerCapture(e.pointerId);
    } catch {}

    const now = performance.now();
    const history = pointerHistoryRef.current;
    let velocity = 0;

    if (history.length >= 2) {
      const oldest = history[0];
      const dt = now - oldest.time;
      if (dt > 10 && dt < 150) {
        velocity = (e.clientY - oldest.y) / dt;
      }
    }

    // Limit extreme velocities
    velocity = Math.max(-2.5, Math.min(2.5, velocity));

    let targetOffset = offsetRef.current;
    if (Math.abs(velocity) > 0.1) {
      // Scale momentum distance by velocity
      const momentumDistance = velocity * 250;
      targetOffset += momentumDistance;
    }

    if (!loop) {
      const minOffset = -(items.length - 1) * itemHeight;
      const maxOffset = 0;
      targetOffset = Math.max(minOffset, Math.min(maxOffset, targetOffset));
    }

    const targetK = Math.round(-targetOffset / itemHeight);
    const snapOffset = -targetK * itemHeight;
    const distance = Math.abs(snapOffset - offsetRef.current);
    const duration = Math.min(750, Math.max(220, distance * 1.6));

    animateToOffset(snapOffset, duration);
  };

  const handlePointerCancel = (e: React.PointerEvent<HTMLDivElement>) => {
    if (isDraggingRef.current) {
      handlePointerUp(e);
    }
  };

  const handleWheel = (e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    stopAnimation();

    const newOffset = offsetRef.current - e.deltaY * 0.6;
    offsetRef.current = newOffset;
    setOffset(newOffset);
    checkHapticTick(newOffset);

    if (wheelTimeoutRef.current) clearTimeout(wheelTimeoutRef.current);
    wheelTimeoutRef.current = setTimeout(() => {
      let target = offsetRef.current;
      if (!loop) {
        const minOffset = -(items.length - 1) * itemHeight;
        const maxOffset = 0;
        target = Math.max(minOffset, Math.min(maxOffset, target));
      }
      const targetK = Math.round(-target / itemHeight);
      animateToOffset(-targetK * itemHeight, 220);
    }, 120);
  };

  const handleItemClick = (slotK: number) => {
    if (isDraggingRef.current) return;
    const targetOffset = -slotK * itemHeight;
    animateToOffset(targetOffset, 240);
  };

  const visibleCount = 3;
  const containerHeight = itemHeight * visibleCount;
  const centerK = Math.round(-offset / itemHeight);

  // Render 5 virtual slots around the center position (-2 to +2)
  const renderSlots = [-2, -1, 0, 1, 2].map((j) => {
    const slotK = centerK + j;
    const itemIndex = ((slotK % items.length) + items.length) % items.length;
    const item = items[itemIndex];
    const distFromCenter = slotK * itemHeight + offset;
    const normDist = distFromCenter / itemHeight;

    const rotateX = -normDist * 30; // degrees
    const scale = Math.max(0.72, 1 - Math.abs(normDist) * 0.15);
    const opacity = Math.max(0.2, 1 - Math.abs(normDist) * 0.55);
    const isSelected = Math.abs(normDist) < 0.45;

    return (
      <div
        key={slotK}
        onClick={() => handleItemClick(slotK)}
        className="absolute w-full flex items-center justify-center font-tabular cursor-pointer select-none"
        style={{
          height: itemHeight,
          top: '50%',
          marginTop: -itemHeight / 2,
          transform: `translateY(${distFromCenter}px) rotateX(${rotateX}deg) scale(${scale})`,
          opacity,
          transformOrigin: 'center center',
          zIndex: isSelected ? 2 : 1,
        }}
      >
        <span
          className={`font-black tracking-tight ${
            isSelected
              ? 'text-4xl text-white drop-shadow-[0_2px_10px_rgba(255,255,255,0.3)]'
              : 'text-3xl text-neutral-400'
          }`}
        >
          {item}
        </span>
      </div>
    );
  });

  return (
    <div
      className="relative overflow-hidden select-none touch-none w-full"
      style={{
        height: containerHeight,
        perspective: '1000px',
        maskImage: 'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
        WebkitMaskImage: 'linear-gradient(to bottom, transparent 0%, black 22%, black 78%, transparent 100%)',
      }}
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerCancel={handlePointerCancel}
      onWheel={handleWheel}
    >
      {/* Center Highlight Selection Band */}
      <div
        className="absolute w-full rounded-xl bg-white/10 border border-white/15 pointer-events-none backdrop-blur-sm"
        style={{
          height: itemHeight,
          top: '50%',
          transform: 'translateY(-50%)',
          zIndex: 0,
        }}
      />

      {/* Rendered 3D Virtual Slots */}
      {renderSlots}
    </div>
  );
};
