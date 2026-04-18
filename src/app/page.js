'use client'
import { useEffect, useState, useCallback } from 'react'
import { supabase } from '../lib/supabase'

const SCHOOLS = ['Blair','Hill','Hun','Lawrenceville','Mercersburg','Peddie','Pennington']
const FLIGHT_NAMES = ['Singles #1','Singles #2','Singles #3','Doubles']
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'mapl2025'

const DOWNSTREAM = {1:[4,6,7],2:[5,6],3:[5,7],4:[8,10],5:[7,10],6:[8],7:[9],8:[9],9:[],10:[]}
const FIXED = {
  1:{p1:4,p2:5},2:{p1:3,p2:6},3:{p1:2,p2:7},
  4:{p1:1,p2:null},5:{p1:null,p2:null},6:{p1:null,p2:null},
  7:{p1:null,p2:null},8:{p1:null,p2:null},9:{p1:null,p2:null},10:{p1:null,p2:null}
}

function emptyFlight(isDoubles) {
  const matches = {}
  for (let id = 1; id <= 10; id++) {
    const fs = FIXED[id]
    matches[id] = { p1: fs.p1, p2: fs.p2, winner: null, loser: null, scores: null, proset: isDoubles }
  }
  const points = {}
  for (let s = 1; s <= 7; s++) points[s] = 0
  points[1] = 2.5
  return { players: {}, matches, points }
}

function recomputePoints(flight) {
  const points = {}
  for (let i = 1; i <= 7; i++) points[i] = 0
  points[1] = 2.5
  for (let id = 1; id <= 10; id++) {
    const m = flight.matches[id]
    if (!m?.winner) continue
    if ([1,2,3,4,5,10].includes(id)) points[m.winner] += 2.5
    else points[m.winner] += 1
    if (id === 1) points[m.loser] += 1
  }
  return points
}

function collectDownstream(matchId) {
  const visited = new Set()
  function walk(id) {
    if (visited.has(id)) return
    visited.add(id)
    ;(DOWNSTREAM[id] || []).forEach(walk)
  }
  walk(matchId)
  return [...visited]
}

function fmtScore(scores, proset, wSlot) {
  if (!scores) return ''
  if (proset) {
    const w = wSlot === 1 ? scores.p1sets[0] : scores.p2sets[0]
    const l = wSlot === 1 ? scores.p2sets[0] : scores.p1sets[0]
    return `${w}–${l}`
  }
  return scores.p1sets.map((g1, s) => {
    const g2 = scores.p2sets[s]
    if (g1 === undefined || g2 === undefined) return null
    const w = wSlot === 1 ? g1 : g2
    const l = wSlot === 1 ? g2 : g1
    const tbL = wSlot === 1 ? scores.tb2?.[s] : scores.tb1?.[s]
    return `${w}–${l}${tbL !== undefined && tbL !== '' ? `(${tbL})` : ''}`
  }).filter(Boolean).join('  ')
}

