import { useEffect, useRef, useState } from 'react';

const THRESHOLD = 75;

//export function PullToRefresh({ children }: { children: React.ReactNode }) {
export function PullToRefresh({ children, onRefresh }: { children: React.ReactNode, onRefresh?: () => void }) {
  const [pullDistance, setPullDistance] = useState(0);
  const [isRefreshing, setIsRefreshing] = useState(false);

  const startYRef = useRef<number | null>(null);
  const pullDistanceRef = useRef(0);
  const isPullingRef = useRef(false);

  useEffect(() => {
    const onTouchStart = (e: TouchEvent) => {
      if (window.scrollY === 0) {
        startYRef.current = e.touches[0].clientY;
        isPullingRef.current = true;
      }
    };

    const onTouchMove = (e: TouchEvent) => {
      if (!isPullingRef.current || startYRef.current === null) return;
      const delta = e.touches[0].clientY - startYRef.current;
      if (delta <= 0) {
        isPullingRef.current = false;
        return;
      }
      e.preventDefault();
      const dist = Math.min(delta * 0.5, THRESHOLD + 20);
      pullDistanceRef.current = dist;
      setPullDistance(dist);
    };

    const onTouchEnd = () => {
      if (!isPullingRef.current) return;
      isPullingRef.current = false;
      const dist = pullDistanceRef.current;
      startYRef.current = null;

      if (dist >= THRESHOLD * 0.5) {
        setIsRefreshing(true);
        setPullDistance(40);
        //setTimeout(() => window.location.reload(), 900);
        setTimeout(() => { onRefresh?.(); setIsRefreshing(false); setPullDistance(0); pullDistanceRef.current = 0; }, 900);
      } else {
        setPullDistance(0);
        pullDistanceRef.current = 0;
      }
    };

    document.addEventListener('touchstart', onTouchStart, { passive: true });
    document.addEventListener('touchmove', onTouchMove, { passive: false });
    document.addEventListener('touchend', onTouchEnd, { passive: true });

    return () => {
      document.removeEventListener('touchstart', onTouchStart);
      document.removeEventListener('touchmove', onTouchMove);
      document.removeEventListener('touchend', onTouchEnd);
    };
  }, []); // sin dependencias — los refs manejan los valores frescos

  const progress = Math.min(pullDistance / (THRESHOLD * 0.5), 1);
  const size = 36;
  const strokeWidth = 3;
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const dashOffset = circumference * (1 - progress);

  return (
    <div style={{ position: 'relative', minHeight: '100dvh' }}>
      {/* Indicador */}
      <div
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          display: 'flex',
          justifyContent: 'center',
          zIndex: 9999,
          pointerEvents: 'none',
          transform: `translateY(${pullDistance - size - 8}px)`,
          transition: pullDistance === 0 ? 'transform 0.3s ease' : 'none',
        }}
      >
        <div
          style={{
            width: size,
            height: size,
            borderRadius: '50%',
            background: '#fff',
            boxShadow: '0 2px 10px rgba(0,0,0,0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            opacity: progress > 0.05 ? 1 : 0,
            transition: 'opacity 0.1s',
          }}
        >
          <svg
            width={size}
            height={size}
            viewBox={`0 0 ${size} ${size}`}
            style={{
              animation: isRefreshing ? 'ptr-spin 0.7s linear infinite' : 'none',
            }}
          >
            <style>{`
              @keyframes ptr-spin {
                from { transform: rotate(0deg); }
                to { transform: rotate(360deg); }
              }
            `}</style>
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#e5e7eb"
              strokeWidth={strokeWidth}
            />
            <circle
              cx={size / 2}
              cy={size / 2}
              r={radius}
              fill="none"
              stroke="#2e9e50"
              strokeWidth={strokeWidth}
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={isRefreshing ? circumference * 0.25 : dashOffset}
            />
          </svg>
        </div>
      </div>

      {children}
    </div>
  );
}
