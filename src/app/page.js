'use client'
import { useEffect, useState, useCallback, useRef } from 'react'
import { supabase } from '../lib/supabase'

// ── Constants ─────────────────────────────────────────────────────────────────
const SCHOOLS = ['Blair','Hill','Hun','Lawrenceville','Mercersburg','Peddie','Pennington']
const FLIGHT_NAMES = ['Singles #1','Singles #2','Singles #3','Singles #4','Doubles']
const ADMIN_PASSWORD = process.env.NEXT_PUBLIC_ADMIN_PASSWORD || 'mapl2025'
const DOWNSTREAM = {1:[4,6,7],2:[5,6],3:[5,7],4:[8,10],5:[7,10],6:[8],7:[9],8:[9],9:[],10:[]}
const FIXED = {1:{p1:4,p2:5},2:{p1:3,p2:6},3:{p1:2,p2:7},4:{p1:1,p2:null},5:{p1:null,p2:null},6:{p1:null,p2:null},7:{p1:null,p2:null},8:{p1:null,p2:null},9:{p1:null,p2:null},10:{p1:null,p2:null}}

// Normal day round times
const NORMAL_TIMES = ['9:00 AM','10:30 AM','12:00 PM','1:30 PM']
// Rain day round times (wave scheduling on 4 courts, singles only)
const RAIN_TIMES = ['9:00 AM','11:00 AM','1:00 PM','3:00 PM']

// Match format rules
// Proset: Round 1 winners (1,2,3), all consolation (6,7,8,9), all doubles
// Best of 3: winners semis (4,5) and final (10) in singles only
function isProsetMatch(f, localId) {
  if (f === 4) return true
  if ([1,2,3,6,7,8,9].includes(localId)) return true
  return false
}

// Rain day: all matches become 6-game prosets, doubles hidden
function getRainProsetMatch() { return true }

// Order of play
const SINGLES_ROUNDS = [
  { label:'Round 1', matches:[[0,1],[0,2],[0,3],[1,1],[1,2],[1,3],[2,1],[2,2],[2,3],[3,1],[3,2],[3,3]] },
  { label:'Round 2', matches:[[0,4],[0,5],[0,6],[1,4],[1,5],[1,6],[2,4],[2,5],[2,6],[3,4],[3,5],[3,6]] },
  { label:'Round 3', matches:[[0,7],[0,8],[0,10],[1,7],[1,8],[1,10],[2,7],[2,8],[2,10],[3,7],[3,8],[3,10]] },
  { label:'Round 4', matches:[[0,9],[1,9],[2,9],[3,9]] },
]
const DOUBLES_ROUNDS = [
  { label:'Round 1', matches:[[4,1],[4,2],[4,3]] },
  { label:'Round 2', matches:[[4,4],[4,5],[4,6]] },
  { label:'Round 3', matches:[[4,7],[4,8],[4,10]] },
  { label:'Round 4', matches:[[4,9]] },
]

const SINGLES_NUM = {}; let sn = 1
SINGLES_ROUNDS.forEach(r => r.matches.forEach(([f,l]) => { SINGLES_NUM[`${f}-${l}`] = sn++ }))
const DOUBLES_NUM = {}; let dn = 1
DOUBLES_ROUNDS.forEach(r => r.matches.forEach(([f,l]) => { DOUBLES_NUM[`${f}-${l}`] = dn++ }))
function getMatchNum(f, lid) { return f === 4 ? 'D' + DOUBLES_NUM[`${f}-${lid}`] : '' + SINGLES_NUM[`${f}-${lid}`] }

// ── Helpers ───────────────────────────────────────────────────────────────────
function emptyFlight(f, rainDay = false) {
  const isDoubles = f === 4
  const matches = {}
  for (let id = 1; id <= 10; id++) {
    const fs = FIXED[id]
    const proset = rainDay ? true : isProsetMatch(f, id)
    matches[id] = { p1: fs.p1, p2: fs.p2, winner: null, loser: null, scores: null, proset }
  }
  const points = {}
  for (let s = 1; s <= 7; s++) points[s] = 0
  points[1] = 2
  return { players: {}, matches, points, isDoubles, flightIdx: f }
}

function recomputePoints(flight) {
  const points = {}
  for (let i = 1; i <= 7; i++) points[i] = 0
  points[1] = 2
  for (let id = 1; id <= 10; id++) {
    const m = flight.matches[id]
    if (!m?.winner) continue
    if ([1,2,3,4,5,10].includes(id)) points[m.winner] += 2
    else points[m.winner] += 0.5
    if (id === 1) points[m.loser] += 0.5
  }
  return points
}

function collectDownstream(matchId) {
  const visited = new Set()
  function walk(id) { if (visited.has(id)) return; visited.add(id); (DOWNSTREAM[id]||[]).forEach(walk) }
  walk(matchId)
  return [...visited]
}

function fmtScore(scores, proset, wSlot) {
  if (!scores) return ''
  if (proset) {
    const w = wSlot===1 ? scores.p1sets[0] : scores.p2sets[0]
    const l = wSlot===1 ? scores.p2sets[0] : scores.p1sets[0]
    return `${w}–${l}`
  }
  return scores.p1sets.map((g1, s) => {
    const g2 = scores.p2sets[s]
    if (g1===undefined||g2===undefined) return null
    const w = wSlot===1?g1:g2, l = wSlot===1?g2:g1
    const tbL = wSlot===1 ? scores.tb2?.[s] : scores.tb1?.[s]
    return `${w}–${l}${tbL!==undefined&&tbL!==''?`(${tbL})`:''}`
  }).filter(Boolean).join('  ')
}

function vSet(a,b) { const hi=Math.max(a,b),lo=Math.min(a,b); return (hi===7&&lo===6)||(hi===6&&lo<=5) }
function vSTB(a,b) { return !isNaN(a)&&!isNaN(b)&&Math.max(a,b)>=10&&Math.abs(a-b)>=2 }
function vProset(a,b,isRain) {
  const target = isRain ? 6 : 8
  return Math.max(a,b)>=target && Math.abs(a-b)>=2
}

// ── Styles ────────────────────────────────────────────────────────────────────
const copper='#B5651D', copperLight='#D4854A', copperDark='#8B4513', copperBg='#FBF4EE'
const rainBlue='#1a5276', rainBlueBg='#EBF5FB', rainBlueBorder='#AED6F1'

