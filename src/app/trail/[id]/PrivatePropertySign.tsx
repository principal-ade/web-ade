/**
 * PrivatePropertySign — illustrated SVG used on the trail's NO_REPO_ACCESS
 * error state. A wooden archway entrance with a "PRIVATE PROPERTY" sign
 * hanging from iron brackets, a fence running off to either side, and a
 * dirt trail receding through the gate into a horizon of trees and hills.
 *
 * Colors are baked in (not themed) so it reads the same in light and dark
 * mode — that's the joke.
 */
export function PrivatePropertySign() {
  return (
    <svg
      width="100%"
      viewBox="-80 -12 320 170"
      preserveAspectRatio="xMidYMid meet"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Private property entrance sign"
    >
      <defs>
        <linearGradient id="ppSky" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#5e9bcb" />
          <stop offset="0.7" stopColor="#9ec3de" />
          <stop offset="1" stopColor="#d6e6ee" />
        </linearGradient>
        <linearGradient id="ppGround" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0" stopColor="#8aa86a" />
          <stop offset="1" stopColor="#6f8e52" />
        </linearGradient>
      </defs>

      {/* Sky and ground plane */}
      <rect x="-80" y="-12" width="320" height="100" fill="url(#ppSky)" />
      <rect x="-80" y="88" width="320" height="70" fill="url(#ppGround)" />

      {/* Sun */}
      <g>
        <circle cx="180" cy="14" r="9" fill="#fff4c2" opacity="0.55" />
        <circle cx="180" cy="14" r="6" fill="#fff8d8" />
      </g>

      {/* Clouds */}
      <g fill="#ffffff" opacity="0.85">
        <ellipse cx="-30" cy="14" rx="14" ry="3.5" />
        <ellipse cx="-22" cy="11" rx="9" ry="3" />
        <ellipse cx="-38" cy="12" rx="7" ry="2.5" />

        <ellipse cx="80" cy="6" rx="18" ry="3.5" />
        <ellipse cx="88" cy="3" rx="10" ry="3" />
        <ellipse cx="72" cy="3" rx="8" ry="2.5" />

        <ellipse cx="220" cy="28" rx="16" ry="3.5" />
        <ellipse cx="226" cy="25" rx="9" ry="3" />
        <ellipse cx="212" cy="26" rx="7" ry="2.5" />
      </g>

      {/* Distant rolling hills on the horizon */}
      <g>
        <path
          d="M -80 88 Q -30 74 30 84 Q 80 70 130 82 Q 180 72 240 86 L 240 92 L -80 92 Z"
          fill="#7892a8"
          opacity="0.55"
        />
        <path
          d="M -80 90 Q -20 80 50 88 Q 110 78 170 88 Q 210 82 240 90 L 240 96 L -80 96 Z"
          fill="#88a08a"
          opacity="0.7"
        />
      </g>

      {/* Distant ground shadow */}
      <ellipse cx="80" cy="148" rx="170" ry="4" fill="#000" opacity="0.18" />

      {/* Background trees — set well back from the fence on the horizon */}
      <g>
        {/* Far-left oak (largest of the back trees) */}
        <rect x="-51" y="74" width="3" height="22" fill="#4a3014" opacity="0.9" />
        <g>
          <circle cx="-50" cy="62" r="11" fill="#3d6b2a" />
          <circle cx="-58" cy="66" r="7.5" fill="#3d6b2a" />
          <circle cx="-42" cy="66" r="7.5" fill="#3d6b2a" />
          <circle cx="-50" cy="55" r="6.5" fill="#3d6b2a" />
          <circle cx="-46" cy="58" r="4" fill="#5d8538" opacity="0.6" />
        </g>

        {/* Far-right oak */}
        <rect x="191" y="76" width="3" height="20" fill="#4a3014" opacity="0.9" />
        <g>
          <circle cx="192" cy="64" r="10.5" fill="#3d6b2a" />
          <circle cx="184" cy="68" r="7" fill="#3d6b2a" />
          <circle cx="200" cy="68" r="7" fill="#3d6b2a" />
          <circle cx="192" cy="56" r="6" fill="#3d6b2a" />
          <circle cx="195" cy="60" r="4" fill="#5d8538" opacity="0.6" />
        </g>

        {/* Pine, far left */}
        <rect x="-78" y="84" width="2" height="14" fill="#4a3014" opacity="0.85" />
        <path d="M -77 56 L -83 84 L -71 84 Z" fill="#345b22" opacity="0.9" />
        <path d="M -77 64 L -81 80 L -73 80 Z" fill="#456e2a" opacity="0.7" />
        <path d="M -77 72 L -79.5 78 L -74.5 78 Z" fill="#5d8538" opacity="0.5" />

        {/* Pine, far right */}
        <rect x="222" y="84" width="2" height="14" fill="#4a3014" opacity="0.85" />
        <path d="M 223 56 L 217 84 L 229 84 Z" fill="#345b22" opacity="0.9" />
        <path d="M 223 64 L 219 80 L 227 80 Z" fill="#456e2a" opacity="0.7" />
        <path d="M 223 72 L 220.5 78 L 225.5 78 Z" fill="#5d8538" opacity="0.5" />

        {/* Mid-distance oak, left side */}
        <rect x="-30" y="82" width="2.5" height="16" fill="#4a3014" opacity="0.88" />
        <g opacity="0.95">
          <circle cx="-28.75" cy="72" r="8" fill="#456e2a" />
          <circle cx="-34" cy="75" r="5" fill="#456e2a" />
          <circle cx="-23" cy="75" r="5" fill="#456e2a" />
          <circle cx="-28.75" cy="66" r="4.5" fill="#456e2a" />
          <circle cx="-26" cy="69" r="3" fill="#6c9a3a" opacity="0.6" />
        </g>

        {/* Mid-distance oak, right side */}
        <rect x="170" y="84" width="2.5" height="14" fill="#4a3014" opacity="0.88" />
        <g opacity="0.95">
          <circle cx="171.25" cy="74" r="7.5" fill="#456e2a" />
          <circle cx="166" cy="77" r="5" fill="#456e2a" />
          <circle cx="177" cy="77" r="5" fill="#456e2a" />
          <circle cx="171.25" cy="68" r="4.5" fill="#456e2a" />
          <circle cx="174" cy="71" r="3" fill="#6c9a3a" opacity="0.6" />
        </g>

        {/* Skinny pine framed in the gate opening (deep distance) */}
        <rect x="118" y="78" width="1.5" height="8" fill="#5a3818" opacity="0.7" />
        <path d="M 118.75 58 L 114 78 L 123.5 78 Z" fill="#345b22" opacity="0.85" />
        <path d="M 118.75 64 L 116 75 L 121.5 75 Z" fill="#456e2a" opacity="0.7" />

        {/* Tiny distant trees on the horizon */}
        <g opacity="0.8">
          <rect x="-15" y="80" width="1.2" height="8" fill="#4a3014" />
          <circle cx="-14.4" cy="76" r="4.5" fill="#345b22" />
          <circle cx="-17.5" cy="78" r="2.8" fill="#345b22" />
          <circle cx="-11.5" cy="78" r="2.8" fill="#345b22" />
        </g>
        <g opacity="0.8">
          <rect x="155" y="82" width="1.2" height="8" fill="#4a3014" />
          <circle cx="155.6" cy="78" r="4.2" fill="#345b22" />
          <circle cx="152.5" cy="80" r="2.7" fill="#345b22" />
          <circle cx="158.5" cy="80" r="2.7" fill="#345b22" />
        </g>

        {/* Far horizon trees at the very edges */}
        <g opacity="0.7">
          <rect x="-100" y="84" width="1" height="6" fill="#4a3014" />
          <circle cx="-99.5" cy="80" r="3.5" fill="#345b22" />
          <circle cx="-102" cy="82" r="2.2" fill="#345b22" />
          <circle cx="-97" cy="82" r="2.2" fill="#345b22" />
        </g>
        <g opacity="0.7">
          <rect x="244" y="86" width="1" height="6" fill="#4a3014" />
          <circle cx="244.5" cy="82" r="3.5" fill="#345b22" />
          <circle cx="242" cy="84" r="2.2" fill="#345b22" />
          <circle cx="247" cy="84" r="2.2" fill="#345b22" />
        </g>
      </g>

      {/* Back grass tufts */}
      <g fill="#4a6b2a">
        <path d="M-70 146 L-68 132 L-65 146 Z" />
        <path d="M-40 146 L-37 130 L-34 146 Z" />
        <path d="M22 146 L24 132 L27 146 Z" />
        <path d="M132 146 L135 130 L138 146 Z" />
        <path d="M180 146 L183 132 L186 146 Z" />
        <path d="M210 146 L213 130 L216 146 Z" />
      </g>
      <g fill="#5d8538">
        <path d="M-60 146 L-57 134 L-54 146 Z" />
        <path d="M-20 146 L-17 136 L-14 146 Z" />
        <path d="M28 146 L30 136 L33 146 Z" />
        <path d="M126 146 L128 136 L131 146 Z" />
        <path d="M168 146 L171 134 L174 146 Z" />
        <path d="M196 146 L199 136 L202 146 Z" />
        <path d="M226 146 L229 134 L232 146 Z" />
      </g>

      {/* Dirt trail winding from the gate opening into the distance */}
      <g>
        {/* Trail surface — tapers up past the horizon to disappear behind the sign */}
        <path
          d="M 50 148 C 60 138, 76 122, 87 80 L 89 80 C 92 122, 100 138, 110 148 Z"
          fill="#b89568"
          stroke="#7a5230"
          strokeWidth="0.5"
          opacity="0.95"
        />
        {/* Lighter wear strip down the middle */}
        <path
          d="M 70 148 C 76 138, 84 122, 87.5 82 L 88.5 82 C 92 122, 96 138, 100 148 Z"
          fill="#cfb285"
          opacity="0.55"
        />
        {/* Subtle scuff marks / footprints suggested with short strokes */}
        <g stroke="#7a5230" strokeWidth="0.4" opacity="0.4" fill="none">
          <path d="M 78 142 L 82 142" />
          <path d="M 82 134 L 86 134" />
          <path d="M 82 124 L 86 124" />
          <path d="M 84 114 L 87 114" />
          <path d="M 86 104 L 88.5 104" />
          <path d="M 87 94 L 89 94" />
          <path d="M 87.5 86 L 88.5 86" />
        </g>
        {/* Small stones along the trail edges for character */}
        <g fill="#9b7a52" opacity="0.85">
          <ellipse cx="56" cy="146" rx="2" ry="1" />
          <ellipse cx="64" cy="138" rx="1.4" ry="0.8" />
          <ellipse cx="73" cy="128" rx="1.1" ry="0.7" />
          <ellipse cx="80" cy="116" rx="0.9" ry="0.55" />
          <ellipse cx="105" cy="146" rx="1.8" ry="0.9" />
          <ellipse cx="98" cy="136" rx="1.3" ry="0.7" />
          <ellipse cx="93" cy="124" rx="1" ry="0.6" />
          <ellipse cx="91" cy="112" rx="0.8" ry="0.5" />
        </g>
      </g>

      {/* Fence — left segment (outside the gate) */}
      <g>
        <path
          d="M-80 100 Q-24 102 32 100"
          stroke="#6b3f22"
          strokeWidth="3.5"
          fill="none"
        />
        <path
          d="M-80 122 Q-24 124 32 122"
          stroke="#6b3f22"
          strokeWidth="3.5"
          fill="none"
        />
        <path
          d="M-80 99 Q-24 101 32 99"
          stroke="#9c6638"
          strokeWidth="0.8"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M-80 121 Q-24 123 32 121"
          stroke="#9c6638"
          strokeWidth="0.8"
          fill="none"
          opacity="0.7"
        />
        <g fill="#5a3318" stroke="#2e1809" strokeWidth="0.8">
          <rect x="-72" y="86" width="6" height="56" rx="0.8" />
          <rect x="-46" y="86" width="6" height="56" rx="0.8" />
          <rect x="-20" y="86" width="6" height="56" rx="0.8" />
          <rect x="6" y="86" width="6" height="56" rx="0.8" />
        </g>
        <g stroke="#8a5230" strokeWidth="0.6" opacity="0.7">
          <line x1="-70.5" y1="88" x2="-70.5" y2="140" />
          <line x1="-44.5" y1="88" x2="-44.5" y2="140" />
          <line x1="-18.5" y1="88" x2="-18.5" y2="140" />
          <line x1="7.5" y1="88" x2="7.5" y2="140" />
        </g>
      </g>

      {/* Fence — right segment */}
      <g>
        <path
          d="M128 100 Q184 102 240 100"
          stroke="#6b3f22"
          strokeWidth="3.5"
          fill="none"
        />
        <path
          d="M128 122 Q184 124 240 122"
          stroke="#6b3f22"
          strokeWidth="3.5"
          fill="none"
        />
        <path
          d="M128 99 Q184 101 240 99"
          stroke="#9c6638"
          strokeWidth="0.8"
          fill="none"
          opacity="0.7"
        />
        <path
          d="M128 121 Q184 123 240 121"
          stroke="#9c6638"
          strokeWidth="0.8"
          fill="none"
          opacity="0.7"
        />
        <g fill="#5a3318" stroke="#2e1809" strokeWidth="0.8">
          <rect x="148" y="86" width="6" height="56" rx="0.8" />
          <rect x="174" y="86" width="6" height="56" rx="0.8" />
          <rect x="200" y="86" width="6" height="56" rx="0.8" />
          <rect x="226" y="86" width="6" height="56" rx="0.8" />
        </g>
        <g stroke="#8a5230" strokeWidth="0.6" opacity="0.7">
          <line x1="149.5" y1="88" x2="149.5" y2="140" />
          <line x1="175.5" y1="88" x2="175.5" y2="140" />
          <line x1="201.5" y1="88" x2="201.5" y2="140" />
          <line x1="227.5" y1="88" x2="227.5" y2="140" />
        </g>
      </g>

      {/* Gate posts — wider apart, beefier than the fence posts */}
      <g fill="#7a4a26" stroke="#3d2412" strokeWidth="1.25">
        <rect x="20" y="20" width="14" height="124" rx="1.75" />
        <rect x="126" y="20" width="14" height="124" rx="1.75" />
      </g>
      {/* Gate post grain highlights */}
      <g stroke="#3d2412" strokeWidth="0.6" opacity="0.5" fill="none">
        <path d="M24 30 Q26 80 24 130" />
        <path d="M30 35 Q28 90 30 138" />
        <path d="M130 30 Q132 80 130 130" />
        <path d="M136 35 Q134 90 136 138" />
      </g>

      {/* Arched header beam — wider than the gateway, overhangs each post */}
      <g>
        {/* Beam itself: a single thick curved stroke for uniform thickness */}
        <path
          d="M 8 26 Q 80 -10 152 26"
          stroke="#7a4a26"
          strokeWidth="6"
          strokeLinecap="round"
          fill="none"
        />
        <path
          d="M 8 23 Q 80 -13 152 23"
          stroke="#3d2412"
          strokeWidth="0.7"
          fill="none"
          opacity="0.55"
        />
        <path
          d="M 8 29 Q 80 -7 152 29"
          stroke="#3d2412"
          strokeWidth="0.7"
          fill="none"
          opacity="0.55"
        />
        {/* Highlight along the top of the beam */}
        <path
          d="M 10 24 Q 80 -11 150 24"
          stroke="#9c6638"
          strokeWidth="0.7"
          fill="none"
          opacity="0.7"
        />
        {/* Decorative bolts where the beam meets each gate post */}
        <circle cx="27" cy="22" r="1.3" fill="#2a2a2a" />
        <circle cx="133" cy="22" r="1.3" fill="#2a2a2a" />
        {/* Decorative bolts at the outer corners where the beam overhangs */}
        <circle cx="14" cy="24" r="1.3" fill="#2a2a2a" />
        <circle cx="146" cy="24" r="1.3" fill="#2a2a2a" />
      </g>

      {/* Iron brackets that extend inward from each post to hold the sign */}
      <g stroke="#2a2a2a" strokeWidth="1.5" strokeLinecap="round" fill="none">
        {/* Left bracket: from inside face of left post out to (52, 52) */}
        <path d="M 34 48 L 52 48 L 52 52" />
        <path d="M 36 52 L 50 48" strokeWidth="0.9" opacity="0.7" />
        {/* Right bracket: mirror */}
        <path d="M 126 48 L 108 48 L 108 52" />
        <path d="M 124 52 L 110 48" strokeWidth="0.9" opacity="0.7" />
      </g>
      {/* Eyebolts at the bracket tips */}
      <circle cx="52" cy="52" r="1.6" fill="#2a2a2a" />
      <circle cx="108" cy="52" r="1.6" fill="#2a2a2a" />

      {/* Chains — hang straight down from the bracket eyebolts */}
      <g stroke="#3a3a3a" fill="none" strokeWidth="0.9">
        {/* Left chain: (52,52) → (52,68), 16 units */}
        <line x1="52" y1="52" x2="52" y2="68" strokeWidth="0.4" opacity="0.5" />
        <ellipse cx="52" cy="54" rx="0.9" ry="1.4" />
        <ellipse cx="52" cy="58" rx="1.4" ry="0.9" />
        <ellipse cx="52" cy="62" rx="0.9" ry="1.4" />
        <ellipse cx="52" cy="66" rx="1.4" ry="0.9" />
        {/* Right chain: (108,52) → (108,68) */}
        <line x1="108" y1="52" x2="108" y2="68" strokeWidth="0.4" opacity="0.5" />
        <ellipse cx="108" cy="54" rx="0.9" ry="1.4" />
        <ellipse cx="108" cy="58" rx="1.4" ry="0.9" />
        <ellipse cx="108" cy="62" rx="0.9" ry="1.4" />
        <ellipse cx="108" cy="66" rx="1.4" ry="0.9" />
      </g>

      {/* Hanging sign — smaller, mounted at chest height between the posts */}
      <g transform="rotate(-1.5 80 84)">
        {/* Shadow */}
        <rect
          x="49"
          y="70"
          width="62"
          height="30"
          rx="1.5"
          fill="#000"
          opacity="0.18"
        />
        {/* Board */}
        <rect
          x="46"
          y="68"
          width="62"
          height="30"
          rx="1.5"
          fill="#f1e2bf"
          stroke="#3d2412"
          strokeWidth="1.4"
        />
        {/* Inner border */}
        <rect
          x="49"
          y="71"
          width="56"
          height="24"
          rx="0.8"
          fill="none"
          stroke="#a32d22"
          strokeWidth="1"
        />
        {/* Hanging rings on top corners of the sign */}
        <circle cx="52" cy="68" r="1.7" fill="none" stroke="#3a3a3a" strokeWidth="0.9" />
        <circle cx="108" cy="68" r="1.7" fill="none" stroke="#3a3a3a" strokeWidth="0.9" />
        {/* Text */}
        <text
          x="77"
          y="83"
          textAnchor="middle"
          fontFamily="Impact, 'Arial Black', sans-serif"
          fontSize="9"
          fontWeight="900"
          letterSpacing="0.4"
          fill="#a32d22"
        >
          PRIVATE
        </text>
        <text
          x="77"
          y="93"
          textAnchor="middle"
          fontFamily="Impact, 'Arial Black', sans-serif"
          fontSize="9"
          fontWeight="900"
          letterSpacing="0.4"
          fill="#a32d22"
        >
          PROPERTY
        </text>
        {/* Weathering scratches */}
        <path d="M52 76 L60 75" stroke="#3d2412" strokeWidth="0.35" opacity="0.35" />
        <path d="M96 92 L104 91" stroke="#3d2412" strokeWidth="0.35" opacity="0.3" />
      </g>

      {/* Foreground grass at the base of the gate posts */}
      <g fill="#5d8538">
        <path d="M36 148 L40 134 L44 148 Z" />
        <path d="M48 148 L51 138 L54 148 Z" />
        <path d="M104 148 L108 136 L112 148 Z" />
        <path d="M116 148 L120 134 L124 148 Z" />
      </g>
      <g fill="#7aab4a">
        <path d="M40 148 L42 140 L45 148 Z" />
        <path d="M52 148 L55 140 L58 148 Z" />
        <path d="M108 148 L111 140 L114 148 Z" />
        <path d="M120 148 L122 140 L125 148 Z" />
      </g>

      {/* Foreground rocks — clusters near each gate post and out in the grass */}
      <g>
        {/* Cluster left of left gate post */}
        <ellipse cx="0" cy="146" rx="6" ry="3" fill="#8a8580" stroke="#4f4a44" strokeWidth="0.4" />
        <ellipse cx="0" cy="144" rx="5" ry="1.5" fill="#a8a39a" opacity="0.65" />
        <ellipse cx="-7" cy="147" rx="3.5" ry="1.8" fill="#7a7570" stroke="#4f4a44" strokeWidth="0.35" />
        <ellipse cx="6" cy="147" rx="2.5" ry="1.4" fill="#8a8580" stroke="#4f4a44" strokeWidth="0.3" />

        {/* Cluster right of right gate post */}
        <ellipse cx="158" cy="146" rx="5.5" ry="2.8" fill="#8a8580" stroke="#4f4a44" strokeWidth="0.4" />
        <ellipse cx="158" cy="144.5" rx="4.5" ry="1.4" fill="#a8a39a" opacity="0.65" />
        <ellipse cx="166" cy="147" rx="3" ry="1.6" fill="#7a7570" stroke="#4f4a44" strokeWidth="0.35" />
        <ellipse cx="151" cy="147" rx="2.2" ry="1.2" fill="#8a8580" stroke="#4f4a44" strokeWidth="0.3" />

        {/* Lone rock further out left */}
        <ellipse cx="-50" cy="147" rx="3.5" ry="1.8" fill="#7a7570" stroke="#4f4a44" strokeWidth="0.35" />
        {/* Lone rock further out right */}
        <ellipse cx="220" cy="147" rx="3.2" ry="1.7" fill="#7a7570" stroke="#4f4a44" strokeWidth="0.35" />
      </g>

      {/* Foreground flowers — small wildflowers in clusters */}
      <g>
        {/* Daisies left of trail */}
        <g>
          <line x1="22" y1="148" x2="22" y2="142" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="22" cy="141" r="1.4" fill="#fdfbe7" stroke="#c2a32a" strokeWidth="0.25" />
          <circle cx="22" cy="141" r="0.6" fill="#e6b62a" />
          <line x1="26" y1="148" x2="26" y2="143" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="26" cy="142.5" r="1.2" fill="#fdfbe7" stroke="#c2a32a" strokeWidth="0.25" />
          <circle cx="26" cy="142.5" r="0.5" fill="#e6b62a" />
          <line x1="29" y1="148" x2="29" y2="144" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="29" cy="143" r="1" fill="#fdfbe7" stroke="#c2a32a" strokeWidth="0.2" />
        </g>

        {/* Pink/red flowers right of trail */}
        <g>
          <line x1="134" y1="148" x2="134" y2="142" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="134" cy="141" r="1.3" fill="#e85a8a" stroke="#a83766" strokeWidth="0.25" />
          <circle cx="134" cy="141" r="0.5" fill="#fde8b2" />
          <line x1="138" y1="148" x2="138" y2="143" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="138" cy="142" r="1.1" fill="#e85a8a" stroke="#a83766" strokeWidth="0.2" />
          <line x1="141" y1="148" x2="141" y2="144" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="141" cy="143" r="0.9" fill="#e85a8a" stroke="#a83766" strokeWidth="0.2" />
        </g>

        {/* Purple flowers far left */}
        <g>
          <line x1="-30" y1="148" x2="-30" y2="143" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="-30" cy="142" r="1.2" fill="#a47bc6" stroke="#6c4d8a" strokeWidth="0.25" />
          <circle cx="-30" cy="142" r="0.4" fill="#fde8b2" />
          <line x1="-26" y1="148" x2="-26" y2="144" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="-26" cy="143" r="1" fill="#a47bc6" stroke="#6c4d8a" strokeWidth="0.2" />
        </g>

        {/* Daisies far right */}
        <g>
          <line x1="174" y1="148" x2="174" y2="143" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="174" cy="142" r="1.3" fill="#fdfbe7" stroke="#c2a32a" strokeWidth="0.25" />
          <circle cx="174" cy="142" r="0.5" fill="#e6b62a" />
          <line x1="178" y1="148" x2="178" y2="144" stroke="#3d6b2a" strokeWidth="0.4" />
          <circle cx="178" cy="143" r="1.1" fill="#fdfbe7" stroke="#c2a32a" strokeWidth="0.2" />
          <circle cx="178" cy="143" r="0.4" fill="#e6b62a" />
        </g>
      </g>
    </svg>
  );
}
