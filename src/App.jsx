import { useState, useRef, useCallback, useMemo } from "react";

const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));
const round2 = (v) => Math.round(v * 100) / 100;
const ceil1 = (v) => Math.ceil(v * 10) / 10;

/* ════════════════════════ ENGINEERING CALCS ════════════════════════ */
function calcSystem(cfg) {
  const { channelLength, shelfCount, levelsPerShelf, channelsPerLevel, firstLevelHeight, levelSpacing, shelfWidth } = cfg;
  const totalChannels = shelfCount * levelsPerShelf * channelsPerLevel;
  const flowPerChannel = clamp(channelLength * 0.5 + 0.5, 1, 4);
  const totalFlow = round2(totalChannels * flowPerChannel);
  const topLevelHeight = round2(firstLevelHeight + (levelsPerShelf - 1) * levelSpacing);
  const slope = round2(clamp((1 / channelLength) * 100, 0.5, 3));
  const channelW = clamp(Math.round(60 + channelLength * 3), 60, 150);
  const channelD = clamp(Math.round(30 + channelLength * 1.5), 30, 80);
  const supplyDia = clamp(Math.round(16 + totalFlow * 0.8), 16, 63);
  const feedDia = clamp(Math.round(12 + flowPerChannel * 3), 12, 25);
  const drainDia = clamp(Math.round(40 + totalFlow * 1.2), 40, 110);
  const pumpHead = round2(topLevelHeight + totalFlow * 0.02 + channelLength * 0.01);
  const pumpWatt = Math.round(pumpHead * totalFlow * 0.18);
  const reservoirL = Math.round(totalFlow * 12 + 20);
  const levelHeights = [];
  for (let i = 0; i < levelsPerShelf; i++) levelHeights.push(round2(firstLevelHeight + i * levelSpacing));
  return { totalChannels, flowPerChannel: round2(flowPerChannel), totalFlow, topLevelHeight, slope, channelW, channelD, supplyDia, feedDia, drainDia, pumpHead, pumpWatt, reservoirL, levelHeights };
}

