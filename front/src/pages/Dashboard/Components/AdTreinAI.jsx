import React, { useEffect, useRef, useState } from 'react';

const AdTreinAI = ({ logWhenHidden = false, threshold = 0.1, anuncioObj }) => {
  const elRef = useRef(null);
  const lastStateRef = useRef(null);
  const [visto, setVisto] = useState(false);

  useEffect(() => {
    const el = elRef.current;
    if (!el) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        const isVisible = entry.isIntersecting && entry.intersectionRatio > 0;
        if (lastStateRef.current === isVisible) return;
        lastStateRef.current = isVisible;

        if (!logWhenHidden && isVisible) {
          if (!visto) setVisto(true);
        } else if (logWhenHidden && !isVisible) {
          if (!visto) setVisto(true);
        }
      },
      { threshold }
    );

    observer.observe(el);
    return () => observer.disconnect();
  }, [logWhenHidden, threshold, visto]);

  useEffect(() => {
    if (visto) {
      alert('O anúncio foi visualizado');
      // logica pra quando o anuncio for visto
    }
  }, [visto]);

  const handleClick = () => {
    alert('O anúncio foi clicado');
    // logica pra quando o anuncio for clicado
  };

  return (
    <div id="display" ref={elRef} onClick={handleClick} style={{ cursor: 'pointer' }}>
      AdTreinAI
    </div>
  );
};

export default AdTreinAI;
