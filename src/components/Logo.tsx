import React from 'react';
import logoMaster from '../assets/logo/kelid-logo-master.png';
import logoWebp1x from '../assets/logo/kelid-logo@1x.webp';
import logoWebp2x from '../assets/logo/kelid-logo@2x.webp';

interface LogoProps {
  className?: string;
  alt?: string;
  style?: React.CSSProperties;
}

/**
 * Universal Kelid Logo Component
 * Renders the authentic transparent gold brand mark (IMG_5399.PNG)
 * strictly frameless, with no border, box, or background around it.
 */
export const Logo: React.FC<LogoProps> = ({
  className = 'h-11 w-auto',
  alt = 'لوگوی کلید',
  style,
}) => {
  return (
    <img
      src={logoMaster}
      srcSet={`${logoWebp1x} 1x, ${logoWebp2x} 2x`}
      alt={alt}
      className={`object-contain bg-transparent border-0 p-0 rounded-none select-none transition-transform duration-300 ${className}`}
      style={style}
      loading="eager"
      decoding="async"
      draggable={false}
    />
  );
};

export default Logo;