/* ════════════════════════ BILL OF MATERIALS ════════════════════════ */
function calcBOM(cfg, sys) {
  const { channelLength, shelfCount, levelsPerShelf, channelsPerLevel, shelfWidth } = cfg;
  const totalLevels = shelfCount * levelsPerShelf;
  const totalChannels = sys.totalChannels;

  // distance from riser to furthest shelf center (estimate 0.6m per shelf spacing)
  const shelfSpacingM = shelfWidth / 1000 + 0.15;
  const avgFeedRun = (shelfCount === 1) ? 0.5 : round2((shelfSpacingM * shelfCount) / 2 + 0.3);

  /* ── PIPES / TUBING ── */
  const pipes = [];

  // 1. Supply main riser – vertical PVC
  const riserLen = ceil1(sys.topLevelHeight + 0.3);
  pipes.push({
    id: "P1", cat: "supply",
    name: `PVC Pressure Pipe ø${sys.supplyDia}mm`,
    type: "PVC-U PN10",
    dia: sys.supplyDia,
    length: riserLen,
    qty: shelfCount,
    totalM: ceil1(riserLen * shelfCount),
    note: "Supply riser(s), 1 per shelf column",
    color: "#4a9ade",
  });

  // 2. Feed distribution lines – PE tubing from riser to each channel
  const feedRunPerLevel = ceil1(shelfSpacingM * shelfCount + 0.2);
  pipes.push({
    id: "P2", cat: "supply",
    name: `PE Tubing ø${sys.feedDia}mm`,
    type: "LDPE",
    dia: sys.feedDia,
    length: feedRunPerLevel,
    qty: levelsPerShelf,
    totalM: ceil1(feedRunPerLevel * levelsPerShelf),
    note: "Feed manifold, 1 per level",
    color: "#5aafee",
  });

  // 3. Feed drippers/spurs to individual channels
  const spurLen = 0.15;
  pipes.push({
    id: "P3", cat: "supply",
    name: `PE Micro-tube ø${Math.max(4, sys.feedDia - 8)}mm`,
    type: "LDPE",
    dia: Math.max(4, sys.feedDia - 8),
    length: spurLen,
    qty: totalChannels,
    totalM: ceil1(spurLen * totalChannels),
    note: "Individual channel feed spur",
    color: "#5aafee",
  });

  // 4. NFT Channels
  pipes.push({
    id: "P4", cat: "channel",
    name: `NFT Channel ${sys.channelW}×${sys.channelD}mm`,
    type: channelLength <= 4 ? "PVC-U Flat-bottom Gully" : "Food-grade PP Gully",
    dia: null,
    length: channelLength,
    qty: totalChannels,
    totalM: ceil1(channelLength * totalChannels),
    note: `${sys.channelW}mm W × ${sys.channelD}mm D, ${sys.slope}% slope`,
    color: "#5a8f3c",
  });

  // 5. Drain downpipes – from each shelf column down to collector
  const avgDrainH = ceil1((sys.topLevelHeight + cfg.firstLevelHeight) / 2 + 0.2);
  pipes.push({
    id: "P5", cat: "drain",
    name: `PVC Pipe ø${sys.drainDia}mm`,
    type: "PVC-U DWV",
    dia: sys.drainDia,
    length: avgDrainH,
    qty: shelfCount,
    totalM: ceil1(avgDrainH * shelfCount),
    note: "Drain downpipe, 1 per shelf",
    color: "#c9853a",
  });

  // 6. Drain collector – horizontal along ground
  const collectorLen = ceil1(shelfSpacingM * shelfCount + 0.5);
  pipes.push({
    id: "P6", cat: "drain",
    name: `PVC Pipe ø${sys.drainDia}mm`,
    type: "PVC-U DWV",
    dia: sys.drainDia,
    length: collectorLen,
    qty: 1,
    totalM: collectorLen,
    note: "Horizontal drain collector to reservoir",
    color: "#c9853a",
  });

  // 7. Pump outlet pipe
  pipes.push({
    id: "P7", cat: "supply",
    name: `PVC Pipe ø${sys.supplyDia}mm`,
    type: "PVC-U PN10",
    dia: sys.supplyDia,
    length: 0.4,
    qty: 1,
    totalM: 0.4,
    note: "Pump outlet to riser base",
    color: "#4a9ade",
  });

  /* ── FITTINGS ── */
  const fittings = [];

  // Supply tees on riser (branch off to feed manifold at each level)
  fittings.push({
    id: "F1", cat: "supply",
    name: `PVC Tee ${sys.supplyDia}×${sys.feedDia}mm`,
    type: "PVC Reducing Tee",
    qty: levelsPerShelf * shelfCount,
    note: "On riser, 1 per level per shelf column",
    color: "#4a9ade",
  });

  // End cap on top of each riser
  fittings.push({
    id: "F2", cat: "supply",
    name: `PVC End Cap ø${sys.supplyDia}mm`,
    type: "PVC Socket Cap",
    qty: shelfCount,
    note: "Top of each supply riser",
    color: "#4a9ade",
  });

  // 90° Elbow at pump outlet
  fittings.push({
    id: "F3", cat: "supply",
    name: `PVC Elbow 90° ø${sys.supplyDia}mm`,
    type: "PVC Socket Elbow",
    qty: shelfCount + 1,
    note: "Pump-to-riser turn + riser base bends",
    color: "#4a9ade",
  });

  // Ball valve after pump
  fittings.push({
    id: "F4", cat: "supply",
    name: `Ball Valve ø${sys.supplyDia}mm`,
    type: "PVC True-union Ball Valve",
    qty: 1,
    note: "Main supply shut-off after pump",
    color: "#6bbbee",
  });

  // Non-return (check) valve
  fittings.push({
    id: "F5", cat: "supply",
    name: `Check Valve ø${sys.supplyDia}mm`,
    type: "PVC Swing Check Valve",
    qty: 1,
    note: "Prevents backflow into pump",
    color: "#6bbbee",
  });

  // Feed take-off fittings (barbed tees or punch-in connectors on PE manifold)
  fittings.push({
    id: "F6", cat: "supply",
    name: `Barbed Tee ø${sys.feedDia}×${Math.max(4, sys.feedDia - 8)}mm`,
    type: "PP Barbed Reducing Tee",
    qty: totalChannels,
    note: "1 per channel on feed manifold",
    color: "#5aafee",
  });

  // Feed end plugs (end of each manifold run)
  fittings.push({
    id: "F7", cat: "supply",
    name: `End Plug ø${sys.feedDia}mm`,
    type: "PE End Stop",
    qty: levelsPerShelf,
    note: "End of each feed manifold",
    color: "#5aafee",
  });

  // Channel inlet grommet/bulkhead (where micro-tube enters channel)
  fittings.push({
    id: "F8", cat: "channel",
    name: `Grommet / Bulkhead ø${Math.max(4, sys.feedDia - 8)}mm`,
    type: "Rubber Grommet + Barb",
    qty: totalChannels,
    note: "Channel inlet, 1 per channel",
    color: "#5a8f3c",
  });

  // Channel end caps
  fittings.push({
    id: "F9", cat: "channel",
    name: `Channel End Cap ${sys.channelW}mm`,
    type: "PVC/PP End Cap",
    qty: totalChannels,
    note: "Upstream closed end, 1 per channel",
    color: "#5a8f3c",
  });

  // Channel drain outlet fitting
  fittings.push({
    id: "F10", cat: "drain",
    name: `Channel Drain Outlet ${sys.channelW}→ø40mm`,
    type: "Overflow / Weir outlet",
    qty: totalChannels,
    note: "Downstream drain from each channel",
    color: "#c9853a",
  });

  // Drain collection tee (each channel drain joins shelf downpipe)
  const drainTees = totalChannels;
  fittings.push({
    id: "F11", cat: "drain",
    name: `PVC Tee ø40×40mm`,
    type: "PVC Equal Tee",
    qty: drainTees,
    note: "Channels into shelf drain manifold",
    color: "#c9853a",
  });

  // Drain elbow at bottom of downpipe (turn into collector)
  fittings.push({
    id: "F12", cat: "drain",
    name: `PVC Elbow 90° ø${sys.drainDia}mm`,
    type: "PVC Socket Elbow",
    qty: shelfCount,
    note: "Downpipe-to-collector turn, 1 per shelf",
    color: "#c9853a",
  });

  // Drain collector tees (where downpipes join collector)
  if (shelfCount > 1) {
    fittings.push({
      id: "F13", cat: "drain",
      name: `PVC Tee ø${sys.drainDia}mm`,
      type: "PVC Equal Tee",
      qty: shelfCount - 1,
      note: "Downpipes into drain collector",
      color: "#c9853a",
    });
  }

  // Collector end cap
  fittings.push({
    id: "F14", cat: "drain",
    name: `PVC End Cap ø${sys.drainDia}mm`,
    type: "PVC Socket Cap",
    qty: 1,
    note: "End of drain collector",
    color: "#c9853a",
  });

  /* ── EQUIPMENT ── */
  const equipment = [
    { id: "E1", name: `Submersible Pump ≥${sys.pumpWatt}W`, type: `Head ≥${sys.pumpHead}m, Flow ≥${sys.totalFlow} L/min`, qty: 1, note: "Size for total system flow + 20% margin", color: "#daa040" },
    { id: "E2", name: `Reservoir Tank ≥${sys.reservoirL}L`, type: "HDPE / Food-grade", qty: 1, note: "Opaque, UV-resistant", color: "#4a9ade" },
    { id: "E3", name: "Timer / Controller", type: "Digital Interval Timer", qty: 1, note: "15-min ON / 15-min OFF cycling", color: "#b080d0" },
  ];

  const totalPipeM = round2(pipes.reduce((s, p) => s + p.totalM, 0));
  const totalFittings = fittings.reduce((s, f) => s + f.qty, 0);

  return { pipes, fittings, equipment, totalPipeM, totalFittings };
}

