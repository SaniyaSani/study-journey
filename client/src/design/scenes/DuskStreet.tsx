/**
 * Original illustrated "photograph" of a Tokyo-suburb street at blue hour: corner shop,
 * utility poles, wires, a traffic signal, a railway embankment with a passing train.
 *
 * It is split into a BACK layer (sky, city, embankment, train) and a FRONT layer (poles,
 * wires, signal, shop, street) so the oversized hero typography can sit between them —
 * the wires and the signal cross in front of the characters, like a printed poster.
 *
 * Replace with real photography by setting `photo` on <Hero/> (see docs/DESIGN.md).
 */

export type Period = "day" | "dusk" | "night";

export const PERIOD_PALETTE: Record<
  Period,
  {
    top: string;
    mid: string;
    low: string;
    sun: string;
    sunAlpha: number;
    city: string;
    lit: number;
  }
> = {
  day: {
    top: "#1d5560",
    mid: "#3d7b80",
    low: "#9ab9a8",
    sun: "#f2e5c4",
    sunAlpha: 0.35,
    city: "#163d43",
    lit: 0.15,
  },
  dusk: {
    top: "#061c21",
    mid: "#0b343a",
    low: "#2f4f55",
    sun: "#e88c55",
    sunAlpha: 0.95,
    city: "#08252a",
    lit: 0.8,
  },
  night: {
    top: "#03100f",
    mid: "#071e22",
    low: "#0e2c31",
    sun: "#3a3550",
    sunAlpha: 0.4,
    city: "#041417",
    lit: 1,
  },
};

export function periodForHour(h: number): Period {
  if (h >= 6 && h < 16) return "day";
  if (h >= 16 && h < 19) return "dusk";
  return "night";
}

const VB = "0 0 1600 1000";

export function DuskStreetBack({ period = "dusk" }: { period?: Period }) {
  const p = PERIOD_PALETTE[period];
  const windows = Array.from({ length: 46 }, (_, i) => {
    const x = 880 + ((i * 97) % 700);
    const y = 690 + ((i * 53) % 110);
    return { x, y, on: (i * 7) % 3 !== 0 };
  });
  return (
    <svg
      className="scene scene-back"
      viewBox={VB}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <linearGradient id="ds-sky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor={p.top} />
          <stop offset="0.55" stopColor={p.mid} />
          <stop offset="0.85" stopColor={p.low} />
        </linearGradient>
        <radialGradient id="ds-sun" cx="0.86" cy="0.86" r="0.5">
          <stop offset="0" stopColor={p.sun} stopOpacity={p.sunAlpha} />
          <stop offset="0.35" stopColor={p.sun} stopOpacity={p.sunAlpha * 0.45} />
          <stop offset="1" stopColor={p.sun} stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ds-train" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#c9d6cf" />
          <stop offset="1" stopColor="#7f948f" />
        </linearGradient>
      </defs>
      <rect width="1600" height="1000" fill="url(#ds-sky)" />
      <rect width="1600" height="1000" fill="url(#ds-sun)" />
      {/* thin high clouds */}
      <g opacity="0.35" fill={p.top}>
        <path d="M980 300 q120 -18 260 -4 t240 -6 v8 q-140 10 -250 4 t-250 8z" />
        <path d="M1100 420 q90 -10 200 -2 t200 -4 v6 q-110 8 -200 3 t-200 5z" />
      </g>
      {/* distant city */}
      <path
        fill={p.city}
        d="M820 830 V760 h40 v-30 h50 v50 h30 v-90 h70 v60 h40 v-40 h60 v70 h30 v-110 h20 v-20 h40 v20 h20 v120 h60 v-60 h50 v40 h40 v-80 h80 v100 h30 v-50 h60 v70 h40 v-40 h70 v100 H820z"
      />
      <g fill="#f2e5c4">
        {windows.map((w, i) => (
          <rect
            key={i}
            x={w.x}
            y={w.y}
            width="6"
            height="5"
            opacity={w.on ? p.lit * 0.85 : 0.08}
            className={i % 11 === 0 ? "flicker" : undefined}
          />
        ))}
      </g>
      {/* mountains far right */}
      <path
        fill={p.city}
        opacity="0.55"
        d="M1180 800 l90 -60 l70 40 l60 -50 l90 70 l110 -30 V830 H1180z"
      />
      {/* railway embankment */}
      <path fill="#05181b" d="M760 905 L1600 850 V1000 H760z" />
      {/* passing train (slow drift) */}
      <g className="ds-train">
        {Array.from({ length: 6 }, (_, i) => (
          <g key={i} transform={`translate(${900 + i * 130} ${846 - i * 8.5}) skewY(-3.7)`}>
            <rect width="124" height="34" rx="3" fill="url(#ds-train)" opacity="0.9" />
            <rect y="22" width="124" height="4" fill="#2e7d5b" opacity="0.9" />
            {Array.from({ length: 5 }, (_, j) => (
              <rect
                key={j}
                x={8 + j * 23}
                y="6"
                width="15"
                height="12"
                fill="#f2e5c4"
                opacity={period === "day" ? 0.35 : 0.95}
              />
            ))}
          </g>
        ))}
      </g>
      {/* fence along the embankment */}
      <g stroke="#9a8c6c" strokeWidth="2" opacity="0.7">
        <path d="M800 915 L1600 860" fill="none" />
        {Array.from({ length: 16 }, (_, i) => (
          <path key={i} d={`M${820 + i * 50} ${914 - i * 3.4} v-18`} />
        ))}
      </g>
    </svg>
  );
}

