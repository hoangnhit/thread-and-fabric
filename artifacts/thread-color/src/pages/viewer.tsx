import { useState, useRef, useEffect, useCallback } from "react";
import { useLocation } from "wouter";

/* ─── TYPES ─────────────────────────────────────────────────────── */
type StitchType = "STITCH" | "JUMP" | "TRIM" | "COLOR_CHANGE" | "END";
interface Stitch { x: number; y: number; type: StitchType; colorIndex: number; }
interface ParsedDesign {
  stitches: Stitch[];
  colorCount: number;
  palette: string[];
  width: number; height: number;
  stitchCount: number;
  format: "DST" | "PES";
  label: string;
}

/* ─── PEC COLOR TABLE (Brother thread colors) ───────────────────── */
const PEC_PALETTE: string[] = [
  "#1A0A94","#0000FF","#C8D200","#B5AD00","#2D7027","#E3E3E3","#C0C0C0",
  "#1A92D3","#6FC3E3","#F0C3E3","#E3C3AB","#6B8267","#5E9B8A","#8AC89B",
  "#6BCDB2","#37A923","#D9C300","#FFFF00","#FFC000","#FF8000","#FF0000",
  "#E31984","#CC0088","#AA00AA","#6600CC","#2200BB","#0066CC","#0099DD",
  "#00AAAA","#009966","#339900","#66BB00","#CCCC00","#FFCC00","#FF9900",
  "#FF6600","#CC0000","#CC0033","#990066","#660099","#0000AA","#0033CC",
  "#0066FF","#00AACC","#00CC99","#33CC33","#99CC00","#CCCC33","#FFFF33",
  "#FFCC33","#FF9933","#FF6633","#FF3333","#CC3366","#993399","#663399",
  "#336699","#0099CC","#33CCCC","#66CC99","#99CC66","#CCCC66","#FFCC66",
  "#FF9966","#FF6666","#FF9999","#FFCCCC","#CCFFCC","#99FFCC","#66FFFF",
  "#FFFFFF","#000000","#808080","#804000","#FF69B4","#00FF00","#FFD700",
];

/* ─── DST PARSER ─────────────────────────────────────────────────── */
function parseDST(buffer: ArrayBuffer): ParsedDesign {
  const data = new Uint8Array(buffer);
  const stitches: Stitch[] = [];
  const headerBytes = data.slice(0, 512);
  let label = "DST Design";
  for (let i = 0; i < 509; i++) {
    if (headerBytes[i] === 0x4C && headerBytes[i+1] === 0x41 && headerBytes[i+2] === 0x3A) {
      const end = Array.from(headerBytes.slice(i+3)).findIndex(c => c === 0x0D || c === 0x0A || c === 0x00);
      label = String.fromCharCode(...headerBytes.slice(i+3, i+3+(end>0?end:16))).trim() || label;
      break;
    }
  }
  let cx = 0, cy = 0, colorIndex = 0;
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  for (let i = 512; i < data.length - 2; i += 3) {
    const b0 = data[i], b1 = data[i+1], b2 = data[i+2];
    if (b0===0x00 && b1===0x00 && b2===0xF3) break;
    let dx = 0, dy = 0;
    if (b2&0x80) dy+=1; if (b2&0x40) dy-=1;
    if (b2&0x20) dy+=9; if (b2&0x10) dy-=9;
    if (b2&0x08) dx-=9; if (b2&0x04) dx+=9;
    if (b2&0x02) dx-=1; if (b2&0x01) dx+=1;
    if (b1&0x80) dy+=3; if (b1&0x40) dy-=3;
    if (b1&0x20) dy+=27; if (b1&0x10) dy-=27;
    if (b1&0x08) dx-=27; if (b1&0x04) dx+=27;
    if (b1&0x02) dx-=3; if (b1&0x01) dx+=3;
    if (b0&0x04) dx+=81; if (b0&0x08) dx-=81;
    if (b0&0x10) dy-=81; if (b0&0x20) dy+=81;
    const isJump = (b0&0x80)!==0, isCStop = (b0&0x40)!==0;
    cx+=dx; cy+=dy;
    if (isCStop) { stitches.push({x:cx,y:cy,type:"COLOR_CHANGE",colorIndex}); colorIndex++; }
    else if (isJump) { stitches.push({x:cx,y:cy,type:"JUMP",colorIndex}); }
    else {
      stitches.push({x:cx,y:cy,type:"STITCH",colorIndex});
      if (cx<minX) minX=cx; if (cx>maxX) maxX=cx;
      if (cy<minY) minY=cy; if (cy>maxY) maxY=cy;
    }
  }
  const defaults = ["#7A9E7E","#C8A96E","#5B7FA6","#D4845A","#9B6BB5","#4AABB8","#D4635A","#8B5E3C","#3A6351","#C4A35A"];
  const palette = Array.from({length:colorIndex+1},(_,i)=>defaults[i%defaults.length]);
  return {stitches, colorCount:colorIndex+1, palette, width:maxX-minX, height:maxY-minY,
          stitchCount:stitches.filter(s=>s.type==="STITCH").length, format:"DST", label};
}

