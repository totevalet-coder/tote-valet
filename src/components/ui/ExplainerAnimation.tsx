'use client'

import { useEffect, useRef, useState } from 'react'
import { Play, Pause } from 'lucide-react'

const STEPS = [
  {
    title: 'Sign in',
    caption: 'Create an account and sign in.',
  },
  {
    title: 'Pick date & quantity',
    caption: 'Pick a date and how many empty totes to have delivered.',
  },
  {
    title: 'Fill & label',
    caption: 'Fill totes with your stuff — photograph and label everything you pack.',
  },
  {
    title: 'Request pickup',
    caption: 'Request pickup and your totes head into storage.',
  },
  {
    title: 'Search & request dropoff',
    caption: 'Search for a tote by name or item, request it back whenever you want.',
  },
]

const DURATION_MS = 4000

// Each scene runs one staged sequence (drop → flash → label, or type → result →
// confirm) on a single shared timeline via animation-delay, rather than several
// independently-timed loops — that mismatch is what reads as "wonky" motion.
export default function ExplainerAnimation() {
  const [current, setCurrent] = useState(0)
  const [playing, setPlaying] = useState(true)
  const [reduced, setReduced] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    setReduced(window.matchMedia('(prefers-reduced-motion: reduce)').matches)
  }, [])

  useEffect(() => {
    if (!playing || reduced) return
    timerRef.current = setTimeout(() => {
      setCurrent(prev => (prev + 1) % STEPS.length)
    }, DURATION_MS)
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [current, playing, reduced])

  function jumpTo(i: number) {
    setCurrent(i)
  }

  return (
    <div className="tve-player">
      <div className="tve-stage">
        <Scene1 active={current === 0} />
        <Scene2 active={current === 1} />
        <Scene3 active={current === 2} />
        <Scene4 active={current === 3} />
        <Scene5 active={current === 4} />

        <div className="tve-scene-label">
          <span className="tve-step-no">STEP {current + 1}</span>
          <span className="tve-step-title">{STEPS[current].title}</span>
        </div>
      </div>

      <div className="tve-controls">
        <button
          onClick={() => setPlaying(p => !p)}
          aria-label={playing ? 'Pause' : 'Play'}
          className="tve-playbtn"
        >
          {playing ? <Pause className="w-3.5 h-3.5" fill="currentColor" /> : <Play className="w-3.5 h-3.5" fill="currentColor" />}
        </button>
        <div className="tve-dots">
          {STEPS.map((step, i) => (
            <button
              key={step.title}
              onClick={() => jumpTo(i)}
              aria-label={`Scene ${i + 1}: ${step.title}`}
              className="tve-dot"
            >
              <span
                className="tve-dot-fill"
                style={
                  i < current
                    ? { width: '100%' }
                    : i === current && playing && !reduced
                    ? { animation: `tve-sweep ${DURATION_MS}ms linear forwards` }
                    : { width: '0%' }
                }
              />
            </button>
          ))}
        </div>
      </div>

      <p className="tve-caption">{STEPS[current].caption}</p>

      <style>{`
        .tve-player {
          position: relative;
          background: #fff;
          border: 1px solid #dbe6f5;
          border-radius: 22px;
          padding: 10px;
          box-shadow: 0 18px 40px -22px rgba(0, 24, 70, 0.35);
          --tve-paper: #e9f1fb;
          --tve-paper-line: #cddcf0;
          --tve-kraft: #e8a659;
          --tve-kraft-dark: #c97f32;
          --tve-kraft-flap: #f2c084;
          --tve-ink: #0a1a33;
        }
        .tve-stage {
          position: relative;
          aspect-ratio: 16 / 10;
          border-radius: 16px;
          overflow: hidden;
          background: var(--tve-paper);
        }
        .tve-scene {
          position: absolute;
          inset: 0;
          opacity: 0;
          transform: scale(1.015);
          transition: opacity 0.5s ease, transform 0.55s ease;
          pointer-events: none;
        }
        .tve-scene.tve-active { opacity: 1; transform: scale(1); pointer-events: auto; }
        .tve-scene svg { width: 100%; height: 100%; display: block; }

        .tve-scene-label { position: absolute; left: 16px; bottom: 14px; display: flex; align-items: baseline; gap: 8px; }
        .tve-step-no { font-size: 11px; font-weight: 800; color: var(--brand-blue); letter-spacing: 0.08em; }
        .tve-step-title { font-size: 14.5px; font-weight: 900; color: var(--brand-navy); background: rgba(255,255,255,0.85); padding: 3px 10px; border-radius: 999px; }

        .tve-controls { display: flex; align-items: center; gap: 14px; padding: 12px 6px 4px; }
        .tve-playbtn {
          width: 34px; height: 34px; border-radius: 50%; border: none;
          background: var(--brand-navy); color: #fff; display: flex; align-items: center; justify-content: center;
          cursor: pointer; flex-shrink: 0; transition: background 0.15s ease, transform 0.1s ease;
        }
        .tve-playbtn:hover { background: var(--brand-blue); }
        .tve-playbtn:active { transform: scale(0.94); }
        .tve-playbtn:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }

        .tve-dots { display: flex; align-items: center; gap: 6px; flex: 1; }
        .tve-dot {
          position: relative; flex: 1; height: 5px; border-radius: 999px;
          background: #dbe6f5; border: none; cursor: pointer; overflow: hidden; padding: 0;
        }
        .tve-dot:focus-visible { outline: 2px solid var(--brand-blue); outline-offset: 2px; }
        .tve-dot-fill { position: absolute; inset: 0; width: 0%; background: linear-gradient(90deg, var(--brand-blue), var(--brand-navy)); border-radius: 999px; }
        @keyframes tve-sweep { from { width: 0%; } to { width: 100%; } }

        .tve-caption { font-size: 12.5px; color: #5c7093; margin: 6px 4px 0; min-height: 18px; }

        .tve-phone-body { fill: #001c56; }
        .tve-phone-screen { fill: #fff; }
        .tve-phone-notch { fill: #001c56; opacity: 0.5; }

        /* Every animated element in a scene shares ONE timeline via
           animation-delay instead of independently-timed loops. */
        .tve-s1 .tve-btn { animation: tve-press 4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s1 .tve-ripple { animation: tve-ripple 4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s1 .tve-check { animation: tve-popin 4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        @keyframes tve-press { 0%, 38% { transform: scale(1); } 46% { transform: scale(0.94); } 54%, 100% { transform: scale(1); } }
        @keyframes tve-ripple { 0%, 40% { opacity: 0; transform: scale(0.6); } 55% { opacity: 0.45; transform: scale(1); } 72%, 100% { opacity: 0; transform: scale(1.5); } }
        @keyframes tve-popin { 0%, 55% { opacity: 0; transform: scale(0.4); } 68% { opacity: 1; transform: scale(1.12); } 78%, 100% { opacity: 1; transform: scale(1); } }

        .tve-s2 .tve-day-cell { animation: tve-settlecell 4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s2 .tve-qty-plus { animation: tve-press 4s ease-in-out infinite; animation-delay: 1.4s; transform-origin: center; transform-box: fill-box; }
        .tve-s2 .tve-qty-text-2 { animation: tve-swap 4s steps(1) infinite; }
        .tve-s2 .tve-qty-text-3 { animation: tve-swap2 4s steps(1) infinite; }
        @keyframes tve-settlecell { 0%, 18% { transform: scale(0.7); opacity: 0; } 32% { transform: scale(1.08); opacity: 1; } 42%, 100% { transform: scale(1); opacity: 1; } }
        @keyframes tve-swap { 0%, 54% { opacity: 1; } 55%, 100% { opacity: 0; } }
        @keyframes tve-swap2 { 0%, 54% { opacity: 0; } 55%, 100% { opacity: 1; } }

        .tve-s3 .tve-item-drop { animation: tve-drop 4s ease-in infinite; }
        .tve-s3 .tve-flash { animation: tve-flash 4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s3 .tve-shutter-ring { animation: tve-flash 4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s3 .tve-label-tag { animation: tve-slidetag 4s ease-out infinite; }
        @keyframes tve-drop { 0% { transform: translateY(-46px); opacity: 0; } 16% { opacity: 1; } 30%, 100% { transform: translateY(0); opacity: 1; } }
        @keyframes tve-flash { 0%, 34% { opacity: 0; transform: scale(0.7); } 40% { opacity: 1; transform: scale(1.15); } 50%, 100% { opacity: 0; transform: scale(1.3); } }
        @keyframes tve-slidetag { 0%, 56% { transform: translate(24px, -6px) rotate(8deg); opacity: 0; } 72% { transform: translate(0,0) rotate(0deg); opacity: 1; } 100% { transform: translate(0,0) rotate(0deg); opacity: 1; } }

        .tve-s4 .tve-btn { animation: tve-press 4s ease-in-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s4 .tve-truck-in { animation: tve-popin 4s ease-out infinite; transform-origin: center; transform-box: fill-box; }
        .tve-s4 .tve-chip { animation: tve-popin 4s ease-out infinite; animation-delay: 0.3s; transform-origin: center; transform-box: fill-box; }

        .tve-s5 .tve-type-char { animation: tve-typechar 4s steps(1) infinite; }
        .tve-s5 .tve-type-char:nth-child(1) { animation-delay: 0s; }
        .tve-s5 .tve-type-char:nth-child(2) { animation-delay: .12s; }
        .tve-s5 .tve-type-char:nth-child(3) { animation-delay: .24s; }
        .tve-s5 .tve-type-char:nth-child(4) { animation-delay: .36s; }
        .tve-s5 .tve-type-char:nth-child(5) { animation-delay: .48s; }
        .tve-s5 .tve-type-char:nth-child(6) { animation-delay: .60s; }
        .tve-s5 .tve-result-card { animation: tve-cardup 4s ease-out infinite; }
        .tve-s5 .tve-check { animation: tve-popin 4s ease-out infinite; animation-delay: 2s; transform-origin: center; transform-box: fill-box; }
        @keyframes tve-typechar { 0%, 8% { opacity: 0; } 16%, 100% { opacity: 1; } }
        @keyframes tve-cardup { 0%, 45% { transform: translateY(16px); opacity: 0; } 62%, 100% { transform: translateY(0); opacity: 1; } }

        @media (prefers-reduced-motion: reduce) {
          .tve-scene * { animation: none !important; opacity: 1 !important; transform: none !important; }
        }
      `}</style>
    </div>
  )
}

