import React from 'react';
import { Logo } from './Logo';

export const AtmosphericBackground: React.FC = () => {
  return (
    <div aria-hidden="true" className="fixed inset-0 pointer-events-none z-0 overflow-hidden">
      {/* Obsidian base background with dark blue multi-tone gradient */}
      <div className="absolute inset-0 bg-gradient-to-b from-[#060a16] via-[#091124] to-[#040813]" />

      {/* Subtle gold architectural grid (24px, radial 0.5px, opacity ~0.04) */}
      <div className="absolute inset-0 bg-[radial-gradient(#f1cb83_0.5px,transparent_0.5px)] [background-size:24px_24px] opacity-[0.04]" />

      {/* Architectural Golden Sketch Lines */}
      <svg className="absolute inset-0 w-full h-full opacity-20 pointer-events-none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="goldSketchGrad" x1="0%" x2="100%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#f1cb83" stopOpacity="0.3" />
            <stop offset="50%" stopColor="#d4b06a" stopOpacity="0.08" />
            <stop offset="100%" stopColor="#f1cb83" stopOpacity="0.25" />
          </linearGradient>
        </defs>
        <path
          d="M -50,180 L 450,260 M 380,80 L 100,520 M -30,420 L 480,360 M 40,700 L 420,620 M 200,50 L 320,850"
          fill="none"
          stroke="url(#goldSketchGrad)"
          strokeDasharray="12 8"
          strokeWidth="0.85"
        />
        <circle cx="280" cy="340" fill="none" r="160" stroke="#f1cb83" strokeOpacity="0.06" strokeWidth="1" />
        <circle cx="280" cy="340" fill="none" r="230" stroke="#f1cb83" strokeDasharray="8 6" strokeOpacity="0.04" strokeWidth="0.7" />
      </svg>

      {/* Authentic Whole Kelid Brand Watermark Drifting Gracefully */}
      <div className="absolute top-1/3 inset-x-0 mx-auto w-72 h-80 anim-watermark flex items-center justify-center pointer-events-none select-none opacity-[0.055]">
        <Logo
          alt="واترمارک اصیل کلید"
          className="w-full h-full object-contain filter drop-shadow-[0_0_50px_rgba(241,203,131,0.35)]"
        />
      </div>

      {/* Ambient Large Golden and Deep Blue Halos */}
      <div className="absolute -top-36 right-[-10%] w-[420px] h-[420px] bg-gradient-to-br from-[#f1cb83]/20 via-[#d4b06a]/10 to-transparent rounded-full blur-[90px] anim-glow-1" />
      <div className="absolute top-1/3 -left-32 w-[380px] h-[380px] bg-gradient-to-tr from-[#38bdf8]/15 via-[#f1cb83]/10 to-transparent rounded-full blur-[85px] anim-glow-2" />
      <div className="absolute -bottom-28 inset-x-0 mx-auto w-[460px] h-[400px] bg-gradient-to-t from-[#f1cb83]/15 via-[#161f34]/30 to-transparent rounded-full blur-[95px] anim-glow-1" />

      {/* Tiny Gold Lights Particle Layer 1 */}
      <div className="absolute inset-0 anim-particles-1 pointer-events-none">
        <div className="absolute top-[18%] left-[15%] w-3 h-3 rounded-full bg-[#f1cb83]/70 blur-[1px] shadow-[0_0_12px_#f1cb83]" />
        <div className="absolute top-[32%] right-[22%] w-2 h-2 rounded-full bg-[#ffdea3]/80 blur-[0.5px] shadow-[0_0_8px_#ffdea3]" />
        <div className="absolute top-[48%] left-[30%] w-4 h-4 rounded-full bg-[#f1cb83]/40 blur-[2px] shadow-[0_0_16px_#f1cb83]" />
        <div className="absolute top-[65%] right-[14%] w-2.5 h-2.5 rounded-full bg-[#f1cb83]/60 blur-[1px] shadow-[0_0_10px_#f1cb83]" />
        <div className="absolute top-[78%] left-[18%] w-3.5 h-3.5 rounded-full bg-[#f1cb83]/50 blur-[1.5px] shadow-[0_0_14px_#f1cb83]" />
        <div className="absolute top-[90%] right-[35%] w-2 h-2 rounded-full bg-[#f1cb83]/70 blur-[0.8px] shadow-[0_0_9px_#f1cb83]" />
      </div>

      {/* Tiny Gold Lights Particle Layer 2 (Opposite Phase) */}
      <div className="absolute inset-0 anim-particles-2 pointer-events-none">
        <div className="absolute top-[25%] right-[32%] w-1.5 h-1.5 rounded-full bg-white/70 blur-[0.5px] shadow-[0_0_6px_#fff]" />
        <div className="absolute top-[40%] left-[10%] w-3 h-3 rounded-full bg-[#f1cb83]/60 blur-[1px] shadow-[0_0_12px_#f1cb83]" />
        <div className="absolute top-[58%] right-[8%] w-2 h-2 rounded-full bg-[#ffdea3]/80 blur-[0.8px] shadow-[0_0_10px_#f1cb83]" />
        <div className="absolute top-[72%] left-[42%] w-2.5 h-2.5 rounded-full bg-[#f1cb83]/50 blur-[1px] shadow-[0_0_10px_#f1cb83]" />
        <div className="absolute top-[85%] left-[8%] w-1.5 h-1.5 rounded-full bg-white/60 blur-[0.5px]" />
      </div>
    </div>
  );
};
