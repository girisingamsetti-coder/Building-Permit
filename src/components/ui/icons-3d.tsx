import * as React from 'react';

interface Icon3DProps extends React.SVGProps<SVGSVGElement> {
  className?: string;
  size?: number | string;
}

// 1. 3D Stack / Layers (Total Applications)
export function Icon3DStack({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="stack-top" x1="16" y1="12" x2="48" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#60A5FA" />
          <stop offset="100%" stopColor="#2563EB" />
        </linearGradient>
        <linearGradient id="stack-mid" x1="14" y1="24" x2="50" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#1D4ED8" />
        </linearGradient>
        <linearGradient id="stack-bot" x1="12" y1="36" x2="52" y2="54" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2563EB" />
          <stop offset="100%" stopColor="#1E40AF" />
        </linearGradient>
        <filter id="shadow-3d" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="4" stdDeviation="3" floodColor="#1E3A8A" floodOpacity="0.35" />
        </filter>
      </defs>
      <g filter="url(#shadow-3d)">
        {/* Bottom Layer */}
        <path d="M32 46L52 36L52 42L32 52L12 42L12 36L32 46Z" fill="url(#stack-bot)" opacity="0.9" />
        <path d="M32 46L52 36L32 26L12 36L32 46Z" fill="#1E40AF" opacity="0.4" />

        {/* Middle Layer */}
        <path d="M32 34L52 24L52 30L32 40L12 30L12 24L32 34Z" fill="url(#stack-mid)" opacity="0.95" />
        <path d="M32 34L52 24L32 14L12 24L32 34Z" fill="#1D4ED8" opacity="0.3" />

        {/* Top Layer with 3D Bevel */}
        <path d="M32 22L52 12L52 18L32 28L12 18L12 12L32 22Z" fill="#1E40AF" />
        <path d="M32 22L52 12L32 2L12 12L32 22Z" fill="url(#stack-top)" />
        {/* Gloss highlight */}
        <path d="M32 3L48 11L32 19L16 11L32 3Z" fill="#93C5FD" opacity="0.5" />
      </g>
    </svg>
  );
}