/* ─── PES / PEC PARSER ──────────────────────────────────────────── */
function signed12(b:number):number { b&=0xfff; return b>0x7ff?-0x1000+b:b; }
function signed7(b:number):number { return b>63?-128+b:b; }

function parsePES(buffer: ArrayBuffer): ParsedDesign {
  const data = new Uint8Array(buffer);
  const view = new DataView(buffer);
  const sig = String.fromCharCode(data[0],data[1],data[2],data[3]);
  const isPEC = sig==="#PEC";
  let pecOffset = isPEC ? 0 : view.getUint32(8,true);
  const pesVer = isPEC ? "" : String.fromCharCode(data[4],data[5],data[6],data[7]).trim();

  for (let search=pecOffset; search<Math.min(pecOffset+512,data.length-3); search++) {
    if (data[search]===0x4C && data[search+1]===0x41 && data[search+2]===0x3A) {
      const lblEnd = search+3+16;
      const label = String.fromCharCode(...data.slice(search+3,lblEnd)).replace(/[\x00\xff]/g,"").trim() || pesVer || "PES Design";
      let p = search+3+16+0xF+1+1+0xC;
      if (p>=data.length) break;
      const cc = data[p]; p++;
      const cnt = cc+1;
      const colorBytes = data.slice(p,p+cnt); p+=cnt;
      p += 0x1D0-cc;
      p += 3+0x0B;
      if (p>=data.length) break;
      const palette: string[] = [];
      for (let i=0;i<cnt;i++) palette.push(PEC_PALETTE[colorBytes[i]%PEC_PALETTE.length]);
      return readPECStitches(data,p,palette,label);
    }
  }
  return {stitches:[],colorCount:1,palette:["#333"],width:0,height:0,stitchCount:0,format:"PES",label:"Parse error"};
}

function readPECStitches(data:Uint8Array, startPos:number, palette:string[], label:string): ParsedDesign {
  const FL=0x80, JC=0x10, TC=0x20;
  const stitches: Stitch[] = [];
  let cx=0, cy=0, colorIndex=0, i=startPos;
  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  while (i<data.length-1) {
    const v1=data[i], v2=data[i+1];
    if (v1===0xFF && v2===0x00) break;
    if (v1===0xFE && v2===0xB0) { i+=3; stitches.push({x:cx,y:cy,type:"COLOR_CHANGE",colorIndex}); colorIndex++; continue; }
    let x:number, y:number, isJump=false;
    if (v1&FL) {
      if (v1&TC||v1&JC) isJump=true;
      x=signed12((v1<<8)|v2); i+=2;
      if (i>=data.length) break;
      const v2b=data[i];
      if (v2b&FL) { if (v2b&TC||v2b&JC) isJump=true; if (i+1>=data.length) break; y=signed12((v2b<<8)|data[i+1]); i+=2; }
      else { y=signed7(v2b); i++; }
    } else {
      x=signed7(v1);
      if (v2&FL) { if (v2&TC||v2&JC) isJump=true; if (i+2>=data.length) break; y=signed12((v2<<8)|data[i+2]); i+=3; }
      else { y=signed7(v2); i+=2; }
    }
    cx+=x; cy+=y;
    if (isJump) { stitches.push({x:cx,y:cy,type:"JUMP",colorIndex}); }
    else {
      stitches.push({x:cx,y:cy,type:"STITCH",colorIndex});
      if(cx<minX)minX=cx; if(cx>maxX)maxX=cx; if(cy<minY)minY=cy; if(cy>maxY)maxY=cy;
    }
  }
  while (palette.length<=colorIndex) palette.push(PEC_PALETTE[palette.length%PEC_PALETTE.length]);
  return {stitches, colorCount:colorIndex+1, palette,
          width:minX===Infinity?0:maxX-minX, height:minY===Infinity?0:maxY-minY,
          stitchCount:stitches.filter(s=>s.type==="STITCH").length, format:"PES", label};
}

