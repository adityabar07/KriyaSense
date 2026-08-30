/* ==========================================================================
   overlay.js
   Canvas renderer for the AI detection overlay. Takes a detection frame
   ({ persons: [...], objects: [...] }, all coordinates normalized 0..1)
   and draws it onto a canvas sized to match the media element beneath it.

   This file NEVER invents positions — every box/skeleton it draws comes
   straight from the frame it's given (mock today, a real backend's
   /ws/ai-stream payload tomorrow, same shape either way).
   ========================================================================== */

const ASTRA_OVERLAY = (() => {

  const BONES = [
    ['head', 'neck'], ['neck', 'lShoulder'], ['neck', 'rShoulder'],
    ['lShoulder', 'lElbow'], ['lElbow', 'lWrist'],
    ['rShoulder', 'rElbow'], ['rElbow', 'rWrist'],
    ['neck', 'spine'], ['spine', 'hip'],
    ['hip', 'lHip'], ['hip', 'rHip'],
    ['lHip', 'lKnee'], ['lKnee', 'lAnkle'],
    ['rHip', 'rKnee'], ['rKnee', 'rAnkle'],
  ];

  function resizeCanvas(canvas) {
    const rect = canvas.getBoundingClientRect();
    const dpr = window.devicePixelRatio || 1;
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
    }
    return { width: rect.width, height: rect.height, dpr };
  }

  function drawRoundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawLabel(ctx, x, y, lines, color) {
    ctx.font = '600 11px "JetBrains Mono", monospace';
    const padX = 6, padY = 5, lineH = 14;
    const w = Math.max(...lines.map(l => ctx.measureText(l).width)) + padX * 2;
    const h = lines.length * lineH + padY * 2 - 4;
    const ly = Math.max(h, y); // keep label on-screen if box is near the top edge
    ctx.fillStyle = 'rgba(3,10,18,0.85)';
    drawRoundRect(ctx, x, ly - h, w, h, 4);
    ctx.fill();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1;
    ctx.stroke();
    ctx.fillStyle = color;
    lines.forEach((line, i) => ctx.fillText(line, x + padX, ly - h + padY + (i + 1) * lineH - 4));
  }

  function drawBox(ctx, x, y, w, h, color, labelLines) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.shadowColor = color;
    ctx.shadowBlur = 8;
    drawRoundRect(ctx, x, y, w, h, 6);
    ctx.stroke();
    ctx.shadowBlur = 0;
    const t = 10;
    ctx.lineWidth = 3;
    [[x, y, 1, 1], [x + w, y, -1, 1], [x, y + h, 1, -1], [x + w, y + h, -1, -1]].forEach(([cx, cy, sx, sy]) => {
      ctx.beginPath();
      ctx.moveTo(cx, cy + t * sy);
      ctx.lineTo(cx, cy);
      ctx.lineTo(cx + t * sx, cy);
      ctx.stroke();
    });
    ctx.restore();
    if (labelLines) drawLabel(ctx, x, y - 4, labelLines, color);
  }

  function drawSkeleton(ctx, pts, color) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.lineWidth = 2.4;
    ctx.shadowColor = color;
    ctx.shadowBlur = 6;
    BONES.forEach(([a, b]) => {
      if (!pts[a] || !pts[b]) return;
      ctx.beginPath();
      ctx.moveTo(pts[a].x, pts[a].y);
      ctx.lineTo(pts[b].x, pts[b].y);
      ctx.stroke();
    });
    ctx.shadowBlur = 0;
    Object.entries(pts).forEach(([name, p]) => {
      const isHand = name === 'lWrist' || name === 'rWrist';
      ctx.beginPath();
      ctx.fillStyle = isHand ? '#ffb547' : color;
      ctx.arc(p.x, p.y, isHand ? 4.5 : 3, 0, Math.PI * 2);
      ctx.fill();
    });
    if (pts.head) {
      ctx.beginPath();
      ctx.fillStyle = color;
      ctx.globalAlpha = 0.25;
      ctx.arc(pts.head.x, pts.head.y, 11, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }
    ctx.restore();
  }

  /** frame = { persons: [{id,bbox,activity,confidence,pose}], objects: [{id,label,bbox,confidence}] } */
  function render(canvas, frame) {
    const { width, height, dpr } = resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    if (!frame) return;

    (frame.objects || []).forEach(o => {
      const x = o.bbox.x * width, y = o.bbox.y * height, w = o.bbox.width * width, h = o.bbox.height * height;
      drawBox(ctx, x, y, w, h, '#4d8dff', [o.label.replace(/_/g, ' '), `${o.confidence.toFixed(1)}% · #${o.id}`]);
    });

    (frame.persons || []).forEach(p => {
      const x = p.bbox.x * width, y = p.bbox.y * height, w = p.bbox.width * width, h = p.bbox.height * height;
      const label = window.ASTRA_ACTIVITY ? ASTRA_ACTIVITY.labelFor(p.activity) : p.activity;
      const idLabel = window.ASTRA_ACTIVITY ? ASTRA_ACTIVITY.formatPersonId(p.id) : `PERSON ${p.id}`;
      drawBox(ctx, x, y, w, h, '#3ee6ff', [idLabel, label.toUpperCase(), `CONF ${p.confidence.toFixed(1)}%`]);
      if (p.pose) {
        const pixelPose = {};
        Object.entries(p.pose).forEach(([k, pt]) => { pixelPose[k] = { x: pt.x * width, y: pt.y * height }; });
        drawSkeleton(ctx, pixelPose, '#39ff8f');
      }
    });
  }

  function drawPlaceholder(canvas, text) {
    const { width, height, dpr } = resizeCanvas(canvas);
    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(62,230,255,0.06)';
    ctx.lineWidth = 1;
    for (let gx = 0; gx < width; gx += 34) { ctx.beginPath(); ctx.moveTo(gx, 0); ctx.lineTo(gx, height); ctx.stroke(); }
    for (let gy = 0; gy < height; gy += 34) { ctx.beginPath(); ctx.moveTo(0, gy); ctx.lineTo(width, gy); ctx.stroke(); }
    ctx.fillStyle = '#6c7ea3';
    ctx.font = '600 12.5px "JetBrains Mono", monospace';
    ctx.textAlign = 'center';
    ctx.fillText(text, width / 2, height / 2);
    ctx.textAlign = 'left';
  }

  return { render, drawPlaceholder, resizeCanvas };
})();