// 2. 3D Activity / Pulse Sphere (In Progress)
export function Icon3DActivity({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <radialGradient id="sphere-glow" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="45%" stopColor="#3B82F6" />
          <stop offset="85%" stopColor="#1E40AF" />
          <stop offset="100%" stopColor="#172554" />
        </radialGradient>
        <linearGradient id="ring-grad" x1="8" y1="20" x2="56" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#67E8F9" />
          <stop offset="50%" stopColor="#3B82F6" />
          <stop offset="100%" stopColor="#A855F7" />
        </linearGradient>
      </defs>
      {/* 3D Outer Orbit Ring Back */}
      <ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(-25 32 32)" stroke="url(#ring-grad)" strokeWidth="3.5" strokeDasharray="38 120" strokeLinecap="round" opacity="0.5" />
      
      {/* 3D Glowing Sphere */}
      <circle cx="32" cy="32" r="18" fill="url(#sphere-glow)" />
      
      {/* Specular Glint */}
      <ellipse cx="26" cy="24" rx="6" ry="3.5" transform="rotate(-30 26 24)" fill="#FFFFFF" opacity="0.75" />
      
      {/* 3D Outer Orbit Ring Front */}
      <ellipse cx="32" cy="32" rx="26" ry="10" transform="rotate(-25 32 32)" stroke="url(#ring-grad)" strokeWidth="3.5" strokeDasharray="80 80" strokeLinecap="round" />
    </svg>
  );
}

// 3. 3D Shield with Checkmark (Approved)
export function Icon3DShieldCheck({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="shield-body" x1="12" y1="8" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#34D399" />
          <stop offset="50%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
        <linearGradient id="shield-bevel" x1="10" y1="6" x2="54" y2="58" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#A7F3D0" />
          <stop offset="100%" stopColor="#064E3B" />
        </linearGradient>
        <filter id="check-shadow" x="-20%" y="-20%" width="140%" height="140%">
          <feDropShadow dx="0" dy="2" stdDeviation="1.5" floodColor="#064E3B" floodOpacity="0.4" />
        </filter>
      </defs>
      {/* Outer 3D Bevel Border */}
      <path d="M32 4L52 13V28C52 42 43.5 54 32 60C20.5 54 12 42 12 28V13L32 4Z" fill="url(#shield-bevel)" />
      {/* Inner 3D Shield Surface */}
      <path d="M32 7.5L49 15.5V28C49 40.5 41.5 51 32 56.5C22.5 51 15 40.5 15 28V15.5L32 7.5Z" fill="url(#shield-body)" />
      {/* Gloss Highlight */}
      <path d="M32 9L46 16V26C46 36 40 45 32 50V9Z" fill="#FFFFFF" opacity="0.22" />
      {/* 3D Checkmark */}
      <path d="M23 30L29 36L41 22" stroke="#FFFFFF" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" filter="url(#check-shadow)" />
    </svg>
  );
}

// 4. 3D Rejection Token (Rejected)
export function Icon3DCircleSlash({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <radialGradient id="rose-sphere" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FDA4AF" />
          <stop offset="40%" stopColor="#F43F5E" />
          <stop offset="85%" stopColor="#BE123C" />
          <stop offset="100%" stopColor="#881337" />
        </radialGradient>
      </defs>
      {/* 3D Disc Base */}
      <circle cx="32" cy="32" r="24" fill="url(#rose-sphere)" />
      {/* Gloss Arch */}
      <ellipse cx="28" cy="20" rx="14" ry="7" fill="#FFFFFF" opacity="0.3" />
      {/* 3D Slash Symbol */}
      <circle cx="32" cy="32" r="15" stroke="#FFFFFF" strokeWidth="4.5" fill="none" />
      <line x1="21.5" y1="21.5" x2="42.5" y2="42.5" stroke="#FFFFFF" strokeWidth="4.5" strokeLinecap="round" />
    </svg>
  );
}

// 5. 3D Warning Octagon (Open Shortfalls)
export function Icon3DAlertOctagon({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="amber-poly" x1="14" y1="8" x2="50" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="35%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
      </defs>
      {/* 3D Octagon with Chamfered Shadow */}
      <polygon points="20,6 44,6 58,20 58,44 44,58 20,58 6,44 6,20" fill="#78350F" />
      <polygon points="20,8 44,8 56,20 56,44 44,56 20,56 8,44 8,20" fill="url(#amber-poly)" />
      <polygon points="20,10 44,10 54,20 54,32 32,32 10,20" fill="#FEF08A" opacity="0.4" />
      
      {/* Exclamation Mark */}
      <rect x="29" y="19" width="6" height="15" rx="3" fill="#FFFFFF" />
      <circle cx="32" cy="42" r="3.5" fill="#FFFFFF" />
    </svg>
  );
}

// 6. 3D Hourglass (Overdue Tasks)
export function Icon3DHourglass({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="wood-frame" x1="10" y1="4" x2="54" y2="60" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#991B1B" />
        </linearGradient>
        <linearGradient id="glass-sand" x1="20" y1="12" x2="44" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FCA5A5" />
          <stop offset="50%" stopColor="#EF4444" />
          <stop offset="100%" stopColor="#B91C1C" />
        </linearGradient>
      </defs>
      {/* Top Cap */}
      <rect x="12" y="6" width="40" height="7" rx="3.5" fill="url(#wood-frame)" />
      {/* Bottom Cap */}
      <rect x="12" y="51" width="40" height="7" rx="3.5" fill="url(#wood-frame)" />
      
      {/* Glass Body */}
      <path d="M16 13C16 26 30 29 32 32C30 35 16 38 16 51H48C48 38 34 35 32 32C34 29 48 26 48 13H16Z" fill="#FEE2E2" opacity="0.3" stroke="#DC2626" strokeWidth="2.5" />
      
      {/* Sand */}
      <path d="M20 18H44C44 24 35 28 32 30C29 28 20 24 20 18Z" fill="url(#glass-sand)" />
      <path d="M22 50C22 43 28 40 32 39C36 40 42 43 42 50H22Z" fill="url(#glass-sand)" />
      {/* Sand stream */}
      <line x1="32" y1="30" x2="32" y2="40" stroke="#EF4444" strokeWidth="2.5" strokeDasharray="3 2" />
    </svg>
  );
}

// 7. 3D Stopwatch / Timer (Due Soon)
export function Icon3DTimer({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <radialGradient id="timer-rim" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#FDBA74" />
          <stop offset="40%" stopColor="#FB923C" />
          <stop offset="100%" stopColor="#C2410C" />
        </radialGradient>
      </defs>
      {/* Top Button */}
      <rect x="28" y="4" width="8" height="6" rx="2" fill="#9A3412" />
      <circle cx="32" cy="35" r="23" fill="#9A3412" />
      <circle cx="32" cy="35" r="21.5" fill="url(#timer-rim)" />
      {/* White Dial face */}
      <circle cx="32" cy="35" r="16" fill="#FFFFFF" />
      {/* Gauge ticks */}
      <circle cx="32" cy="35" r="13" stroke="#FED7AA" strokeWidth="1.5" strokeDasharray="2 6" />
      {/* Needle */}
      <line x1="32" y1="35" x2="40" y2="25" stroke="#EA580C" strokeWidth="3" strokeLinecap="round" />
      <circle cx="32" cy="35" r="3" fill="#9A3412" />
    </svg>
  );
}

// 8. 3D Speedometer / Gauge (Average Processing Time)
export function Icon3DGauge({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="gauge-arc" x1="10" y1="20" x2="54" y2="44" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#818CF8" />
          <stop offset="50%" stopColor="#6366F1" />
          <stop offset="100%" stopColor="#4338CA" />
        </linearGradient>
      </defs>
      {/* 3D Gauge Pod */}
      <circle cx="32" cy="34" r="23" fill="#312E81" />
      <circle cx="32" cy="34" r="21" fill="#1E1B4B" />
      
      {/* Dial Arc */}
      <path d="M16 42C13 32 18 20 32 18C46 20 51 32 48 42" stroke="url(#gauge-arc)" strokeWidth="5" strokeLinecap="round" />
      
      {/* Active Needle */}
      <path d="M32 34L42 22" stroke="#A5B4FC" strokeWidth="3.5" strokeLinecap="round" />
      <circle cx="32" cy="34" r="4" fill="#6366F1" />
      <circle cx="32" cy="34" r="2" fill="#FFFFFF" />
    </svg>
  );
}

// 9. 3D Gold Coins Stack (Fees Generated)
export function Icon3DCoins({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="gold-side" x1="12" y1="20" x2="52" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#F59E0B" />
          <stop offset="100%" stopColor="#B45309" />
        </linearGradient>
        <linearGradient id="gold-top" x1="14" y1="10" x2="50" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#FDE047" />
          <stop offset="60%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </linearGradient>
      </defs>
      {/* Bottom Coin */}
      <g transform="translate(0, 16)">
        <path d="M14 26C14 32 22 36 32 36C42 36 50 32 50 26V32C50 38 42 42 32 42C22 42 14 38 14 32V26Z" fill="url(#gold-side)" />
        <ellipse cx="32" cy="26" rx="18" ry="7" fill="url(#gold-top)" />
      </g>
      
      {/* Middle Coin */}
      <g transform="translate(0, 8)">
        <path d="M14 26C14 32 22 36 32 36C42 36 50 32 50 26V32C50 38 42 42 32 42C22 42 14 38 14 32V26Z" fill="url(#gold-side)" />
        <ellipse cx="32" cy="26" rx="18" ry="7" fill="url(#gold-top)" />
      </g>

      {/* Top Coin */}
      <g transform="translate(0, 0)">
        <path d="M14 26C14 32 22 36 32 36C42 36 50 32 50 26V32C50 38 42 42 32 42C22 42 14 38 14 32V26Z" fill="url(#gold-side)" />
        <ellipse cx="32" cy="26" rx="18" ry="7" fill="url(#gold-top)" />
        <ellipse cx="32" cy="26" rx="13" ry="5" stroke="#FDE68A" strokeWidth="1.5" />
      </g>
    </svg>
  );
}

// 10. 3D Bank / Treasury (Fees Collected)
export function Icon3DLandmark({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="treasury-top" x1="12" y1="8" x2="52" y2="40" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#10B981" />
          <stop offset="100%" stopColor="#047857" />
        </linearGradient>
      </defs>
      {/* Roof Pediment Triangle */}
      <polygon points="32,6 10,18 54,18" fill="url(#treasury-top)" />
      <rect x="8" y="18" width="48" height="5" rx="1.5" fill="#065F46" />
      
      {/* 4 Pillars */}
      <rect x="13" y="23" width="6" height="23" rx="1.5" fill="url(#treasury-top)" />
      <rect x="23" y="23" width="6" height="23" rx="1.5" fill="url(#treasury-top)" />
      <rect x="35" y="23" width="6" height="23" rx="1.5" fill="url(#treasury-top)" />
      <rect x="45" y="23" width="6" height="23" rx="1.5" fill="url(#treasury-top)" />
      
      {/* Stepped Base */}
      <rect x="10" y="46" width="44" height="4" rx="1" fill="#065F46" />
      <rect x="6" y="50" width="52" height="6" rx="2" fill="#047857" />
    </svg>
  );
}

// 11. 3D Financial Token (Pending Fee)
export function Icon3DCircleDollar({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <radialGradient id="fuchsia-coin" cx="35%" cy="30%" r="65%">
          <stop offset="0%" stopColor="#F0ABFC" />
          <stop offset="50%" stopColor="#D946EF" />
          <stop offset="100%" stopColor="#86198F" />
        </radialGradient>
      </defs>
      {/* 3D Coin Body */}
      <circle cx="32" cy="32" r="23" fill="#701A75" />
      <circle cx="32" cy="31" r="21.5" fill="url(#fuchsia-coin)" />
      <circle cx="32" cy="31" r="16.5" stroke="#F5D0FE" strokeWidth="2" opacity="0.6" />
      
      {/* Currency Symbol ₹ / $ */}
      <path d="M26 23H38M26 28H38M26 23H33C36 23 37.5 25.5 36.5 28L26 40M31 28L38 40" stroke="#FFFFFF" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// 12. 3D Trending Arrow & Bar Chart (Payment Success Rate)
export function Icon3DTrendingUp({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="bar-cyan" x1="12" y1="20" x2="52" y2="52" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#2DD4BF" />
          <stop offset="100%" stopColor="#0F766E" />
        </linearGradient>
        <linearGradient id="arrow-green" x1="12" y1="12" x2="52" y2="34" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#4ADE80" />
          <stop offset="100%" stopColor="#16A34A" />
        </linearGradient>
      </defs>
      {/* 3D Isometric Bars */}
      <rect x="12" y="38" width="9" height="18" rx="2" fill="url(#bar-cyan)" />
      <rect x="25" y="28" width="9" height="28" rx="2" fill="url(#bar-cyan)" />
      <rect x="38" y="18" width="9" height="38" rx="2" fill="url(#bar-cyan)" />
      
      {/* 3D Ascending Green Arrow */}
      <path d="M12 34L28 20L38 27L52 10" stroke="url(#arrow-green)" strokeWidth="4.5" strokeLinecap="round" strokeLinejoin="round" />
      <polygon points="54,8 54,18 44,12" fill="#4ADE80" />
    </svg>
  );
}

// 13. 3D Sparkles (New This Month)
export function Icon3DSparkles({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <radialGradient id="sparkle-gold" cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="#FEF08A" />
          <stop offset="40%" stopColor="#FBBF24" />
          <stop offset="100%" stopColor="#D97706" />
        </radialGradient>
      </defs>
      {/* Big Center Star */}
      <path d="M32 4C32 18 36 28 48 32C36 36 32 46 32 60C32 46 28 36 16 32C28 28 32 18 32 4Z" fill="url(#sparkle-gold)" />
      <circle cx="32" cy="32" r="4" fill="#FFFFFF" />
      {/* Small Secondary Star */}
      <path d="M48 10C48 15 50 18 55 20C50 22 48 25 48 30C48 25 46 22 41 20C46 18 48 15 48 10Z" fill="#FDE047" />
    </svg>
  );
}

// 14. 3D File Edit / Draft (Drafts)
export function Icon3DFileEdit({ className = 'size-8', size, ...props }: Icon3DProps) {
  return (
    <svg viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" className={className} width={size} height={size} {...props}>
      <defs>
        <linearGradient id="doc-blue" x1="12" y1="8" x2="48" y2="56" gradientUnits="userSpaceOnUse">
          <stop offset="0%" stopColor="#93C5FD" />
          <stop offset="100%" stopColor="#3B82F6" />
        </linearGradient>
      </defs>
      {/* 3D Paper Sheet with Folded Corner */}
      <path d="M16 8H40L50 18V56H16V8Z" fill="#1E40AF" />
      <path d="M14 6H38L48 16V54H14V6Z" fill="url(#doc-blue)" />
      <polygon points="38,6 48,16 38,16" fill="#BFDBFE" />
      
      {/* Document lines */}
      <rect x="20" y="24" width="22" height="3" rx="1.5" fill="#FFFFFF" opacity="0.8" />
      <rect x="20" y="31" width="18" height="3" rx="1.5" fill="#FFFFFF" opacity="0.8" />
      <rect x="20" y="38" width="14" height="3" rx="1.5" fill="#FFFFFF" opacity="0.8" />
    </svg>
  );
}