/* ─── CANVAS RENDERER ───────────────────────────────────────────── */
function renderDesign(
  canvas: HTMLCanvasElement, design: ParsedDesign, colors: string[],
  scale: number, offsetX: number, offsetY: number,
  maxStitchIdx: number = Infinity, bgColor?: string
) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  if (bgColor) { ctx.fillStyle = bgColor; ctx.fillRect(0,0,canvas.width,canvas.height); }

  const {stitches} = design;
  if (!stitches.length) return;

  let minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity;
  for (const s of stitches) {
    if (s.type==="STITCH") {
      if(s.x<minX)minX=s.x; if(s.x>maxX)maxX=s.x;
      if(s.y<minY)minY=s.y; if(s.y>maxY)maxY=s.y;
    }
  }
  if (minX===Infinity) return;
  const cx=(minX+maxX)/2, cy=(minY+maxY)/2;
  const toSX=(x:number)=>canvas.width/2+(x-cx)*scale+offsetX;
  const toSY=(y:number)=>canvas.height/2+(y-cy)*scale+offsetY;

  // Group into segments by color
  const segments: {start:number;end:number;ci:number}[] = [];
  let segStart=0, currentCI=0;
  const limit = Math.min(stitches.length-1, maxStitchIdx);
  for (let i=0; i<=limit; i++) {
    const s=stitches[i];
    if (s.type==="COLOR_CHANGE" || i===limit) {
      segments.push({start:segStart,end:i,ci:currentCI});
      segStart=i+1; currentCI=s.colorIndex+(s.type==="COLOR_CHANGE"?1:0);
    }
  }

  for (const seg of segments) {
    const color = colors[seg.ci] ?? colors[seg.ci%colors.length] ?? "#ffffff";
    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = Math.max(0.4, scale*0.7);
    ctx.lineCap = "round"; ctx.lineJoin = "round";
    let penDown = false;
    for (let i=seg.start; i<=seg.end && i<=limit; i++) {
      const s=stitches[i];
      if (s.type==="STITCH") {
        const sx=toSX(s.x), sy=toSY(s.y);
        if (!penDown) { ctx.moveTo(sx,sy); penDown=true; } else ctx.lineTo(sx,sy);
      } else { penDown=false; if (i<stitches.length) ctx.moveTo(toSX(s.x),toSY(s.y)); }
    }
    ctx.stroke();
  }
}

function computeAutoScale(design:ParsedDesign, w:number, h:number): number {
  if (!design.width||!design.height) return 1;
  return Math.min((w*0.82)/design.width, (h*0.82)/design.height, 6);
}

/* ─── FABRIC TEXTURES ───────────────────────────────────────────── */
const FABRICS = {
  cloth: {
    bg: "#1a2340",
    css: `repeating-linear-gradient(135deg,transparent 0,transparent 3px,rgba(255,255,255,0.025) 3px,rgba(255,255,255,0.025) 4px),repeating-linear-gradient(45deg,transparent 0,transparent 3px,rgba(255,255,255,0.015) 3px,rgba(255,255,255,0.015) 4px),#1a2340`,
  },
  leather: {
    bg: "#120c08",
    css: `repeating-linear-gradient(0deg,transparent 0,transparent 5px,rgba(255,255,255,0.012) 5px,rgba(255,255,255,0.012) 6px),repeating-linear-gradient(90deg,transparent 0,transparent 8px,rgba(255,255,255,0.008) 8px,rgba(255,255,255,0.008) 9px),#110b07`,
  },
  fleece: {
    bg: "#1e1c2a",
    css: `radial-gradient(circle at 1px 1px,rgba(255,255,255,0.05) 1px,transparent 0) 0 0/6px 6px,#1e1c2a`,
  },
};