const S = {
  appWrap: { minHeight:'100vh', background:'#FAFAF8' },
  header: { background:'linear-gradient(135deg, #1a1a1a 0%, #2d1a0a 60%, #1a0f05 100%)', position:'relative', overflow:'hidden' },
  headerInner: { maxWidth:1100, margin:'0 auto', padding:'20px 16px 16px', display:'flex', alignItems:'center', gap:20 },
  headerTitle: { fontSize:26, fontWeight:700, color:'white', marginBottom:4 },
  headerSub: { fontSize:11, color:'rgba(255,255,255,0.5)', letterSpacing:1, textTransform:'uppercase' },
  headerSchools: { fontSize:12, color:'rgba(255,255,255,0.55)', marginTop:6 },
  copperBar: { height:3, background:`linear-gradient(90deg, ${copperDark}, ${copperLight}, ${copperDark})` },
  rainBar: { height:3, background:'linear-gradient(90deg, #1a5276, #2980b9, #1a5276)' },
  tabsWrap: { background:'white', borderBottom:'1px solid #ece8e3', position:'sticky', top:0, zIndex:10 },
  tabsInner: { maxWidth:1100, margin:'0 auto', padding:'0 16px', display:'flex', overflowX:'auto' },
  tab: { fontSize:13, padding:'12px 16px', cursor:'pointer', border:'none', borderBottom:'3px solid transparent', background:'transparent', color:'#999', whiteSpace:'nowrap', fontWeight:500 },
  tabActive: { fontSize:13, padding:'12px 16px', cursor:'pointer', border:'none', borderBottom:`3px solid ${copper}`, background:'transparent', color:copper, whiteSpace:'nowrap', fontWeight:600 },
  inner: { maxWidth:1100, margin:'0 auto', padding:'0 16px 60px' },
  pageTitle: { fontSize:20, fontWeight:600, color:'#1a1a1a', marginBottom:6, marginTop:24 },
  pageSub: { fontSize:13, color:'#999', marginBottom:20 },
  sectionHead: { fontSize:16, fontWeight:600, color:'#1a1a1a', marginBottom:12, paddingLeft:10, borderLeft:`3px solid ${copper}` },
  sectionHeadBlue: { fontSize:16, fontWeight:600, color:'#185FA5', marginBottom:12, paddingLeft:10, borderLeft:'3px solid #185FA5' },
  setupGrid: { display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20, marginBottom:20 },
  setupFlight: { background:'white', borderRadius:12, border:'1px solid #ece8e3', padding:'16px 18px' },
  flightTitleRow: { display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12, paddingBottom:8, borderBottom:'1px solid #f0ebe5' },
  flightBadge: { fontSize:10, color:copper, background:copperBg, border:`1px solid rgba(181,101,29,0.2)`, borderRadius:4, padding:'2px 7px', fontWeight:500 },
  seedBlock: { border:'1px solid #f0ebe5', borderRadius:8, padding:'10px 12px', marginBottom:8, background:'#FDFCFB' },
  seedHeader: { fontSize:11, fontWeight:600, color:'#bbb', marginBottom:8, textTransform:'uppercase', letterSpacing:0.5 },
  fieldLabel: { fontSize:10, color:'#ccc', marginBottom:3, textTransform:'uppercase', letterSpacing:0.3 },
  textInput: { width:'100%', fontSize:13, padding:'7px 9px', border:'1px solid #e0dbd5', borderRadius:6, background:'white', marginBottom:6, color:'#1a1a1a', fontFamily:'inherit', boxSizing:'border-box' },
  select: { width:'100%', fontSize:13, padding:'7px 9px', border:'1px solid #e0dbd5', borderRadius:6, background:'white', color:'#1a1a1a', fontFamily:'inherit', boxSizing:'border-box' },
  selectDup: { width:'100%', fontSize:13, padding:'7px 9px', border:'1px solid #D85A30', borderRadius:6, background:'#FFF0EB', color:'#1a1a1a', fontFamily:'inherit', boxSizing:'border-box' },
  dupMsg: { fontSize:10, color:'#D85A30', marginTop:3 },
  genBtn: { fontSize:14, padding:'10px 24px', cursor:'pointer', background:`linear-gradient(135deg, ${copper}, ${copperLight})`, border:'none', borderRadius:8, color:'white', fontWeight:600, fontFamily:'inherit' },
  resetBtn: { fontSize:12, padding:'5px 12px', cursor:'pointer', background:'transparent', border:'1px solid #ddd', borderRadius:8, color:'#aaa', marginBottom:16, fontFamily:'inherit' },
  bracketWrap: { display:'flex', alignItems:'stretch', overflowX:'auto', paddingBottom:8, marginBottom:24 },
  round: { display:'flex', flexDirection:'column' },
  matchCard: { background:'white', border:'1px solid #ece8e3', borderRadius:10, width:220, minWidth:220, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)' },
  matchCardClickable: { background:'white', border:'1px solid #ece8e3', borderRadius:10, width:220, minWidth:220, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.05)', cursor:'pointer' },
  matchTitle: { fontSize:11, fontWeight:600, color:'#aaa', padding:'5px 9px', borderBottom:'1px solid #f0ebe5', background:'#FDFCFB', display:'flex', justifyContent:'space-between', alignItems:'center', textTransform:'uppercase', letterSpacing:0.3 },
  editBtn: { fontSize:10, padding:'2px 7px', cursor:'pointer', border:'1px solid #ddd', borderRadius:4, background:'transparent', color:'#bbb', textTransform:'none', letterSpacing:0, fontFamily:'inherit' },
  playerRow: { display:'flex', alignItems:'center', padding:'6px 9px', gap:7, minHeight:40 },
  playerRowWinner: { display:'flex', alignItems:'center', padding:'6px 9px', gap:7, minHeight:40, background:'linear-gradient(90deg, #EAF3DE, #F4FAF0)' },
  playerRowLoser: { display:'flex', alignItems:'center', padding:'6px 9px', gap:7, minHeight:40, opacity:0.4 },
  seedBadge: { fontSize:10, fontWeight:700, background:'#F5F0EB', border:'1px solid #E8E0D5', borderRadius:4, padding:'1px 5px', color:'#aaa', minWidth:22, textAlign:'center', flexShrink:0 },
  seedBadgeW: { fontSize:10, fontWeight:700, background:'#D4EABC', border:'1px solid #B5D990', borderRadius:4, padding:'1px 5px', color:'#3B6D11', minWidth:22, textAlign:'center', flexShrink:0 },
  playerInfo: { flex:1, minWidth:0, display:'flex', flexDirection:'column', justifyContent:'center' },
  pname: { fontSize:13, color:'#1a1a1a', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.3 },
  pnameW: { fontSize:13, color:'#3B6D11', fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis', lineHeight:1.3 },
  schoolTag: { fontSize:10, color:'#bbb', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  schoolTagW: { fontSize:10, color:'#5A9020', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' },
  setScores: { fontSize:11, color:'#5A9020', whiteSpace:'nowrap', fontWeight:600, flexShrink:0 },
  emptySlot: { fontSize:12, color:'#ccc', fontStyle:'italic', flex:1 },
  roundLabel: { fontSize:10, fontWeight:600, color:'#ccc', textAlign:'center', marginBottom:8, width:220, textTransform:'uppercase', letterSpacing:0.5 },
  ptsCard: { background:'white', borderRadius:8, border:'1px solid #ece8e3', padding:'10px 14px', minWidth:120 },
  ptsName: { fontSize:11, color:'#999', marginBottom:2 },
  ptsSchool: { fontSize:10, color:'#ccc', marginBottom:4 },
  ptsVal: { fontSize:20, fontWeight:700, color:copper },
  lbCard: { background:'white', border:'1px solid #ece8e3', borderRadius:12, padding:'14px 18px', display:'flex', alignItems:'center', gap:14, marginBottom:10 },
  lbRank: { fontSize:22, fontWeight:700, minWidth:32, color:'#ddd' },
  lbName: { fontSize:15, fontWeight:600, color:'#1a1a1a' },
  lbBd: { fontSize:11, color:'#bbb', marginTop:3 },
  lbPts: { fontSize:24, fontWeight:700, color:copper, minWidth:56, textAlign:'right' },
  // Rain day banner
  rainBanner: { background:rainBlueBg, border:`1px solid ${rainBlueBorder}`, borderRadius:10, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:14 },
  rainBannerTitle: { fontSize:14, fontWeight:700, color:rainBlue, marginBottom:3 },
  rainBannerSub: { fontSize:12, color:'#2471a3' },
  rainToggleBtn: { fontSize:13, fontWeight:600, padding:'8px 16px', cursor:'pointer', border:`1px solid ${rainBlueBorder}`, borderRadius:8, background:rainBlue, color:'white', fontFamily:'inherit', flexShrink:0 },
  rainToggleBtnOff: { fontSize:13, fontWeight:600, padding:'8px 16px', cursor:'pointer', border:'1px solid #ddd', borderRadius:8, background:'transparent', color:'#aaa', fontFamily:'inherit', flexShrink:0 },
  // OOP
  oopRoundHeader: { fontSize:13, fontWeight:600, color:'#1a1a1a', padding:'9px 14px', marginBottom:8, background:'white', borderRadius:8, border:'1px solid #ece8e3', display:'flex', justifyContent:'space-between', alignItems:'center' },
  oopRoundHeaderRain: { fontSize:13, fontWeight:600, color:rainBlue, padding:'9px 14px', marginBottom:8, background:rainBlueBg, borderRadius:8, border:`1px solid ${rainBlueBorder}`, display:'flex', justifyContent:'space-between', alignItems:'center' },
  oopRoundTime: { fontSize:12, fontWeight:700, color:copper, marginLeft:8 },
  oopRoundTimeRain: { fontSize:12, fontWeight:700, color:rainBlue, marginLeft:8 },
  oopRoundSub: { fontSize:11, color:'#bbb', fontWeight:400 },
  oopDoublesHeader: { fontSize:13, fontWeight:600, color:'#185FA5', padding:'9px 14px', background:'#EAF1FB', borderRadius:8, border:'1px solid #C5D8F0', marginBottom:8, display:'flex', justifyContent:'space-between' },
  oopMatch: { display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:'1px solid #ece8e3', borderRadius:8, background:'white', marginBottom:6 },
  oopMatchIP: { display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:`1px solid ${copperLight}`, borderRadius:8, background:copperBg, marginBottom:6 },
  oopMatchDone: { display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:'1px solid #eee', borderRadius:8, background:'#FAFAF8', marginBottom:6, opacity:0.55 },
  oopMatchWait: { display:'flex', alignItems:'center', gap:10, padding:'9px 14px', border:'1px solid #f0f0f0', borderRadius:8, background:'white', marginBottom:6, opacity:0.35 },
  oopNum: { fontSize:15, fontWeight:700, color:copper, minWidth:40 },
  oopNumD: { fontSize:15, fontWeight:700, color:'#185FA5', minWidth:40 },
  oopFlight: { fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:4, background:'#F5F0EB', color:copperDark, flexShrink:0, textTransform:'uppercase' },
  oopFlightD: { fontSize:10, fontWeight:600, padding:'2px 8px', borderRadius:4, background:'#EAF1FB', color:'#185FA5', flexShrink:0, textTransform:'uppercase' },
  oopPlayers: { flex:1, fontSize:12, color:'#444' },
  oopScore: { fontSize:12, color:'#5A9020', fontWeight:600, whiteSpace:'nowrap' },
  oopStatusReady: { fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, flexShrink:0, cursor:'pointer', background:'#F5F0EB', color:copper, border:`1px solid rgba(181,101,29,0.3)`, fontFamily:'inherit' },
  oopStatusIP: { fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, flexShrink:0, cursor:'pointer', background:copperBg, color:copperDark, border:`1px solid ${copperLight}`, fontFamily:'inherit' },
  oopStatusDone: { fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, flexShrink:0, background:'#EAF3DE', color:'#3B6D11', border:'1px solid #C5E0A0', fontFamily:'inherit' },
  oopStatusWait: { fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:6, flexShrink:0, background:'#F5F5F5', color:'#ddd', border:'1px solid #f0f0f0', fontFamily:'inherit' },
  // Modal
  modalBg: { position:'fixed', inset:0, background:'rgba(0,0,0,0.4)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 },
  modal: { background:'white', borderRadius:14, padding:'22px 26px', width:420, maxWidth:'95vw', maxHeight:'90vh', overflowY:'auto', boxShadow:'0 8px 40px rgba(0,0,0,0.18)' },
  warnBox: { background:'#FFF0EB', border:'1px solid #F0997B', borderRadius:8, padding:'10px 14px', fontSize:12, color:'#712B13', marginBottom:16 },
  adminBar: { background:'#1a1a2e', color:'white', padding:'8px 16px', display:'flex', alignItems:'center', gap:12, fontSize:13 },
  adminDot: { width:8, height:8, borderRadius:'50%', background:'#27ae60', flexShrink:0 },
  lockBox: { background:'white', borderRadius:14, padding:36, maxWidth:360, margin:'80px auto', boxShadow:'0 4px 20px rgba(0,0,0,0.1)', textAlign:'center' },
}

// ── Maple Leaf ────────────────────────────────────────────────────────────────
function MapleLeaf({ size=64 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 64 64">
      <polygon points="32,4 36,20 50,12 42,26 58,24 46,34 56,46 40,42 36,58 32,46 28,58 24,42 8,46 18,34 6,24 22,26 14,12 28,20" fill="#B5651D" opacity="0.9"/>
      <polygon points="32,10 35,22 46,16 40,27 54,26 44,34 52,44 38,41 35,54 32,44 29,54 26,41 12,44 20,34 10,26 24,27 18,16 29,22" fill="#D4854A" opacity="0.5"/>
    </svg>
  )
}

// ── VConn ─────────────────────────────────────────────────────────────────────
function VConn({ n }) {
  const b = '1px solid #e8e0d5'
  const base = { display:'flex', flexDirection:'column', width:32, alignSelf:'stretch' }
  if (n===3) return <div style={base}><div style={{flex:2,borderRight:b,borderBottom:b}}/><div style={{flex:1}}/><div style={{flex:2,borderRight:b,borderTop:b}}/></div>
  if (n===2) return <div style={base}><div style={{flex:1,borderRight:b,borderBottom:b}}/><div style={{flex:1,borderRight:b}}/></div>
  return <div style={base}><div style={{flex:1,borderRight:b}}/></div>
}

// ── Match Card ────────────────────────────────────────────────────────────────
function MatchCard({ flight, localId, isAdmin, rainDay, onOpen, onEdit }) {
  const m = flight.matches[localId]
  const isDoubles = flight.isDoubles
  if (!m) return null
  const num = getMatchNum(flight.flightIdx, localId)
  const clickable = !m.winner && isAdmin
  const formatTag = m.proset
    ? <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:'#E8F0FB',color:'#185FA5',textTransform:'uppercase',letterSpacing:0.3,marginLeft:4}}>proset</span>
    : <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:'#F0EBE3',color:'#8B6914',textTransform:'uppercase',letterSpacing:0.3,marginLeft:4}}>B3</span>

  return (
    <div style={clickable ? S.matchCardClickable : S.matchCard} onClick={()=>clickable&&onOpen(localId)}>
      <div style={S.matchTitle}>
        <span style={{display:'flex',alignItems:'center'}}>Match {num}{formatTag}</span>
        {m.winner&&isAdmin&&<button style={S.editBtn} onClick={e=>{e.stopPropagation();onEdit(localId)}}>Edit</button>}
      </div>
      {[m.p1,m.p2].map((seed,idx)=>{
        const isW=m.winner&&seed===m.winner, isL=m.winner&&seed&&seed!==m.winner
        const rowStyle=isW?S.playerRowWinner:isL?S.playerRowLoser:S.playerRow
        const border=idx===0?'1px solid #f5f3f0':'none'
        if (!seed) return <div key={idx} style={{...rowStyle,borderBottom:border}}><span style={S.emptySlot}>TBD</span></div>
        const p=flight.players[seed]; if(!p) return null
        const sc=isW&&m.scores?fmtScore(m.scores,m.proset,seed===m.p1?1:2):''
        return (
          <div key={idx} style={{...rowStyle,borderBottom:border}}>
            <span style={isW?S.seedBadgeW:S.seedBadge}>{p.seed}</span>
            <div style={S.playerInfo}>
              <div style={isW?S.pnameW:S.pname}>{p.name}</div>
              {!isDoubles&&<div style={isW?S.schoolTagW:S.schoolTag}>{p.school}</div>}
            </div>
            {sc&&<span style={S.setScores}>{sc}</span>}
          </div>
        )
      })}
    </div>
  )
}

