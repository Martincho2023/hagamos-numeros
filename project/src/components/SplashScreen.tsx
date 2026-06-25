import { useEffect, useState } from 'react';

interface SplashScreenProps {
  onFinish: () => void;
}

export function SplashScreen({ onFinish }: SplashScreenProps) {
  const [animate, setAnimate] = useState(false);
  const [showSubtitle, setShowSubtitle] = useState(false);

  useEffect(() => {
    const t1 = setTimeout(() => setAnimate(true), 100);
    const t2 = setTimeout(() => setShowSubtitle(true), 1200);
    const t3 = setTimeout(() => onFinish(), 2400);
    return () => {
      clearTimeout(t1);
      clearTimeout(t2);
      clearTimeout(t3);
    };
  }, [onFinish]);

  return (
    <div className="fixed inset-0 flex flex-col items-center justify-center bg-black z-50">
      <div className="relative flex items-start justify-center" style={{ height: 160 }}>
        <span
          style={{
            fontSize: 150,
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: 'Arial Black, Arial, sans-serif',
            color: '#2e9e50',
            position: 'absolute',
            left: -23,
            zIndex: 1,
            opacity: animate ? 1 : 0,
            transform: animate ? 'translateX(0)' : 'translateX(-180px)',
            transition: animate
              ? 'transform 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s, opacity 0.2s ease 0.25s'
              : 'none',
          }}
        >
          N
        </span>
        <span
          style={{
            fontSize: 150,
            fontWeight: 900,
            lineHeight: 1,
            fontFamily: 'Arial Black, Arial, sans-serif',
            color: '#ffffff',
            position: 'absolute',
            right: -23,
            zIndex: 2,
            opacity: animate ? 1 : 0,
            transform: animate ? 'translateX(0)' : 'translateX(180px)',
            transition: animate
              ? 'transform 1s cubic-bezier(0.22, 1, 0.36, 1) 0.15s, opacity 0.2s ease 0.25s'
              : 'none',
          }}
        >
          H
        </span>
      </div>

      <p
        style={{
          fontSize: 13,
          letterSpacing: '0.18em',
          textTransform: 'uppercase',
          color: showSubtitle ? 'rgba(255,255,255,0.5)' : 'rgba(255,255,255,0)',
          transition: 'color 0.8s ease',
          marginTop: 12,
          fontWeight: 500,
        }}
      >
        Hagamos Números
      </p>
    </div>
  );
}
