/**
 * Small, original duotone "travel poster" scenes for the route collage — in the spirit of
 * screen-printed railway posters. They stand in until licensed photography is added
 * (see docs/DESIGN.md → Photography).
 */
export type SceneVariant = "sea" | "mountain" | "bamboo" | "coast" | "alps" | "rain";

const INK = "#071e22";
const PETROL = "#0b343a";
const MINT = "#d9f4d8";
const CREAM = "#f2e5c4";
const SUN = "#e88c55";
const RED = "#ff5548";

function Train({
  x,
  y,
  scale = 1,
  color = MINT,
}: {
  x: number;
  y: number;
  scale?: number;
  color?: string;
}) {
  return (
    <g transform={`translate(${x} ${y}) scale(${scale})`}>
      {[0, 1, 2].map((i) => (
        <g key={i} transform={`translate(${i * 64} 0)`}>
          <rect width="60" height="20" rx="3" fill={color} />
          <rect y="13" width="60" height="3" fill={RED} />
          {[0, 1, 2, 3].map((j) => (
            <rect key={j} x={5 + j * 14} y="4" width="9" height="6" fill={INK} opacity="0.7" />
          ))}
        </g>
      ))}
    </g>
  );
}

export function EditorialScene({ variant }: { variant: SceneVariant }) {
  return (
    <svg
      className="ed-scene"
      viewBox="0 0 400 300"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      {variant === "sea" && (
        <>
          <rect width="400" height="300" fill={PETROL} />
          <circle cx="300" cy="120" r="46" fill={SUN} />
          <rect y="150" width="400" height="150" fill={INK} />
          {Array.from({ length: 12 }, (_, i) => (
            <rect
              key={i}
              x={40 + ((i * 67) % 320)}
              y={160 + i * 9}
              width={30 + (i % 4) * 14}
              height="2"
              fill={SUN}
              opacity={0.6 - i * 0.04}
            />
          ))}
          <path d="M0 210 L400 190 V215 L0 235z" fill={MINT} opacity="0.85" />
          <Train x={150} y={170} scale={0.9} color={CREAM} />
          <path d="M0 150 q40 -30 90 -10 t70 0 V150z" fill={INK} />
        </>
      )}
      {variant === "mountain" && (
        <>
          <rect width="400" height="300" fill="#103b40" />
          <circle cx="90" cy="80" r="26" fill={CREAM} opacity="0.9" />
          <path
            d="M0 190 L70 110 L130 160 L210 70 L300 150 L360 100 L400 130 V300 H0z"
            fill={PETROL}
          />
          <path d="M0 230 L90 170 L170 210 L250 150 L330 200 L400 170 V300 H0z" fill={INK} />
          <path d="M60 215 H340" stroke={MINT} strokeWidth="2" />
          {Array.from({ length: 8 }, (_, i) => (
            <path key={i} d={`M${70 + i * 38} 215 v30`} stroke={MINT} strokeWidth="2" />
          ))}
          <Train x={110} y={194} scale={0.8} />
        </>
      )}
      {variant === "bamboo" && (
        <>
          <rect width="400" height="300" fill="#0d3a33" />
          {Array.from({ length: 16 }, (_, i) => (
            <g key={i} opacity={0.5 + (i % 3) * 0.2}>
              <rect
                x={i * 26 + (i % 2) * 6}
                y="0"
                width={8 + (i % 3) * 3}
                height="300"
                fill={i % 2 ? "#2e7d5b" : "#5aa37a"}
              />
              {[60, 140, 220].map((y) => (
                <rect
                  key={y}
                  x={i * 26 + (i % 2) * 6}
                  y={y + i * 3}
                  width={8 + (i % 3) * 3}
                  height="2"
                  fill={INK}
                />
              ))}
            </g>
          ))}
          <rect y="230" width="400" height="70" fill={INK} opacity="0.85" />
          <path d="M0 236 Q200 214 400 236" stroke={CREAM} strokeWidth="5" fill="none" />
          {Array.from({ length: 10 }, (_, i) => (
            <path key={i} d={`M${20 + i * 40} 230 v20`} stroke={CREAM} strokeWidth="3" />
          ))}
        </>
      )}
      {variant === "coast" && (
        <>
          <rect width="400" height="300" fill="#3a2f3c" />
          <rect width="400" height="160" fill={SUN} opacity="0.85" />
          <circle cx="200" cy="160" r="60" fill={RED} opacity="0.85" />
          <rect y="160" width="400" height="140" fill={PETROL} />
          <path d="M0 120 L60 110 L110 140 L150 160 H0z" fill={INK} />
          <path d="M260 160 L300 120 L340 115 L400 100 V160z" fill={INK} />
          {Array.from({ length: 9 }, (_, i) => (
            <rect
              key={i}
              x={150 + ((i * 31) % 100)}
              y={170 + i * 12}
              width={40 - i * 3}
              height="2"
              fill={SUN}
              opacity="0.7"
            />
          ))}
          <path
            d="M290 112 q6 -14 0 -26 M305 108 q6 -14 0 -26"
            stroke={CREAM}
            strokeWidth="3"
            fill="none"
            opacity="0.7"
          />
        </>
      )}
      {variant === "alps" && (
        <>
          <rect width="400" height="300" fill="#0e3940" />
          <path
            d="M0 170 L80 70 L120 110 L180 40 L250 120 L300 80 L400 160 V300 H0z"
            fill="#1d5560"
          />
          <path
            d="M80 70 L100 95 L90 100 L120 110 L104 88z M180 40 L205 75 L190 72 L215 92 L196 60z M300 80 L320 104 L312 106 L332 120z"
            fill={MINT}
          />
          <path d="M0 260 Q200 200 400 250 V300 H0z" fill={INK} />
          <path
            d="M0 280 Q160 230 400 270"
            stroke={CREAM}
            strokeWidth="6"
            fill="none"
            opacity="0.5"
          />
          <Train x={150} y={218} scale={0.75} color={CREAM} />
        </>
      )}
      {variant === "rain" && (
        <>
          <rect width="400" height="300" fill="#0a2a30" />
          <rect x="40" y="40" width="320" height="200" fill="#123f46" />
          {Array.from({ length: 40 }, (_, i) => (
            <path
              key={i}
              d={`M${50 + ((i * 37) % 300)} ${50 + ((i * 53) % 180)} l-6 16`}
              stroke={MINT}
              strokeWidth="1.5"
              opacity="0.6"
            />
          ))}
          {Array.from({ length: 14 }, (_, i) => (
            <circle
              key={i}
              cx={60 + ((i * 71) % 290)}
              cy={60 + ((i * 43) % 170)}
              r={2 + (i % 3)}
              fill={MINT}
              opacity="0.5"
            />
          ))}
          <rect x="40" y="240" width="320" height="18" fill={INK} />
          <circle cx="300" cy="150" r="10" fill={RED} opacity="0.6" />
        </>
      )}
    </svg>
  );
}
