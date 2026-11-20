/**
 * Live bill scanner for the web: camera preview, finds the whole bill's four edges, auto-captures when it
 * holds still, then straightens & crops it. "Long bill" mode captures several parts and stacks them.
 * Falls back (onUnavailable) when the browser has no camera access, so the caller can offer a photo instead.
 */
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import Svg, { Circle } from 'react-native-svg';
import { detectBill, Quad, quadShift, toGray, warpQuad, warpSize } from '../lib/docScan';
import type { Photo } from '../lib/photo';
import { dark } from '../theme/theme';
import { Icon } from './Icon';

export interface LiveScannerProps {
  onCapture: (photo: Photo) => void;
  onClose: () => void;
  onGallery: () => void;
  onUnavailable: (message: string) => void;
}

export function liveScannerSupported(): boolean {
  return typeof navigator !== 'undefined' && !!navigator.mediaDevices?.getUserMedia && typeof window !== 'undefined' && window.isSecureContext;
}

type Status = 'starting' | 'searching' | 'partial' | 'found' | 'capturing';
const DETECT_W = 200; // detection frame width (px)
const STEADY = 8; // steady detections in a row before auto-capture (~1.1 s)
const P = dark; // the camera view is always dark

export function LiveScanner({ onCapture, onClose, onGallery, onUnavailable }: LiveScannerProps) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const overlayRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const det = useRef<{ quad: Quad; partial: boolean; dw: number; dh: number } | null>(null);
  const steady = useRef(0);
  const busy = useRef(false);
  const modeRef = useRef<'auto' | 'parts'>('auto');
  const [status, setStatus] = useState<Status>('starting');
  const [progress, setProgress] = useState(0);
  const [mode, setMode] = useState<'auto' | 'parts'>('auto');
  const [parts, setParts] = useState<Photo[]>([]);
  const [torch, setTorch] = useState<{ available: boolean; on: boolean }>({ available: false, on: false });
  const [tips, setTips] = useState(false);
  const [flash, setFlash] = useState(false);
  modeRef.current = mode;

  const stop = useCallback(() => {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, []);

  // ---------------------------------------------------------------- camera
  useEffect(() => {
    let cancelled = false;
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1920 }, height: { ideal: 1080 } }, audio: false })
      .then(async (stream) => {
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = stream;
        const v = videoRef.current!;
        v.srcObject = stream;
        await v.play().catch(() => {});
        const track = stream.getVideoTracks()[0];
        const caps = (track.getCapabilities?.() ?? {}) as { torch?: boolean };
        setTorch({ available: !!caps.torch, on: false });
        setStatus('searching');
      })
      .catch((e: DOMException) => {
        if (cancelled) return;
        onUnavailable(e?.name === 'NotAllowedError'
          ? 'Camera access was blocked. Allow the camera for this site, or take a photo instead.'
          : "This browser can't open a live camera here. Take a photo of the bill instead.");
      });
    return () => { cancelled = true; stop(); };
  }, [onUnavailable, stop]);

  // ---------------------------------------------------------------- capture
  const grab = useCallback((): Photo | null => {
    const v = videoRef.current;
    if (!v || !v.videoWidth) return null;
    const vw = v.videoWidth, vh = v.videoHeight;
    const full = document.createElement('canvas');
    full.width = vw; full.height = vh;
    const fctx = full.getContext('2d', { willReadFrequently: true })!;
    fctx.drawImage(v, 0, 0);
    const d = det.current;
    const out = document.createElement('canvas');
    if (d && !d.partial) {
      // Straighten & crop to the bill, in full-resolution coordinates.
      const k = vw / d.dw;
      const q = d.quad.map((p) => ({ x: p.x * k, y: p.y * k })) as Quad;
      const size = warpSize(q, 2000);
      const pixels = warpQuad(fctx.getImageData(0, 0, vw, vh).data, vw, vh, q, size.width, size.height);
      out.width = size.width; out.height = size.height;
      const img = new ImageData(size.width, size.height);
      img.data.set(pixels);
      out.getContext('2d')!.putImageData(img, 0, 0);
    } else {
      const k = Math.min(1, 2000 / Math.max(vw, vh));
      out.width = Math.round(vw * k); out.height = Math.round(vh * k);
      out.getContext('2d')!.drawImage(full, 0, 0, out.width, out.height);
    }
    return { uri: out.toDataURL('image/jpeg', 0.92), mimeType: 'image/jpeg', width: out.width, height: out.height };
  }, []);

  const capture = useCallback(() => {
    if (busy.current) return;
    busy.current = true;
    setStatus('capturing');
    setFlash(true);
    setTimeout(() => setFlash(false), 180);
    // Let the "capturing" state paint before the (heavier) straightening runs.
    setTimeout(() => {
      const photo = grab();
      steady.current = 0;
      setProgress(0);
      if (photo && modeRef.current === 'parts') {
        setParts((p) => [...p, photo]);
        busy.current = false;
        setStatus('searching');
        return;
      }
      if (photo) { stop(); onCapture(photo); } else { busy.current = false; setStatus('searching'); }
    }, 60);
  }, [grab, onCapture, stop]);

  /** Long bill: stack the parts top to bottom into one image. */
  const finishParts = useCallback(async () => {
    if (!parts.length) return;
    const imgs = await Promise.all(parts.map((p) => new Promise<HTMLImageElement>((res) => { const i = new window.Image(); i.onload = () => res(i); i.src = p.uri; })));
    const width = Math.min(1600, Math.max(...imgs.map((i) => i.naturalWidth)));
    const heights = imgs.map((i) => Math.round((i.naturalHeight * width) / i.naturalWidth));
    const c = document.createElement('canvas');
    c.width = width; c.height = heights.reduce((a, b) => a + b, 0);
    const ctx = c.getContext('2d')!;
    ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height);
    let y = 0;
    imgs.forEach((img, i) => { ctx.drawImage(img, 0, y, width, heights[i]); y += heights[i]; });
    stop();
    onCapture({ uri: c.toDataURL('image/jpeg', 0.9), mimeType: 'image/jpeg', width: c.width, height: c.height });
  }, [onCapture, parts, stop]);

  // ---------------------------------------------------------------- detection loop (~7 per second)
  useEffect(() => {
    const small = document.createElement('canvas');
    const sctx = small.getContext('2d', { willReadFrequently: true })!;
    const id = setInterval(() => {
      const v = videoRef.current;
      if (!v || !v.videoWidth || busy.current) return;
      const dw = DETECT_W, dh = Math.round((v.videoHeight * DETECT_W) / v.videoWidth);
      if (small.width !== dw || small.height !== dh) { small.width = dw; small.height = dh; }
      sctx.drawImage(v, 0, 0, dw, dh);
      const found = detectBill(toGray(sctx.getImageData(0, 0, dw, dh).data, dw, dh), dw, dh);
      if (!found) {
        det.current = null; steady.current = 0; setProgress(0); setStatus('searching');
        return;
      }
      const prev = det.current;
      det.current = { quad: found.quad, partial: found.partial, dw, dh };
      if (found.partial) { steady.current = 0; setProgress(0); setStatus('partial'); return; }
      steady.current = prev && !prev.partial && quadShift(prev.quad, found.quad, dw, dh) < 0.025 ? steady.current + 1 : 0;
      setStatus('found');
      if (modeRef.current === 'auto') {
        setProgress(Math.min(1, steady.current / STEADY));
        if (steady.current >= STEADY) capture();
      }
    }, 140);
    return () => clearInterval(id);
  }, [capture]);

  // ---------------------------------------------------------------- overlay (guides, outline, scan line)
  useEffect(() => {
    let raf = 0;
    const draw = (t: number) => {
      raf = requestAnimationFrame(draw);
      const cv = overlayRef.current, v = videoRef.current;
      if (!cv || !v) return;
      const cw = cv.clientWidth, ch = cv.clientHeight, dpr = window.devicePixelRatio || 1;
      if (cv.width !== Math.round(cw * dpr)) { cv.width = Math.round(cw * dpr); cv.height = Math.round(ch * dpr); }
      const ctx = cv.getContext('2d')!;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, cw, ch);
      const d = det.current;
      let top: number, bottom: number, left: number, right: number;
      if (d && !d.partial && v.videoWidth) {
        // Map detection coords → displayed video (object-fit: cover).
        const vw = v.videoWidth, vh = v.videoHeight, s = Math.max(cw / vw, ch / vh);
        const ox = (cw - vw * s) / 2, oy = (ch - vh * s) / 2, k = vw / d.dw;
        const pts = d.quad.map((p) => ({ x: p.x * k * s + ox, y: p.y * k * s + oy }));
        ctx.beginPath(); pts.forEach((p, i) => (i ? ctx.lineTo(p.x, p.y) : ctx.moveTo(p.x, p.y))); ctx.closePath();
        ctx.fillStyle = 'rgba(129,140,248,0.14)'; ctx.fill();
        ctx.lineWidth = 3; ctx.strokeStyle = P.primary; ctx.lineJoin = 'round'; ctx.stroke();
        for (const p of pts) { ctx.beginPath(); ctx.arc(p.x, p.y, 7, 0, Math.PI * 2); ctx.fillStyle = P.primary; ctx.fill(); ctx.lineWidth = 2; ctx.strokeStyle = '#fff'; ctx.stroke(); }
        top = Math.min(...pts.map((p) => p.y)); bottom = Math.max(...pts.map((p) => p.y));
        left = Math.min(...pts.map((p) => p.x)); right = Math.max(...pts.map((p) => p.x));
      } else {
        // Corner guides showing where to put the bill.
        const gw = cw * 0.78, gh = Math.min(ch * 0.62, gw * 1.6);
        left = (cw - gw) / 2; right = left + gw; top = Math.max(110, (ch - gh) / 2 - 40); bottom = top + gh;
        const L = 34;
        ctx.lineWidth = 5; ctx.lineCap = 'round'; ctx.strokeStyle = d?.partial ? P.warning : 'rgba(255,255,255,0.9)';
        ctx.beginPath();
        ctx.moveTo(left, top + L); ctx.lineTo(left, top); ctx.lineTo(left + L, top);
        ctx.moveTo(right - L, top); ctx.lineTo(right, top); ctx.lineTo(right, top + L);
        ctx.moveTo(right, bottom - L); ctx.lineTo(right, bottom); ctx.lineTo(right - L, bottom);
        ctx.moveTo(left + L, bottom); ctx.lineTo(left, bottom); ctx.lineTo(left, bottom - L);
        ctx.stroke();
      }
      // Scan line sweeping over the bill.
      const y = top + ((Math.sin(t / 650) + 1) / 2) * (bottom - top);
      const g = ctx.createLinearGradient(0, y - 40, 0, y);
      g.addColorStop(0, 'rgba(129,140,248,0)'); g.addColorStop(1, 'rgba(129,140,248,0.35)');
      ctx.fillStyle = g; ctx.fillRect(left + 6, y - 40, right - left - 12, 40);
      ctx.fillStyle = P.primary; ctx.shadowColor = P.primary; ctx.shadowBlur = 12;
      ctx.fillRect(left + 6, y - 1.5, right - left - 12, 3); ctx.shadowBlur = 0;
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, []);

  const toggleTorch = async () => {
    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return;
    const on = !torch.on;
    try { await track.applyConstraints({ advanced: [{ torch: on } as MediaTrackConstraintSet] }); setTorch({ available: true, on }); } catch { setTorch({ available: false, on: false }); }
  };

  const hint = mode === 'parts'
    ? parts.length ? `Part ${parts.length + 1}: move down the bill, overlap a line or two, then tap the shutter` : 'Part 1: fit the top of the bill, then tap the shutter'
    : { starting: 'Starting camera…', searching: 'Point at the bill — fit the whole bill in the frame', partial: 'Move back a little — part of the bill is outside', found: 'Whole bill found · hold steady', capturing: 'Capturing…' }[status];
  const hintOk = status === 'found' || status === 'capturing';

  const round = (size: number, children: React.ReactNode, onPress: () => void, label: string, on = false) => (
    <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={label}
      style={({ pressed }) => ({ width: size, height: size, borderRadius: size / 2, alignItems: 'center', justifyContent: 'center', backgroundColor: on ? P.primary : `rgba(255,255,255,${pressed ? 0.24 : 0.14})` })}>
      {children}
    </Pressable>
  );

  return (
    <View style={{ flex: 1, backgroundColor: '#000' }}>
      <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}>
        <video ref={videoRef} playsInline muted autoPlay aria-label="Camera view"
          style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', objectFit: 'cover', background: '#000' }} />
        <canvas ref={overlayRef} aria-hidden style={{ position: 'absolute', inset: 0, width: '100%', height: '100%', pointerEvents: 'none' }} />
        {flash ? <View style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, backgroundColor: 'rgba(255,255,255,0.6)' }} /> : null}
      </View>

      {/* Top bar */}
      <View style={{ flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingTop: 16 }}>
        {round(40, <Icon name="x" color={P.text} size={20} />, () => { stop(); onClose(); }, 'Close scanner')}
        <Text style={{ flex: 1, textAlign: 'center', color: P.text, fontSize: 18, fontWeight: '700' }}>Scan bill</Text>
        {round(40, <Icon name="help" color={P.text} size={20} />, () => setTips((x) => !x), 'Scanning tips')}
      </View>

      {/* Hint */}
      <View style={{ alignItems: 'center', marginTop: 14, paddingHorizontal: 16 }} accessibilityLiveRegion="polite">
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: 'rgba(0,0,0,0.55)', paddingVertical: 8, paddingHorizontal: 14, borderRadius: 999, maxWidth: 360 }}>
          {hintOk ? <Icon name="check" color={P.primary} size={16} strokeWidth={3} /> : status === 'partial' ? <Icon name="alert" color={P.warning} size={16} /> : null}
          <Text style={{ color: P.text, fontSize: 14, flexShrink: 1 }}>{hint}</Text>
        </View>
      </View>

      {tips ? (
        <View style={{ marginTop: 12, marginHorizontal: 24, backgroundColor: 'rgba(0,0,0,0.7)', borderRadius: 16, padding: 14, gap: 6 }}>
          {['Lay the bill flat on a darker surface', 'Get the whole bill in, edges and all', 'Good light, no shadow over the numbers', 'Very long bill? Use “Long bill · scan in parts”'].map((t) => (
            <View key={t} style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>
              <Icon name="check" color={P.primary} size={14} strokeWidth={3} />
              <Text style={{ color: P.text, fontSize: 14 }}>{t}</Text>
            </View>
          ))}
        </View>
      ) : null}

      <View style={{ flex: 1 }} />

      {/* Controls */}
      <View style={{ backgroundColor: 'rgba(0,0,0,0.55)', paddingTop: 14, paddingBottom: 30, paddingHorizontal: 24, gap: 16, alignItems: 'center' }}>
        <View style={{ flexDirection: 'row', backgroundColor: 'rgba(255,255,255,0.12)', borderRadius: 999, padding: 4, gap: 4 }}>
          {([['auto', 'Auto-capture'], ['parts', 'Long bill · scan in parts']] as const).map(([k, label]) => (
            <Pressable key={k} onPress={() => { setMode(k); setParts([]); steady.current = 0; setProgress(0); }} accessibilityRole="radio" aria-checked={mode === k}
              style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, backgroundColor: mode === k ? P.primary : 'transparent' }}>
              <Text style={{ fontSize: 12, fontWeight: '600', color: mode === k ? P.onPrimary : P.text }}>{label}</Text>
            </Pressable>
          ))}
        </View>

        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', alignSelf: 'stretch' }}>
          {round(52, <Icon name="image" color={P.text} size={24} />, () => { stop(); onGallery(); }, 'Choose a photo from the gallery')}
          <Pressable onPress={capture} accessibilityRole="button" accessibilityLabel={mode === 'parts' ? `Capture part ${parts.length + 1}` : 'Capture the bill'}
            style={({ pressed }) => ({ width: 78, height: 78, alignItems: 'center', justifyContent: 'center', opacity: pressed ? 0.85 : 1 })}>
            <Svg width={78} height={78} style={{ position: 'absolute' }}>
              <Circle cx={39} cy={39} r={36} stroke="#fff" strokeWidth={4} fill="none" />
              {progress > 0 ? (
                <Circle cx={39} cy={39} r={36} stroke={P.primary} strokeWidth={4} fill="none" strokeLinecap="round"
                  strokeDasharray={`${2 * Math.PI * 36}`} strokeDashoffset={`${2 * Math.PI * 36 * (1 - progress)}`} transform="rotate(-90 39 39)" />
              ) : null}
            </Svg>
            <View style={{ width: 60, height: 60, borderRadius: 30, backgroundColor: P.primary }} />
          </Pressable>
          {mode === 'parts' && parts.length ? (
            <Pressable onPress={finishParts} accessibilityRole="button" accessibilityLabel={`Done, ${parts.length} part${parts.length > 1 ? 's' : ''}`}
              style={{ minWidth: 52, height: 52, borderRadius: 26, paddingHorizontal: 14, alignItems: 'center', justifyContent: 'center', backgroundColor: P.primary }}>
              <Text style={{ color: P.onPrimary, fontWeight: '700', fontSize: 13 }}>Done · {parts.length}</Text>
            </Pressable>
          ) : torch.available ? (
            round(52, <Icon name="flash" color={torch.on ? P.onPrimary : P.text} size={24} />, toggleTorch, torch.on ? 'Turn the light off' : 'Turn the light on', torch.on)
          ) : (
            <View style={{ width: 52 }} />
          )}
        </View>
        <Text style={{ color: P.textMuted, fontSize: 12, textAlign: 'center' }}>
          {mode === 'auto' ? 'Auto-captures when all 4 corners are steady' : parts.length ? `${parts.length} part${parts.length > 1 ? 's' : ''} captured — tap Done when you reach the total` : 'Capture the bill from top to bottom'}
        </Text>
      </View>
    </View>
  );
}