export function DuskStreetFront({ period = "dusk" }: { period?: Period }) {
  const shopGlow = period === "day" ? 0.25 : 1;
  return (
    <svg
      className="scene scene-front"
      viewBox={VB}
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
    >
      <defs>
        <radialGradient id="ds-shopglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#f2e5c4" stopOpacity={0.55 * shopGlow} />
          <stop offset="1" stopColor="#f2e5c4" stopOpacity="0" />
        </radialGradient>
        <radialGradient id="ds-redglow" cx="0.5" cy="0.5" r="0.5">
          <stop offset="0" stopColor="#ff5548" stopOpacity="0.9" />
          <stop offset="0.3" stopColor="#ff5548" stopOpacity="0.35" />
          <stop offset="1" stopColor="#ff5548" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="ds-road" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#0d2226" />
          <stop offset="1" stopColor="#050f11" />
        </linearGradient>
        <linearGradient id="ds-shopfloor" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#f6e9c8" />
          <stop offset="1" stopColor="#d9b97f" />
        </linearGradient>
      </defs>

      {/* road */}
      <path fill="url(#ds-road)" d="M0 930 L1600 900 V1000 H0z" />
      {/* red signal reflection on wet asphalt */}
      <ellipse
        className="signal-reflection"
        cx="1060"
        cy="960"
        rx="26"
        ry="70"
        fill="url(#ds-redglow)"
        opacity="0.45"
      />
      {/* crosswalk */}
      <g fill="#d9f4d8" opacity="0.32">
        {Array.from({ length: 9 }, (_, i) => (
          <path key={i} d={`M${860 + i * 82} ${972 - i * 1.6} l60 -2 l40 30 l-64 2z`} />
        ))}
      </g>

      {/* low apartment block on the left (keeps the copy area dark and quiet) */}
      <g>
        <path fill="#061619" d="M-10 610 H380 V930 H-10z" />
        <path fill="#041113" d="M-10 600 H390 V616 H-10z" />
        <g fill="#f2e5c4">
          <rect x="40" y="660" width="34" height="20" opacity={0.55 * shopGlow} />
          <rect x="250" y="700" width="34" height="20" opacity={0.35 * shopGlow} />
          <rect x="160" y="760" width="34" height="20" opacity={0.2 * shopGlow} />
        </g>
        <g stroke="#0d2a2e" strokeWidth="2">
          <path d="M-10 740 H380 M-10 850 H380" />
        </g>
      </g>
      <g transform="translate(420 64)">
        {/* light spill from the shop */}
        <ellipse cx="420" cy="935" rx="420" ry="60" fill="url(#ds-shopglow)" />
        {/* corner shop (generic, fictional) */}
        <g>
          <path fill="#0a2125" d="M70 650 L330 600 L760 640 V930 H70z" />
          <path fill="#08191c" d="M70 650 L330 600 V560 L70 610z" />
          {/* upper floor windows */}
          <g fill="#f2e5c4" opacity={0.5 * shopGlow}>
            <rect x="120" y="660" width="40" height="22" />
            <rect x="420" y="662" width="60" height="24" opacity="0.6" />
            <rect x="560" y="668" width="60" height="24" />
          </g>
          {/* fascia band: mint over petrol, deliberately not any real chain's colours */}
          <path fill="#d9f4d8" d="M70 735 L330 712 L760 742 V770 L330 742 L70 765z" />
          <path fill="#e88c55" d="M70 765 L330 742 L760 770 V778 L330 750 L70 773z" />
          <text
            x="430"
            y="764"
            fontFamily="var(--f-heavy)"
            fontWeight="900"
            fontSize="26"
            fill="#082d34"
            transform="skewY(4)"
            letterSpacing="6"
          >
            ひかり商店
          </text>
          {/* glowing shop floor */}
          <path
            fill="url(#ds-shopfloor)"
            d="M90 785 L330 760 L740 786 V925 H90z"
            opacity={0.92 * shopGlow + 0.05}
          />
          {/* shelves & window frames */}
          <g stroke="#3a3324" strokeWidth="3" opacity="0.55">
            <path d="M170 790 V925 M250 780 V925 M330 772 V925 M420 777 V925 M510 781 V925 M600 784 V925 M680 786 V925" />
            <path d="M90 845 L740 850" />
          </g>
          <g fill="#c8553d" opacity="0.55">
            <rect x="360" y="800" width="40" height="30" />
            <rect x="540" y="808" width="26" height="36" fill="#2e7d5b" />
            <rect x="190" y="805" width="44" height="22" fill="#e88c55" />
          </g>
          {/* vending machines */}
          <rect x="700" y="820" width="46" height="105" fill="#d9f4d8" opacity="0.88" />
          <rect x="706" y="830" width="34" height="34" fill="#0b343a" opacity="0.7" />
          <rect
            x="18"
            y="830"
            width="46"
            height="100"
            fill="#f2e5c4"
            opacity={0.8 * shopGlow + 0.1}
          />
        </g>

        {/* tall vertical sign */}
        <g>
          <rect x="40" y="420" width="16" height="520" fill="#05161a" />
          <rect
            x="14"
            y="440"
            width="70"
            height="170"
            fill="#d9f4d8"
            opacity={0.85 * shopGlow + 0.1}
          />
          <text
            x="49"
            y="500"
            textAnchor="middle"
            fontFamily="var(--f-heavy)"
            fontWeight="900"
            fontSize="34"
            fill="#082d34"
          >
            喫
          </text>
          <text
            x="49"
            y="545"
            textAnchor="middle"
            fontFamily="var(--f-heavy)"
            fontWeight="900"
            fontSize="34"
            fill="#082d34"
          >
            茶
          </text>
          <rect x="14" y="610" width="70" height="40" fill="#e88c55" />
          <text
            x="49"
            y="638"
            textAnchor="middle"
            fontFamily="var(--f-mono)"
            fontSize="15"
            fill="#082d34"
            letterSpacing="2"
          >
            24H
          </text>
        </g>

        {/* cyclist */}
        <g fill="none" stroke="#05161a" strokeWidth="5" strokeLinecap="round">
          <circle cx="470" cy="905" r="34" />
          <circle cx="580" cy="905" r="34" />
          <path d="M470 905 L515 860 L580 905 M515 860 L560 852 M515 860 L505 845" />
        </g>
        <path fill="#05161a" d="M512 790 q18 -8 30 8 l14 40 l-8 18 l-30 -6 l-16 -30z" />
        <circle cx="532" cy="776" r="13" fill="#05161a" />
      </g>
      {/* utility poles */}
      <g fill="#04131a">
        <rect x="1055" y="360" width="16" height="590" />
        <rect x="1300" y="520" width="11" height="380" />
        <rect x="1505" y="560" width="9" height="320" />
        <rect x="1036" y="430" width="54" height="6" />
        <rect x="1288" y="560" width="36" height="5" />
      </g>
      {/* wires — cross the sky (and the hero characters) diagonally */}
      <g fill="none" stroke="#04131a" strokeLinecap="round">
        <path strokeWidth="2.6" d="M-20 140 C 400 330, 760 420, 1063 434" />
        <path strokeWidth="2.2" d="M-20 70 C 420 300, 760 400, 1063 440" />
        <path strokeWidth="1.8" d="M500 -20 C 640 160, 860 360, 1063 438" />
        <path strokeWidth="2.4" d="M640 -20 C 760 170, 930 340, 1063 432" />
        <path strokeWidth="1.6" d="M1063 434 C 1160 470, 1230 520, 1305 562" />
        <path strokeWidth="1.6" d="M1063 440 C 1170 500, 1240 545, 1305 566" />
        <path strokeWidth="1.4" d="M1305 563 C 1390 580, 1450 590, 1510 600" />
        <path strokeWidth="1.2" d="M1610 470 C 1500 520, 1400 545, 1305 562" />
        <path strokeWidth="1.6" d="M180 -20 C 300 220, 520 520, 1063 436" opacity="0.8" />
      </g>

      {/* traffic signal */}
      <g>
        <path d="M1063 470 L1000 478" stroke="#04131a" strokeWidth="6" />
        <rect x="860" y="448" width="150" height="52" rx="10" fill="#0a1b1f" />
        <circle cx="890" cy="474" r="17" fill="#1a2b2d" />
        <circle cx="935" cy="474" r="17" fill="#1a2b2d" />
        <circle className="signal-glow" cx="980" cy="474" r="70" fill="url(#ds-redglow)" />
        <circle className="signal-lamp" cx="980" cy="474" r="17" fill="#ff5548" />
        {/* station-front street sign */}
        <g transform="translate(905 520) rotate(-6)">
          <rect width="130" height="34" fill="#d9f4d8" opacity="0.9" />
          <text
            x="65"
            y="23"
            textAnchor="middle"
            fontFamily="var(--f-gothic)"
            fontWeight="700"
            fontSize="17"
            fill="#082d34"
            letterSpacing="2"
          >
            南ヶ丘駅前
          </text>
        </g>
      </g>
    </svg>
  );
}
