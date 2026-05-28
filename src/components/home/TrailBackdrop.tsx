interface BackdropTheme {
  colors: {
    primary?: string;
    accent?: string;
    text?: string;
  };
}

export function TrailBackdrop({ theme }: { theme: BackdropTheme }) {
  const accent = theme.colors.accent ?? theme.colors.primary ?? '#22d3ee';
  const primary = theme.colors.primary ?? '#22d3ee';
  const text = theme.colors.text ?? '#f8fafc';

  const blocks = [
    { x: 60, y: 80, w: 180, h: 140, fill: primary, op: 0.5 },
    { x: 280, y: 40, w: 110, h: 180, fill: accent, op: 0.45 },
    { x: 430, y: 110, w: 160, h: 130, fill: primary, op: 0.35 },
    { x: 640, y: 60, w: 130, h: 170, fill: accent, op: 0.4 },
    { x: 820, y: 100, w: 180, h: 150, fill: primary, op: 0.3 },
    { x: 1050, y: 50, w: 140, h: 200, fill: accent, op: 0.45 },
    { x: 1240, y: 90, w: 200, h: 160, fill: primary, op: 0.35 },
    { x: 100, y: 320, w: 150, h: 130, fill: accent, op: 0.4 },
    { x: 290, y: 360, w: 220, h: 110, fill: primary, op: 0.3 },
    { x: 560, y: 330, w: 130, h: 160, fill: accent, op: 0.45 },
    { x: 740, y: 380, w: 180, h: 130, fill: primary, op: 0.35 },
    { x: 970, y: 320, w: 160, h: 170, fill: accent, op: 0.4 },
    { x: 1180, y: 360, w: 220, h: 140, fill: primary, op: 0.3 },
    { x: 50, y: 580, w: 200, h: 140, fill: accent, op: 0.4 },
    { x: 300, y: 620, w: 130, h: 110, fill: primary, op: 0.35 },
    { x: 480, y: 580, w: 180, h: 160, fill: accent, op: 0.45 },
    { x: 710, y: 620, w: 160, h: 120, fill: primary, op: 0.3 },
    { x: 920, y: 580, w: 200, h: 150, fill: accent, op: 0.4 },
    { x: 1170, y: 600, w: 180, h: 140, fill: primary, op: 0.35 },
    { x: 180, y: 800, w: 160, h: 120, fill: text, op: 0.15 },
    { x: 400, y: 820, w: 220, h: 100, fill: primary, op: 0.3 },
    { x: 680, y: 800, w: 180, h: 130, fill: accent, op: 0.35 },
    { x: 920, y: 820, w: 160, h: 110, fill: text, op: 0.18 },
    { x: 1140, y: 800, w: 200, h: 130, fill: accent, op: 0.3 },
  ];

  const trailPoints = [
    { x: 150, y: 150 },
    { x: 360, y: 130 },
    { x: 720, y: 250 },
    { x: 920, y: 420 },
    { x: 1130, y: 380 },
    { x: 1320, y: 600 },
    { x: 1080, y: 720 },
    { x: 760, y: 680 },
    { x: 480, y: 820 },
  ];
  const trailD = trailPoints
    .map((p, i) => `${i === 0 ? 'M' : 'L'} ${p.x} ${p.y}`)
    .join(' ');

  return (
    <div
      className="pointer-events-none absolute inset-0 overflow-hidden"
      aria-hidden
      style={{ filter: 'blur(20px)', opacity: 0.05 }}
    >
      <svg
        viewBox="0 0 1600 1000"
        preserveAspectRatio="xMidYMid slice"
        style={{ width: '100%', height: '100%' }}
      >
        {blocks.map((b, i) => (
          <rect
            key={i}
            x={b.x}
            y={b.y}
            width={b.w}
            height={b.h}
            rx={10}
            fill={b.fill}
            opacity={b.op}
          />
        ))}
        <path
          d={trailD}
          fill="none"
          stroke={accent}
          strokeWidth={6}
          strokeDasharray="14 10"
          strokeLinecap="round"
          opacity={0.7}
        />
        {trailPoints.map((p, i) => (
          <circle key={i} cx={p.x} cy={p.y} r={9} fill={accent} opacity={0.85} />
        ))}
      </svg>
    </div>
  );
}