/* ════════════════════════ UI COMPONENTS ════════════════════════ */
function Slider({ label, unit, value, min, max, step, onChange, accent }) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <div style={{ marginBottom: 12 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 3 }}>
        <span style={{ fontSize: 10, color: "#8a9a7c", letterSpacing: 1.1, textTransform: "uppercase", fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>{label}</span>
        <span style={{ fontSize: 14, fontWeight: 700, color: "#e4edd8", fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>
          {value}<span style={{ fontSize: 9, color: "#6b7a5e", marginLeft: 3 }}>{unit}</span>
        </span>
      </div>
      <div style={{ position: "relative", height: 20, display: "flex", alignItems: "center" }}>
        <div style={{ position: "absolute", left: 0, right: 0, height: 3, background: "#1e2a18", borderRadius: 2 }} />
        <div style={{ position: "absolute", left: 0, width: `${pct}%`, height: 3, background: accent || "#5a8f3c", borderRadius: 2, transition: "width .08s" }} />
        <input type="range" min={min} max={max} step={step} value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          style={{ position: "relative", width: "100%", height: 20, WebkitAppearance: "none", appearance: "none", background: "transparent", cursor: "pointer", zIndex: 2 }} />
      </div>
    </div>
  );
}

function Spec({ label, value, unit, color }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", padding: "6px 4px", background: "#0f1a0b", borderRadius: 5, border: `1px solid ${color || "#2a3a22"}`, minWidth: 68 }}>
      <span style={{ fontSize: 8, color: "#5e7050", letterSpacing: 1, textTransform: "uppercase", fontFamily: "'Atkinson Hyperlegible',sans-serif", textAlign: "center" }}>{label}</span>
      <span style={{ fontSize: 14, fontWeight: 800, color: color || "#a4c88e", fontFamily: "'Atkinson Hyperlegible',sans-serif", marginTop: 1 }}>{value}</span>
      <span style={{ fontSize: 8, color: "#4a5c3e", fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>{unit}</span>
    </div>
  );
}

function DimLine({ x1, y1, x2, y2, label, color = "#8a9a7c", side = "left", offset = 0 }) {
  const mx = (x1 + x2) / 2 + offset, my = (y1 + y2) / 2, tk = 5;
  return (
    <g>
      <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={color} strokeWidth={0.8} />
      <line x1={x1 - tk} y1={y1} x2={x1 + tk} y2={y1} stroke={color} strokeWidth={0.8} />
      <line x1={x2 - tk} y1={y2} x2={x2 + tk} y2={y2} stroke={color} strokeWidth={0.8} />
      <polygon points={`${x1},${Math.min(y1,y2)+4} ${x1-2.5},${Math.min(y1,y2)+9} ${x1+2.5},${Math.min(y1,y2)+9}`} fill={color} />
      <polygon points={`${x2},${Math.max(y1,y2)-4} ${x2-2.5},${Math.max(y1,y2)-9} ${x2+2.5},${Math.max(y1,y2)-9}`} fill={color} />
      <text x={mx + (side === "left" ? -6 : 6)} y={my + 3} textAnchor={side === "left" ? "end" : "start"}
        fontSize={9} fill={color} fontFamily="'Atkinson Hyperlegible',sans-serif" fontWeight={600}>{label}</text>
    </g>
  );
}

/* ════════════════════════ ELEVATION VIEW ════════════════════════ */
function ElevationView({ cfg, sys, width = 880, height = 500 }) {
  const { shelfCount, levelsPerShelf, channelsPerLevel, firstLevelHeight, levelSpacing } = cfg;
  const pad = { top: 36, bottom: 50, left: 80, right: 50 };
  const maxRealH = sys.topLevelHeight + 0.4;
  const drawH = height - pad.top - pad.bottom;
  const groundY = pad.top + drawH;
  const toY = (m) => groundY - (m / maxRealH) * drawH;
  const shelfAreaW = width - pad.left - pad.right - 70;
  const shelfW = Math.min(Math.max(shelfAreaW / shelfCount - 14, 46), 160);
  const shelfStartX = pad.left + 50;
  const chH = clamp(10, 4, 14);
  const els = [];

  els.push(<line key="gnd" x1={pad.left-10} y1={groundY} x2={width-pad.right+10} y2={groundY} stroke="#3a5030" strokeWidth={2}/>);
  for (let i=0;i<Math.floor((width-pad.left-pad.right+20)/10);i++)
    els.push(<line key={`gh${i}`} x1={pad.left-10+i*10} y1={groundY+2} x2={pad.left-10+i*10-6} y2={groundY+10} stroke="#2a3a22" strokeWidth={0.7}/>);
  els.push(<text key="g0" x={pad.left-16} y={groundY+4} textAnchor="end" fontSize={9} fill="#5e7050" fontFamily="'Atkinson Hyperlegible',sans-serif">0.00m</text>);

  const resW=46,resDH=Math.max(18,toY(0)-toY(0.25)),resX=pad.left-4;
  els.push(<g key="res"><rect x={resX} y={groundY-resDH} width={resW} height={resDH} rx={4} fill="#1a3a5a" stroke="#3a7aba" strokeWidth={1.2}/><text x={resX+resW/2} y={groundY-resDH/2-3} textAnchor="middle" fontSize={7} fill="#8ac4f0" fontFamily="'Atkinson Hyperlegible',sans-serif">Res.</text><text x={resX+resW/2} y={groundY-resDH/2+8} textAnchor="middle" fontSize={9} fill="#a0d8ff" fontWeight={700} fontFamily="'Atkinson Hyperlegible',sans-serif">{sys.reservoirL}L</text></g>);

  const px=resX+resW+12,py=groundY-resDH/2;
  els.push(<g key="pump"><circle cx={px} cy={py} r={10} fill="#2a5a1a" stroke="#7abc5a" strokeWidth={1.2}/><text x={px} y={py+1} textAnchor="middle" fontSize={5} fill="#d0f0c0" fontFamily="'Atkinson Hyperlegible',sans-serif" fontWeight={700}>PUMP</text><text x={px} y={py+8} textAnchor="middle" fontSize={5} fill="#90c070" fontFamily="'Atkinson Hyperlegible',sans-serif">{sys.pumpWatt}W</text></g>);

  const riserX=px+16,riserTop=toY(sys.topLevelHeight)-10;
  els.push(<g key="riser"><line x1={px+10} y1={py} x2={riserX} y2={py} stroke="#4a9ade" strokeWidth={clamp(sys.supplyDia/10,1.5,3.5)}/><line x1={riserX} y1={py} x2={riserX} y2={riserTop} stroke="#4a9ade" strokeWidth={clamp(sys.supplyDia/10,1.5,3.5)}/><text x={riserX+4} y={riserTop+8} fontSize={7} fill="#4a9ade" fontFamily="'Atkinson Hyperlegible',sans-serif">ø{sys.supplyDia}</text></g>);

  for (let l=0;l<levelsPerShelf;l++){
    const h=sys.levelHeights[l],ly=toY(h),groupH=channelsPerLevel*chH+6;
    els.push(<line key={`ht${l}`} x1={pad.left-16} y1={ly} x2={pad.left-6} y2={ly} stroke="#3a5a2a" strokeWidth={0.7} strokeDasharray="2,2"/>);
    els.push(<text key={`htl${l}`} x={pad.left-18} y={ly+3} textAnchor="end" fontSize={8} fill="#7abc5a" fontFamily="'Atkinson Hyperlegible',sans-serif" fontWeight={600}>{h.toFixed(2)}m</text>);
    els.push(<line key={`gd${l}`} x1={pad.left-6} y1={ly} x2={width-pad.right} y2={ly} stroke="#1e2e16" strokeWidth={0.4} strokeDasharray="4,4"/>);
    for (let s=0;s<shelfCount;s++){
      const sx=shelfStartX+s*(shelfW+14),fy=ly-groupH/2;
      els.push(<rect key={`sf${s}${l}`} x={sx} y={fy} width={shelfW} height={groupH} rx={3} fill="#151f11" stroke="#3a5030" strokeWidth={1}/>);
      for (let c=0;c<channelsPerLevel;c++){
        const cy=fy+3+c*chH;
        els.push(<rect key={`ch${s}${l}${c}`} x={sx+3} y={cy} width={shelfW-6} height={Math.max(chH-2,3)} rx={1.5} fill="#2b5a18" opacity={0.6+c*0.08}/>);
        if(chH>5)els.push(<line key={`fa${s}${l}${c}`} x1={sx+7} y1={cy+(chH-2)/2} x2={sx+shelfW-10} y2={cy+(chH-2)/2} stroke="#7fdc52" strokeWidth={0.5} strokeDasharray="3,2" opacity={0.35}/>);
      }
      els.push(<line key={`fd${s}${l}`} x1={riserX} y1={ly} x2={sx} y2={ly} stroke="#4a9ade" strokeWidth={clamp(sys.feedDia/10,1,2.2)} strokeDasharray="3,2"/>);
      els.push(<polyline key={`dr${s}${l}`} points={`${sx+shelfW},${ly} ${sx+shelfW+5},${ly} ${sx+shelfW+5},${groundY}`} fill="none" stroke="#c9853a" strokeWidth={clamp(sys.drainDia/30,1,2.2)} opacity={0.5}/>);
    }
    els.push(<text key={`lbl${l}`} x={width-pad.right+6} y={ly+3} fontSize={8} fill="#5e7050" fontFamily="'Atkinson Hyperlegible',sans-serif">L{l+1}</text>);
  }
  for (let s=0;s<shelfCount;s++) els.push(<text key={`stl${s}`} x={shelfStartX+s*(shelfW+14)+shelfW/2} y={pad.top-6} textAnchor="middle" fontSize={8} fill="#6b8a56" fontFamily="'Atkinson Hyperlegible',sans-serif">Shelf {s+1}</text>);
  els.push(<line key="drm" x1={resX+resW} y1={groundY-2} x2={shelfStartX+(shelfCount-1)*(shelfW+14)+shelfW+8} y2={groundY-2} stroke="#c9853a" strokeWidth={clamp(sys.drainDia/20,1.5,2.8)} strokeDasharray="5,3"/>);

  const dims=[], dx1=pad.left-54;
  if(levelsPerShelf>=1)dims.push(<DimLine key="df" x1={dx1} y1={groundY} x2={dx1} y2={toY(firstLevelHeight)} label={`${firstLevelHeight.toFixed(2)}m`} color="#e8c45a" side="left" offset={-2}/>);
  if(levelsPerShelf>=2)dims.push(<DimLine key="ds" x1={dx1-20} y1={toY(sys.levelHeights[0])} x2={dx1-20} y2={toY(sys.levelHeights[1])} label={`${levelSpacing.toFixed(2)}m`} color="#e09040" side="left" offset={-2}/>);
  if(levelsPerShelf>=1)dims.push(<DimLine key="dt" x1={width-pad.right+20} y1={groundY} x2={width-pad.right+20} y2={toY(sys.topLevelHeight)} label={`${sys.topLevelHeight.toFixed(2)}m`} color="#b0d090" side="right" offset={2}/>);

  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{background:"#0a1208"}}>
      <text x={width/2} y={16} textAnchor="middle" fontSize={11} fill="#5e7050" fontFamily="'Averia Sans Libre',sans-serif" fontWeight={700} letterSpacing={2}>SIDE ELEVATION — LEVEL DISTRIBUTION</text>
      {els}{dims}
      <g transform={`translate(${pad.left},${height-16})`}>
        <rect x={-2} y={-7} width={8} height={8} rx={1} fill="#e8c45a" opacity={0.7}/><text x={10} y={0} fontSize={7.5} fill="#b0a050" fontFamily="'Atkinson Hyperlegible',sans-serif">1st Level</text>
        <rect x={72} y={-7} width={8} height={8} rx={1} fill="#e09040" opacity={0.7}/><text x={84} y={0} fontSize={7.5} fill="#a07030" fontFamily="'Atkinson Hyperlegible',sans-serif">Spacing</text>
        <line x1={140} y1={-3} x2={152} y2={-3} stroke="#4a9ade" strokeWidth={2}/><text x={156} y={0} fontSize={7.5} fill="#4a7a9a" fontFamily="'Atkinson Hyperlegible',sans-serif">Supply</text>
        <line x1={200} y1={-3} x2={212} y2={-3} stroke="#c9853a" strokeWidth={2} strokeDasharray="3,2"/><text x={216} y={0} fontSize={7.5} fill="#9a7040" fontFamily="'Atkinson Hyperlegible',sans-serif">Drain</text>
        <rect x={260} y={-6} width={12} height={6} rx={1.5} fill="#2b5a18"/><text x={276} y={0} fontSize={7.5} fill="#5a8a3c" fontFamily="'Atkinson Hyperlegible',sans-serif">Channel</text>
      </g>
    </svg>
  );
}

/* ════════════════════════ PLAN VIEW ════════════════════════ */
function PlanView({ cfg, sys, width = 880, height = 500 }) {
  const { shelfCount, levelsPerShelf, channelsPerLevel } = cfg;
  const pad = 32;
  const shelfGap = Math.max(20, (width - pad*2 - 80) / shelfCount);
  const shelfW = Math.min(shelfGap - 14, 180);
  const chH = clamp(8, 4, 12);
  const groupH = channelsPerLevel * chH + 6;
  const levelH = groupH + 10;
  const supplyX = pad + 20;
  const elems = [];
  for (let s=0;s<shelfCount;s++){
    const sx=pad+60+s*shelfGap;
    for (let l=0;l<levelsPerShelf;l++){
      const ly=pad+14+l*levelH;
      elems.push(<rect key={`sf${s}${l}`} x={sx} y={ly} width={shelfW} height={groupH} rx={3} fill="#151f11" stroke="#3a5030" strokeWidth={0.8}/>);
      for (let c=0;c<channelsPerLevel;c++){
        const cy=ly+3+c*chH;
        elems.push(<rect key={`ch${s}${l}${c}`} x={sx+3} y={cy} width={shelfW-6} height={Math.max(chH-2,2)} rx={1.5} fill="#2b5a18" opacity={0.65+c*0.06}/>);
      }
      elems.push(<line key={`fd${s}${l}`} x1={supplyX} y1={ly+groupH/2} x2={sx} y2={ly+groupH/2} stroke="#4a9ade" strokeWidth={1.2} strokeDasharray="3,2"/>);
      elems.push(<text key={`ll${s}${l}`} x={sx-4} y={ly+groupH/2+3} textAnchor="end" fontSize={7} fill="#5e7050" fontFamily="'Atkinson Hyperlegible',sans-serif">{sys.levelHeights[l]?.toFixed(2)}m</text>);
    }
    elems.push(<text key={`stl${s}`} x={sx+shelfW/2} y={pad+6} textAnchor="middle" fontSize={8} fill="#6b8a56" fontFamily="'Atkinson Hyperlegible',sans-serif">Shelf {s+1}</text>);
  }
  elems.push(<line key="riser" x1={supplyX} y1={pad+14+groupH/2} x2={supplyX} y2={pad+14+(levelsPerShelf-1)*levelH+groupH/2} stroke="#4a9ade" strokeWidth={clamp(sys.supplyDia/10,1.5,3.5)}/>);
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox={`0 0 ${width} ${height}`} width="100%" height="100%" style={{background:"#0a1208"}}>
      <text x={width/2} y={14} textAnchor="middle" fontSize={11} fill="#5e7050" fontFamily="'Averia Sans Libre',sans-serif" fontWeight={700} letterSpacing={2}>PLAN VIEW — CHANNEL LAYOUT</text>
      {elems}
    </svg>
  );
}

