import { useEffect, useRef } from 'react';

const AdBanner = ({ className = '', showPlaceholder = true }) => {
  const adRef = useRef(false);

  useEffect(() => {
    if (adRef.current) return; // evita rodar novamente
    adRef.current = true;

    try {
      // Carrega o script do AdSense se ainda não estiver carregado
      if (!window.adsbygoogle) {
        const script = document.createElement('script');
        script.src = "https://pagead2.googlesyndication.com/pagead/js/adsbygoogle.js?client=ca-pub-4653666389038251";
        script.async = true;
        script.crossOrigin = "anonymous";
        document.body.appendChild(script);
      }

      (window.adsbygoogle = window.adsbygoogle || []).push({});
    } catch (e) {
      console.error("Erro ao carregar AdSense", e);
    }
  }, []);

  return (
    <ins
      className={`adsbygoogle block ${showPlaceholder ? 'bg-black text-white flex items-center justify-center' : ''} ${className}`}
      data-ad-client="ca-pub-4653666389038251"
      data-ad-slot="1383755817"
      data-ad-format="auto"
      data-full-width-responsive="true"
      data-adtest={showPlaceholder ? "on" : undefined} // apenas para testes em localhost
    >
      {showPlaceholder && 'ANÚNCIO TREINAI'}
    </ins>
  );
};

export default AdBanner;
