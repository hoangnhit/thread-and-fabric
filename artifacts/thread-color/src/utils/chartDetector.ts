export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface MatchPair {
  swatch: Rect;
  label: Rect;
  swatchCenter: { x: number; y: number };
  labelCenter: { x: number; y: number };
}

export interface DetectedColumn {
  swatchBounds: Rect;
  labelBounds: Rect;
  swatches: Rect[];
  labels: Rect[];
  matches: MatchPair[];
}

export interface DetectionResult {
  columns: DetectedColumn[];
  W: number;
  H: number;
}

function px4(data: Uint8ClampedArray, W: number, x: number, y: number): [number, number, number] {
  const i = (y * W + x) * 4;
  return [data[i], data[i + 1], data[i + 2]];
}

function brt(r: number, g: number, b: number) {
  return (r * 299 + g * 587 + b * 114) / 1000;
}

function sat(r: number, g: number, b: number) {
  const mx = Math.max(r, g, b), mn = Math.min(r, g, b);
  return mx === 0 ? 0 : (mx - mn) / mx;
}

function smooth(arr: Float32Array, k: number): Float32Array {
  const out = new Float32Array(arr.length);
  for (let i = 0; i < arr.length; i++) {
    let s = 0, c = 0;
    for (let d = -k; d <= k; d++) {
      const j = i + d;
      if (j >= 0 && j < arr.length) { s += arr[j]; c++; }
    }
    out[i] = s / c;
  }
  return out;
}

function findPeaksAtMinDist(arr: Float32Array, start: number, end: number, threshold: number, minDist: number): number[] {
  const halfW = Math.max(2, Math.round(minDist * 0.35));
  const raw: number[] = [];

  for (let y = start + Math.round(minDist * 0.3); y <= end - Math.round(minDist * 0.3); y++) {
    if (arr[y] < threshold) continue;
    let isMax = true;
    for (let dy = -halfW; dy <= halfW; dy++) {
      if (dy === 0) continue;
      const yy = y + dy;
      if (yy >= start && yy <= end && arr[yy] > arr[y]) { isMax = false; break; }
    }
    if (isMax) raw.push(y);
  }

  const out: number[] = [];
  for (const p of raw) {
    if (out.length === 0 || p - out[out.length - 1] > minDist) {
      out.push(p);
    } else if (arr[p] > arr[out[out.length - 1]]) {
      out[out.length - 1] = p;
    }
  }
  return out;
}

function adaptivePeaks(signal: Float32Array, chartTop: number, chartBot: number, minDist: number, targetCount: number): number[] {
  const maxVal = Math.max(...signal.slice(chartTop, chartBot + 1));
  if (maxVal <= 0) return [];

  let bestPeaks: number[] = [];
  let bestDiff = Infinity;

  for (let frac = 0.5; frac >= 0.01; frac -= 0.01) {
    const th = maxVal * frac;
    const peaks = findPeaksAtMinDist(signal, chartTop, chartBot, th, minDist);
    const diff = Math.abs(peaks.length - targetCount);
    if (diff < bestDiff || (diff === bestDiff && peaks.length > bestPeaks.length)) {
      bestDiff = diff;
      bestPeaks = peaks;
    }
    if (peaks.length === targetCount) break;
  }

  return bestPeaks;
}