// ── Score Modal ───────────────────────────────────────────────────────────────
function ScoreModal({ flight, localId, rainDay, onClose, onAdvance, onSaveScores }) {
  const m = flight.matches[localId]
  const p1=flight.players[m.p1], p2=flight.players[m.p2]
  const isDoubles=flight.isDoubles
  const forceProset=isProsetMatch(flight.flightIdx,localId)||isDoubles||rainDay
  const [isProset,setIsProset]=useState(m.proset||forceProset)
  const [s1p1,setS1p1]=useState(m.scores?.p1sets?.[0]??'')
  const [s1p2,setS1p2]=useState(m.scores?.p2sets?.[0]??'')
  const [s2p1,setS2p1]=useState(m.scores?.p1sets?.[1]??'')
  const [s2p2,setS2p2]=useState(m.scores?.p2sets?.[1]??'')
  const [s3p1,setS3p1]=useState(m.scores?.p1sets?.[2]??'')
  const [s3p2,setS3p2]=useState(m.scores?.p2sets?.[2]??'')
  const [tb1_0,setTb1_0]=useState(m.scores?.tb1?.[0]??'')
  const [tb2_0,setTb2_0]=useState(m.scores?.tb2?.[0]??'')
  const [tb1_1,setTb1_1]=useState(m.scores?.tb1?.[1]??'')
  const [tb2_1,setTb2_1]=useState(m.scores?.tb2?.[1]??'')
  const [psV1,setPsV1]=useState(m.scores?.p1sets?.[0]??'')
  const [psV2,setPsV2]=useState(m.scores?.p2sets?.[0]??'')
  const [err,setErr]=useState('')

  const showTB0=(parseInt(s1p1)===7&&parseInt(s1p2)===6)||(parseInt(s1p1)===6&&parseInt(s1p2)===7)
  const showTB1=(parseInt(s2p1)===7&&parseInt(s2p2)===6)||(parseInt(s2p1)===6&&parseInt(s2p2)===7)
  const prosetTarget=rainDay?6:8

  function buildAndSave(winnerSeed) {
    let builtScores
    if (isProset||forceProset) {
      const v1=parseInt(psV1),v2=parseInt(psV2)
      if(isNaN(v1)||isNaN(v2)){setErr('Enter game counts.');return}
      if(!vProset(v1,v2,rainDay)){setErr(`Proset: first to ${prosetTarget}, win by 2.`);return}
      builtScores={p1sets:[v1],p2sets:[v2],proset:true}
    } else {
      const a1=parseInt(s1p1),b1=parseInt(s1p2),a2=parseInt(s2p1),b2=parseInt(s2p2)
      const a3=s3p1!==''?parseInt(s3p1):null,b3=s3p2!==''?parseInt(s3p2):null
      const has3=a3!==null&&b3!==null
      if(isNaN(a1)||isNaN(b1)){setErr('Enter Set 1 scores.');return}
      if(!vSet(a1,b1)){setErr('Set 1 invalid (e.g. 6–4, 7–5, 7–6).');return}
      if(isNaN(a2)||isNaN(b2)){setErr('Enter Set 2 scores.');return}
      if(!vSet(a2,b2)){setErr('Set 2 invalid.');return}
      if(has3){
        if((a1>b1?1:2)===(a2>b2?1:2)){setErr('Sets not split — no super tiebreak needed.');return}
        if(!vSTB(a3,b3)){setErr('Super tiebreak: first to 10, win by 2.');return}
      }
      const p1s=[a1,a2],p2s=[b1,b2],tb1={},tb2={}
      if(has3){p1s.push(a3);p2s.push(b3)}
      if(showTB0&&tb1_0!=='')tb1[0]=parseInt(tb1_0)
      if(showTB0&&tb2_0!=='')tb2[0]=parseInt(tb2_0)
      if(showTB1&&tb1_1!=='')tb1[1]=parseInt(tb1_1)
      if(showTB1&&tb2_1!=='')tb2[1]=parseInt(tb2_1)
      builtScores={p1sets:p1s,p2sets:p2s,tb1,tb2}
    }
    onSaveScores(localId,builtScores,isProset||forceProset)
    if(winnerSeed!==undefined) onAdvance(localId,winnerSeed)
    onClose()
  }

  const inp={width:52,fontSize:15,textAlign:'center',border:'1px solid #ddd',borderRadius:6,padding:'5px 4px',background:'white',color:'#1a1a1a',fontFamily:'inherit'}
  const tbInp={width:44,fontSize:13,textAlign:'center',border:'1px solid #ddd',borderRadius:6,padding:4,background:'white',color:'#888',fontFamily:'inherit'}
  const num=getMatchNum(flight.flightIdx,localId)

  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:4,color:'#1a1a1a'}}>Match {num} — {FLIGHT_NAMES[flight.flightIdx]}</h3>
        <p style={{fontSize:12,color:'#aaa',marginBottom:12}}>({p1?.seed}) {p1?.name}{!isDoubles?` · ${p1?.school}`:''} vs ({p2?.seed}) {p2?.name}{!isDoubles?` · ${p2?.school}`:''}</p>

        {rainDay&&<div style={{fontSize:12,color:rainBlue,background:rainBlueBg,border:`1px solid ${rainBlueBorder}`,borderRadius:6,padding:'6px 10px',marginBottom:12}}>🌧 Rain day — {prosetTarget}-game proset</div>}

        {forceProset ? (
          <p style={{fontSize:12,color:'#aaa',marginBottom:14}}>{isDoubles?'Doubles matches are':'This match is a'} {prosetTarget}-game proset.</p>
        ) : (
          <label style={{display:'flex',alignItems:'center',gap:8,marginBottom:14,fontSize:13,color:'#666',cursor:'pointer'}}>
            <input type="checkbox" checked={isProset} onChange={e=>setIsProset(e.target.checked)}/>
            Switch to proset (rain/indoor)
          </label>
        )}

        {(isProset||forceProset) ? (
          <table style={{width:'100%',borderCollapse:'collapse',marginBottom:8}}>
            <thead><tr>
              <th style={{fontSize:11,color:'#aaa',textAlign:'left',padding:'4px 6px'}}>{isDoubles?'Team':'Player'}</th>
              <th style={{fontSize:11,color:'#aaa',padding:'4px 6px'}}>Games</th>
            </tr></thead>
            <tbody>{[p1,p2].map((p,i)=>(
              <tr key={i}>
                <td style={{fontSize:12,padding:'5px 6px',color:'#1a1a1a'}}><span style={{fontSize:10,color:'#aaa',marginRight:4}}>({p?.seed})</span>{p?.name}{!isDoubles&&<span style={{fontSize:10,color:'#bbb',display:'block'}}>{p?.school}</span>}</td>
                <td style={{padding:'5px 6px'}}><input type="number" min={0} max={99} style={inp} value={i===0?psV1:psV2} onChange={e=>i===0?setPsV1(e.target.value):setPsV2(e.target.value)}/></td>
              </tr>
            ))}</tbody>
          </table>
        ) : (
          <>
            <table style={{width:'100%',borderCollapse:'collapse',marginBottom:8}}>
              <thead><tr>
                <th style={{fontSize:11,color:'#aaa',textAlign:'left',padding:'4px 6px'}}>Player</th>
                <th style={{fontSize:11,color:'#aaa',padding:'4px 6px'}}>Set 1</th>
                <th style={{fontSize:10,color:'#ccc',padding:'4px 4px'}}>TB</th>
                <th style={{fontSize:11,color:'#aaa',padding:'4px 6px'}}>Set 2</th>
                <th style={{fontSize:10,color:'#ccc',padding:'4px 4px'}}>TB</th>
                <th style={{fontSize:11,color:'#aaa',padding:'4px 6px',textAlign:'center'}}>Set 3<br/><span style={{fontSize:9,color:'#ccc'}}>super TB</span></th>
              </tr></thead>
              <tbody>{[p1,p2].map((p,pi)=>(
                <tr key={pi}>
                  <td style={{fontSize:12,padding:'5px 6px',color:'#1a1a1a'}}><span style={{fontSize:10,color:'#aaa',marginRight:4}}>({p?.seed})</span>{p?.name}<span style={{fontSize:10,color:'#bbb',display:'block'}}>{p?.school}</span></td>
                  <td style={{padding:'4px 4px'}}><input type="number" min={0} max={7} style={inp} value={pi===0?s1p1:s1p2} onChange={e=>pi===0?setS1p1(e.target.value):setS1p2(e.target.value)}/></td>
                  <td style={{padding:'4px 2px'}}>{showTB0&&<input type="number" min={0} max={99} style={tbInp} placeholder="–" value={pi===0?tb1_0:tb2_0} onChange={e=>pi===0?setTb1_0(e.target.value):setTb2_0(e.target.value)}/>}</td>
                  <td style={{padding:'4px 4px'}}><input type="number" min={0} max={7} style={inp} value={pi===0?s2p1:s2p2} onChange={e=>pi===0?setS2p1(e.target.value):setS2p2(e.target.value)}/></td>
                  <td style={{padding:'4px 2px'}}>{showTB1&&<input type="number" min={0} max={99} style={tbInp} placeholder="–" value={pi===0?tb1_1:tb2_1} onChange={e=>pi===0?setTb1_1(e.target.value):setTb2_1(e.target.value)}/>}</td>
                  <td style={{padding:'4px 4px'}}><input type="number" min={0} max={99} style={inp} value={pi===0?s3p1:s3p2} onChange={e=>pi===0?setS3p1(e.target.value):setS3p2(e.target.value)}/></td>
                </tr>
              ))}</tbody>
            </table>
            <p style={{fontSize:10,color:'#bbb',marginBottom:8}}>TB columns appear on a 7–6 set. Enter the loser's tiebreak score. Set 3 is a super tiebreak (first to 10, win by 2).</p>
          </>
        )}

        {err&&<p style={{fontSize:11,color:'#c0392b',marginBottom:12}}>{err}</p>}
        <hr style={{border:'none',borderTop:'1px solid #f0ebe5',margin:'14px 0'}}/>
        <p style={{fontSize:13,fontWeight:600,color:'#aaa',marginBottom:8}}>Confirm winner</p>
        <div style={{display:'flex',gap:8,marginBottom:16,flexWrap:'wrap'}}>
          {[p1,p2].map((p,idx)=>(
            <button key={idx} style={{flex:1,minWidth:130,padding:'10px 8px',fontSize:13,cursor:'pointer',border:'1px solid #ddd',borderRadius:8,background:'#fafafa',color:'#333',textAlign:'center',lineHeight:1.5,fontFamily:'inherit'}}
              onClick={()=>buildAndSave(idx===0?m.p1:m.p2)}>
              <div style={{fontWeight:600}}>{p?.name}</div>
              {!isDoubles&&<div style={{fontSize:11,color:'#aaa'}}>{p?.school}</div>}
            </button>
          ))}
        </div>
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button style={{fontSize:13,padding:'7px 16px',cursor:'pointer',borderRadius:8,border:'1px solid #ddd',background:'transparent',fontFamily:'inherit'}} onClick={()=>buildAndSave()}>Save scores only</button>
          <button style={{fontSize:13,padding:'7px 16px',cursor:'pointer',borderRadius:8,border:'1px solid #ddd',background:'transparent',fontFamily:'inherit'}} onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  )
}