function Scene1({ active }: { active: boolean }) {
  return (
    <div className={`tve-scene tve-s1 ${active ? 'tve-active' : ''}`}>
      <svg viewBox="0 0 380 238" preserveAspectRatio="xMidYMid meet">
        <rect width="380" height="238" fill="var(--tve-paper)" />
        <rect className="tve-phone-body" x="140" y="18" width="100" height="200" rx="16" />
        <rect className="tve-phone-screen" x="148" y="30" width="84" height="176" rx="6" />
        <rect className="tve-phone-notch" x="176" y="24" width="28" height="4" rx="2" />
        <rect x="160" y="52" width="60" height="10" rx="5" fill="var(--tve-paper-line)" />
        <rect x="160" y="70" width="60" height="10" rx="5" fill="var(--tve-paper-line)" />
        <g className="tve-btn">
          <rect x="160" y="94" width="60" height="18" rx="9" fill="var(--brand-blue)" />
          <rect x="176" y="100" width="28" height="6" rx="3" fill="#fff" />
        </g>
        <circle className="tve-ripple" cx="190" cy="103" r="16" fill="var(--brand-blue)" />
        <g className="tve-check">
          <circle cx="212" cy="46" r="11" fill="#2fae66" />
          <path d="M207 46l3.5 3.5L217 42" stroke="#fff" strokeWidth="2.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  )
}

function Scene2({ active }: { active: boolean }) {
  const cells = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11]
  return (
    <div className={`tve-scene tve-s2 ${active ? 'tve-active' : ''}`}>
      <svg viewBox="0 0 380 238" preserveAspectRatio="xMidYMid meet">
        <rect width="380" height="238" fill="var(--tve-paper)" />
        <rect className="tve-phone-body" x="140" y="14" width="100" height="210" rx="16" />
        <rect className="tve-phone-screen" x="148" y="26" width="84" height="186" rx="6" />
        <rect className="tve-phone-notch" x="176" y="20" width="28" height="4" rx="2" />
        <rect x="158" y="38" width="64" height="9" rx="4" fill="var(--tve-paper-line)" />
        {cells.map(i => {
          const col = i % 4
          const row = Math.floor(i / 4)
          const x = 158 + col * 18
          const y = 56 + row * 18
          const isSelected = i === 5
          return (
            <rect
              key={i}
              x={x}
              y={y}
              width="14"
              height="14"
              rx="3"
              className={isSelected ? 'tve-day-cell' : ''}
              fill={isSelected ? 'var(--brand-blue)' : 'var(--tve-paper-line)'}
            />
          )
        })}
        <rect x="158" y="122" width="68" height="24" rx="12" fill="#fff" stroke="var(--tve-paper-line)" strokeWidth="2" />
        <rect x="164" y="132" width="10" height="3" rx="1.5" fill="var(--brand-navy)" />
        <text x="192" y="139" fontSize="13" fontWeight="800" fill="#001c56" textAnchor="middle" className="tve-qty-text-2">2</text>
        <text x="192" y="139" fontSize="13" fontWeight="800" fill="#001c56" textAnchor="middle" className="tve-qty-text-3">3</text>
        <g className="tve-qty-plus">
          <circle cx="214" cy="134" r="8" fill="var(--brand-blue)" />
          <rect x="210.5" y="133" width="7" height="2" fill="#fff" />
          <rect x="213" y="130.5" width="2" height="7" fill="#fff" />
        </g>
        <text x="160" y="176" fontSize="9" fontWeight="700" fill="#5c7093">Empty totes</text>
      </svg>
    </div>
  )
}

