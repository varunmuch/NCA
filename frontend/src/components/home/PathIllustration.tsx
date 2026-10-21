/**
 * A winding path through milestones toward a flag: the "your journey"
 * motif used on Home and onboarding. Purely decorative.
 */
export function PathIllustration({ className = "" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 360 260"
      aria-hidden
      focusable="false"
      className={className}
      fill="none"
    >
      <defs>
        <linearGradient id="pi-hill" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="var(--color-accent-soft)" />
          <stop offset="1" stopColor="var(--color-accent-softer)" />
        </linearGradient>
        <linearGradient id="pi-sun" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#ffd79a" />
          <stop offset="1" stopColor="var(--color-warm)" />
        </linearGradient>
      </defs>

      <circle cx="268" cy="70" r="40" fill="url(#pi-sun)" opacity="0.9" />
      <circle cx="268" cy="70" r="58" stroke="var(--color-warm)" strokeOpacity="0.18" strokeWidth="1.5" />

      <path
        d="M0 210 C 60 170, 120 190, 180 168 S 300 120, 360 140 L 360 260 L 0 260 Z"
        fill="url(#pi-hill)"
      />
      <path
        d="M0 236 C 80 206, 150 226, 220 206 S 320 180, 360 196 L 360 260 L 0 260 Z"
        fill="var(--color-primary-soft)"
        opacity="0.85"
      />

      <path
        d="M36 236 C 70 208, 110 214, 132 196 S 150 160, 186 158 S 238 150, 252 122 S 270 92, 296 92"
        stroke="var(--color-primary)"
        strokeWidth="3"
        strokeLinecap="round"
        strokeDasharray="2 9"
      />

      <g>
        <circle cx="36" cy="236" r="9" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="3" />
        <circle cx="132" cy="196" r="9" fill="var(--color-accent)" />
        <path d="M128 196 l3 3 l5.5 -6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="186" cy="158" r="9" fill="var(--color-accent)" />
        <path d="M182 158 l3 3 l5.5 -6" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
        <circle cx="252" cy="122" r="9" fill="var(--color-surface)" stroke="var(--color-primary)" strokeWidth="3" />
      </g>

      <g transform="translate(290 54)">
        <path d="M6 0 V40" stroke="var(--color-ink)" strokeWidth="3" strokeLinecap="round" />
        <path d="M7 2 H32 L26 11 L32 20 H7 Z" fill="var(--color-primary)" />
      </g>

      <g fill="var(--color-sun)">
        <path d="M70 70 l3 8 l8 3 l-8 3 l-3 8 l-3 -8 l-8 -3 l8 -3 Z" />
        <path d="M118 36 l2 5 l5 2 l-5 2 l-2 5 l-2 -5 l-5 -2 l5 -2 Z" opacity="0.8" />
      </g>
      <path
        d="M196 50 l1.6 4 l4 1.6 l-4 1.6 l-1.6 4 l-1.6 -4 l-4 -1.6 l4 -1.6 Z"
        fill="var(--color-primary)"
        opacity="0.5"
      />
    </svg>
  );
}