// ── Edit Warning ──────────────────────────────────────────────────────────────
function EditWarning({ flight, localId, onClose, onConfirm }) {
  const affected=collectDownstream(localId).filter(id=>flight.matches[id]?.winner)
  const num=getMatchNum(flight.flightIdx,localId)
  return (
    <div style={S.modalBg} onClick={onClose}>
      <div style={S.modal} onClick={e=>e.stopPropagation()}>
        <h3 style={{fontSize:17,fontWeight:700,marginBottom:12,color:'#1a1a1a'}}>Edit Match {num}</h3>
        {affected.length>0?(
          <div style={S.warnBox}><strong>Warning:</strong> Editing this match will clear {affected.map(id=>`Match ${getMatchNum(flight.flightIdx,id)}`).join(', ')}. Those results will need to be re-entered.</div>
        ):<p style={{fontSize:13,color:'#aaa',marginBottom:16}}>No downstream matches played yet. Safe to re-enter.</p>}
        <div style={{display:'flex',gap:8,justifyContent:'flex-end'}}>
          <button style={{fontSize:13,padding:'7px 16px',cursor:'pointer',borderRadius:8,border:'1px solid #ddd',background:'transparent',fontFamily:'inherit'}} onClick={onClose}>Cancel</button>
          <button style={{fontSize:13,padding:'7px 16px',cursor:'pointer',borderRadius:8,border:'1px solid #D85A30',color:'#D85A30',background:'transparent',fontFamily:'inherit'}} onClick={onConfirm}>
            {affected.length>0?'Clear & re-enter':'Re-enter result'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ── Flight View ───────────────────────────────────────────────────────────────
function FlightView({ flight, isAdmin, rainDay, onUpdate }) {
  const [modal,setModal]=useState(null)
  const isDoubles=flight.isDoubles

  function handleAdvance(localId,winnerSeed) {
    const next=JSON.parse(JSON.stringify(flight))
    const m=next.matches[localId]
    const loserSeed=winnerSeed===m.p1?m.p2:m.p1
    m.winner=winnerSeed;m.loser=loserSeed
    function place(mid,seed){const nm=next.matches[mid];if(!nm.p1)nm.p1=seed;else nm.p2=seed}
    if(localId===1){next.matches[4].p2=winnerSeed;next.matches[7].p1=loserSeed}
    else if(localId===2){place(5,winnerSeed);next.matches[6].p1=loserSeed}
    else if(localId===3){place(5,winnerSeed);next.matches[6].p2=loserSeed}
    else if(localId===4){next.matches[10].p1=winnerSeed;next.matches[8].p1=loserSeed}
    else if(localId===5){next.matches[10].p2=winnerSeed;next.matches[7].p2=loserSeed}
    else if(localId===6){next.matches[8].p2=winnerSeed}
    else if(localId===7){place(9,winnerSeed)}
    else if(localId===8){place(9,winnerSeed)}
    next.points=recomputePoints(next)
    onUpdate(next)
  }

  function handleSaveScores(localId,scores,proset) {
    const next=JSON.parse(JSON.stringify(flight))
    next.matches[localId].scores=scores;next.matches[localId].proset=proset
    onUpdate(next)
  }

  function confirmEdit(localId) {
    const next=JSON.parse(JSON.stringify(flight))
    collectDownstream(localId).forEach(id=>{
      const fs=FIXED[id]
      next.matches[id]={...next.matches[id],p1:fs.p1,p2:fs.p2,winner:null,loser:null,scores:null,proset:rainDay?true:isProsetMatch(flight.flightIdx,id)}
    })
    next.points=recomputePoints(next)
    onUpdate(next)
    setModal({type:'score',localId})
  }

  function mkCard(id) {
    return <MatchCard key={id} flight={flight} localId={id} isAdmin={isAdmin} rainDay={rainDay}
      onOpen={id=>setModal({type:'score',localId:id})} onEdit={id=>setModal({type:'edit',localId:id})}/>
  }

  const pts=flight.points||{}
  const sortedSeeds=Object.keys(pts).sort((a,b)=>pts[b]-pts[a])

  return (
    <div>
      {isAdmin&&<button style={S.resetBtn} onClick={()=>{if(confirm('Reset this flight? All results will be cleared.')){const f=emptyFlight(flight.flightIdx,rainDay);f.players=flight.players;onUpdate(f)}}}>Reset flight</button>}
      {rainDay&&<div style={{...S.rainBanner,marginTop:8}}><div style={{flex:1}}><div style={S.rainBannerTitle}>🌧 Rain day mode</div><div style={S.rainBannerSub}>All matches are 6-game prosets</div></div></div>}
      {isDoubles&&!rainDay&&<p style={{fontSize:12,color:'#aaa',marginBottom:12}}>All doubles matches are 8-game prosets.</p>}

      {!rainDay&&!isDoubles&&<p style={{fontSize:11,color:'#aaa',marginBottom:16}}>
        <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:'#E8F0FB',color:'#185FA5',textTransform:'uppercase',marginRight:4}}>proset</span>= 8-game proset &nbsp;
        <span style={{fontSize:9,fontWeight:600,padding:'1px 5px',borderRadius:3,background:'#F0EBE3',color:'#8B6914',textTransform:'uppercase',marginRight:4}}>B3</span>= best of 3 sets
      </p>}

      <div style={{...S.sectionHead,marginBottom:12}}>Winners bracket</div>
      <div style={S.bracketWrap}>
        <div style={{...S.round,gap:10}}><div style={S.roundLabel}>Round 1</div>{[1,2,3].map(id=>mkCard(id))}</div>
        <VConn n={3}/>
        <div style={{...S.round,justifyContent:'space-around',gap:12,paddingTop:28}}><div style={S.roundLabel}>Semifinals</div>{[4,5].map(id=>mkCard(id))}</div>
        <VConn n={2}/>
        <div style={{...S.round,justifyContent:'center',paddingTop:28}}><div style={S.roundLabel}>Final</div>{mkCard(10)}</div>
      </div>

      <div style={{...S.sectionHead,marginBottom:12}}>Consolation bracket</div>
      <div style={S.bracketWrap}>
        <div style={{...S.round,justifyContent:'flex-start',gap:8}}><div style={S.roundLabel}>Play-in</div>{mkCard(6)}<div style={{flex:1}}/></div>
        <div style={{display:'flex',flexDirection:'column',width:32,alignSelf:'stretch'}}><div style={{flex:1,borderRight:'1px solid #e8e0d5',borderBottom:'1px solid #e8e0d5'}}/><div style={{flex:3}}/></div>
        <div style={{...S.round,justifyContent:'space-between',gap:12}}><div style={S.roundLabel}>Semifinals</div>{mkCard(8)}{mkCard(7)}</div>
        <VConn n={2}/>
        <div style={{...S.round,justifyContent:'center'}}><div style={S.roundLabel}>Final</div>{mkCard(9)}</div>
      </div>

      <div style={{...S.sectionHead,marginBottom:12}}>Points</div>
      <div style={{display:'flex',flexWrap:'wrap',gap:8,marginBottom:24}}>
        {sortedSeeds.map(s=>{
          const p=flight.players[s];if(!p)return null
          return <div key={s} style={S.ptsCard}>
            <div style={S.ptsName}>({p.seed}) {p.name}</div>
            {!isDoubles&&<div style={S.ptsSchool}>{p.school}</div>}
            <div style={S.ptsVal}>{(pts[s]||0).toFixed(1)}</div>
          </div>
        })}
      </div>

      {modal?.type==='score'&&<ScoreModal flight={flight} localId={modal.localId} rainDay={rainDay} onClose={()=>setModal(null)} onAdvance={handleAdvance} onSaveScores={handleSaveScores}/>}
      {modal?.type==='edit'&&<EditWarning flight={flight} localId={modal.localId} onClose={()=>setModal(null)} onConfirm={()=>confirmEdit(modal.localId)}/>}
    </div>
  )
}

// ── Order of Play ─────────────────────────────────────────────────────────────
function OrderOfPlay({ flights, inProgress, setInProgress, rainDay, isAdmin, onRainToggle }) {
  if (!flights.some(f=>f)) return <p style={{fontSize:13,color:'#bbb',fontStyle:'italic',marginTop:16}}>Generate brackets in Setup to see the order of play.</p>

  const times=rainDay?RAIN_TIMES:NORMAL_TIMES

  function getStatus(f,lid) {
    const fl=flights[f];if(!fl)return'waiting'
    const m=fl.matches[lid]
    if(m?.winner)return'complete'
    if(inProgress.has(`${f}-${lid}`))return'inprogress'
    if(m?.p1&&m?.p2&&!m?.winner)return'ready'
    return'waiting'
  }
  function getPlayers(f,lid) {
    const fl=flights[f];if(!fl)return'—'
    const m=fl.matches[lid],p=fl.players
    return`${m?.p1?p[m.p1]?.name:'TBD'} vs ${m?.p2?p[m.p2]?.name:'TBD'}`
  }
  function getScore(f,lid) {
    const fl=flights[f];if(!fl)return''
    const m=fl.matches[lid];if(!m?.winner||!m?.scores)return''
    return fmtScore(m.scores,m.proset,m.winner===m.p1?1:2)
  }
  function toggle(f,lid) {
    const key=`${f}-${lid}`;const next=new Set(inProgress)
    if(next.has(key))next.delete(key);else next.add(key)
    setInProgress(next)
  }

  function OOPRow({f,lid,isDoubles}) {
    const status=getStatus(f,lid)
    const rowStyle=status==='inprogress'?S.oopMatchIP:status==='complete'?S.oopMatchDone:status==='waiting'?S.oopMatchWait:S.oopMatch
    const statusStyle=status==='complete'?S.oopStatusDone:status==='inprogress'?S.oopStatusIP:status==='ready'?S.oopStatusReady:S.oopStatusWait
    const label=status==='complete'?'✓ Done':status==='inprogress'?'● On court':status==='ready'?'Start':'Waiting'
    return (
      <div style={rowStyle}>
        <div style={isDoubles?S.oopNumD:S.oopNum}>{getMatchNum(f,lid)}</div>
        <div style={isDoubles?S.oopFlightD:S.oopFlight}>{FLIGHT_NAMES[f]}</div>
        <div style={S.oopPlayers}>{getPlayers(f,lid)}</div>
        <div style={S.oopScore}>{getScore(f,lid)}</div>
        <button style={statusStyle} onClick={()=>(status==='ready'||status==='inprogress')&&toggle(f,lid)}>{label}</button>
      </div>
    )
  }

  return (
    <div>
      {/* Rain day toggle — admin only */}
      {isAdmin && (
        <div style={{display:'flex',alignItems:'center',gap:12,marginBottom:20,padding:'12px 16px',background:'white',borderRadius:10,border:'1px solid #ece8e3'}}>
          <div style={{flex:1}}>
            <div style={{fontSize:13,fontWeight:600,color:'#1a1a1a',marginBottom:2}}>Rain day mode</div>
            <div style={{fontSize:11,color:'#aaa'}}>Singles only · 6-game prosets · Adjusted schedule</div>
          </div>
          <button style={rainDay?S.rainToggleBtn:S.rainToggleBtnOff} onClick={onRainToggle}>
            {rainDay?'🌧 Rain day ON':'☀️ Normal day'}
          </button>
        </div>
      )}

      {rainDay&&(
        <div style={{...S.rainBanner,marginBottom:20}}>
          <div style={{fontSize:24,flexShrink:0}}>🌧</div>
          <div>
            <div style={S.rainBannerTitle}>Rain day — Indoor format</div>
            <div style={S.rainBannerSub}>Singles only · All matches are 6-game prosets · Doubles postponed · Est. finish 3:30 PM</div>
          </div>
        </div>
      )}

      <div style={{...S.sectionHead,marginBottom:14,marginTop:4}}>
        {rainDay?'Singles — Matches 1–40 (Rain day)':'Singles — Matches 1–40'}
      </div>

      {SINGLES_ROUNDS.map((round,ri)=>(
        <div key={round.label} style={{marginBottom:20}}>
          <div style={rainDay?S.oopRoundHeaderRain:S.oopRoundHeader}>
            <span>
              {round.label}
              <span style={rainDay?S.oopRoundTimeRain:S.oopRoundTime}>{times[ri]}</span>
            </span>
            <span style={S.oopRoundSub}>
              {ri===0?`12 matches — 3 courts per flight`:
               ri===1?'Semifinals & consolation play-ins':
               ri===2?'Consolation semifinals & winners finals':
               'Consolation finals'}
            </span>
          </div>
          {round.matches.map(([f,lid])=><OOPRow key={`${f}-${lid}`} f={f} lid={lid} isDoubles={false}/>)}
        </div>
      ))}

      {!rainDay&&(
        <>
          <div style={{...S.sectionHeadBlue,marginBottom:14,marginTop:8}}>Doubles — Matches D1–D10</div>
          {DOUBLES_ROUNDS.map((round,ri)=>(
            <div key={round.label} style={{marginBottom:20}}>
              <div style={S.oopDoublesHeader}>
                <span>{round.label}<span style={{fontSize:12,fontWeight:700,color:'#185FA5',marginLeft:8}}>{times[ri]}</span></span>
              </div>
              {round.matches.map(([f,lid])=><OOPRow key={`${f}-${lid}`} f={f} lid={lid} isDoubles={true}/>)}
            </div>
          ))}
        </>
      )}

      {rainDay&&(
        <div style={{padding:'16px',background:'#fafaf8',borderRadius:10,border:'1px solid #ece8e3',textAlign:'center'}}>
          <div style={{fontSize:14,color:'#aaa',marginBottom:4}}>☂️ Doubles postponed</div>
          <div style={{fontSize:12,color:'#bbb'}}>Doubles matches will be rescheduled. Contact your league coordinator.</div>
        </div>
      )}
    </div>
  )
}

// ── Setup View ────────────────────────────────────────────────────────────────
function SetupView({ onGenerate }) {
  const [entries,setEntries]=useState(()=>{const e={};for(let f=0;f<5;f++){e[f]={};for(let s=1;s<=7;s++)e[f][s]={name:'',school:''}};return e})
  const [err,setErr]=useState('')

  function getDups(f){const c={};for(let s=1;s<=7;s++){const sc=entries[f][s].school;if(sc)c[sc]=(c[sc]||0)+1};return c}

  function generate(){
    setErr('')
    const fls=[]
    for(let f=0;f<5;f++){
      const isDoubles=f===4,used=new Set(),players={}
      for(let s=1;s<=7;s++){
        const{name,school}=entries[f][s]
        if(!school){setErr(`Assign all schools in ${FLIGHT_NAMES[f]}.`);return}
        if(!isDoubles&&!name.trim()){setErr(`Enter all player names in ${FLIGHT_NAMES[f]}.`);return}
        if(used.has(school)){setErr(`${school} appears more than once in ${FLIGHT_NAMES[f]}.`);return}
        used.add(school)
        players[s]={seed:s,name:isDoubles?school:name.trim(),school}
      }
      const fl=emptyFlight(f,false)
      fl.players=players
      fls.push(fl)
    }
    onGenerate(fls)
  }

  function setEntry(f,s,field,val){setEntries(prev=>({...prev,[f]:{...prev[f],[s]:{...prev[f][s],[field]:val}}}))}

  return (
    <div>
      <div style={S.pageTitle}>Assign seeds for each flight</div>
      <div style={S.pageSub}>Singles: enter each player's name and school. Doubles: select school only.</div>
      <div style={S.setupGrid}>
        {[0,1,2,3,4].map(f=>{
          const isDoubles=f===4,dups=getDups(f)
          const badge=isDoubles?'D1–D10':`${f*10+1}–${f*10+10}`
          return (
            <div key={f} style={S.setupFlight}>
              <div style={S.flightTitleRow}>
                <span style={{fontSize:13,fontWeight:600,color:'#1a1a1a'}}>{FLIGHT_NAMES[f]}</span>
                <span style={S.flightBadge}>{badge}</span>
              </div>
              {[1,2,3,4,5,6,7].map(s=>{
                const{name,school}=entries[f][s],isDup=school&&dups[school]>1
                return (
                  <div key={s} style={S.seedBlock}>
                    <div style={S.seedHeader}>Seed {s}</div>
                    {!isDoubles&&<><div style={S.fieldLabel}>Player name</div>
                    <input type="text" style={S.textInput} placeholder="e.g. Smith, John" value={name} onChange={e=>setEntry(f,s,'name',e.target.value)}/></>}
                    <div style={S.fieldLabel}>School</div>
                    <select style={isDup?S.selectDup:S.select} value={school} onChange={e=>setEntry(f,s,'school',e.target.value)}>
                      <option value="">— select school —</option>
                      {SCHOOLS.map(sc=><option key={sc} value={sc}>{sc}</option>)}
                    </select>
                    {isDup&&<div style={S.dupMsg}>Already selected in this flight</div>}
                  </div>
                )
              })}
            </div>
          )
        })}
      </div>
      <button style={S.genBtn} onClick={generate}>Generate brackets →</button>
      {err&&<p style={{fontSize:12,color:'#c0392b',marginTop:10}}>{err}</p>}
    </div>
  )
}

// ── Leaderboard ───────────────────────────────────────────────────────────────
function Leaderboard({ flights, rainDay }) {
  const totals={},breakdown={}
  SCHOOLS.forEach(sch=>{totals[sch]=0;breakdown[sch]={}})
  flights.forEach((fl,fi)=>{
    if(!fl||( rainDay&&fi===4))return
    const pts=fl.points||{}
    for(let s=1;s<=7;s++){
      const p=fl.players[s];if(!p?.school)continue
      totals[p.school]=(totals[p.school]||0)+(pts[s]||0)
      breakdown[p.school][FLIGHT_NAMES[fi]]=pts[s]||0
    }
  })
  const sorted=SCHOOLS.slice().sort((a,b)=>totals[b]-totals[a])
  const rankColors=['#B8860B','#888780','#854F0B']

  return (
    <div>
      <div style={S.pageTitle}>Team standings</div>
      <div style={S.pageSub}>{rainDay?'Singles flights only (rain day — doubles postponed)':'Total points across all 5 flights.'}</div>
      {sorted.map((sch,i)=>{
        const bd=Object.entries(breakdown[sch]||{}).map(([fn,pts])=>`${fn}: ${pts.toFixed(1)}`).join(' · ')||'No results yet'
        return (
          <div key={sch} style={{...S.lbCard,borderLeft:i<3?`4px solid ${rankColors[i]}`:undefined}}>
            <div style={{...S.lbRank,color:i<3?rankColors[i]:'#ddd'}}>{i+1}</div>
            <div style={{flex:1}}><div style={S.lbName}>{sch}</div><div style={S.lbBd}>{bd}</div></div>
            <div style={S.lbPts}>{totals[sch].toFixed(1)}</div>
          </div>
        )
      })}
    </div>
  )
}

// ── Admin Login ───────────────────────────────────────────────────────────────
function AdminLogin({ onLogin }) {
  const [pw,setPw]=useState('')
  const [err,setErr]=useState('')
  function attempt(){if(pw===ADMIN_PASSWORD){onLogin()}else{setErr('Incorrect password.')}}
  return (
    <div style={S.lockBox}>
      <MapleLeaf size={56}/>
      <h2 style={{fontSize:20,fontWeight:700,margin:'12px 0 4px',color:'#1a1a1a'}}>Coach login</h2>
      <p style={{fontSize:13,color:'#aaa',marginBottom:20}}>Enter the password to enter scores.</p>
      <input type="password" placeholder="Password" style={{...S.textInput,marginBottom:12,textAlign:'center'}}
        value={pw} onChange={e=>setPw(e.target.value)} onKeyDown={e=>e.key==='Enter'&&attempt()}/>
      <button style={{...S.genBtn,width:'100%'}} onClick={attempt}>Sign in</button>
      {err&&<p style={{fontSize:12,color:'#c0392b',marginTop:10}}>{err}</p>}
    </div>
  )
}

// ── Main App ──────────────────────────────────────────────────────────────────
export default function App() {
  const [tab,setTab]=useState('setup')
  const [flights,setFlights]=useState([null,null,null,null,null])
  const [generated,setGenerated]=useState(false)
  const [isAdmin,setIsAdmin]=useState(false)
  const [showLogin,setShowLogin]=useState(false)
  const [loading,setLoading]=useState(true)
  const [inProgress,setInProgress]=useState(new Set())
  const [rainDay,setRainDay]=useState(false)

  useEffect(()=>{
    async function load(){
      const{data}=await supabase.from('tournament_state').select('*').eq('id',1).single()
      if(data?.state){
        const s=data.state
        const fls=(s.flights||[null,null,null,null,null]).map((fl,i)=>fl?{...fl,flightIdx:i,isDoubles:i===4}:null)
        setFlights(fls)
        setGenerated(s.generated||false)
        setRainDay(s.rainDay||false)
        if(s.generated)setTab('oop')
      }
      setLoading(false)
    }
    load()
    const channel=supabase.channel('tournament')
      .on('postgres_changes',{event:'UPDATE',schema:'public',table:'tournament_state'},payload=>{
        const s=payload.new.state
        const fls=(s.flights||[null,null,null,null,null]).map((fl,i)=>fl?{...fl,flightIdx:i,isDoubles:i===4}:null)
        setFlights(fls)
        setGenerated(s.generated||false)
        setRainDay(s.rainDay||false)
      }).subscribe()
    return()=>supabase.removeChannel(channel)
  },[])

  const saveState=useCallback(async(newFlights,newGenerated,newRainDay)=>{
    await supabase.from('tournament_state').upsert({id:1,state:{flights:newFlights,generated:newGenerated,rainDay:newRainDay}})
  },[])

  function handleGenerate(newFlights){
    setFlights(newFlights);setGenerated(true);setTab('oop')
    saveState(newFlights,true,rainDay)
  }

  function handleFlightUpdate(fi,updatedFlight){
    const next=[...flights];next[fi]=updatedFlight;setFlights(next)
    saveState(next,generated,rainDay)
  }

  function handleRainToggle(){
    if(!confirm(rainDay?'Switch back to normal day? This will restore standard match formats and timing.':'Switch to rain day mode? This will hide doubles and switch all matches to 6-game prosets.'))return
    const newRain=!rainDay
    setRainDay(newRain)
    saveState(flights,generated,newRain)
  }

  const TABS=[
    {id:'setup',label:'Setup'},
    {id:'oop',label:'Order of Play'},
    {id:'f0',label:'Singles #1'},
    {id:'f1',label:'Singles #2'},
    {id:'f2',label:'Singles #3'},
    {id:'f3',label:'Singles #4'},
    ...(!rainDay?[{id:'f4',label:'Doubles'}]:[]),
    {id:'team',label:'Team Scores'},
  ]

  if(loading) return <div style={{display:'flex',alignItems:'center',justifyContent:'center',height:'60vh'}}><p style={{color:'#aaa',fontSize:16}}>Loading tournament...</p></div>

  return (
    <div style={S.appWrap}>
      {isAdmin&&(
        <div style={S.adminBar}>
          <div style={S.adminDot}/>
          <span>Admin mode — scores can be edited</span>
          {rainDay&&<span style={{marginLeft:8,background:'#1a5276',padding:'2px 8px',borderRadius:4,fontSize:11}}>🌧 Rain day active</span>}
          <button style={{marginLeft:'auto',fontSize:12,padding:'4px 10px',cursor:'pointer',border:'1px solid #555',borderRadius:6,background:'transparent',color:'white',fontFamily:'inherit'}} onClick={()=>setIsAdmin(false)}>Sign out</button>
        </div>
      )}

      <div style={{...S.header,background:rainDay?'linear-gradient(135deg, #1a2a3a 0%, #1a3a5a 60%, #0f2030 100%)':'linear-gradient(135deg, #1a1a1a 0%, #2d1a0a 60%, #1a0f05 100%)'}}>
        <div style={S.headerInner}>
          <MapleLeaf size={64}/>
          <div>
            <div style={S.headerTitle}>MAPL Boys' Tennis</div>
            <div style={S.headerSub}>Mid-Atlantic Prep League</div>
            <div style={S.headerSchools}>Lawrenceville · Peddie · Blair · Mercersburg · Hill · Hun · Pennington</div>
          </div>
          {!isAdmin&&<button style={{marginLeft:'auto',fontSize:12,padding:'7px 14px',cursor:'pointer',border:'1px solid rgba(255,255,255,0.25)',borderRadius:8,background:'transparent',color:'rgba(255,255,255,0.75)',fontFamily:'inherit'}} onClick={()=>setShowLogin(true)}>Coach login</button>}
        </div>
      </div>
      <div style={rainDay?S.rainBar:S.copperBar}/>

      <div style={S.tabsWrap}>
        <div style={S.tabsInner}>
          {TABS.map(t=>(
            <button key={t.id} style={tab===t.id?S.tabActive:S.tab}
              onClick={()=>setTab(t.id)}
              disabled={!generated&&t.id!=='setup'}>
              {t.label}
            </button>
          ))}
        </div>
      </div>

      <div style={S.inner}>
        {tab==='setup'&&<SetupView onGenerate={handleGenerate}/>}
        {tab==='oop'&&<div style={{marginTop:8}}><OrderOfPlay flights={flights} inProgress={inProgress} setInProgress={setInProgress} rainDay={rainDay} isAdmin={isAdmin} onRainToggle={handleRainToggle}/></div>}
        {['f0','f1','f2','f3','f4'].map((t,fi)=>
          tab===t&&flights[fi]?<FlightView key={t} flight={flights[fi]} isAdmin={isAdmin} rainDay={rainDay} onUpdate={f=>handleFlightUpdate(fi,f)}/>:null
        )}
        {tab==='team'&&<Leaderboard flights={flights} rainDay={rainDay}/>}
      </div>

      {showLogin&&(
        <div style={S.modalBg} onClick={()=>setShowLogin(false)}>
          <div onClick={e=>e.stopPropagation()}><AdminLogin onLogin={()=>{setIsAdmin(true);setShowLogin(false)}}/></div>
        </div>
      )}
    </div>
  )
}