function Scene3({ active }: { active: boolean }) {
  return (
    <div className={`tve-scene tve-s3 ${active ? 'tve-active' : ''}`}>
      <svg viewBox="0 0 380 238" preserveAspectRatio="xMidYMid meet">
        <rect width="380" height="238" fill="var(--tve-paper)" />
        <rect x="0" y="196" width="380" height="42" fill="var(--tve-paper-line)" />
        <rect x="150" y="150" width="80" height="52" rx="4" fill="var(--tve-kraft)" />
        <polygon points="150,150 190,132 230,150" fill="var(--tve-kraft-flap)" />
        <rect x="150" y="150" width="80" height="6" fill="var(--tve-kraft-dark)" />
        <rect className="tve-item-drop" x="176" y="150" width="28" height="20" rx="3" fill="var(--brand-blue)" />
        <g transform="translate(258,110)">
          <rect x="0" y="8" width="34" height="24" rx="4" fill="var(--brand-navy)" />
          <rect x="10" y="2" width="14" height="8" rx="2" fill="var(--brand-navy)" />
          <circle cx="17" cy="20" r="8" fill="#001c56" />
          <circle cx="17" cy="20" r="4" fill="var(--brand-blue)" />
        </g>
        <circle className="tve-shutter-ring" cx="275" cy="130" r="26" fill="none" stroke="#fff" strokeWidth="3" />
        <circle className="tve-flash" cx="275" cy="130" r="30" fill="#fff" />
        <g className="tve-label-tag">
          <rect x="160" y="172" width="60" height="20" rx="4" fill="#fff" stroke="var(--tve-kraft-dark)" strokeWidth="2" />
          <rect x="167" y="178" width="30" height="3" rx="1.5" fill="#001c56" />
          <rect x="167" y="184" width="18" height="3" rx="1.5" fill="#5c7093" />
        </g>
      </svg>
    </div>
  )
}