/* ════════════════════════ BOM VIEW ════════════════════════ */
const catLabel = { supply: "SUPPLY", channel: "CHANNEL", drain: "DRAIN" };
const catColor = { supply: "#4a9ade", channel: "#5a8f3c", drain: "#c9853a" };

function BOMView({ cfg, sys, bom }) {
  const tH = { fontSize: 8, color: "#5e7050", letterSpacing: 1.5, textTransform: "uppercase", fontFamily: "'Atkinson Hyperlegible',sans-serif", padding: "6px 8px", borderBottom: "1px solid #1e2e16", textAlign: "left" };
  const tD = { fontSize: 10, fontFamily: "'Atkinson Hyperlegible',sans-serif", padding: "5px 8px", borderBottom: "1px solid #111d0d", verticalAlign: "top" };

  const renderTable = (title, items, columns) => (
    <div style={{ marginBottom: 20 }}>
      <div style={{ fontSize: 11, color: "#8ab86e", letterSpacing: 2, marginBottom: 6, fontWeight: 700, fontFamily: "'Averia Sans Libre',sans-serif" }}>{title}</div>
      <div style={{ overflowX: "auto" }}>
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
          <thead>
            <tr style={{ background: "#0f1a0b" }}>
              {columns.map((c, i) => <th key={i} style={{ ...tH, textAlign: c.align || "left", minWidth: c.minW || "auto" }}>{c.label}</th>)}
            </tr>
          </thead>
          <tbody>
            {items.map((item, i) => (
              <tr key={i} style={{ background: i % 2 === 0 ? "transparent" : "#0a1208" }}>
                {columns.map((c, j) => {
                  const val = c.render ? c.render(item) : item[c.key];
                  return <td key={j} style={{ ...tD, textAlign: c.align || "left", color: c.color ? (typeof c.color === "function" ? c.color(item) : c.color) : "#c0d8b0" }}>{val}</td>;
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );

  const pipeCols = [
    { label: "#", key: "id", minW: 28, color: "#5e7050" },
    { label: "SYSTEM", render: (r) => <span style={{ color: catColor[r.cat] || "#888", fontSize: 8, letterSpacing: 1 }}>{catLabel[r.cat]}</span>, minW: 50 },
    { label: "PIPE / TUBING", key: "name", minW: 160, color: (r) => r.color || "#c0d8b0" },
    { label: "TYPE", key: "type", minW: 100, color: "#7a9a6c" },
    { label: "QTY", key: "qty", align: "center", minW: 36, color: "#e4edd8" },
    { label: "LENGTH", render: (r) => `${r.length}m`, align: "center", minW: 50 },
    { label: "TOTAL", render: (r) => <span style={{ fontWeight: 700, color: "#e8c45a" }}>{r.totalM}m</span>, align: "center", minW: 50 },
    { label: "NOTES", key: "note", color: "#5e7050", minW: 120 },
  ];

  const fitCols = [
    { label: "#", key: "id", minW: 28, color: "#5e7050" },
    { label: "SYSTEM", render: (r) => <span style={{ color: catColor[r.cat] || "#888", fontSize: 8, letterSpacing: 1 }}>{catLabel[r.cat]}</span>, minW: 50 },
    { label: "FITTING", key: "name", minW: 180, color: (r) => r.color || "#c0d8b0" },
    { label: "TYPE", key: "type", minW: 130, color: "#7a9a6c" },
    { label: "QTY", key: "qty", align: "center", minW: 40, color: "#e4edd8" },
    { label: "NOTES", key: "note", color: "#5e7050", minW: 120 },
  ];

  const eqCols = [
    { label: "#", key: "id", minW: 28, color: "#5e7050" },
    { label: "EQUIPMENT", key: "name", minW: 200, color: (r) => r.color || "#c0d8b0" },
    { label: "SPECIFICATION", key: "type", minW: 180, color: "#7a9a6c" },
    { label: "QTY", key: "qty", align: "center", minW: 40, color: "#e4edd8" },
    { label: "NOTES", key: "note", color: "#5e7050", minW: 140 },
  ];

  return (
    <div style={{ padding: "16px 20px", overflowY: "auto", maxHeight: "100%", background: "#0c1409" }}>
      {/* Summary header */}
      <div style={{ display: "flex", gap: 10, marginBottom: 18, flexWrap: "wrap" }}>
        {[
          { label: "TOTAL PIPE", value: `${bom.totalPipeM}m`, color: "#e8c45a" },
          { label: "TOTAL FITTINGS", value: bom.totalFittings, color: "#c9853a" },
          { label: "PIPE TYPES", value: bom.pipes.length, color: "#4a9ade" },
          { label: "FITTING TYPES", value: bom.fittings.length, color: "#5aafee" },
          { label: "TOTAL CHANNELS", value: sys.totalChannels, color: "#5a8f3c" },
          { label: "TOTAL FLOW", value: `${sys.totalFlow} L/min`, color: "#7abc5a" },
        ].map((s, i) => (
          <div key={i} style={{ padding: "8px 14px", background: "#0f1a0b", borderRadius: 6, border: `1px solid ${s.color}33`, minWidth: 90, textAlign: "center" }}>
            <div style={{ fontSize: 8, color: "#5e7050", letterSpacing: 1.2, marginBottom: 2, fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>{s.label}</div>
            <div style={{ fontSize: 16, fontWeight: 800, color: s.color, fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>{s.value}</div>
          </div>
        ))}
      </div>

      {renderTable("PIPES & TUBING", bom.pipes, pipeCols)}
      {renderTable("FITTINGS & CONNECTORS", bom.fittings, fitCols)}
      {renderTable("EQUIPMENT", bom.equipment, eqCols)}

      <div style={{ marginTop: 12, padding: "10px 14px", background: "#111d0d", borderRadius: 6, border: "1px solid #1e2e16" }}>
        <div style={{ fontSize: 9, color: "#5e7050", letterSpacing: 1, fontFamily: "'Atkinson Hyperlegible',sans-serif", lineHeight: 1.7 }}>
          <strong style={{ color: "#8ab86e" }}>Notes:</strong> Quantities include no waste allowance — add 10–15% for cuts and joins.
          PVC pipes sold in standard lengths (3m or 6m); purchase accordingly.
          PE tubing sold in coils (25m, 50m, 100m).
          Channel dimensions are internal; verify with manufacturer specs.
          All PVC fittings assume solvent-weld joints unless noted. Threaded unions recommended at pump connections for serviceability.
        </div>
      </div>
    </div>
  );
}

/* ════════════════════════ MAIN APP ════════════════════════ */
export default function NFTCalculator() {
  const elevRef = useRef(null);
  const planRef = useRef(null);
  const [cfg, setCfg] = useState({
    channelLength: 3, shelfCount: 3, levelsPerShelf: 4, channelsPerLevel: 3,
    firstLevelHeight: 0.40, levelSpacing: 0.50, shelfWidth: 600,
  });
  const [activeView, setActiveView] = useState("elevation");
  const set = (key) => (v) => setCfg((p) => ({ ...p, [key]: v }));
  const sys = useMemo(() => calcSystem(cfg), [cfg]);
  const bom = useMemo(() => calcBOM(cfg, sys), [cfg, sys]);

  const downloadSVG = useCallback(() => {
    const c = activeView === "elevation" ? elevRef.current : planRef.current;
    const svg = c?.querySelector("svg");
    if (!svg) return;
    const blob = new Blob([new XMLSerializer().serializeToString(svg.cloneNode(true))], { type: "image/svg+xml" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = `nft-${activeView}.svg`; a.click(); URL.revokeObjectURL(u);
  }, [activeView]);

  const downloadBOM = useCallback(() => {
    let csv = "Category,ID,Name,Type,Qty,Length (m),Total (m),Notes\n";
    bom.pipes.forEach(p => csv += `${catLabel[p.cat]},${p.id},"${p.name}","${p.type}",${p.qty},${p.length},${p.totalM},"${p.note}"\n`);
    csv += "\nCategory,ID,Fitting,Type,Qty,,, Notes\n";
    bom.fittings.forEach(f => csv += `${catLabel[f.cat]},${f.id},"${f.name}","${f.type}",${f.qty},,,"${f.note}"\n`);
    csv += "\n,ID,Equipment,Specification,Qty,,,Notes\n";
    bom.equipment.forEach(e => csv += `,${e.id},"${e.name}","${e.type}",${e.qty},,,"${e.note}"\n`);
    const blob = new Blob([csv], { type: "text/csv" });
    const u = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = u; a.download = "nft-bill-of-materials.csv"; a.click(); URL.revokeObjectURL(u);
  }, [bom]);

  const sH = (t) => <div style={{ fontSize: 10, color: "#4a5c3e", letterSpacing: 2, margin: "14px 0 8px", borderBottom: "1px solid #1e2e16", paddingBottom: 5, fontFamily: "'Averia Sans Libre',sans-serif", fontWeight: 700 }}>{t}</div>;
  const sG = { display: "grid", gridTemplateColumns: "repeat(auto-fill,minmax(68px,1fr))", gap: 5 };

  const tabBtn = (id, lb) => (
    <button onClick={() => setActiveView(id)} style={{
      padding: "5px 12px", fontSize: 10, fontFamily: "'Atkinson Hyperlegible',sans-serif", letterSpacing: 1,
      background: activeView === id ? "#253a1a" : "transparent",
      border: activeView === id ? "1px solid #3a5a2a" : "1px solid #1e2e16",
      color: activeView === id ? "#a4c88e" : "#4a5c3e", borderRadius: 4, cursor: "pointer", transition: "all .12s",
    }}>{lb}</button>
  );

  return (
    <>
      <link href="https://fonts.googleapis.com/css2?family=Averia+Sans+Libre:wght@300;400;700&family=Atkinson+Hyperlegible:wght@400;700&display=swap" rel="stylesheet"/>
      <style>{`
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:12px;height:12px;border-radius:50%;background:#7abc5a;border:2px solid #0c1409;box-shadow:0 0 6px #5a8f3c88;cursor:pointer}
        input[type=range]::-moz-range-thumb{width:12px;height:12px;border-radius:50%;background:#7abc5a;border:2px solid #0c1409;cursor:pointer}
        *::-webkit-scrollbar{width:5px} *::-webkit-scrollbar-track{background:#0c1409} *::-webkit-scrollbar-thumb{background:#2a3a22;border-radius:3px}
      `}</style>
      <div style={{ minHeight: "100vh", background: "#0c1409", color: "#c8ddb8", fontFamily: "'Atkinson Hyperlegible',sans-serif", display: "flex", flexDirection: "column" }}>
        {/* HEADER */}
        <div style={{ padding: "12px 20px 8px", borderBottom: "1px solid #1e2e16", display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: 8 }}>
          <div>
            <div style={{ fontSize: 17, fontFamily: "'Averia Sans Libre',sans-serif", color: "#b8daa0", letterSpacing: 1 }}>NFT System Calculator</div>
            <div style={{ fontSize: 8, color: "#4a5c3e", letterSpacing: 2, fontFamily: "'Atkinson Hyperlegible',sans-serif" }}>NUTRIENT FILM TECHNIQUE — PIPE, FLOW &amp; MATERIALS</div>
          </div>
          <div style={{ display: "flex", gap: 5, alignItems: "center", flexWrap: "wrap" }}>
            {tabBtn("elevation", "⬍ ELEVATION")}
            {tabBtn("plan", "⊞ PLAN")}
            {tabBtn("bom", "☰ MATERIALS")}
            <div style={{ width: 1, height: 20, background: "#1e2e16", margin: "0 2px" }} />
            {activeView !== "bom" ? (
              <button onClick={downloadSVG} style={{ padding: "5px 12px", background: "#253a1a", border: "1px solid #3a5a2a", borderRadius: 4, color: "#a4c88e", fontFamily: "'Atkinson Hyperlegible',sans-serif", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}
                onMouseOver={e=>e.currentTarget.style.background="#3a5a2a"} onMouseOut={e=>e.currentTarget.style.background="#253a1a"}>↓ SVG</button>
            ) : (
              <button onClick={downloadBOM} style={{ padding: "5px 12px", background: "#2a1a0a", border: "1px solid #5a3a1a", borderRadius: 4, color: "#e8c45a", fontFamily: "'Atkinson Hyperlegible',sans-serif", fontSize: 10, cursor: "pointer", letterSpacing: 1 }}
                onMouseOver={e=>e.currentTarget.style.background="#3a2a1a"} onMouseOut={e=>e.currentTarget.style.background="#2a1a0a"}>↓ CSV</button>
            )}
          </div>
        </div>

        {/* BODY */}
        <div style={{ display: "flex", flex: 1, overflow: "hidden", flexWrap: "wrap" }}>
          {/* LEFT PANEL */}
          <div style={{ width: 280, minWidth: 240, padding: "12px 16px", borderRight: "1px solid #1e2e16", overflowY: "auto", maxHeight: "calc(100vh - 50px)" }}>
            {sH("STRUCTURE")}
            <Slider label="Channel Length" unit="m" value={cfg.channelLength} min={1} max={12} step={0.5} onChange={set("channelLength")}/>
            <Slider label="Shelf Width" unit="mm" value={cfg.shelfWidth} min={300} max={1200} step={50} onChange={set("shelfWidth")} accent="#6b8a56"/>
            <Slider label="Shelves" unit="" value={cfg.shelfCount} min={1} max={8} step={1} onChange={set("shelfCount")} accent="#c9853a"/>
            <Slider label="Levels / Shelf" unit="" value={cfg.levelsPerShelf} min={1} max={8} step={1} onChange={set("levelsPerShelf")} accent="#c9853a"/>
            <Slider label="Channels / Level" unit="" value={cfg.channelsPerLevel} min={1} max={6} step={1} onChange={set("channelsPerLevel")} accent="#c9853a"/>

            {sH("VERTICAL DISTRIBUTION")}
            <Slider label="1st Level Height" unit="m" value={cfg.firstLevelHeight} min={0.15} max={1.5} step={0.05} onChange={set("firstLevelHeight")} accent="#e8c45a"/>
            <Slider label="Level Spacing" unit="m" value={cfg.levelSpacing} min={0.15} max={1.2} step={0.05} onChange={set("levelSpacing")} accent="#e09040"/>

            <div style={{ background: "#111d0d", borderRadius: 6, padding: "8px 10px", border: "1px solid #1e2e16", marginTop: 4 }}>
              <div style={{ fontSize: 9, color: "#5e7050", letterSpacing: 1.5, marginBottom: 4, fontFamily: "'Averia Sans Libre',sans-serif", fontWeight: 700 }}>LEVEL HEIGHTS</div>
              {sys.levelHeights.map((h, i) => (
                <div key={i} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "2px 0", borderBottom: i < sys.levelHeights.length-1 ? "1px solid #1a2816" : "none" }}>
                  <span style={{ fontSize: 9, color: "#6b8a56" }}>Level {i+1}</span>
                  <div style={{ flex: 1, margin: "0 6px", height: 1, background: "#1a2816" }}/>
                  <span style={{ fontSize: 11, fontWeight: 700, color: "#b8daa0" }}>{h.toFixed(2)}</span>
                  <span style={{ fontSize: 8, color: "#4a5c3e", marginLeft: 2 }}>m</span>
                </div>
              ))}
              <div style={{ display: "flex", justifyContent: "space-between", marginTop: 6, padding: "4px 0 0", borderTop: "1px solid #2a3a22" }}>
                <span style={{ fontSize: 9, color: "#8ab86e", fontWeight: 600 }}>Total Height</span>
                <span style={{ fontSize: 12, fontWeight: 800, color: "#b0d090" }}>{sys.topLevelHeight.toFixed(2)}m</span>
              </div>
            </div>

            {sH("PIPES")}
            <div style={sG}>
              <Spec label="Supply" value={`ø${sys.supplyDia}`} unit="mm" color="#4a9ade"/>
              <Spec label="Feed" value={`ø${sys.feedDia}`} unit="mm" color="#5aafee"/>
              <Spec label="Drain" value={`ø${sys.drainDia}`} unit="mm" color="#c9853a"/>
            </div>
            {sH("CHANNELS")}
            <div style={sG}>
              <Spec label="Width" value={sys.channelW} unit="mm" color="#5a8f3c"/>
              <Spec label="Depth" value={sys.channelD} unit="mm" color="#5a8f3c"/>
              <Spec label="Slope" value={`${sys.slope}%`} unit="" color="#8ab86e"/>
            </div>
            {sH("FLOW & POWER")}
            <div style={sG}>
              <Spec label="/Channel" value={sys.flowPerChannel} unit="L/min"/>
              <Spec label="Total" value={sys.totalFlow} unit="L/min" color="#4a9ade"/>
              <Spec label="Pump" value={sys.pumpWatt} unit="W" color="#daa040"/>
              <Spec label="Head" value={sys.pumpHead} unit="m" color="#c9853a"/>
              <Spec label="Reservoir" value={sys.reservoirL} unit="L" color="#4a9ade"/>
              <Spec label="Channels" value={sys.totalChannels} unit="total" color="#7abc5a"/>
            </div>

            {/* BOM summary in sidebar */}
            {sH("MATERIAL TOTALS")}
            <div style={sG}>
              <Spec label="Pipe" value={`${bom.totalPipeM}`} unit="m" color="#e8c45a"/>
              <Spec label="Fittings" value={bom.totalFittings} unit="pcs" color="#c9853a"/>
              <Spec label="Pipe Types" value={bom.pipes.length} unit="" color="#4a9ade"/>
              <Spec label="Fit. Types" value={bom.fittings.length} unit="" color="#5aafee"/>
            </div>
          </div>

          {/* RIGHT: VIEWS */}
          <div style={{ flex: 1, minWidth: 380, display: "flex", flexDirection: "column", padding: activeView === "bom" ? 0 : 10, gap: 8, overflow: "hidden" }}>
            <div ref={elevRef} style={{ flex: 1, border: activeView === "elevation" ? "1px solid #1e2e16" : "none", borderRadius: 6, overflow: "hidden", background: "#0a1208", minHeight: 340, display: activeView === "elevation" ? "block" : "none" }}>
              <ElevationView cfg={cfg} sys={sys}/>
            </div>
            <div ref={planRef} style={{ flex: 1, border: activeView === "plan" ? "1px solid #1e2e16" : "none", borderRadius: 6, overflow: "hidden", background: "#0a1208", minHeight: 340, display: activeView === "plan" ? "block" : "none" }}>
              <PlanView cfg={cfg} sys={sys}/>
            </div>
            {activeView === "bom" && (
              <div style={{ flex: 1, overflow: "auto" }}>
                <BOMView cfg={cfg} sys={sys} bom={bom}/>
              </div>
            )}
            {activeView !== "bom" && (
              <div style={{ display: "flex", gap: 12, justifyContent: "center", flexWrap: "wrap", fontSize: 9, color: "#4a5c3e", letterSpacing: 1 }}>
                <span><span style={{ color: "#e8c45a" }}>◆</span> 1st @ {cfg.firstLevelHeight.toFixed(2)}m</span>
                <span><span style={{ color: "#e09040" }}>◆</span> {cfg.levelSpacing.toFixed(2)}m spacing</span>
                <span><span style={{ color: "#b0d090" }}>◆</span> Top @ {sys.topLevelHeight.toFixed(2)}m</span>
                <span><span style={{ color: "#7abc5a" }}>●</span> {cfg.shelfCount}×{cfg.levelsPerShelf}×{cfg.channelsPerLevel} = {sys.totalChannels} ch</span>
                <span><span style={{ color: "#e8c45a" }}>●</span> {bom.totalPipeM}m pipe · {bom.totalFittings} fittings</span>
              </div>
            )}
          </div>
        </div>
      </div>
    </>
  );
}