export function detectChart(imageData: ImageData): DetectionResult {
  const { data, width: W, height: H } = imageData;

  const nSamples = 15;
  const sampleYs = Array.from({ length: nSamples }, (_, i) =>
    Math.round(H * (0.1 + 0.8 * i / (nSamples - 1)))
  );

  const hSat = new Float32Array(W);
  for (const sy of sampleYs) {
    for (let x = 0; x < W; x++) {
      const [r, g, b] = px4(data, W, x, sy);
      hSat[x] += sat(r, g, b);
    }
  }
  for (let x = 0; x < W; x++) hSat[x] /= nSamples;
  const hSatSm = smooth(hSat, 8);

  const SAT_TH = 0.10;
  const minRunW = W * 0.025;
  const swatchRuns: { x1: number; x2: number }[] = [];
  let inRun = false, rStart = 0;
  for (let x = 0; x <= W; x++) {
    const v = x < W ? hSatSm[x] : 0;
    if (v > SAT_TH) {
      if (!inRun) { inRun = true; rStart = x; }
    } else {
      if (inRun) {
        inRun = false;
        if (x - rStart > minRunW) swatchRuns.push({ x1: rStart, x2: x });
      }
    }
  }

  const columns: DetectedColumn[] = [];
  const TARGET_ROWS = 20;

  for (let ci = 0; ci < swatchRuns.length; ci++) {
    const { x1: sx1, x2: sx2 } = swatchRuns[ci];
    const sw = sx2 - sx1;
    const lx1 = ci === 0 ? 0 : swatchRuns[ci - 1].x2;
    const lx2 = sx1;
    const labelW = lx2 - lx1;

    const nX = Math.max(7, Math.round(sw * 0.4));
    const xSamples = Array.from({ length: nX }, (_, i) =>
      Math.round(sx1 + sw * (0.1 + 0.8 * i / (nX - 1)))
    );

    const vSat = new Float32Array(H);
    const vBrt = new Float32Array(H);
    for (let y = 0; y < H; y++) {
      let sSum = 0, bSum = 0;
      for (const xx of xSamples) {
        const [r, g, b] = px4(data, W, xx, y);
        sSum += sat(r, g, b);
        bSum += brt(r, g, b);
      }
      vSat[y] = sSum / nX;
      vBrt[y] = bSum / nX;
    }

    let chartTop = 0, chartBot = H - 1;
    for (let y = 0; y < H; y++) if (vSat[y] > 0.05) { chartTop = y; break; }
    for (let y = H - 1; y >= 0; y--) if (vSat[y] > 0.05) { chartBot = y; break; }
    const chartH = chartBot - chartTop;

    if (chartH < H * 0.15) {
      columns.push({
        swatchBounds: { x: sx1, y: chartTop, w: sw, h: chartH },
        labelBounds: { x: lx1, y: chartTop, w: labelW, h: chartH },
        swatches: [], labels: [], matches: [],
      });
      continue;
    }

    const expectedSwH = chartH / TARGET_ROWS;
    const minSwH = expectedSwH * 0.45;

    const colorDiff = new Float32Array(H);
    for (let y = chartTop + 1; y <= chartBot; y++) {
      let diffSum = 0;
      for (const xx of xSamples) {
        const [r1, g1, b1] = px4(data, W, xx, y - 1);
        const [r2, g2, b2] = px4(data, W, xx, y);
        diffSum += Math.sqrt((r2 - r1) ** 2 + (g2 - g1) ** 2 + (b2 - b1) ** 2);
      }
      colorDiff[y] = diffSum / nX;
    }
    const cdSm = smooth(colorDiff, 3);

    const vBrtSm = smooth(vBrt, 2);
    const vSatSm = smooth(vSat, 2);
    const windowR = Math.max(3, Math.round(chartH / 80));

    const brtPeak = new Float32Array(H);
    const satDip = new Float32Array(H);
    for (let y = chartTop + windowR; y <= chartBot - windowR; y++) {
      let bAbove = 0, bBelow = 0, sAbove = 0, sBelow = 0;
      for (let d = 1; d <= windowR; d++) {
        bAbove += vBrtSm[y - d]; bBelow += vBrtSm[y + d];
        sAbove += vSatSm[y - d]; sBelow += vSatSm[y + d];
      }
      const bAvg = (bAbove + bBelow) / (2 * windowR);
      const sAvg = (sAbove + sBelow) / (2 * windowR);
      brtPeak[y] = Math.max(0, vBrtSm[y] - bAvg);
      satDip[y] = Math.max(0, (sAvg - vSatSm[y]) * 80);
    }
    const bpSm = smooth(brtPeak, 2);
    const sdSm = smooth(satDip, 2);

    const cdMax = Math.max(1, ...cdSm.slice(chartTop, chartBot + 1));
    const bpMax = Math.max(1, ...bpSm.slice(chartTop, chartBot + 1));
    const sdMax = Math.max(1, ...sdSm.slice(chartTop, chartBot + 1));

    const combined = new Float32Array(H);
    for (let y = chartTop; y <= chartBot; y++) {
      combined[y] =
        (cdSm[y] / cdMax) * 0.4 +
        (bpSm[y] / bpMax) * 0.35 +
        (sdSm[y] / sdMax) * 0.25;
    }
    const combSm = smooth(combined, 2);

    let bestPeaks = adaptivePeaks(combSm, chartTop, chartBot, minSwH, TARGET_ROWS - 1);

    if (bestPeaks.length < 15) {
      const cdPeaks = adaptivePeaks(cdSm, chartTop, chartBot, minSwH, TARGET_ROWS - 1);
      if (cdPeaks.length > bestPeaks.length) bestPeaks = cdPeaks;
    }
    if (bestPeaks.length < 15) {
      const bpPeaks = adaptivePeaks(bpSm, chartTop, chartBot, minSwH, TARGET_ROWS - 1);
      if (bpPeaks.length > bestPeaks.length) bestPeaks = bpPeaks;
    }

    if (bestPeaks.length < 10) {
      bestPeaks = [];
      for (let i = 1; i < TARGET_ROWS; i++) {
        bestPeaks.push(Math.round(chartTop + i * expectedSwH));
      }
    }

    const allBounds = [chartTop, ...bestPeaks, chartBot];
    const swatches: Rect[] = [];
    for (let i = 0; i < allBounds.length - 1; i++) {
      const y1 = allBounds[i];
      const y2 = allBounds[i + 1];
      if (y2 - y1 > minSwH * 0.2) {
        swatches.push({ x: sx1, y: y1, w: sw, h: y2 - y1 });
      }
    }

    const labels: Rect[] = [];
    if (labelW > 10) {
      const nlx = Math.max(5, Math.round(labelW * 0.5));
      const lxArr = Array.from({ length: nlx }, (_, i) =>
        Math.round(lx1 + labelW * (0.1 + 0.8 * i / (nlx - 1)))
      );
      const darkP = new Float32Array(H);
      for (let y = chartTop; y <= chartBot; y++) {
        let dark = 0;
        for (const xx of lxArr) {
          const [r, g, b] = px4(data, W, xx, y);
          if (brt(r, g, b) < 120) dark++;
        }
        darkP[y] = dark / nlx;
      }
      const dpSm = smooth(darkP, 2);
      const textTh = 0.10;
      let tStart = -1;
      for (let y = chartTop; y <= chartBot + 1; y++) {
        const hasText = y <= chartBot && dpSm[y] > textTh;
        if (hasText) {
          if (tStart === -1) tStart = y;
        } else {
          if (tStart !== -1) {
            if (y - tStart > 3) labels.push({ x: lx1, y: tStart, w: labelW, h: y - tStart });
            tStart = -1;
          }
        }
      }
    }

    const matches: MatchPair[] = [];
    const usedLabels = new Set<number>();

    for (const swatch of swatches) {
      const sCy = swatch.y + swatch.h / 2;
      let bestIdx = -1, bestDist = Infinity;
      for (let li = 0; li < labels.length; li++) {
        if (usedLabels.has(li)) continue;
        const lCy = labels[li].y + labels[li].h / 2;
        const d = Math.abs(sCy - lCy);
        if (d < bestDist) { bestDist = d; bestIdx = li; }
      }
      const matchedLabel = bestIdx >= 0 && bestDist < expectedSwH * 1.5
        ? labels[bestIdx]
        : { x: lx1, y: swatch.y, w: labelW, h: swatch.h };
      if (bestIdx >= 0 && bestDist < expectedSwH * 1.5) usedLabels.add(bestIdx);

      matches.push({
        swatch,
        label: matchedLabel,
        swatchCenter: { x: swatch.x + swatch.w / 2, y: sCy },
        labelCenter: { x: matchedLabel.x + matchedLabel.w / 2, y: matchedLabel.y + matchedLabel.h / 2 },
      });
    }

    columns.push({
      swatchBounds: { x: sx1, y: chartTop, w: sw, h: chartH },
      labelBounds: { x: lx1, y: chartTop, w: labelW, h: chartH },
      swatches,
      labels,
      matches,
    });
  }

  return { columns, W, H };
}