function Scene4({ active }: { active: boolean }) {
  return (
    <div className={`tve-scene tve-s4 ${active ? 'tve-active' : ''}`}>
      <svg viewBox="0 0 380 238" preserveAspectRatio="xMidYMid meet">
        <rect width="380" height="238" fill="var(--tve-paper)" />
        <rect className="tve-phone-body" x="140" y="14" width="100" height="210" rx="16" />
        <rect className="tve-phone-screen" x="148" y="26" width="84" height="186" rx="6" />
        <rect className="tve-phone-notch" x="176" y="20" width="28" height="4" rx="2" />
        <rect x="158" y="40" width="64" height="40" rx="6" fill="#fff" stroke="var(--tve-paper-line)" strokeWidth="2" />
        <rect x="166" y="48" width="18" height="14" rx="2" fill="var(--tve-kraft)" />
        <rect x="190" y="50" width="26" height="5" rx="2.5" fill="var(--tve-paper-line)" />
        <rect x="190" y="60" width="20" height="5" rx="2.5" fill="var(--tve-paper-line)" />
        <g className="tve-btn">
          <rect x="158" y="92" width="64" height="18" rx="9" fill="var(--brand-navy)" />
          <rect x="172" y="98" width="36" height="6" rx="3" fill="#fff" />
        </g>
        <g className="tve-truck-in" transform="translate(158,128)">
          <rect x="0" y="6" width="34" height="16" rx="3" fill="var(--tve-kraft)" />
          <rect x="34" y="10" width="14" height="12" rx="2" fill="var(--brand-navy)" />
          <circle cx="10" cy="24" r="4" fill="var(--tve-ink)" />
          <circle cx="38" cy="24" r="4" fill="var(--tve-ink)" />
        </g>
        <g className="tve-chip">
          <rect x="158" y="160" width="64" height="16" rx="8" fill="#e7f6ec" />
          <circle cx="168" cy="168" r="5" fill="#2fae66" />
          <path d="M165.5 168l1.6 1.6 3-3.2" stroke="#fff" strokeWidth="1.4" fill="none" strokeLinecap="round" strokeLinejoin="round" />
          <rect x="178" y="165" width="34" height="6" rx="3" fill="#bfe4cb" />
        </g>
      </svg>
    </div>
  )
}

