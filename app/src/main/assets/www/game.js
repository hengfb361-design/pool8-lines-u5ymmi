/* 8-Ball practice table — own game, offline.
   Aim lines: ghost ball, cue path tangent, object ball path and long
   multi-bounce cushion reflections, like a training aid in the game. */
(function () {
  'use strict';

  var W = 900, H = 450, RAIL = 46, R = 11, POCKET_R = 20;
  var MAX_SPEED = 2450, FRICTION = 1.75, STOP = 7, RESTITUTION = 0.96, RAIL_BOUNCE = 0.9;

  var canvas = document.getElementById('table');
  var ctx = canvas.getContext('2d');
  var powerEl = document.getElementById('power');
  var powerFill = document.getElementById('powerFill');
  var barsEl = document.getElementById('bars');
  var bannerEl = document.getElementById('banner');
  var bannerText = document.getElementById('bannerText');
  var linesBtn = document.getElementById('linesBtn');

  var COLORS = {
    1: '#f2c230', 2: '#1f6fd0', 3: '#d32f2f', 4: '#7b3fa0', 5: '#e07b1f',
    6: '#1f8f4e', 7: '#8d2b2b', 8: '#14171c',
    9: '#f2c230', 10: '#1f6fd0', 11: '#d32f2f', 12: '#7b3fa0', 13: '#e07b1f',
    14: '#1f8f4e', 15: '#8d2b2b'
  };
  var POCKETS = [
    { x: -2, y: -2 }, { x: W / 2, y: -6 }, { x: W + 2, y: -2 },
    { x: -2, y: H + 2 }, { x: W / 2, y: H + 6 }, { x: W + 2, y: H + 2 }
  ];

  var balls = [];
  var shots = 0;
  var aiming = null;          // {x, y} pointer in world space while dragging
  var angle = 0;              // cue direction, radians
  var power = 0.55;           // 0..1
  var showLines = true;
  var potted = 0;
  var over = false;
  var view = { scale: 1, ox: 0, oy: 0, cw: 0, ch: 0 };

  function ball(x, y, n) {
    return { x: x, y: y, vx: 0, vy: 0, n: n, alive: true, spin: 0 };
  }

  function rack() {
    balls = [];
    potted = 0;
    over = false;
    shots = 0;
    bannerEl.classList.remove('show');
    balls.push(ball(W * 0.22, H / 2, 0));
    var apex = W * 0.72;
    var order = [1, 9, 2, 10, 8, 3, 11, 4, 12, 5, 13, 6, 14, 7, 15];
    var k = 0;
    for (var col = 0; col < 5; col++) {
      for (var row = 0; row <= col; row++) {
        balls.push(ball(
          apex + col * (R * 1.78),
          H / 2 + (row - col / 2) * (R * 2.06),
          order[k++]
        ));
      }
    }
    renderBars();
  }

  /* ---------- geometry helpers ---------- */
  function norm(x, y) { var l = Math.hypot(x, y) || 1; return { x: x / l, y: y / l }; }
  function dot(a, b) { return a.x * b.x + a.y * b.y; }

  // distance along ray o + t*d to hit a circle of radius R around c
  function rayCircle(o, d, c, radius) {
    var ox = c.x - o.x, oy = c.y - o.y;
    var t = ox * d.x + oy * d.y;
    if (t < 0) return null;
    var perp2 = ox * ox + oy * oy - t * t;
    var rr = radius * radius;
    if (perp2 > rr) return null;
    var half = Math.sqrt(rr - perp2);
    var t0 = t - half;
    if (t0 <= 0.001) return null;
    return t0;
  }

  // distance along ray to the felt edge, keeping the ball radius inside
  function rayRail(o, d) {
    var best = Infinity, nx = 0, ny = 0;
    if (d.x > 1e-9) { var t1 = (W - R - o.x) / d.x; if (t1 >= 0 && t1 < best) { best = t1; nx = -1; ny = 0; } }
    if (d.x < -1e-9) { var t2 = (R - o.x) / d.x; if (t2 >= 0 && t2 < best) { best = t2; nx = 1; ny = 0; } }
    if (d.y > 1e-9) { var t3 = (H - R - o.y) / d.y; if (t3 >= 0 && t3 < best) { best = t3; nx = 0; ny = -1; } }
    if (d.y < -1e-9) { var t4 = (R - o.y) / d.y; if (t4 >= 0 && t4 < best) { best = t4; nx = 0; ny = 1; } }
    return { t: best, nx: nx, ny: ny };
  }

  /* ---------- aim prediction ---------- */
  function predict() {
    var cue = balls[0];
    if (!cue || !cue.alive) return null;
    var d = { x: Math.cos(angle), y: Math.sin(angle) };
    var out = { cue: cue, dir: d, hit: null, ghost: null, objectLine: null, end: null, bounces: [] };
    var bestBall = null, bestT = Infinity;

    for (var i = 1; i < balls.length; i++) {
      var b = balls[i];
      if (!b.alive) continue;
      var t = rayCircle(cue, d, b, R * 2);
      if (t !== null && t < bestT) { bestT = t; bestBall = b; }
    }
    var rail = rayRail(cue, d);
    if (bestBall && bestT < rail.t) {
      var gp = { x: cue.x + d.x * bestT, y: cue.y + d.y * bestT };
      out.hit = bestBall;
      out.ghost = gp;
      out.end = gp;
      var nd = norm(bestBall.x - gp.x, bestBall.y - gp.y);
      out.objectLine = continueLine({ x: bestBall.x, y: bestBall.y }, nd, 260, 3);
      // cue ball leaves along the tangent
      var tangent = { x: -nd.y, y: nd.x };
      if (dot(tangent, d) < 0) { tangent.x = -tangent.x; tangent.y = -tangent.y; }
      out.cueLine = continueLine(gp, tangent, 150, 1);
    } else {
      var p = { x: cue.x + d.x * rail.t, y: cue.y + d.y * rail.t };
      out.end = p;
      out.bounces = continueLine(cue, d, 3200, 4);
    }
    return out;
  }

  // walk a ray, bouncing off rails, collecting segments up to `bounces`
  function continueLine(start, dir, maxLen, bounces) {
    var segs = [];
    var o = { x: start.x, y: start.y };
    var d = { x: dir.x, y: dir.y };
    var left = maxLen;
    for (var i = 0; i <= bounces && left > 4; i++) {
      var rail = rayRail(o, d);
      var len = Math.min(rail.t, left);
      var end = { x: o.x + d.x * len, y: o.y + d.y * len };
      segs.push({ a: o, b: end, bounce: i });
      left -= len;
      if (len < rail.t - 0.5) break;
      // reflect, nudged off the rail so the next segment starts clean
      o = { x: end.x + rail.nx * 0.6, y: end.y + rail.ny * 0.6 };
      var dn = dot(d, { x: rail.nx, y: rail.ny });
      d = norm(d.x - 2 * dn * rail.nx, d.y - 2 * dn * rail.ny);
    }
    return segs;
  }

  /* ---------- simulation ---------- */
  function step(dt) {
    var i, j, b;
    for (i = 0; i < balls.length; i++) {
      b = balls[i];
      if (!b.alive) continue;
      b.x += b.vx * dt;
      b.y += b.vy * dt;
      var decay = Math.max(0, 1 - FRICTION * dt);
      b.vx *= decay; b.vy *= decay;
      if (Math.hypot(b.vx, b.vy) < STOP) { b.vx = 0; b.vy = 0; }
      // rails
      if (b.x < R) { b.x = R; b.vx = -b.vx * RAIL_BOUNCE; }
      if (b.x > W - R) { b.x = W - R; b.vx = -b.vx * RAIL_BOUNCE; }
      if (b.y < R) { b.y = R; b.vy = -b.vy * RAIL_BOUNCE; }
      if (b.y > H - R) { b.y = H - R; b.vy = -b.vy * RAIL_BOUNCE; }
      // pockets
      for (j = 0; j < POCKETS.length; j++) {
        var p = POCKETS[j];
        if (Math.hypot(b.x - p.x, b.y - p.y) < POCKET_R) { sink(b); break; }
      }
    }
    // ball-ball
    for (i = 0; i < balls.length; i++) {
      var a = balls[i];
      if (!a.alive) continue;
      for (j = i + 1; j < balls.length; j++) {
        b = balls[j];
        if (!b.alive) continue;
        var dx = b.x - a.x, dy = b.y - a.y;
        var dist = Math.hypot(dx, dy);
        if (dist === 0 || dist > R * 2) continue;
        var nx = dx / dist, ny = dy / dist;
        var overlap = R * 2 - dist;
        a.x -= nx * overlap / 2; a.y -= ny * overlap / 2;
        b.x += nx * overlap / 2; b.y += ny * overlap / 2;
        var p1 = a.vx * nx + a.vy * ny;
        var p2 = b.vx * nx + b.vy * ny;
        if (p1 - p2 <= 0) continue;
        var imp = (p1 - p2) * RESTITUTION;
        a.vx -= imp * nx; a.vy -= imp * ny;
        b.vx += imp * nx; b.vy += imp * ny;
      }
    }
  }

  function moving() {
    for (var i = 0; i < balls.length; i++) {
      var b = balls[i];
      if (b.alive && (b.vx !== 0 || b.vy !== 0)) return true;
    }
    return false;
  }

  function sink(b) {
    if (b.n === 0) {
      // cue ball: back on the head spot
      b.alive = true;
      b.x = W * 0.22; b.y = H / 2;
      b.vx = 0; b.vy = 0;
      flash('បាល់ស ធ្លាក់ — ដាក់វិញនៅចំណុចដើម');
      return;
    }
    b.alive = false;
    b.vx = 0; b.vy = 0;
    potted += 1;
    renderBars();
    var remaining = balls.filter(function (x) { return x.alive && x.n !== 0 && x.n !== 8; }).length;
    var eightAlive = balls.some(function (x) { return x.alive && x.n === 8; });
    if (b.n === 8) {
      endGame(eightAlive ? false : remaining === 0, b);
    } else if (remaining === 0 && eightAlive) {
      flash('បាល់ទាំងអស់ធ្លាក់ហើយ — ដាក់បាល់ ៨');
    }
  }

  function endGame(win) {
    over = true;
    bannerText.textContent = win ? 'ឈ្នះ! អ្នកដាក់បាល់ ៨ ចុងក្រោយ 🎉' : 'ចាញ់ — បាល់ ៨ ធ្លាក់មុនកាល';
    bannerEl.classList.add('show');
  }

  var flashTimer = 0;
  function flash(msg) {
    bannerText.textContent = msg;
    bannerEl.classList.add('show');
    clearTimeout(flashTimer);
    flashTimer = setTimeout(function () {
      if (!over) bannerEl.classList.remove('show');
    }, 2200);
  }

  /* ---------- rendering ---------- */
  function layout() {
    var rect = canvas.getBoundingClientRect();
    var dpr = Math.min(2, window.devicePixelRatio || 1);
    var cw = rect.width || 360, ch = rect.height || 240;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    var scale = Math.min(cw / (W + RAIL * 2), ch / (H + RAIL * 2));
    view = {
      scale: scale, dpr: dpr, cw: cw, ch: ch,
      ox: (cw - (W + RAIL * 2) * scale) / 2 + RAIL * scale,
      oy: (ch - (H + RAIL * 2) * scale) / 2 + RAIL * scale
    };
    draw();
  }

  function toWorld(ev) {
    var rect = canvas.getBoundingClientRect();
    var x = (ev.clientX - rect.left - view.ox) / view.scale;
    var y = (ev.clientY - rect.top - view.oy) / view.scale;
    return { x: x, y: y };
  }

  function drawTable() {
    ctx.fillStyle = '#1b2027';
    ctx.fillRect(-RAIL, -RAIL, W + RAIL * 2, H + RAIL * 2);

    var wood = ctx.createLinearGradient(0, -RAIL, 0, H + RAIL);
    wood.addColorStop(0, '#7b4a24');
    wood.addColorStop(0.5, '#5d3417');
    wood.addColorStop(1, '#3f2310');
    ctx.fillStyle = wood;
    roundRect(-RAIL, -RAIL, W + RAIL * 2, H + RAIL * 2, 18);
    ctx.fill();

    var felt = ctx.createRadialGradient(W / 2, H / 2, 40, W / 2, H / 2, W * 0.62);
    felt.addColorStop(0, '#1c8a7c');
    felt.addColorStop(1, '#0d5f57');
    ctx.fillStyle = felt;
    ctx.fillRect(0, 0, W, H);
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 2;
    ctx.strokeRect(0, 0, W, H);

    // diamonds
    ctx.fillStyle = 'rgba(240,235,220,.75)';
    for (var i = 1; i < 8; i++) {
      if (i === 4) continue;
      var dx = (W / 8) * i;
      diamond(dx, -RAIL / 2);
      diamond(dx, H + RAIL / 2);
    }
    for (var j = 1; j < 4; j++) {
      var dy = (H / 4) * j;
      diamond(-RAIL / 2, dy);
      diamond(W + RAIL / 2, dy);
    }

    // head string + foot spot
    ctx.strokeStyle = 'rgba(255,255,255,.12)';
    ctx.beginPath();
    ctx.moveTo(W * 0.25, 0); ctx.lineTo(W * 0.25, H);
    ctx.stroke();

    POCKETS.forEach(function (p) {
      var g = ctx.createRadialGradient(p.x, p.y, 2, p.x, p.y, POCKET_R);
      g.addColorStop(0, '#000');
      g.addColorStop(0.7, '#05070a');
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(p.x, p.y, POCKET_R, 0, Math.PI * 2);
      ctx.fill();
    });
  }

  function diamond(x, y) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(Math.PI / 4);
    ctx.fillRect(-3.2, -3.2, 6.4, 6.4);
    ctx.restore();
  }

  function roundRect(x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawBall(b) {
    var col = b.n === 0 ? '#fbfbf7' : COLORS[b.n];
    var stripe = b.n > 8;
    ctx.save();
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.closePath();
    ctx.fillStyle = stripe ? '#f7f7f2' : col;
    ctx.fill();
    if (stripe) {
      ctx.save();
      ctx.clip();
      ctx.fillStyle = col;
      ctx.fillRect(b.x - R, b.y - R * 0.62, R * 2, R * 1.24);
      ctx.restore();
    }
    var sh = ctx.createRadialGradient(b.x - R * 0.35, b.y - R * 0.4, R * 0.15, b.x, b.y, R);
    sh.addColorStop(0, 'rgba(255,255,255,.55)');
    sh.addColorStop(0.45, 'rgba(255,255,255,0)');
    sh.addColorStop(1, 'rgba(0,0,0,.45)');
    ctx.fillStyle = sh;
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.fill();
    if (b.n > 0) {
      ctx.fillStyle = '#fbfbf7';
      ctx.beginPath();
      ctx.arc(b.x, b.y, R * 0.52, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = '#12151a';
      ctx.font = '700 ' + Math.round(R * 0.82) + 'px system-ui, sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(String(b.n), b.x, b.y + 0.5);
    }
    ctx.strokeStyle = 'rgba(0,0,0,.35)';
    ctx.lineWidth = 0.8;
    ctx.beginPath();
    ctx.arc(b.x, b.y, R, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();
  }

  function line(a, b, style, width, dash) {
    ctx.save();
    ctx.strokeStyle = style;
    ctx.lineWidth = width;
    if (dash) ctx.setLineDash(dash);
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
    ctx.restore();
  }

  function drawAim() {
    if (!showLines || over) return;
    var cue = balls[0];
    if (!cue || !cue.alive || moving()) return;
    var p = predict();
    if (!p) return;

    var REFLECT = ['rgba(197,139,255,.82)', 'rgba(224,138,74,.82)', 'rgba(255,255,255,.5)', 'rgba(255,255,255,.32)'];

    // main white line from the cue ball
    line(cue, p.end, 'rgba(255,255,255,.92)', 2.2);

    if (p.hit) {
      // ghost ball at contact
      ctx.save();
      ctx.strokeStyle = 'rgba(255,255,255,.85)';
      ctx.lineWidth = 1.6;
      ctx.setLineDash([4, 4]);
      ctx.beginPath();
      ctx.arc(p.ghost.x, p.ghost.y, R, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();

      // object ball predicted path, with its own long reflections
      p.objectLine.forEach(function (seg) {
        line(seg.a, seg.b, REFLECT[Math.min(seg.bounce, REFLECT.length - 1)], seg.bounce === 0 ? 2.4 : 1.6, seg.bounce === 0 ? null : [7, 5]);
      });

      // cue ball after contact (tangent)
      (p.cueLine || []).forEach(function (seg) {
        line(seg.a, seg.b, 'rgba(255,255,255,.5)', 1.6, [6, 5]);
      });
    }

    // long cushion reflections of the cue line itself
    p.bounces.forEach(function (seg) {
      line(seg.a, seg.b, REFLECT[Math.min(seg.bounce, REFLECT.length - 1)], seg.bounce === 0 ? 2.2 : 1.8, seg.bounce === 0 ? null : [8, 6]);
    });
  }

  function drawCue() {
    var cue = balls[0];
    if (!cue || !cue.alive || moving() || over) return;
    var back = 26 + power * 46;
    var d = { x: Math.cos(angle), y: Math.sin(angle) };
    var tip = { x: cue.x - d.x * (R + 4 + back * 0.02), y: cue.y - d.y * (R + 4 + back * 0.02) };
    var butt = { x: cue.x - d.x * (R + back), y: cue.y - d.y * (R + back) };
    var g = ctx.createLinearGradient(tip.x, tip.y, butt.x, butt.y);
    g.addColorStop(0, '#f0e3c8');
    g.addColorStop(0.15, '#c9a06a');
    g.addColorStop(1, '#6b3d1c');
    ctx.save();
    ctx.strokeStyle = g;
    ctx.lineWidth = 5.5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(tip.x, tip.y);
    ctx.lineTo(butt.x, butt.y);
    ctx.stroke();
    ctx.restore();
  }

  function draw() {
    var dpr = view.dpr || 1;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    ctx.clearRect(0, 0, view.cw, view.ch);
    ctx.fillStyle = '#0d1117';
    ctx.fillRect(0, 0, view.cw, view.ch);
    var s = view.scale * dpr;
    ctx.setTransform(s, 0, 0, s, view.ox * dpr, view.oy * dpr);

    drawTable();
    drawAim();
    balls.forEach(function (b) { if (b.alive) drawBall(b); });
    drawCue();
  }

  function renderBars() {
    var total = balls.filter(function (b) { return b.n > 0 && b.n !== 8 && b.alive; }).length;
    var html = '';
    for (var i = 0; i < total; i++) html += '<i></i>';
    barsEl.innerHTML = html || '<em>តុទទេ</em>';
  }

  /* ---------- input ---------- */
  var dragging = false;

  function aimAt(pt) {
    var cue = balls[0];
    if (!cue || !cue.alive) return;
    var dx = pt.x - cue.x, dy = pt.y - cue.y;
    var dist = Math.hypot(dx, dy);
    if (dist < 6) return;
    angle = Math.atan2(dy, dx);
    // pull back further = more power, but never removed from the table centre
    power = Math.max(0.12, Math.min(1, (dist - R) / 320));
    powerFill.style.width = Math.round(power * 100) + '%';
    powerEl.classList.add('live');
    draw();
  }

  canvas.addEventListener('pointerdown', function (ev) {
    if (moving() || over) return;
    canvas.setPointerCapture(ev.pointerId);
    dragging = true;
    aimAt(toWorld(ev));
  });
  canvas.addEventListener('pointermove', function (ev) {
    if (!dragging) return;
    aimAt(toWorld(ev));
  });
  canvas.addEventListener('pointerup', function (ev) {
    if (!dragging) return;
    dragging = false;
    powerEl.classList.remove('live');
    shoot();
  });
  canvas.addEventListener('pointercancel', function () {
    dragging = false;
    powerEl.classList.remove('live');
  });

  function shoot() {
    var cue = balls[0];
    if (!cue || !cue.alive || moving() || over) return;
    var speed = 250 + power * (MAX_SPEED - 250);
    cue.vx = Math.cos(angle) * speed;
    cue.vy = Math.sin(angle) * speed;
    shots += 1;
  }

  document.getElementById('resetBtn').addEventListener('click', function () {
    rack();
    draw();
  });
  linesBtn.addEventListener('click', function () {
    showLines = !showLines;
    linesBtn.classList.toggle('off', !showLines);
  });

  /* ---------- loop ---------- */
  var last = 0;
  function frame(t) {
    if (!last) last = t;
    var dt = Math.min(0.05, (t - last) / 1000);
    last = t;
    var sub = 4;
    var h = dt / sub;
    for (var i = 0; i < sub; i++) step(h);
    draw();
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', layout);
  rack();
  layout();
  requestAnimationFrame(frame);
})();