/* ─── THREAD SPOOL SVG LOGO ─────────────────────────────────────── */
function SpoolIcon({size=28}:{size?:number}) {
  return (
    <svg width={size} height={size} viewBox="0 0 28 28" fill="none" xmlns="http://www.w3.org/2000/svg">
      <ellipse cx="14" cy="6" rx="9" ry="3.5" fill="#8B5E3C"/>
      <rect x="5" y="5.5" width="18" height="17" rx="1" fill="#C4853D"/>
      <line x1="5" y1="9" x2="23" y2="9" stroke="#D4635A" strokeWidth="1.8"/>
      <line x1="5" y1="11.5" x2="23" y2="11.5" stroke="#E85D04" strokeWidth="1.8"/>
      <line x1="5" y1="14" x2="23" y2="14" stroke="#FAA307" strokeWidth="1.8"/>
      <line x1="5" y1="16.5" x2="23" y2="16.5" stroke="#E85D04" strokeWidth="1.8"/>
      <line x1="5" y1="19" x2="23" y2="19" stroke="#D4635A" strokeWidth="1.8"/>
      <ellipse cx="14" cy="22.5" rx="9" ry="3.5" fill="#8B5E3C"/>
      <ellipse cx="14" cy="6" rx="3" ry="1.4" fill="#5C3A1E"/>
      <ellipse cx="14" cy="22.5" rx="3" ry="1.4" fill="#5C3A1E"/>
    </svg>
  );
}

/* ─── FILE TYPE ICONS ───────────────────────────────────────────── */
function FileIcon({ext,color}:{ext:string;color:string}) {
  return (
    <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:4}}>
      <div style={{width:44,height:54,background:color,borderRadius:6,display:"flex",alignItems:"flex-end",justifyContent:"center",paddingBottom:5,position:"relative",boxShadow:"0 2px 8px rgba(0,0,0,0.4)"}}>
        <div style={{position:"absolute",top:0,right:0,width:12,height:12,background:"rgba(255,255,255,0.25)",borderRadius:"0 6px 0 6px"}}/>
        <span style={{fontSize:9,fontWeight:800,color:"#fff",letterSpacing:0.5}}>.{ext}</span>
      </div>
    </div>
  );
}