// ── Styles ────────────────────────────────────────────────────────────────────
const S = {
  wrap: { maxWidth: 1100, margin: '0 auto', padding: '16px 16px 60px' },
  header: { borderBottom: '1px solid #ddd', paddingBottom: 12, marginBottom: 16 },
  h1: { fontSize: 24, fontWeight: 600, margin: 0 },
  sub: { fontSize: 13, color: '#666', marginTop: 4 },
  tabs: { display: 'flex', gap: 6, flexWrap: 'wrap', marginBottom: 20 },
  tab: { fontSize: 13, padding: '6px 14px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'white', color: '#555' },
  tabActive: { fontSize: 13, padding: '6px 14px', cursor: 'pointer', border: '1px solid #333', borderRadius: 8, background: '#f0f0f0', color: '#111', fontWeight: 600 },
  card: { background: 'white', borderRadius: 10, border: '1px solid #e0e0e0', overflow: 'hidden', width: 220, minWidth: 220 },
  cardTitle: { fontSize: 11, fontWeight: 600, color: '#888', padding: '4px 8px', borderBottom: '1px solid #eee', background: '#f9f9f9', display: 'flex', justifyContent: 'space-between', alignItems: 'center' },
  playerRow: { display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6, borderBottom: '1px solid #f0f0f0', minHeight: 40 },
  playerRowWinner: { display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6, borderBottom: '1px solid #f0f0f0', minHeight: 40, background: '#EAF3DE' },
  playerRowLoser: { display: 'flex', alignItems: 'center', padding: '5px 8px', gap: 6, borderBottom: '1px solid #f0f0f0', minHeight: 40, opacity: 0.45 },
  badge: { fontSize: 10, fontWeight: 600, background: '#f0f0f0', border: '1px solid #ddd', borderRadius: 4, padding: '1px 5px', color: '#666', minWidth: 20, textAlign: 'center' },
  pname: { fontSize: 13, color: '#111', flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  pnameW: { fontSize: 13, color: '#3B6D11', fontWeight: 600, flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' },
  schoolTag: { fontSize: 10, color: '#888' },
  schoolTagW: { fontSize: 10, color: '#3B6D11', opacity: 0.8 },
  setScores: { fontSize: 11, color: '#3B6D11', whiteSpace: 'nowrap', fontWeight: 600 },
  empty: { fontSize: 12, color: '#aaa', fontStyle: 'italic', flex: 1 },
  roundLabel: { fontSize: 11, fontWeight: 600, color: '#888', textAlign: 'center', marginBottom: 8, width: 220 },
  bracketWrap: { display: 'flex', alignItems: 'stretch', overflowX: 'auto', paddingBottom: 8 },
  round: { display: 'flex', flexDirection: 'column' },
  editBtn: { fontSize: 10, padding: '2px 6px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 4, background: 'transparent', color: '#888' },
  genBtn: { fontSize: 14, padding: '9px 22px', cursor: 'pointer', background: '#f0f0f0', border: '1px solid #999', borderRadius: 8, fontWeight: 600 },
  resetBtn: { fontSize: 12, padding: '5px 12px', cursor: 'pointer', background: 'transparent', border: '1px solid #ccc', borderRadius: 8, color: '#888', marginBottom: 16 },
  section: { paddingBottom: 24 },
  h2: { fontSize: 18, fontWeight: 600, marginBottom: 12 },
  setupGrid: { display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px, 1fr))', gap: 20, marginBottom: 20 },
  setupFlight: { background: 'white', borderRadius: 10, border: '1px solid #e0e0e0', padding: '16px 18px' },
  seedBlock: { border: '1px solid #eee', borderRadius: 8, background: '#fafafa', padding: '10px 12px', marginBottom: 8 },
  fieldLabel: { fontSize: 10, color: '#aaa', marginBottom: 3 },
  textInput: { width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'white', marginBottom: 6, boxSizing: 'border-box' },
  select: { width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #ddd', borderRadius: 6, background: 'white', boxSizing: 'border-box' },
  selectDup: { width: '100%', fontSize: 13, padding: '6px 8px', border: '1px solid #D85A30', borderRadius: 6, background: '#FAECE7', boxSizing: 'border-box' },
  dupMsg: { fontSize: 10, color: '#D85A30', marginTop: 3 },
  errMsg: { fontSize: 12, color: '#c0392b', marginTop: 8 },
  // leaderboard
  lbRow: { background: 'white', border: '1px solid #e0e0e0', borderRadius: 10, padding: '12px 16px', display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 },
  lbRank: { fontSize: 20, fontWeight: 700, minWidth: 28, color: '#ccc' },
  lbName: { fontSize: 15, fontWeight: 600, flex: 1 },
  lbBd: { fontSize: 11, color: '#888', marginTop: 2 },
  lbTotal: { fontSize: 22, fontWeight: 700, minWidth: 52, textAlign: 'right' },
  // modal
  modalBg: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 },
  modal: { background: 'white', borderRadius: 12, padding: '20px 24px', width: 420, maxWidth: '95vw', maxHeight: '90vh', overflowY: 'auto', boxShadow: '0 8px 32px rgba(0,0,0,0.15)' },
  warnBox: { background: '#FAECE7', border: '1px solid #F0997B', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#712B13', marginBottom: 16 },
  winBtn: { flex: 1, minWidth: 130, padding: '10px 8px', fontSize: 13, cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: '#f9f9f9', textAlign: 'center', lineHeight: 1.5 },
  // admin
  adminBar: { background: '#1a1a2e', color: 'white', padding: '8px 16px', display: 'flex', alignItems: 'center', gap: 12, fontSize: 13 },
  adminDot: { width: 8, height: 8, borderRadius: '50%', background: '#27ae60' },
  lockBox: { background: 'white', borderRadius: 12, padding: 32, maxWidth: 340, margin: '60px auto', boxShadow: '0 4px 16px rgba(0,0,0,0.1)', textAlign: 'center' },
}

// ── Connector lines ────────────────────────────────────────────────────────────
function VConn({ n }) {
  const border = '1px solid #ccc'
  if (n === 3) return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 32, alignSelf: 'stretch' }}>
      <div style={{ flex: 2, borderRight: border, borderBottom: border }} />
      <div style={{ flex: 1 }} />
      <div style={{ flex: 2, borderRight: border, borderTop: border }} />
    </div>
  )
  if (n === 2) return (
    <div style={{ display: 'flex', flexDirection: 'column', width: 32, alignSelf: 'stretch' }}>
      <div style={{ flex: 1, borderRight: border, borderBottom: border }} />
      <div style={{ flex: 1, borderRight: border }} />
    </div>
  )
  return <div style={{ display: 'flex', flexDirection: 'column', width: 32, alignSelf: 'stretch' }}>
    <div style={{ flex: 1, borderRight: border }} />
  </div>
}

// ── Match Card ─────────────────────────────────────────────────────────────────
function MatchCard({ flight, matchId, isAdmin, onOpen, onEdit }) {
  const m = flight.matches[matchId]
  const isDoubles = flight.isDoubles
  if (!m) return null

  return (
    <div style={{ ...S.card, cursor: !m.winner && isAdmin ? 'pointer' : 'default' }}
      onClick={() => !m.winner && isAdmin && onOpen(matchId)}>
      <div style={S.cardTitle}>
        <span>Match {matchId}{m.proset && !m.scores ? ' · proset' : ''}</span>
        {m.winner && isAdmin && <button style={S.editBtn} onClick={e => { e.stopPropagation(); onEdit(matchId) }}>Edit</button>}
      </div>
      {[m.p1, m.p2].map((seed, idx) => {
        const isW = m.winner && seed === m.winner
        const isL = m.winner && seed && seed !== m.winner
        const rowStyle = isW ? S.playerRowWinner : isL ? S.playerRowLoser : S.playerRow
        if (!seed) return <div key={idx} style={rowStyle}><span style={S.empty}>TBD</span></div>
        const p = flight.players[seed]
        if (!p) return <div key={idx} style={rowStyle}><span style={S.empty}>TBD</span></div>
        const sc = isW && m.scores ? fmtScore(m.scores, m.proset, seed === m.p1 ? 1 : 2) : ''
        return (
          <div key={idx} style={rowStyle}>
            <span style={S.badge}>{p.seed}</span>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={isW ? S.pnameW : S.pname}>{p.name}</div>
              {!isDoubles && <div style={isW ? S.schoolTagW : S.schoolTag}>{p.school}</div>}
            </div>
            {sc && <span style={S.setScores}>{sc}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Score Modal ────────────────────────────────────────────────────────────────
function ScoreModal({ flight, matchId, flightIdx, isDoubles, onClose, onAdvance, onSaveScores }) {
  const m = flight.matches[matchId]
  const p1 = flight.players[m.p1]
  const p2 = flight.players[m.p2]
  const [isProset, setIsProset] = useState(m.proset)
  const [scores, setScores] = useState(() => {
    if (m.scores) return JSON.parse(JSON.stringify(m.scores))
    return { p1sets: ['', ''], p2sets: ['', ''], tb1: {}, tb2: {}, s3p1: '', s3p2: '' }
  })
  const [psScores, setPsScores] = useState({ v1: m.scores?.p1sets?.[0] ?? '', v2: m.scores?.p2sets?.[0] ?? '' })
  const [err, setErr] = useState('')

  function vSet(a, b) { const hi = Math.max(a, b), lo = Math.min(a, b); return (hi === 7 && lo === 6) || (hi === 6 && lo <= 5) }
  function vSTB(a, b) { return !isNaN(a) && !isNaN(b) && Math.max(a, b) >= 10 && Math.abs(a - b) >= 2 }

  function showTB(setIdx) {
    const a = parseInt(scores.p1sets[setIdx]), b = parseInt(scores.p2sets[setIdx])
    return (a === 7 && b === 6) || (a === 6 && b === 7)
  }

  function buildAndSave(winnerSeed) {
    let builtScores
    if (isProset) {
      const v1 = parseInt(psScores.v1), v2 = parseInt(psScores.v2)
      if (isNaN(v1) || isNaN(v2)) { setErr('Enter game counts.'); return }
      if (Math.max(v1, v2) < 8 || Math.abs(v1 - v2) < 2) { setErr('Proset: first to 8, win by 2.'); return }
      builtScores = { p1sets: [v1], p2sets: [v2], proset: true }
    } else {
      const s1p1 = parseInt(scores.p1sets[0]), s1p2 = parseInt(scores.p2sets[0])
      const s2p1 = parseInt(scores.p1sets[1]), s2p2 = parseInt(scores.p2sets[1])
      const s3p1 = scores.s3p1 !== '' ? parseInt(scores.s3p1) : null
      const s3p2 = scores.s3p2 !== '' ? parseInt(scores.s3p2) : null
      const has3 = s3p1 !== null && s3p2 !== null
      if (isNaN(s1p1) || isNaN(s1p2)) { setErr('Enter Set 1 scores.'); return }
      if (!vSet(s1p1, s1p2)) { setErr('Set 1 invalid (e.g. 6–4, 7–5, 7–6).'); return }
      if (isNaN(s2p1) || isNaN(s2p2)) { setErr('Enter Set 2 scores.'); return }
      if (!vSet(s2p1, s2p2)) { setErr('Set 2 invalid.'); return }
      if (has3) {
        if ((s1p1 > s1p2 ? 1 : 2) === (s2p1 > s2p2 ? 1 : 2)) { setErr('Sets not split — no super tiebreak needed.'); return }
        if (!vSTB(s3p1, s3p2)) { setErr('Super tiebreak: first to 10, win by 2.'); return }
      }
      const p1s = [s1p1, s2p1], p2s = [s1p2, s2p2]
      if (has3) { p1s.push(s3p1); p2s.push(s3p2) }
      builtScores = { p1sets: p1s, p2sets: p2s, tb1: scores.tb1 || {}, tb2: scores.tb2 || {} }
    }
    onSaveScores(matchId, builtScores, isProset)
    if (winnerSeed !== undefined) onAdvance(matchId, winnerSeed)
    onClose()
  }

  const inp = (style) => ({ ...style, border: '1px solid #ddd', borderRadius: 6, padding: '5px 4px', textAlign: 'center', background: 'white', fontSize: 15, width: 50 })
  const tbInp = (style) => ({ ...style, border: '1px solid #ddd', borderRadius: 6, padding: 4, textAlign: 'center', background: 'white', fontSize: 13, width: 42 })

  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 4 }}>Match {matchId} — {FLIGHT_NAMES[flightIdx]}</h3>
        <p style={{ fontSize: 12, color: '#888', marginBottom: 16 }}>
          ({p1?.seed}) {p1?.name}{!isDoubles ? ` · ${p1?.school}` : ''} vs ({p2?.seed}) {p2?.name}{!isDoubles ? ` · ${p2?.school}` : ''}
        </p>

        {!isDoubles ? (
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, fontSize: 13, color: '#666', cursor: 'pointer' }}>
            <input type="checkbox" checked={isProset} onChange={e => setIsProset(e.target.checked)} />
            Proset (8 games, win by 2)
          </label>
        ) : (
          <p style={{ fontSize: 12, color: '#888', marginBottom: 14 }}>Doubles matches are 8-game prosets.</p>
        )}

        {(isProset || isDoubles) ? (
          <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
            <thead><tr>
              <th style={{ fontSize: 11, color: '#888', textAlign: 'left', padding: '4px 6px' }}>{isDoubles ? 'Team' : 'Player'}</th>
              <th style={{ fontSize: 11, color: '#888', padding: '4px 6px' }}>Games</th>
            </tr></thead>
            <tbody>
              {[p1, p2].map((p, i) => (
                <tr key={i}>
                  <td style={{ fontSize: 12, padding: '4px 6px' }}>
                    <span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>({p?.seed})</span>{p?.name}
                    {!isDoubles && <span style={{ fontSize: 10, color: '#aaa', display: 'block' }}>{p?.school}</span>}
                  </td>
                  <td style={{ padding: '4px 6px' }}>
                    <input type="number" min={0} max={99} style={inp({})}
                      value={i === 0 ? psScores.v1 : psScores.v2}
                      onChange={e => setPsScores(prev => ({ ...prev, [i === 0 ? 'v1' : 'v2']: e.target.value }))} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <>
            <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 8 }}>
              <thead><tr>
                <th style={{ fontSize: 11, color: '#888', textAlign: 'left', padding: '4px 6px' }}>Player</th>
                <th style={{ fontSize: 11, color: '#888', padding: '4px 6px' }}>Set 1</th>
                <th style={{ fontSize: 10, color: '#aaa', padding: '4px 4px' }}>TB</th>
                <th style={{ fontSize: 11, color: '#888', padding: '4px 6px' }}>Set 2</th>
                <th style={{ fontSize: 10, color: '#aaa', padding: '4px 4px' }}>TB</th>
                <th style={{ fontSize: 11, color: '#888', padding: '4px 6px', textAlign: 'center' }}>Set 3<br /><span style={{ fontSize: 9, color: '#aaa' }}>super TB</span></th>
              </tr></thead>
              <tbody>
                {[p1, p2].map((p, pi) => (
                  <tr key={pi}>
                    <td style={{ fontSize: 12, padding: '4px 6px' }}>
                      <span style={{ fontSize: 10, color: '#888', marginRight: 4 }}>({p?.seed})</span>{p?.name}
                      <span style={{ fontSize: 10, color: '#aaa', display: 'block' }}>{p?.school}</span>
                    </td>
                    {[0, 1].map(si => (
                      <>
                        <td key={`s${si}`} style={{ padding: '4px 4px' }}>
                          <input type="number" min={0} max={7} style={inp({})}
                            value={pi === 0 ? scores.p1sets[si] : scores.p2sets[si]}
                            onChange={e => {
                              const val = e.target.value
                              setScores(prev => {
                                const next = JSON.parse(JSON.stringify(prev))
                                if (pi === 0) next.p1sets[si] = val; else next.p2sets[si] = val
                                return next
                              })
                            }} />
                        </td>
                        <td key={`tb${si}`} style={{ padding: '4px 2px' }}>
                          {showTB(si) && (
                            <input type="number" min={0} max={99} style={tbInp({})}
                              placeholder="–"
                              value={pi === 0 ? (scores.tb1?.[si] ?? '') : (scores.tb2?.[si] ?? '')}
                              onChange={e => {
                                const val = e.target.value
                                setScores(prev => {
                                  const next = JSON.parse(JSON.stringify(prev))
                                  if (pi === 0) { next.tb1 = next.tb1 || {}; next.tb1[si] = val }
                                  else { next.tb2 = next.tb2 || {}; next.tb2[si] = val }
                                  return next
                                })
                              }} />
                          )}
                        </td>
                      </>
                    ))}
                    <td style={{ padding: '4px 4px' }}>
                      <input type="number" min={0} max={99} style={inp({})}
                        value={pi === 0 ? scores.s3p1 : scores.s3p2}
                        onChange={e => setScores(prev => ({ ...prev, [pi === 0 ? 's3p1' : 's3p2']: e.target.value }))} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <p style={{ fontSize: 10, color: '#aaa', marginBottom: 8 }}>TB columns appear on a 7–6 set. Enter the loser's tiebreak score. Set 3 is a super tiebreak (first to 10, win by 2).</p>
          </>
        )}

        {err && <p style={{ fontSize: 11, color: '#c0392b', marginBottom: 12 }}>{err}</p>}

        <hr style={{ border: 'none', borderTop: '1px solid #eee', margin: '12px 0' }} />
        <p style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 8 }}>Confirm winner</p>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16, flexWrap: 'wrap' }}>
          {[p1, p2].map((p, idx) => (
            <button key={idx} style={S.winBtn}
              onClick={() => buildAndSave(idx === 0 ? m.p1 : m.p2)}>
              <div style={{ fontWeight: 600 }}>{p?.name}</div>
              {!isDoubles && <div style={{ fontSize: 11, color: '#888' }}>{p?.school}</div>}
            </button>
          ))}
        </div>

        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ fontSize: 13, padding: '6px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #ccc', background: 'transparent' }}
            onClick={() => { buildAndSave(); }}>Save scores only</button>
          <button style={{ fontSize: 13, padding: '6px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #ccc', background: 'transparent' }}
            onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Warning Modal ─────────────────────────────────────────────────────────
function EditWarning({ flight, matchId, onClose, onConfirm }) {
  const affected = collectDownstream(matchId).filter(id => flight.matches[id]?.winner)
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e => e.stopPropagation()}>
        <h3 style={{ fontSize: 16, fontWeight: 600, marginBottom: 12 }}>Edit Match {matchId}</h3>
        {affected.length > 0 ? (
          <div style={S.warnBox}>
            <strong>Warning:</strong> Editing this match will clear {affected.map(id => `Match ${id}`).join(', ')}. Those results will need to be re-entered.
          </div>
        ) : (
          <p style={{ fontSize: 13, color: '#888', marginBottom: 16 }}>No downstream matches played yet. Safe to re-enter.</p>
        )}
        <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
          <button style={{ fontSize: 13, padding: '6px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #ccc', background: 'transparent' }} onClick={onClose}>Cancel</button>
          <button style={{ fontSize: 13, padding: '6px 16px', cursor: 'pointer', borderRadius: 8, border: '1px solid #D85A30', color: '#D85A30', background: 'transparent' }} onClick={onConfirm}>
            {affected.length > 0 ? 'Clear & re-enter' : 'Re-enter result'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Flight View ────────────────────────────────────────────────────────────────
function FlightView({ flight, flightIdx, isAdmin, onUpdate }) {
  const [modal, setModal] = useState(null) // { type: 'score'|'edit', matchId }
  const isDoubles = flightIdx === 3

  function handleAdvance(matchId, winnerSeed) {
    const next = JSON.parse(JSON.stringify(flight))
    const m = next.matches[matchId]
    const loserSeed = winnerSeed === m.p1 ? m.p2 : m.p1
    m.winner = winnerSeed; m.loser = loserSeed
    function placeIn(mid, seed) { const nm = next.matches[mid]; if (!nm.p1) nm.p1 = seed; else nm.p2 = seed }
    if (matchId === 1) { next.matches[4].p2 = winnerSeed; next.matches[7].p1 = loserSeed }
    else if (matchId === 2) { placeIn(5, winnerSeed); next.matches[6].p1 = loserSeed }
    else if (matchId === 3) { placeIn(5, winnerSeed); next.matches[6].p2 = loserSeed }
    else if (matchId === 4) { next.matches[10].p1 = winnerSeed; next.matches[8].p1 = loserSeed }
    else if (matchId === 5) { next.matches[10].p2 = winnerSeed; next.matches[7].p2 = loserSeed }
    else if (matchId === 6) { next.matches[8].p2 = winnerSeed }
    else if (matchId === 7) { placeIn(9, winnerSeed) }
    else if (matchId === 8) { placeIn(9, winnerSeed) }
    next.points = recomputePoints(next)
    onUpdate(next)
  }

  function handleSaveScores(matchId, scores, proset) {
    const next = JSON.parse(JSON.stringify(flight))
    next.matches[matchId].scores = scores
    next.matches[matchId].proset = proset
    onUpdate(next)
  }

  function handleEdit(matchId) {
    setModal({ type: 'edit', matchId })
  }

  function confirmEdit(matchId) {
    const next = JSON.parse(JSON.stringify(flight))
    collectDownstream(matchId).forEach(id => {
      const fs = FIXED[id]
      next.matches[id] = { ...next.matches[id], p1: fs.p1, p2: fs.p2, winner: null, loser: null, scores: null }
    })
    next.points = recomputePoints(next)
    onUpdate(next)
    setModal({ type: 'score', matchId })
  }

  function mkCard(id) {
    return <MatchCard key={id} flight={flight} matchId={id} isAdmin={isAdmin}
      onOpen={id => setModal({ type: 'score', matchId: id })}
      onEdit={handleEdit} />
  }

  const pts = flight.points || {}
  const sortedSeeds = Object.keys(pts).sort((a, b) => pts[b] - pts[a])

  return (
    <div>
      {isAdmin && <button style={S.resetBtn} onClick={() => {
        if (confirm('Reset this flight? All results will be cleared.')) {
          const f = emptyFlight(isDoubles)
          f.players = flight.players
          f.isDoubles = isDoubles
          f.points = recomputePoints(f)
          onUpdate(f)
        }
      }}>Reset flight</button>}
      {isDoubles && <p style={{ fontSize: 12, color: '#888', marginBottom: 12 }}>All doubles matches are 8-game prosets.</p>}

      <div style={S.section}>
        <h2 style={S.h2}>Winners bracket</h2>
        <div style={S.bracketWrap}>
          <div style={{ ...S.round, gap: 10 }}>
            <div style={S.roundLabel}>Round 1</div>
            {[1,2,3].map(id => mkCard(id))}
          </div>
          <VConn n={3} />
          <div style={{ ...S.round, justifyContent: 'space-around', gap: 12, paddingTop: 28 }}>
            <div style={S.roundLabel}>Semifinals</div>
            {[4,5].map(id => mkCard(id))}
          </div>
          <VConn n={2} />
          <div style={{ ...S.round, justifyContent: 'center', paddingTop: 28 }}>
            <div style={S.roundLabel}>Final</div>
            {mkCard(10)}
          </div>
        </div>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>Consolation bracket</h2>
        <div style={S.bracketWrap}>
          <div style={{ ...S.round, justifyContent: 'flex-start', gap: 8 }}>
            <div style={S.roundLabel}>Play-in</div>
            {mkCard(6)}
            <div style={{ flex: 1 }} />
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', width: 32, alignSelf: 'stretch' }}>
            <div style={{ flex: 1, borderRight: '1px solid #ccc', borderBottom: '1px solid #ccc' }} />
            <div style={{ flex: 3 }} />
          </div>
          <div style={{ ...S.round, justifyContent: 'space-between', gap: 12 }}>
            <div style={S.roundLabel}>Semifinals</div>
            {mkCard(8)}
            {mkCard(7)}
          </div>
          <VConn n={2} />
          <div style={{ ...S.round, justifyContent: 'center' }}>
            <div style={S.roundLabel}>Final</div>
            {mkCard(9)}
          </div>
        </div>
      </div>

      <div style={S.section}>
        <h2 style={S.h2}>Points</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
          {sortedSeeds.map(s => {
            const p = flight.players[s]
            if (!p) return null
            return (
              <div key={s} style={{ background: 'white', borderRadius: 8, border: '1px solid #eee', padding: '8px 14px', minWidth: 120 }}>
                <div style={{ fontSize: 11, color: '#888', marginBottom: 1 }}>({p.seed}) {p.name}</div>
                {!isDoubles && <div style={{ fontSize: 10, color: '#aaa', marginBottom: 3 }}>{p.school}</div>}
                <div style={{ fontSize: 18, fontWeight: 700 }}>{(pts[s] || 0).toFixed(1)} pts</div>
              </div>
            )
          })}
        </div>
      </div>

      {modal?.type === 'score' && (
        <ScoreModal flight={flight} matchId={modal.matchId} flightIdx={flightIdx}
          isDoubles={isDoubles} onClose={() => setModal(null)}
          onAdvance={handleAdvance} onSaveScores={handleSaveScores} />
      )}
      {modal?.type === 'edit' && (
        <EditWarning flight={flight} matchId={modal.matchId}
          onClose={() => setModal(null)}
          onConfirm={() => confirmEdit(modal.matchId)} />
      )}
    </div>
  )
}

// ── Setup View ────────────────────────────────────────────────────────────────
function SetupView({ onGenerate }) {
  const [entries, setEntries] = useState(() => {
    const e = {}
    for (let f = 0; f < 4; f++) {
      e[f] = {}
      for (let s = 1; s <= 7; s++) e[f][s] = { name: '', school: '' }
    }
    return e
  })
  const [err, setErr] = useState('')

  function getDuplicates(f) {
    const counts = {}
    for (let s = 1; s <= 7; s++) {
      const sch = entries[f][s].school
      if (sch) counts[sch] = (counts[sch] || 0) + 1
    }
    return counts
  }

  function generate() {
    setErr('')
    const flights = []
    for (let f = 0; f < 4; f++) {
      const isDoubles = f === 3
      const usedSchools = new Set()
      const players = {}
      for (let s = 1; s <= 7; s++) {
        const { name, school } = entries[f][s]
        if (!school) { setErr(`Assign all schools in ${FLIGHT_NAMES[f]}.`); return }
        if (!isDoubles && !name.trim()) { setErr(`Enter all player names in ${FLIGHT_NAMES[f]}.`); return }
        if (usedSchools.has(school)) { setErr(`${school} appears more than once in ${FLIGHT_NAMES[f]}.`); return }
        usedSchools.add(school)
        players[s] = { seed: s, name: isDoubles ? school : name.trim(), school }
      }
      const flight = emptyFlight(isDoubles)
      flight.players = players
      flight.isDoubles = isDoubles
      flight.points = recomputePoints(flight)
      flights.push(flight)
    }
    onGenerate(flights)
  }

  return (
    <div>
      <h2 style={S.h2}>Assign seeds for each flight</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Singles: enter each player's name and school. Doubles: select school only.</p>
      <div style={S.setupGrid}>
        {[0,1,2,3].map(f => {
          const isDoubles = f === 3
          const dups = getDuplicates(f)
          return (
            <div key={f} style={S.setupFlight}>
              <h3 style={{ fontSize: 14, fontWeight: 600, marginBottom: 12 }}>{FLIGHT_NAMES[f]}</h3>
              {[1,2,3,4,5,6,7].map(s => {
                const { name, school } = entries[f][s]
                const isDup = school && dups[school] > 1
                return (
                  <div key={s} style={S.seedBlock}>
                    <div style={{ fontSize: 11, fontWeight: 600, color: '#888', marginBottom: 8 }}>Seed {s}</div>
                    {!isDoubles && (
                      <>
                        <div style={S.fieldLabel}>Player name</div>
                        <input type="text" style={S.textInput} placeholder="e.g. Smith, John"
                          value={name}
                          onChange={e => setEntries(prev => ({ ...prev, [f]: { ...prev[f], [s]: { ...prev[f][s], name: e.target.value } } }))} />
                      </>
                    )}
                    <div style={S.fieldLabel}>School</div>
                    <select style={isDup ? S.selectDup : S.select} value={school}
                      onChange={e => setEntries(prev => ({ ...prev, [f]: { ...prev[f], [s]: { ...prev[f][s], school: e.target.value } } }))}>
                      <option value="">— select school —</option>
                      {SCHOOLS.map(sch => <option key={sch} value={sch}>{sch}</option>)}
                    </select>
                    {isDup && <div style={S.dupMsg}>Already selected in this flight</div>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <button style={S.genBtn} onClick={generate}>Generate brackets →</button>
      {err && <p style={S.errMsg}>{err}</p>}
    </div>
  )
}

// ── Leaderboard ────────────────────────────────────────────────────────────────
function Leaderboard({ flights }) {
  const totals = {}, breakdown = {}
  SCHOOLS.forEach(sch => { totals[sch] = 0; breakdown[sch] = {} })
  flights.forEach((flight, fi) => {
    if (!flight) return
    const pts = flight.points || {}
    for (let s = 1; s <= 7; s++) {
      const p = flight.players[s]
      if (!p?.school) continue
      totals[p.school] = (totals[p.school] || 0) + (pts[s] || 0)
      breakdown[p.school][FLIGHT_NAMES[fi]] = pts[s] || 0
    }
  })
  const sorted = SCHOOLS.slice().sort((a, b) => totals[b] - totals[a])
  const rankColors = ['#BA7517', '#888780', '#854F0B']

  return (
    <div>
      <h2 style={S.h2}>Team standings</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Total points across all 4 flights.</p>
      {sorted.map((sch, i) => {
        const bd = Object.entries(breakdown[sch] || {}).map(([fn, pts]) => `${fn}: ${pts.toFixed(1)}`).join(' · ') || 'No results yet'
        return (
          <div key={sch} style={S.lbRow}>
            <div style={{ ...S.lbRank, color: rankColors[i] || '#ccc' }}>{i + 1}</div>
            <div style={{ flex: 1 }}>
              <div style={S.lbName}>{sch}</div>
              <div style={S.lbBd}>{bd}</div>
            </div>
            <div style={S.lbTotal}>{totals[sch].toFixed(1)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Admin Login ────────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pw, setPw] = useState('')
  const [err, setErr] = useState('')
  return (
    <div style={S.lockBox}>
      <div style={{ fontSize: 32, marginBottom: 12 }}>🎾</div>
      <h2 style={{ fontSize: 18, fontWeight: 600, marginBottom: 4 }}>Admin access</h2>
      <p style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>Enter the coach password to enter scores.</p>
      <input type="password" placeholder="Password" style={{ ...S.textInput, marginBottom: 12, textAlign: 'center' }}
        value={pw} onChange={e => setPw(e.target.value)}
        onKeyDown={e => e.key === 'Enter' && (pw === ADMIN_PASSWORD ? onLogin() : setErr('Incorrect password.'))} />
      <button style={{ ...S.genBtn, width: '100%' }}
        onClick={() => pw === ADMIN_PASSWORD ? onLogin() : setErr('Incorrect password.')}>
        Sign in
      </button>
      {err && <p style={S.errMsg}>{err}</p>}
    </div>
  )
}

// ── Main App ───────────────────────────────────────────────────────────────────
export default function App() {
  const [tab, setTab] = useState('setup')
  const [flights, setFlights] = useState([null, null, null, null])
  const [generated, setGenerated] = useState(false)
  const [isAdmin, setIsAdmin] = useState(false)
  const [showLogin, setShowLogin] = useState(false)
  const [loading, setLoading] = useState(true)

  // Load state from Supabase on mount
  useEffect(() => {
    async function load() {
      const { data } = await supabase.from('tournament_state').select('*').eq('id', 1).single()
      if (data?.state) {
        const s = data.state
        setFlights(s.flights || [null, null, null, null])
        setGenerated(s.generated || false)
        if (s.generated) setTab('flight0')
      }
      setLoading(false)
    }
    load()

    // Real-time subscription
    const channel = supabase.channel('tournament')
      .on('postgres_changes', { event: 'UPDATE', schema: 'public', table: 'tournament_state' }, payload => {
        const s = payload.new.state
        setFlights(s.flights || [null, null, null, null])
        setGenerated(s.generated || false)
      })
      .subscribe()

    return () => supabase.removeChannel(channel)
  }, [])

  // Save state to Supabase
  const saveState = useCallback(async (newFlights, newGenerated) => {
    await supabase.from('tournament_state').upsert({ id: 1, state: { flights: newFlights, generated: newGenerated } })
  }, [])

  function handleGenerate(newFlights) {
    setFlights(newFlights)
    setGenerated(true)
    setTab('flight0')
    saveState(newFlights, true)
  }

  function handleFlightUpdate(fi, updatedFlight) {
    const next = [...flights]
    next[fi] = updatedFlight
    setFlights(next)
    saveState(next, generated)
  }

  const tabNames = ['setup', 'flight0', 'flight1', 'flight2', 'flight3', 'team']
  const tabLabels = ['Setup', 'Singles #1', 'Singles #2', 'Singles #3', 'Doubles', 'Team Scores']

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '60vh' }}>
      <p style={{ color: '#888', fontSize: 16 }}>Loading tournament...</p>
    </div>
  )

  return (
    <div>
      {isAdmin && (
        <div style={S.adminBar}>
          <div style={S.adminDot} />
          <span>Admin mode — scores can be edited</span>
          <button style={{ marginLeft: 'auto', fontSize: 12, padding: '4px 10px', cursor: 'pointer', border: '1px solid #555', borderRadius: 6, background: 'transparent', color: 'white' }}
            onClick={() => setIsAdmin(false)}>Sign out</button>
        </div>
      )}

      <div style={S.wrap}>
        <div style={S.header}>
          <h1 style={S.h1}>MAPL Boys' Tennis Tournament</h1>
          <p style={S.sub}>Lawrenceville · Peddie · Blair · Mercersburg · Hill · Hun · Pennington</p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8, marginBottom: 16 }}>
          <div style={S.tabs}>
            {tabNames.map((t, i) => (
              <button key={t} style={tab === t ? S.tabActive : S.tab}
                onClick={() => setTab(t)}
                disabled={!generated && t !== 'setup'}>
                {tabLabels[i]}
              </button>
            ))}
          </div>
          {!isAdmin && (
            <button style={{ fontSize: 12, padding: '5px 12px', cursor: 'pointer', border: '1px solid #ccc', borderRadius: 8, background: 'white', color: '#666' }}
              onClick={() => setShowLogin(true)}>
              Coach login
            </button>
          )}
        </div>

        {tab === 'setup' && <SetupView onGenerate={handleGenerate} />}
        {['flight0','flight1','flight2','flight3'].map((t, fi) =>
          tab === t && flights[fi] ? (
            <FlightView key={t} flight={flights[fi]} flightIdx={fi} isAdmin={isAdmin}
              onUpdate={f => handleFlightUpdate(fi, f)} />
          ) : null
        )}
        {tab === 'team' && <Leaderboard flights={flights} />}
      </div>

      {showLogin && (
        <div style={S.modalBg} onClick={() => setShowLogin(false)}>
          <div onClick={e => e.stopPropagation()}>
            <AdminLogin onLogin={() => { setIsAdmin(true); setShowLogin(false) }} />
          </div>
        </div>
      )}
    </div>
  )
}