function Scene5({ active }: { active: boolean }) {
  const chars = [0, 1, 2, 3, 4, 5]
  return (
    <div className={`tve-scene tve-s5 ${active ? 'tve-active' : ''}`}>
      <svg viewBox="0 0 380 238" preserveAspectRatio="xMidYMid meet">
        <rect width="380" height="238" fill="var(--tve-paper)" />
        <rect className="tve-phone-body" x="140" y="14" width="100" height="210" rx="16" />
        <rect className="tve-phone-screen" x="148" y="26" width="84" height="186" rx="6" />
        <rect className="tve-phone-notch" x="176" y="20" width="28" height="4" rx="2" />
        <rect x="158" y="40" width="64" height="18" rx="9" fill="#fff" stroke="var(--tve-paper-line)" strokeWidth="2" />
        <circle cx="167" cy="49" r="4" fill="none" stroke="#5c7093" strokeWidth="1.6" />
        <line x1="170" y1="52" x2="173" y2="55" stroke="#5c7093" strokeWidth="1.6" strokeLinecap="round" />
        {chars.map(i => (
          <rect key={i} className="tve-type-char" x={180 + i * 6} y="46" width="4" height="6" rx="1" fill="#001c56" />
        ))}
        <g className="tve-result-card">
          <rect x="158" y="70" width="64" height="44" rx="6" fill="#fff" stroke="var(--tve-paper-line)" strokeWidth="2" />
          <rect x="166" y="78" width="16" height="12" rx="2" fill="var(--tve-kraft)" />
          <rect x="188" y="80" width="28" height="5" rx="2.5" fill="var(--tve-paper-line)" />
          <rect x="188" y="89" width="20" height="5" rx="2.5" fill="var(--tve-paper-line)" />
          <rect x="166" y="98" width="48" height="10" rx="5" fill="var(--brand-navy)" />
        </g>
        <g className="tve-check">
          <circle cx="222" cy="72" r="10" fill="#2fae66" />
          <path d="M217.5 72l3 3 6-6.4" stroke="#fff" strokeWidth="2.2" fill="none" strokeLinecap="round" strokeLinejoin="round" />
        </g>
      </svg>
    </div>
  )
}
