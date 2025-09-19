import React, { useEffect, useRef, useState } from 'react';

function SmartphoneAnimation() {
    const images = Array.from({ length: 8 }, (_, i) => `/src/images/${i + 1}.png`);
    const [current, setCurrent] = useState(0);
    const timeoutRef = useRef(null);

    // Troca automática a cada 2s
    useEffect(() => {
        const next = () => setCurrent((prev) => (prev + 1) % images.length);
        timeoutRef.current = setTimeout(next, 2000);
        return () => clearTimeout(timeoutRef.current);
    }, [current]);

    return (
        <div className="w-1/3 md:w-1/6 select-none aspect-[0.5] flex items-center justify-center bg-gray-950 border-4 border-gray-900 rounded-3xl overflow-hidden relative shadow-xl">
            {images.map((src, index) => (
                <img
                    key={index}
                    src={src}
                    alt={`Slide ${index + 1}`}
                    className={`absolute w-full object-cover transition-opacity duration-1000 ease-in-out mask-alpha ${index === current ? 'opacity-100' : 'opacity-0'
                        }`}
                />
            ))}
        </div>
    );
}

export default SmartphoneAnimation;