/* ─── MAIN COMPONENT ─────────────────────────────────────────────── */
export default function Viewer() {
  const [, navigate] = useLocation();
  const [design, setDesign] = useState<ParsedDesign|null>(null);
  const [editedColors, setEditedColors] = useState<string[]>([]);
  const [fileName, setFileName] = useState("");
  const [error, setError] = useState<string|null>(null);
  const [loading, setLoading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [fabric, setFabric] = useState<"cloth"|"leather"|"fleece">("cloth");
  const [customBg, setCustomBg] = useState("#2a1a2a");
  const [useCustomBg, setUseCustomBg] = useState(false);
  const [spm, setSpm] = useState(650);
  const [showSpmMenu, setShowSpmMenu] = useState(false);
  const [animMaxIdx, setAnimMaxIdx] = useState(Infinity);
  const [isPlaying, setIsPlaying] = useState(false);

  const canvasRef = useRef<HTMLCanvasElement>(null);
  const scaleRef = useRef(1);
  const offsetRef = useRef({x:0,y:0});
  const dragStartRef = useRef<{x:number;y:number}|null>(null);
  const animFrameRef = useRef<number>(0);
  const animIdxRef = useRef(0);
  const colorInputRefs = useRef<(HTMLInputElement|null)[]>([]);

  const triggerRender = useCallback(() => {
    if (!design||!canvasRef.current) return;
    const fabric_ = useCustomBg ? null : FABRICS[fabric];
    renderDesign(canvasRef.current, design, editedColors, scaleRef.current,
      offsetRef.current.x, offsetRef.current.y, animMaxIdx, undefined);
  }, [design, editedColors, fabric, useCustomBg, animMaxIdx]);

  useEffect(() => { triggerRender(); }, [triggerRender]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const resize = () => {
      canvas.width = canvas.clientWidth * devicePixelRatio;
      canvas.height = canvas.clientHeight * devicePixelRatio;
      triggerRender();
    };
    resize();
    window.addEventListener("resize", resize);
    return () => window.removeEventListener("resize", resize);
  }, [triggerRender]);

  // Animation loop
  useEffect(() => {
    if (!isPlaying||!design) return;
    const total = design.stitches.length;
    const speed = Math.max(50, Math.floor(total/200));
    const step = () => {
      animIdxRef.current = Math.min(animIdxRef.current+speed, total-1);
      setAnimMaxIdx(animIdxRef.current);
      if (animIdxRef.current>=total-1) { setIsPlaying(false); setAnimMaxIdx(Infinity); return; }
      animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animFrameRef.current);
  }, [isPlaying, design]);

  const loadFile = useCallback(async (file:File) => {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext!=="dst"&&ext!=="pes") { setError("Chỉ hỗ trợ file .pes và .dst"); return; }
    setLoading(true); setError(null); setDesign(null);
    setFileName(file.name.toUpperCase());
    animIdxRef.current = 0; setAnimMaxIdx(Infinity); setIsPlaying(false);
    try {
      const buf = await file.arrayBuffer();
      const parsed = ext==="dst" ? parseDST(buf) : parsePES(buf);
      if (!parsed.stitches.length) { setError("Không đọc được dữ liệu từ file."); setLoading(false); return; }
      setEditedColors([...parsed.palette]);
      const canvas = canvasRef.current;
      if (canvas) scaleRef.current = computeAutoScale(parsed, canvas.width, canvas.height);
      offsetRef.current = {x:0,y:0};
      setDesign(parsed);
    } catch(e) { setError("Lỗi đọc file: "+String(e)); }
    setLoading(false);
  }, []);

  const onFileInput = (e:React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files?.[0]) loadFile(e.target.files[0]);
    e.target.value = "";
  };
  const onDrop = (e:React.DragEvent) => {
    e.preventDefault(); setIsDragging(false);
    if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]);
  };

  const onWheel = (e:React.WheelEvent) => {
    e.preventDefault();
    scaleRef.current = Math.max(0.05, Math.min(20, scaleRef.current*(e.deltaY<0?1.12:0.88)));
    triggerRender();
  };
  const onMouseDown = (e:React.MouseEvent) => {
    dragStartRef.current = {x:e.clientX-offsetRef.current.x, y:e.clientY-offsetRef.current.y};
  };
  const onMouseMove = (e:React.MouseEvent) => {
    if (!dragStartRef.current) return;
    offsetRef.current = {x:e.clientX-dragStartRef.current.x, y:e.clientY-dragStartRef.current.y};
    triggerRender();
  };
  const onMouseUp = () => { dragStartRef.current=null; };

  const resetView = () => {
    if (!design||!canvasRef.current) return;
    scaleRef.current = computeAutoScale(design, canvasRef.current.width, canvasRef.current.height);
    offsetRef.current = {x:0,y:0}; triggerRender();
  };

  const handlePlay = () => {
    if (!design) return;
    if (animMaxIdx>=design.stitches.length-1||animMaxIdx===Infinity) {
      animIdxRef.current=0; setAnimMaxIdx(0);
    }
    setIsPlaying(p=>!p);
  };

  const handleStep = () => {
    if (!design) return;
    setIsPlaying(false);
    // advance to next color section
    const idx = animMaxIdx===Infinity ? design.stitches.length-1 : animMaxIdx;
    let next = idx+1;
    while (next<design.stitches.length && design.stitches[next].type!=="COLOR_CHANGE") next++;
    setAnimMaxIdx(next>=design.stitches.length ? Infinity : next);
    animIdxRef.current = next;
  };

  const downloadPNG = () => {
    if (!design||!canvasRef.current) return;
    const offscreen = document.createElement("canvas");
    offscreen.width = canvasRef.current.width; offscreen.height = canvasRef.current.height;
    const ctx = offscreen.getContext("2d")!;
    ctx.fillStyle = useCustomBg ? customBg : FABRICS[fabric].bg;
    ctx.fillRect(0,0,offscreen.width,offscreen.height);
    renderDesign(offscreen,design,editedColors,scaleRef.current,offsetRef.current.x,offsetRef.current.y,animMaxIdx);
    offscreen.toBlob(blob=>{
      if (!blob) return;
      const a=document.createElement("a");
      a.href=URL.createObjectURL(blob);
      a.download=fileName.replace(/\.(dst|pes)$/i,"")+".png";
      a.click();
    });
  };

  const updateColor = (i:number, color:string) => {
    setEditedColors(prev=>{const n=[...prev];n[i]=color;return n;});
  };

  const toInches = (units:number) => (units/254).toFixed(2);
  const timeMin = design ? Math.ceil(design.stitchCount/spm) : 0;
  const timeStr = timeMin>=60 ? `${Math.floor(timeMin/60)} h ${timeMin%60} min` : `${timeMin} min`;

  const fabricBg = useCustomBg ? customBg : FABRICS[fabric].css;
  const fabricBgColor = useCustomBg ? customBg : FABRICS[fabric].bg;

  return (
    <div style={{display:"flex",flexDirection:"column",minHeight:"100dvh",background:"#0d1117",color:"#e8e8f0",fontFamily:"Inter,system-ui,sans-serif"}}>

      {/* ── Header ── */}
      <header style={{display:"flex",alignItems:"center",justifyContent:"space-between",padding:"10px 20px",background:"#0d1117",borderBottom:"1px solid #1e2436"}}>
        <div style={{display:"flex",alignItems:"center",gap:8}}>
          <button onClick={()=>navigate("/")} style={{background:"none",border:"none",color:"#666",fontSize:18,cursor:"pointer",padding:"2px 6px",borderRadius:6}}>←</button>
          <SpoolIcon size={26}/>
          <span style={{fontWeight:800,fontSize:17,color:"#fff",letterSpacing:-0.3}}>
            <span style={{color:"#4A9EFF"}}>stitch</span>Viewer
          </span>
        </div>
        <div style={{display:"flex",gap:4}}>
          {(["cloth","leather","fleece"] as const).map(f=>(
            <button key={f} onClick={()=>{setFabric(f);setUseCustomBg(false);}}
              style={{padding:"5px 14px",borderRadius:6,border:"1px solid",fontSize:13,fontWeight:600,cursor:"pointer",transition:"all 0.15s",
                background:(!useCustomBg&&fabric===f)?"#3b82f6":"transparent",
                borderColor:(!useCustomBg&&fabric===f)?"#3b82f6":"#2a3050",
                color:(!useCustomBg&&fabric===f)?"#fff":"#9ca3af"}}>
              {f.charAt(0).toUpperCase()+f.slice(1)}
            </button>
          ))}
          <label title="Custom background color" style={{position:"relative",cursor:"pointer"}}>
            <div style={{width:32,height:32,borderRadius:6,border:"2px solid "+(useCustomBg?"#3b82f6":"#2a3050"),
              background:useCustomBg?customBg:"linear-gradient(135deg,#f472b6,#818cf8)",cursor:"pointer"}}
              onClick={()=>setUseCustomBg(true)}/>
            <input type="color" value={customBg} onChange={e=>{setCustomBg(e.target.value);setUseCustomBg(true);}}
              style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}}/>
          </label>
        </div>
      </header>

      {/* ── Main content ── */}
      <div style={{flex:1,display:"flex",flexDirection:"column",alignItems:"center",padding:"16px",gap:16}}>

        {design ? (
          <>
            {/* Preview + Info row */}
            <div style={{display:"flex",gap:14,width:"100%",maxWidth:920,alignItems:"flex-start"}}>

              {/* Preview canvas */}
              <div style={{flex:"1 1 0",minWidth:0,position:"relative"}}>
                {/* File name badge */}
                <div style={{position:"absolute",top:-10,left:"50%",transform:"translateX(-50%)",zIndex:10,
                  background:"#fff",color:"#0d1117",padding:"3px 14px",borderRadius:4,fontSize:12,fontWeight:700,letterSpacing:0.5,
                  whiteSpace:"nowrap",boxShadow:"0 2px 8px rgba(0,0,0,0.3)"}}>
                  {fileName}
                </div>

                {/* Canvas area */}
                <div style={{position:"relative",borderRadius:10,overflow:"hidden",background:fabricBg,aspectRatio:"4/3",
                  boxShadow:"0 4px 24px rgba(0,0,0,0.6)",border:"1px solid #1e2436"}}>

                  {/* Play / Step buttons */}
                  <div style={{position:"absolute",top:10,left:10,display:"flex",gap:6,zIndex:5}}>
                    <button onClick={handlePlay} title={isPlaying?"Pause":"Play"}
                      style={{width:30,height:30,borderRadius:6,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      {isPlaying?"⏸":"▶"}
                    </button>
                    <button onClick={handleStep} title="Next color"
                      style={{width:30,height:30,borderRadius:6,background:"rgba(0,0,0,0.5)",border:"1px solid rgba(255,255,255,0.15)",color:"#fff",cursor:"pointer",display:"flex",alignItems:"center",justifyContent:"center",fontSize:12}}>
                      ⏭
                    </button>
                  </div>

                  <canvas ref={canvasRef} style={{width:"100%",height:"100%",display:"block",cursor:"grab",touchAction:"none"}}
                    onWheel={onWheel} onMouseDown={onMouseDown} onMouseMove={onMouseMove}
                    onMouseUp={onMouseUp} onMouseLeave={onMouseUp}/>
                </div>

                {/* Download buttons */}
                <div style={{display:"flex",gap:0,marginTop:8}}>
                  <button onClick={downloadPNG}
                    style={{flex:1,padding:"11px 0",background:"#1a1f30",border:"1px solid #2a3050",borderRight:"none",
                      borderRadius:"8px 0 0 8px",color:"#e8e8f0",cursor:"pointer",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    ⬇ Download PNG
                  </button>
                  <button disabled title="Coming soon"
                    style={{flex:1,padding:"11px 0",background:"#1a1f30",border:"1px solid #2a3050",
                      borderRadius:"0 8px 8px 0",color:"#555",cursor:"not-allowed",fontSize:13,fontWeight:600,display:"flex",alignItems:"center",justifyContent:"center",gap:6}}>
                    📄 Save as GIF
                  </button>
                </div>
              </div>

              {/* Right panel */}
              <div style={{display:"flex",flexDirection:"column",gap:10,width:220,flexShrink:0}}>

                {/* Stats card */}
                <div style={{background:"#131929",border:"1px solid #1e2a42",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:10,fontWeight:700,color:"#4A9EFF",letterSpacing:1,marginBottom:4}}>STITCH COUNT</div>
                  <div style={{fontSize:32,fontWeight:800,color:"#fff",lineHeight:1.1}}>
                    {design.stitchCount.toLocaleString()}
                  </div>
                  <div style={{fontSize:13,color:"#4A9EFF",fontWeight:600,marginTop:2,textAlign:"right"}}>
                    {toInches(design.width)} × {toInches(design.height)} in
                  </div>
                  <div style={{display:"flex",alignItems:"center",gap:8,marginTop:10,paddingTop:10,borderTop:"1px solid #1e2a42"}}>
                    <div style={{position:"relative"}}>
                      <button onClick={()=>setShowSpmMenu(p=>!p)}
                        style={{background:"#1a2236",border:"1px solid #2a3a56",borderRadius:6,color:"#e8e8f0",padding:"4px 10px",fontSize:12,cursor:"pointer",display:"flex",alignItems:"center",gap:4}}>
                        {spm} SPM <span style={{fontSize:9}}>▼</span>
                      </button>
                      {showSpmMenu && (
                        <div style={{position:"absolute",top:"100%",left:0,marginTop:4,background:"#1a2236",border:"1px solid #2a3a56",borderRadius:6,overflow:"hidden",zIndex:20}}>
                          {[400,500,650,800,1000].map(v=>(
                            <div key={v} onClick={()=>{setSpm(v);setShowSpmMenu(false);}}
                              style={{padding:"6px 16px",cursor:"pointer",fontSize:12,color:v===spm?"#4A9EFF":"#e8e8f0",background:v===spm?"#223":"none"}}>
                              {v} SPM
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                    <span style={{fontSize:12,color:"#9ca3af"}}>| {timeStr}</span>
                  </div>
                </div>

                {/* Edit Colors card */}
                <div style={{background:"#131929",border:"1px solid #1e2a42",borderRadius:10,padding:"14px 16px"}}>
                  <div style={{fontSize:12,fontWeight:700,color:"#e8e8f0",marginBottom:10}}>Edit Colors</div>
                  <div style={{display:"flex",flexWrap:"wrap",gap:6}}>
                    {editedColors.slice(0,design.colorCount).map((c,i)=>(
                      <label key={i} style={{position:"relative",cursor:"pointer"}} title={`Color ${i+1}: ${c}`}>
                        <div style={{width:28,height:28,borderRadius:6,background:c,border:"2px solid rgba(255,255,255,0.15)",cursor:"pointer",boxShadow:"0 1px 4px rgba(0,0,0,0.4)"}}/>
                        <input type="color" value={c} onChange={e=>updateColor(i,e.target.value)}
                          ref={el=>{colorInputRefs.current[i]=el;}}
                          style={{position:"absolute",inset:0,opacity:0,width:"100%",height:"100%",cursor:"pointer"}}/>
                      </label>
                    ))}
                  </div>
                  <button onClick={()=>setEditedColors([...design.palette])}
                    style={{marginTop:10,background:"none",border:"none",color:"#4A9EFF",fontSize:11,cursor:"pointer",padding:0}}>
                    Reset màu gốc
                  </button>
                </div>

                {/* Fit button */}
                <button onClick={resetView}
                  style={{background:"#1a1f30",border:"1px solid #2a3050",borderRadius:8,color:"#9ca3af",padding:"8px 0",cursor:"pointer",fontSize:12}}>
                  🔍 Khớp màn hình
                </button>

                {/* Upload another */}
                <label style={{cursor:"pointer"}}>
                  <input type="file" accept=".pes,.dst" onChange={onFileInput} style={{display:"none"}}/>
                  <div style={{background:"#1a1f30",border:"1px dashed #2a3050",borderRadius:8,color:"#9ca3af",padding:"8px 0",fontSize:12,textAlign:"center",cursor:"pointer"}}>
                    + Tải file khác
                  </div>
                </label>
              </div>
            </div>
          </>
        ) : (
          /* ── Upload drop zone ── */
          <div style={{width:"100%",maxWidth:600,marginTop:24}}>
            <div
              onDrop={onDrop}
              onDragOver={e=>{e.preventDefault();setIsDragging(true);}}
              onDragLeave={()=>setIsDragging(false)}
              style={{border:`2px dashed ${isDragging?"#4A9EFF":"#2a3050"}`,borderRadius:14,
                padding:"48px 32px",textAlign:"center",transition:"all 0.2s",
                background:isDragging?"rgba(74,158,255,0.05)":"#0f1520"}}>

              {loading ? (
                <div style={{display:"flex",flexDirection:"column",alignItems:"center",gap:12}}>
                  <div style={{fontSize:36}}>⏳</div>
                  <div style={{color:"#4A9EFF"}}>Đang đọc file...</div>
                </div>
              ) : (
                <>
                  <div style={{marginBottom:24,display:"flex",justifyContent:"center"}}>
                    <SpoolIcon size={56}/>
                  </div>
                  <div style={{fontSize:20,fontWeight:700,color:"#fff",marginBottom:8}}>
                    Tải lên file thêu
                  </div>
                  <div style={{fontSize:13,color:"#6b7a99",lineHeight:1.6,marginBottom:28}}>
                    Kéo thả hoặc chọn file .pes hoặc .dst<br/>để xem trước thiết kế thêu của bạn
                  </div>

                  {/* File type icons */}
                  <div style={{display:"flex",justifyContent:"center",gap:12,marginBottom:28}}>
                    <FileIcon ext="pes" color="#3b6fd4"/>
                    <FileIcon ext="dst" color="#3da86a"/>
                    <FileIcon ext="pec" color="#c4893d"/>
                    <FileIcon ext="jef" color="#9b59b6"/>
                    <FileIcon ext="exp" color="#d4635a"/>
                  </div>

                  <label style={{cursor:"pointer"}}>
                    <input type="file" accept=".pes,.dst" onChange={onFileInput} style={{display:"none"}}/>
                    <span style={{display:"inline-block",padding:"10px 32px",background:"#3b82f6",color:"#fff",borderRadius:8,fontWeight:700,fontSize:14,cursor:"pointer",boxShadow:"0 2px 12px rgba(59,130,246,0.4)"}}>
                      Chọn file
                    </span>
                  </label>

                  {error && <div style={{color:"#ff6b6b",fontSize:13,marginTop:16}}>{error}</div>}
                </>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
