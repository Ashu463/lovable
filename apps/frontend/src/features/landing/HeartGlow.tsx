// A heavily-blurred heart silhouette filled with the current accent gradient,
// sized to roughly 75% of the viewport — echoing the reference screenshots'
// glowing-heart backdrop instead of a plain gradient blob.
export function HeartGlow() {
  return (
    <svg
      viewBox="0 0 24 24"
      aria-hidden
      className="pointer-events-none absolute left-1/2 top-1/2 h-[95vmin] w-[95vmin] -translate-x-1/2 -translate-y-1/2 opacity-80 blur-[70px]"
    >
      <defs>
        <linearGradient id="heart-glow-gradient" x1="0" y1="1" x2="1" y2="0">
          <stop offset="0%" stopColor="var(--color-accent-from)" />
          <stop offset="100%" stopColor="var(--color-accent-to)" />
        </linearGradient>
      </defs>
      <path
        fill="url(#heart-glow-gradient)"
        d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"
      />
    </svg>
  );
}
