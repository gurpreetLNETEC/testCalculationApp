import React, { useEffect, useRef, useState } from 'react';
import './App.css';

export default function App() {
  const NUM_QUESTIONS = 10; // changed from 5 to 10

  // default best time (seconds) = 10 minutes
  const DEFAULT_BEST = 600;

  const [questions, setQuestions] = useState([]);
  const [index, setIndex] = useState(0);
  const [input, setInput] = useState('');
  const [completed, setCompleted] = useState(false);
  const [score, setScore] = useState(0);
  const [timings, setTimings] = useState([]); // per-question times in seconds
  const [answers, setAnswers] = useState([]); // store entered answers + correctness
  const [bestTime, setBestTime] = useState(DEFAULT_BEST); // best total time (seconds), default 10min
  const [started, setStarted] = useState(false); // require user to start
  const inputRef = useRef(null);
  const startRef = useRef(0); // timestamp when current question started

  // new: svg ref + tooltip state
  const svgRef = useRef(null);
  const [tooltip, setTooltip] = useState({ visible: false, left: 0, top: 0, html: '' });

  const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

  const makeQuestion = () => {
    const op = Math.random() < 0.5 ? '+' : '×';
    if (op === '+') {
      const a = randInt(10, 99);
      const b = randInt(10, 99);
      return { a, b, op, ans: a + b };
    } else {
      const a = randInt(1, 20);
      const b = randInt(1, 20);
      return { a, b, op, ans: a * b };
    }
  };

  const loadBest = () => {
    const raw = localStorage.getItem('calc_best_time');
    if (raw !== null) {
      const v = Number(raw);
      if (!Number.isNaN(v)) setBestTime(v);
    } else {
      // leave default (10 minutes) when no stored best
      setBestTime(DEFAULT_BEST);
    }
  };

  const formatTime = (sec) => {
    if (sec == null || Number.isNaN(sec)) return '—';
    const s = Number(sec);
    const minutes = Math.floor(s / 60);
    const seconds = s - minutes * 60;
    // keep one decimal if fraction exists
    const secondsStr = Number.isInteger(seconds) ? String(seconds).padStart(2, '0') : (Math.round(seconds * 10) / 10).toFixed(1).padStart(4, '0');
    return `${minutes}:${secondsStr}`;
  };

  const startSession = () => {
    const qs = Array.from({ length: NUM_QUESTIONS }, () => makeQuestion()); // use NUM_QUESTIONS
    setQuestions(qs);
    setIndex(0);
    setInput('');
    setCompleted(false);
    setScore(0);
    setTimings([]);
    setAnswers([]); // reset answers
    setTooltip({ visible: false, left: 0, top: 0, html: '' }); // hide tooltip
    setStarted(true); // mark started when user clicks
    startRef.current = Date.now();
    // focus after state updates
    setTimeout(() => inputRef.current?.focus(), 50);
  };

  useEffect(() => {
    loadBest();
    // removed auto-start: do NOT call startSession() here
  }, []);

  useEffect(() => {
    // focus input when moving to next question
    inputRef.current?.focus();
  }, [index]);

  const submitCurrent = (value) => {
    if (!questions[index]) return;
    const now = Date.now();
    const elapsedMs = Math.max(0, now - (startRef.current || now));
    const elapsedSec = Math.round((elapsedMs / 1000) * 10) / 10; // one decimal

    // store entered answer and correctness immediately
    const numeric = Number(value || 0);
    const correct = numeric === questions[index].ans;
    setAnswers((a) => {
      const nextA = [...a, { entered: String(value || ''), correct }];
      return nextA;
    });

    setTimings((t) => {
      const nextT = [...t, elapsedSec];
      return nextT;
    });

    if (correct) setScore((s) => s + 1);

    const next = index + 1;
    if (next >= questions.length) {
      // session complete
      setCompleted(true);
      setIndex(next);
      setInput('');

      // compute total time and update best if all answers correct
      setTimeout(() => {
        setTimings((t) => {
          const total = t.reduce((a, b) => a + b, 0);
          // check perfect score using recorded answers (answers state updated above may be async)
          const finalScore = score + (correct ? 1 : 0);
          if (finalScore === questions.length) {
            const prevRaw = localStorage.getItem('calc_best_time');
            const prev = prevRaw !== null ? Number(prevRaw) : DEFAULT_BEST;
            if (total < prev) {
              const rounded = Math.round(total * 10) / 10;
              localStorage.setItem('calc_best_time', String(rounded));
              setBestTime(rounded);
            }
          }
          return t;
        });
      }, 50);
    } else {
      // move next and reset timer
      setIndex(next);
      setInput('');
      startRef.current = Date.now();
    }
  };

  const handleChange = (e) => {
    // allow only digits
    const raw = e.target.value.replace(/[^\d]/g, '');
    setInput(raw);

    if (!questions[index]) return;
    const targetLen = String(Math.abs(questions[index].ans)).length;
    if (raw.length >= targetLen && raw.length > 0) {
      // auto-submit once length reached
      submitCurrent(raw);
    }
  };

  const handleKey = (e) => {
    if (e.key === 'Enter') {
      submitCurrent(input);
    }
  };

  // simple linear least-squares slope to find trend (seconds per question)
  const computeSlope = (arr) => {
    if (!arr || arr.length < 2) return 0;
    const n = arr.length;
    const xs = arr.map((_, i) => i + 1);
    const ys = arr;
    const meanX = xs.reduce((a, b) => a + b, 0) / n;
    const meanY = ys.reduce((a, b) => a + b, 0) / n;
    let num = 0;
    let den = 0;
    for (let i = 0; i < n; i++) {
      num += (xs[i] - meanX) * (ys[i] - meanY);
      den += (xs[i] - meanX) * (xs[i] - meanX);
    }
    return den === 0 ? 0 : num / den;
  };

  // replace previous handleHover with this corrected version
  const handleHover = (i, p, e) => {
    const svg = svgRef.current;
    if (!svg) return;
    // create an SVGPoint in svg coordinate space and map to screen coordinates
    let left = 0;
    let top = 0;
    try {
      const pt = svg.createSVGPoint();
      pt.x = p.x;
      pt.y = p.y;
      const screenP = pt.matrixTransform(svg.getScreenCTM());
      left = screenP.x;
      top = screenP.y;
    } catch (err) {
      // fallback: use bounding rect + pixel scale
      const rect = svg.getBoundingClientRect();
      const scaleX = rect.width / (svg.viewBox.baseVal.width || rect.width);
      const scaleY = rect.height / (svg.viewBox.baseVal.height || rect.height);
      left = rect.left + p.x * (scaleX || 1);
      top = rect.top + p.y * (scaleY || 1);
    }

    const q = questions[i] || {};
    const ansRec = answers[i] || {};
    const entered = ansRec.entered ?? '';
    const correct = ansRec.correct;
    const timeStr = timings[i] != null ? `${timings[i]}s` : '—';
    let html = `Q${i + 1}: ${q.a} ${q.op} ${q.b} = ${q.ans} <br/> time: ${timeStr}`;
    if (entered !== '') {
      if (correct) html += ` — you entered ${entered} (correct)`;
      else html += ` — you entered ${entered} (wrong)`;
    } else {
      html += ` — no answer recorded`;
    }
    setTooltip({ visible: true, left, top, html });
  };

  const renderChart = (times) => {
    const w = 420;
    const h = 120;
    if (!times || times.length === 0) return null;
    const maxT = Math.max(...times, 1);
    const minT = Math.min(...times, 0);
    const padding = 20;
    const innerW = w - padding * 2;
    const innerH = h - padding * 2;
    const points = times.map((t, i) => {
      const x = padding + (i / (times.length - 1 || 1)) * innerW;
      const y = padding + (1 - (t - minT) / (maxT - minT || 1)) * innerH;
      return { x, y, t };
    });

    const poly = points.map((p) => `${p.x},${p.y}`).join(' ');
    return (
      // responsive svg: width controlled by CSS, coordinates by viewBox
      <svg ref={svgRef} viewBox={`0 0 ${w} ${h}`} preserveAspectRatio="xMidYMid meet" className="timing-chart" aria-hidden>
        <polyline points={poly} fill="none" stroke="#2b6cb0" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
        {points.map((p, i) => {
          const ansRec = answers[i] || {};
          const correct = !!ansRec.correct;
          const fill = correct ? '#16a34a' : '#e53e3e'; // green/red
          return (
            <g key={i}>
              <circle
                cx={p.x}
                cy={p.y}
                r={5}
                fill={fill}
                onMouseEnter={(e) => handleHover(i, p, e)}
                onMouseLeave={() => setTooltip({ visible: false, left: 0, top: 0, html: '' })}
              />
              <text x={p.x} y={h - 6} fontSize="10" textAnchor="middle" fill="#666">Q{i + 1}</text>
            </g>
          );
        })}
      </svg>
    );
  };

  const totalTime = timings.reduce((a, b) => a + b, 0);
  const slope = computeSlope(timings);
  const slopeThreshold = 0.05; // secs per question threshold for noticeable trend
  const trend =
    timings.length < 2
      ? 'no data'
      : slope > slopeThreshold
      ? 'increasing (slowing down)'
      : slope < -slopeThreshold
      ? 'decreasing (getting faster)'
      : 'no clear trend';

  return (
    <div className="app">
      <header className="app-header">
        <h1>Calculation Practice</h1>
        <p>Ten sequential questions — addition and multiplication</p>

        <div className="toolbar">
          <div className="toolbar-left">
            <div>Question: {started ? Math.min(index + 1, NUM_QUESTIONS) : 0} / {NUM_QUESTIONS}</div>
            <div style={{ marginLeft: 12, color: '#444' }}>
              Best time: {bestTime != null ? `${bestTime}s` : '—'}
            </div>
          </div>

          <div className="toolbar-right">
            <button onClick={startSession}>{started ? 'Start Again' : 'Start'}</button>
          </div>
        </div>
      </header>

      <div className="canvas-wrap" style={{ position: 'relative', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        {!started ? (
          // show initial welcome until user clicks Start
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>Ready?</div>
            <div style={{ fontSize: 16, marginBottom: 18, color: '#555' }}>
              Click the Start button in the header to begin 5 questions. Timing begins when the first question appears.
            </div>
            {/* removed duplicate Start button here; use header control */}
          </div>
        ) : !completed && questions[index] ? (
          <div style={{ textAlign: 'center', width: '100%', maxWidth: 520 }}>
            <div style={{ fontSize: 32, marginBottom: 12 }}>
              {questions[index].a} {questions[index].op} {questions[index].b} = ?
            </div>
            <input
              ref={inputRef}
              value={input}
              onChange={handleChange}
              onKeyDown={handleKey}
              inputMode="numeric"
              autoFocus
              style={{
                fontSize: 24,
                padding: '8px 12px',
                width: 220,
                textAlign: 'center',
              }}
              aria-label="Answer"
            />
            <div style={{ marginTop: 8, color: '#666' }}>
              (Typing auto-submits when you enter all digits of the correct answer)
            </div>
            {timings.length > 0 && (
              <div style={{ marginTop: 12, color: '#555' }}>
                Recent times: {timings.map((t, i) => `${t}s${i < timings.length - 1 ? ', ' : ''}`)}
              </div>
            )}
          </div>
        ) : (
          // completed: show results (no Start button here)
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 28, marginBottom: 10 }}>Session Complete</div>
            <div style={{ fontSize: 18, marginBottom: 8 }}>Score: {score} / {questions.length}</div>
            <div style={{ fontSize: 16, marginBottom: 8 }}>Total time: {Math.round(totalTime * 10) / 10}s</div>
            <div style={{ marginBottom: 12 }}>{renderChart(timings)}</div>
            <div style={{ marginBottom: 12, color: '#444' }}>Trend: {trend}</div>

            {/* per-question breakdown */}
            <div style={{ marginTop: 12, textAlign: 'left', maxWidth: 520, marginLeft: 'auto', marginRight: 'auto' }}>
              <h3 style={{ margin: '8px 0' }}>Details</h3>
              <ul style={{ paddingLeft: 18 }}>
                {questions.map((q, i) => {
                  const ansRec = answers[i] || {};
                  const entered = ansRec.entered ?? '—';
                  const correct = ansRec.correct ? 'Correct' : 'Wrong';
                  const time = timings[i] != null ? `${timings[i]}s` : '—';
                  const color = ansRec.correct ? '#16a34a' : '#e53e3e';
                  return (
                    <li key={i} style={{ marginBottom: 6 }}>
                      <span style={{ fontWeight: 600 }}>{q.a} {q.op} {q.b} = {q.ans}</span>
                      <div style={{ fontSize: 13, color: '#444' }}>
                        Your answer: <span style={{ color }}>{entered}</span> · {correct} · time: {time}
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        )}

        {/* tooltip rendered over chart */}
        {tooltip.visible && (
          <div
            style={{
              position: 'fixed',
              left: tooltip.left + 8,
              top: tooltip.top - 24,
              background: 'white',
              border: '1px solid rgba(0,0,0,0.12)',
              padding: '6px 8px',
              borderRadius: 6,
              fontSize: 13,
              boxShadow: '0 6px 18px rgba(0,0,0,0.08)',
              pointerEvents: 'none',
              zIndex: 1000,
            }}
            dangerouslySetInnerHTML={{ __html: tooltip.html }}
          />
        )}
      </div>
    </div>
  );
}