export function drawDebugOverlay(
  ctx: CanvasRenderingContext2D,
  det: DetectionResult
) {
  for (const col of det.columns) {
    ctx.setLineDash([10, 5]);
    ctx.lineWidth = 3;
    ctx.strokeStyle = "rgba(59,130,246,0.8)";
    ctx.strokeRect(col.swatchBounds.x, col.swatchBounds.y, col.swatchBounds.w, col.swatchBounds.h);
    ctx.strokeStyle = "rgba(34,197,94,0.8)";
    ctx.strokeRect(col.labelBounds.x, col.labelBounds.y, col.labelBounds.w, col.labelBounds.h);
    ctx.setLineDash([]);

    for (const sw of col.swatches) {
      ctx.strokeStyle = "rgba(249,115,22,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(sw.x + 1, sw.y + 1, sw.w - 2, sw.h - 2);
      ctx.fillStyle = "rgba(249,115,22,0.9)";
      ctx.beginPath();
      ctx.arc(sw.x + sw.w / 2, sw.y + sw.h / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const lb of col.labels) {
      ctx.strokeStyle = "rgba(236,72,153,0.7)";
      ctx.lineWidth = 2;
      ctx.strokeRect(lb.x + 1, lb.y + 1, lb.w - 2, lb.h - 2);
      ctx.fillStyle = "rgba(236,72,153,0.9)";
      ctx.beginPath();
      ctx.arc(lb.x + lb.w / 2, lb.y + lb.h / 2, 5, 0, Math.PI * 2);
      ctx.fill();
    }

    for (const m of col.matches) {
      ctx.strokeStyle = "rgba(234,179,8,0.9)";
      ctx.lineWidth = 2;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(m.labelCenter.x, m.labelCenter.y);
      ctx.lineTo(m.swatchCenter.x, m.swatchCenter.y);
      ctx.stroke();
    }
  }
}
