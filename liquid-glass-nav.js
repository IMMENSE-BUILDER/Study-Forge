/* ============================================================
   StudyForged — Ray-Traced Liquid Glass Engine
   3D SDF raymarching, Snell refraction, Total Internal Reflection
   border caustics, chromatic dispersion, and damped spring physics
   adapted from MuhammadaliMS/liquid-glass (MIT License, Copyright (c) 2026 zerowing).

   Multi-surface hybrid dual-layer architecture for live scrolling PWA DOM:
   1. Live-DOM Refraction Layer: CPU-computed per-surface 3D ray-traced
      Snell + TIR displacement map driving a 3-channel sRGB SVG
      <feDisplacementMap> backdrop-filter (Chromium) with frosted CSS fallback.
   2. Transparent WebGL 3D Glass Surface: real-time raymarched 3D SDF
      (outer pill + optional smooth-min blended active droplet lens)
      rendering Fresnel rims, softbox reflections, pointer liquid bulge,
      TIR border caustics & dispersion, specular glints, and contact shadow.

   Active surfaces (within 5 total WebGL contexts):
   - Main view: #bottomNav, #aiSearchBar > .ai-search-inner
   - Ask AI page (lazy on .open, sleeps on close):
     .ai-page-header, .ai-mode-bar (with active droplet), .ai-input-bar
   ============================================================ */
(function () {
  'use strict';

  var GLASS_IOR = 1.48;
  var RAY_CAMERA = 780;
  var RAY_BACK = -165;
  var SINK_THRESH = 0.001;
  var SVG_NS = 'http://www.w3.org/2000/svg';

  function clamp(value, minimum, maximum) {
    return Math.min(maximum, Math.max(minimum, value));
  }

  /** Frame-rate-independent damped spring integrator (ported from panes.ts). */
  function stepSpring(value, velocity, target, deltaSeconds, stiffness, damping) {
    var duration = clamp(Number.isFinite(deltaSeconds) ? deltaSeconds : 0, 0, 1 / 15);
    var steps = Math.max(1, Math.ceil(duration / (1 / 240)));
    var dt = duration / steps;
    var position = value;
    var speed = velocity;
    var k = stiffness === undefined ? 420 : stiffness;
    var c = damping === undefined ? 18 : damping;
    for (var i = 0; i < steps; i++) {
      speed += ((target - position) * k - speed * c) * dt;
      position += speed * dt;
    }
    return [position, speed];
  }

  /** Detect whether Chromium's SVG url() backdrop-filter pipeline is supported. */
  function supportsSvgBackdropRefraction() {
    if (typeof CSS === 'undefined' || typeof CSS.supports !== 'function') return false;
    var hasBackdrop = CSS.supports('backdrop-filter', 'blur(1px)') || CSS.supports('-webkit-backdrop-filter', 'blur(1px)');
    if (!hasBackdrop) return false;
    var ua = navigator.userAgent || '';
    var isBlink = /Chrome|Chromium|Edg|OPR|Brave|CriOS|SamsungBrowser/i.test(ua) && !/Firefox|FxiOS/i.test(ua);
    var isSafariOnly = /Safari/i.test(ua) && !/Chrome|Chromium|Edg|OPR|Brave|CriOS|Android/i.test(ua);
    return isBlink && !isSafariOnly;
  }

  /* ------------------------------------------------------------
     Layer 1: Exact 3D SDF + Snell + TIR Displacement Map Builder
     ------------------------------------------------------------ */
  function sdRoundedBox2D(px, py, hw, hh, r) {
    var qx = Math.abs(px) - hw + r;
    var qy = Math.abs(py) - hh + r;
    var ax = Math.max(qx, 0);
    var ay = Math.max(qy, 0);
    return Math.min(Math.max(qx, qy), 0) + Math.hypot(ax, ay) - r;
  }

  function refract3(ix, iy, iz, nx, ny, nz, eta) {
    var ndi = ix * nx + iy * ny + iz * nz;
    var k = 1.0 - eta * eta * (1.0 - ndi * ndi);
    if (k < 0.0) return null;
    var scale = eta * ndi + Math.sqrt(k);
    return [eta * ix - scale * nx, eta * iy - scale * ny, eta * iz - scale * nz];
  }

  function reflect3(ix, iy, iz, nx, ny, nz) {
    var d = 2.0 * (ix * nx + iy * ny + iz * nz);
    return [ix - d * nx, iy - d * ny, iz - d * nz];
  }

  function buildRayTracedDisplacementURL(width, height, radius, maxDisp) {
    var W = Math.max(32, Math.round(width));
    var H = Math.max(24, Math.round(height));
    var hw = W * 0.5;
    var hh = H * 0.5;
    var r = Math.min(radius, hw, hh);
    var halfDepth = Math.min(18, hh * 0.58);
    var rounding = Math.min(11, hh * 0.36);
    var domeHeight = 2.6;
    var rx = Math.max(hw, 20);
    var ry = Math.max(hh, 20);
    var invRx2 = 1.0 / (rx * rx);
    var invRy2 = 1.0 / (ry * ry);

    var offCanvas = document.createElement('canvas');
    offCanvas.width = W;
    offCanvas.height = H;
    var ctx = offCanvas.getContext('2d');
    if (!ctx) return null;

    var img = ctx.createImageData(W, H);
    var data = img.data;

    function field2D(px, py) {
      var d = sdRoundedBox2D(px, py, hw, hh, r);
      var eps = 0.5;
      var dx = sdRoundedBox2D(px + eps, py, hw, hh, r) - sdRoundedBox2D(px - eps, py, hw, hh, r);
      var dy = sdRoundedBox2D(px, py + eps, hw, hh, r) - sdRoundedBox2D(px, py - eps, hw, hh, r);
      var len = Math.hypot(dx, dy) + 1e-6;
      return [d, dx / len, dy / len];
    }

    function solidDistAndGrad(px, py, pz) {
      var b = field2D(px, py);
      var qxNorm = px / rx;
      var qyNorm = py / ry;
      var dome = domeHeight * Math.exp(-1.5 * (qxNorm * qxNorm + qyNorm * qyNorm));
      var dgx = -3.0 * dome * px * invRx2;
      var dgy = -3.0 * dome * py * invRy2;

      var qx = b[0] + rounding;
      var qy = Math.abs(pz) - halfDepth - dome + rounding;
      var ox = Math.max(qx, 0);
      var oy = Math.max(qy, 0);
      var olen = Math.hypot(ox, oy);
      var wx, wy;
      if (olen > 0.0001) {
        wx = ox / olen;
        wy = oy / olen;
      } else if (qx > qy) {
        wx = 1.0;
        wy = 0.0;
      } else {
        wx = 0.0;
        wy = 1.0;
      }
      var dist = Math.min(Math.max(qx, qy), 0) + olen - rounding;
      var sz = pz >= 0 ? 1.0 : -1.0;
      var gx = wx * b[1] - wy * dgx;
      var gy = wx * b[2] - wy * dgy;
      var gz = wy * sz;
      var glen = Math.hypot(gx, gy, gz) || 1.0;
      return [dist, gx / glen, gy / glen, gz / glen];
    }

    var boundX = hw + 4;
    var boundY = hh + 4;
    var boundZ = halfDepth + domeHeight + 8;
    var exitLimit = 2.0 * (hw + hh) + 2.0 * halfDepth;

    for (var pyIdx = 0; pyIdx < H; pyIdx++) {
      var ly = pyIdx + 0.5 - hh;
      for (var pxIdx = 0; pxIdx < W; pxIdx++) {
        var lx = pxIdx + 0.5 - hw;
        var idx = (pyIdx * W + pxIdx) * 4;

        var rdx = lx;
        var rdy = ly;
        var rdz = -RAY_CAMERA;
        var rlen = Math.hypot(rdx, rdy, rdz);
        rdx /= rlen;
        rdy /= rlen;
        rdz /= rlen;

        var invX = 1.0 / (rdx + 1e-6);
        var invY = 1.0 / (rdy + 1e-6);
        var invZ = 1.0 / (rdz + 1e-6);
        var ax0 = (-boundX) * invX;
        var ax1 = (boundX) * invX;
        var ay0 = (-boundY) * invY;
        var ay1 = (boundY) * invY;
        var az0 = (-boundZ - RAY_CAMERA) * invZ;
        var az1 = (boundZ - RAY_CAMERA) * invZ;
        var tNear = Math.max(0.0, Math.max(Math.min(ax0, ax1), Math.min(ay0, ay1), Math.min(az0, az1)));
        var tFar = Math.min(Math.max(ax0, ax1), Math.max(ay0, ay1), Math.max(az0, az1));

        var dxOut = 0.0;
        var dyOut = 0.0;

        if (tFar >= tNear) {
          var t = tNear;
          var hit = false;
          var fx = 0, fy = 0, fz = 0;
          var sg = null;
          for (var step = 0; step < 44; step++) {
            fx = rdx * t;
            fy = rdy * t;
            fz = RAY_CAMERA + rdz * t;
            sg = solidDistAndGrad(fx, fy, fz);
            if (sg[0] < 0.14) {
              hit = true;
              break;
            }
            t += Math.max(0.08, sg[0] * 0.78);
            if (t > tFar) break;
          }

          if (hit && sg) {
            var inside = refract3(rdx, rdy, rdz, sg[1], sg[2], sg[3], 1.0 / GLASS_IOR);
            if (inside) {
              var travel = 0.6;
              var rxPos = fx, ryPos = fy, rzPos = fz;
              var rg = sg;
              for (var eStep = 0; eStep < 36; eStep++) {
                rxPos = fx + inside[0] * travel;
                ryPos = fy + inside[1] * travel;
                rzPos = fz + inside[2] * travel;
                rg = solidDistAndGrad(rxPos, ryPos, rzPos);
                if (eStep > 1 && -rg[0] < 0.14) break;
                travel += Math.max(0.12, -rg[0] * 0.78);
                if (travel > exitLimit) break;
              }

              var outgoing = refract3(inside[0], inside[1], inside[2], -rg[1], -rg[2], -rg[3], GLASS_IOR);
              if (!outgoing) {
                inside = reflect3(inside[0], inside[1], inside[2], rg[1], rg[2], rg[3]);
                var bTravel = 0.6;
                var bx = rxPos, by = ryPos, bz = rzPos;
                for (var bStep = 0; bStep < 28; bStep++) {
                  bx = rxPos + inside[0] * bTravel;
                  by = ryPos + inside[1] * bTravel;
                  bz = rzPos + inside[2] * bTravel;
                  rg = solidDistAndGrad(bx, by, bz);
                  if (bStep > 1 && -rg[0] < 0.14) break;
                  bTravel += Math.max(0.12, -rg[0] * 0.78);
                  if (bTravel > exitLimit) break;
                }
                rxPos = bx; ryPos = by; rzPos = bz;
                outgoing = refract3(inside[0], inside[1], inside[2], -rg[1], -rg[2], -rg[3], GLASS_IOR);
                if (!outgoing) {
                  outgoing = reflect3(inside[0], inside[1], inside[2], rg[1], rg[2], rg[3]);
                }
              }

              var oz = outgoing[2];
              if (oz > -0.18) {
                var edgeTaper = clamp(-sdRoundedBox2D(lx, ly, hw, hh, r) / 4.0, 0.0, 1.0);
                dxOut = clamp(outgoing[0] * maxDisp * 1.1 * edgeTaper, -maxDisp, maxDisp);
                dyOut = clamp(outgoing[1] * maxDisp * 1.1 * edgeTaper, -maxDisp, maxDisp);
              } else {
                var rayDist = (RAY_BACK - rzPos) / oz;
                var bgX = (rxPos + outgoing[0] * rayDist) * RAY_CAMERA / (RAY_CAMERA - RAY_BACK);
                var bgY = (ryPos + outgoing[1] * rayDist) * RAY_CAMERA / (RAY_CAMERA - RAY_BACK);
                var rawDx = bgX - lx;
                var rawDy = bgY - ly;
                var dEdge = sdRoundedBox2D(lx, ly, hw, hh, r);
                var edgeFade = clamp(-dEdge / 1.5, 0.0, 1.0);
                dxOut = clamp(rawDx * edgeFade, -maxDisp, maxDisp);
                dyOut = clamp(rawDy * edgeFade, -maxDisp, maxDisp);
              }
            }
          }
        }

        data[idx] = clamp(Math.round(128 + (dxOut / maxDisp) * 127), 0, 255);
        data[idx + 1] = clamp(Math.round(128 + (dyOut / maxDisp) * 127), 0, 255);
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return { url: offCanvas.toDataURL('image/png'), width: W, height: H };
  }

  function ensureSvgElement() {
    var svg = document.getElementById('sf-lg-svg');
    if (svg) return svg;
    svg = document.createElementNS(SVG_NS, 'svg');
    svg.id = 'sf-lg-svg';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;left:-9999px;top:-9999px;';
    var defs = document.createElementNS(SVG_NS, 'defs');
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return svg;
  }

  function ensureSvgFilter(filterId) {
    var svg = ensureSvgElement();
    var defs = svg.querySelector('defs');
    if (!defs) {
      defs = document.createElementNS(SVG_NS, 'defs');
      svg.appendChild(defs);
    }
    var filter = document.getElementById(filterId);
    if (!filter) {
      filter = document.createElementNS(SVG_NS, 'filter');
      filter.id = filterId;
      filter.setAttribute('color-interpolation-filters', 'sRGB');
      defs.appendChild(filter);
    }
    return filter;
  }

  function updateSvgDisplacementFilter(filterId, width, height, radius, maxDisp) {
    var map = buildRayTracedDisplacementURL(width, height, radius, maxDisp);
    if (!map) return false;
    var filter = ensureSvgFilter(filterId);
    if (!filter) return false;

    var W = String(map.width);
    var H = String(map.height);

    filter.setAttribute('filterUnits', 'userSpaceOnUse');
    filter.setAttribute('primitiveUnits', 'userSpaceOnUse');
    filter.setAttribute('x', '0');
    filter.setAttribute('y', '0');
    filter.setAttribute('width', W);
    filter.setAttribute('height', H);
    filter.setAttribute('color-interpolation-filters', 'sRGB');

    while (filter.firstChild) filter.removeChild(filter.firstChild);

    function el(tag, attrs) {
      var node = document.createElementNS(SVG_NS, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
      return node;
    }

    filter.appendChild(el('feGaussianBlur', {
      in: 'SourceGraphic',
      stdDeviation: '1.85',
      result: 'softSrc'
    }));
    filter.appendChild(el('feImage', {
      href: map.url,
      x: '0',
      y: '0',
      width: W,
      height: H,
      preserveAspectRatio: 'none',
      result: 'dispMap'
    }));

    filter.appendChild(el('feDisplacementMap', {
      in: 'softSrc',
      in2: 'dispMap',
      scale: (maxDisp * 0.96).toFixed(2),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'dispR'
    }));
    filter.appendChild(el('feColorMatrix', {
      in: 'dispR',
      type: 'matrix',
      values: '1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',
      result: 'chanR'
    }));

    filter.appendChild(el('feDisplacementMap', {
      in: 'softSrc',
      in2: 'dispMap',
      scale: maxDisp.toFixed(2),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'dispG'
    }));
    filter.appendChild(el('feColorMatrix', {
      in: 'dispG',
      type: 'matrix',
      values: '0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',
      result: 'chanG'
    }));

    filter.appendChild(el('feDisplacementMap', {
      in: 'softSrc',
      in2: 'dispMap',
      scale: (maxDisp * 1.04).toFixed(2),
      xChannelSelector: 'R',
      yChannelSelector: 'G',
      result: 'dispB'
    }));
    filter.appendChild(el('feColorMatrix', {
      in: 'dispB',
      type: 'matrix',
      values: '0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',
      result: 'chanB'
    }));

    filter.appendChild(el('feComposite', {
      in: 'chanR',
      in2: 'chanG',
      operator: 'arithmetic',
      k1: '0',
      k2: '1',
      k3: '1',
      k4: '0',
      result: 'chanRG'
    }));
    filter.appendChild(el('feComposite', {
      in: 'chanRG',
      in2: 'chanB',
      operator: 'arithmetic',
      k1: '0',
      k2: '1',
      k3: '1',
      k4: '0',
      result: 'dispRGB'
    }));
    filter.appendChild(el('feColorMatrix', {
      in: 'dispRGB',
      type: 'saturate',
      values: '1.28'
    }));

    return true;
  }

  /* ------------------------------------------------------------
     Layer 2: Transparent WebGL 3D SDF Ray-Traced Glass Surface
     ------------------------------------------------------------ */
  var VERTEX_SHADER = 'attribute vec2 a_position; void main() { gl_Position = vec4(a_position, 0.0, 1.0); }';

  var FRAGMENT_SHADER = [
    'precision highp float;',
    'uniform vec2 u_resolution;',
    'uniform vec2 u_size;',
    'uniform float u_dpr;',
    'uniform vec4 u_pill;',       // cx, cy, halfW, halfH
    'uniform float u_radius;',
    'uniform vec4 u_lens;',       // cx, cy, halfW, halfH (sliding active droplet)
    'uniform float u_lensRadius;',
    'uniform float u_lensLift;',  // vertical dome lift of droplet
    'uniform vec2 u_pointer;',    // pointer pos in canvas CSS px
    'uniform float u_pull;',      // pointer liquid bulge in px
    'uniform vec2 u_light;',      // specular studio light pos in canvas CSS px
    'uniform float u_press;',     // 0..1 active press/focus highlight
    'uniform float u_dark;',      // 0 light mode .. 1 dark mode
    '',
    'const float CAMERA = 780.0;',
    '',
    'float sdBox2(vec2 p, vec2 h, float r) {',
    '  float cr = min(r, min(h.x, h.y));',
    '  vec2 q = abs(p) - h + cr;',
    '  return min(max(q.x, q.y), 0.0) + length(max(q, 0.0)) - cr;',
    '}',
    '',
    'float pillOutline(vec2 p) {',
    '  float d = sdBox2(p, u_pill.zw, u_radius);',
    '  vec2 toPtr = (u_pill.xy + p) - u_pointer;',
    '  return d - u_pull * exp(-dot(toPtr, toPtr) / 1450.0);',
    '}',
    '',
    'vec3 pillField(vec2 p) {',
    '  float d = pillOutline(p);',
    '  vec2 e = vec2(0.5, 0.0);',
    '  vec2 n = vec2(pillOutline(p + e.xy) - pillOutline(p - e.xy), pillOutline(p + e.yx) - pillOutline(p - e.yx));',
    '  return vec3(d, normalize(n + 1e-6));',
    '}',
    '',
    'vec3 lensField(vec2 p) {',
    '  float d = sdBox2(p, u_lens.zw, u_lensRadius);',
    '  vec2 e = vec2(0.5, 0.0);',
    '  vec2 n = vec2(sdBox2(p + e.xy, u_lens.zw, u_lensRadius) - sdBox2(p - e.xy, u_lens.zw, u_lensRadius),',
    '                sdBox2(p + e.yx, u_lens.zw, u_lensRadius) - sdBox2(p - e.yx, u_lens.zw, u_lensRadius));',
    '  return vec3(d, normalize(n + 1e-6));',
    '}',
    '',
    'vec4 solid(vec3 p) {',
    '  vec2 local = p.xy - u_pill.xy;',
    '  vec3 b = pillField(local);',
    '  vec2 rad = max(u_pill.zw, vec2(20.0));',
    '  float halfDepth = min(18.0, u_pill.w * 0.58);',
    '  float rounding = min(11.0, u_pill.w * 0.36);',
    '  float dome = 2.6 * exp(-1.5 * dot(local / rad, local / rad));',
    '  vec2 domeGrad = -3.0 * dome * local / (rad * rad);',
    '  vec2 q = vec2(b.x + rounding, abs(p.z) - halfDepth - dome + rounding);',
    '  vec2 outside = max(q, 0.0);',
    '  float outLen = length(outside);',
    '  vec2 w = outLen > 0.0001 ? outside / outLen : (q.x > q.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));',
    '  float dist = min(max(q.x, q.y), 0.0) + outLen - rounding;',
    '  vec3 grad = w.x * vec3(b.yz, 0.0) + w.y * vec3(-domeGrad, sign(p.z));',
    '',
    '  if (u_lens.z > 2.0 && u_lens.w > 2.0) {',
    '    vec2 lLocal = p.xy - u_lens.xy;',
    '    vec3 lb = lensField(lLocal);',
    '    vec2 lRad = max(u_lens.zw, vec2(14.0));',
    '    float lHalfZ = halfDepth * 0.36 + u_lensLift;',
    '    float lRound = min(9.5, u_lens.w * 0.42);',
    '    float lDome = 4.2 * exp(-1.7 * dot(lLocal / lRad, lLocal / lRad));',
    '    vec2 lDomeGrad = -3.4 * lDome * lLocal / (lRad * lRad);',
    '    float lz = p.z - halfDepth * 0.72;',
    '    vec2 lq = vec2(lb.x + lRound, abs(lz) - lHalfZ - lDome + lRound);',
    '    vec2 lOut = max(lq, 0.0);',
    '    float lOutLen = length(lOut);',
    '    vec2 lw = lOutLen > 0.0001 ? lOut / lOutLen : (lq.x > lq.y ? vec2(1.0, 0.0) : vec2(0.0, 1.0));',
    '    float lDist = min(max(lq.x, lq.y), 0.0) + lOutLen - lRound;',
    '    vec3 lGrad = lw.x * vec3(lb.yz, 0.0) + lw.y * vec3(-lDomeGrad, sign(lz));',
    '    float k = 2.6;',
    '    float h = clamp(0.5 + 0.5 * (lDist - dist) / k, 0.0, 1.0);',
    '    dist = mix(lDist, dist, h) - k * h * (1.0 - h);',
    '    grad = mix(lGrad, grad, h);',
    '  }',
    '  return vec4(dist, normalize(grad + 1e-6));',
    '}',
    '',
    'bool enterSolid(vec3 origin, vec3 dir, out vec3 hit) {',
    '  vec3 bMin = vec3(u_pill.xy - u_pill.zw - u_pull - 8.0, -34.0);',
    '  vec3 bMax = vec3(u_pill.xy + u_pill.zw + u_pull + 8.0, 36.0);',
    '  vec3 invDir = 1.0 / (dir + vec3(1e-6));',
    '  vec3 a = (bMin - origin) * invDir;',
    '  vec3 b = (bMax - origin) * invDir;',
    '  vec3 nearB = min(a, b);',
    '  vec3 farB = max(a, b);',
    '  float tNear = max(0.0, max(max(nearB.x, nearB.y), nearB.z));',
    '  float tFar = min(min(farB.x, farB.y), farB.z);',
    '  if (tFar < tNear) return false;',
    '  float t = tNear;',
    '  for (int i = 0; i < 44; i++) {',
    '    hit = origin + dir * t;',
    '    float d = solid(hit).x;',
    '    if (d < 0.14) return true;',
    '    t += max(0.08, d * 0.78);',
    '    if (t > tFar) break;',
    '  }',
    '  return false;',
    '}',
    '',
    'vec3 exitSolid(vec3 origin, vec3 dir, out float traveled) {',
    '  float t = 0.6;',
    '  vec3 pt = origin + dir * t;',
    '  float limit = 2.0 * (u_pill.z + u_pill.w) + 44.0;',
    '  for (int i = 0; i < 36; i++) {',
    '    pt = origin + dir * t;',
    '    float d = -solid(pt).x;',
    '    if (i > 1 && d < 0.14) break;',
    '    t += max(0.12, d * 0.78);',
    '    if (t > limit) break;',
    '  }',
    '  traveled = t;',
    '  return pt;',
    '}',
    '',
    'vec3 environmentColor(vec3 dir, vec2 pixel) {',
    '  vec3 skyLight = mix(vec3(0.95, 0.92, 0.86), vec3(1.0, 0.98, 0.94), clamp(0.5 - dir.y * 0.8, 0.0, 1.0));',
    '  vec3 skyDark = mix(vec3(0.10, 0.13, 0.20), vec3(0.32, 0.42, 0.60), clamp(0.5 - dir.y * 0.8, 0.0, 1.0));',
    '  vec3 sky = mix(skyLight, skyDark, u_dark);',
    '  float softbox = exp(-pow((dir.x + 0.34) / 0.22, 2.0) - pow((dir.y + 0.56) / 0.26, 4.0));',
    '  float rimFill = exp(-pow((dir.x - 0.62) / 0.16, 2.0) - pow((dir.y - 0.12) / 0.52, 4.0));',
    '  float bottomBounce = exp(-pow((dir.y - 0.75) / 0.18, 2.0));',
    '  vec3 bounceCol = mix(vec3(1.0, 0.90, 0.78), vec3(0.55, 0.72, 1.0), u_dark);',
    '  return sky + vec3(1.0, 0.99, 0.97) * (softbox * 1.45 + rimFill * 0.48) + bounceCol * (bottomBounce * 0.32);',
    '}',
    '',
    'void main() {',
    '  vec2 uv = gl_FragCoord.xy / u_resolution;',
    '  vec2 pixel = vec2(uv.x * u_size.x, (1.0 - uv.y) * u_size.y);',
    '  vec2 pLocal = pixel - u_pill.xy;',
    '  float outerDist = pillOutline(pLocal);',
    '',
    '  vec3 origin = vec3(u_pill.xy, CAMERA);',
    '  vec3 viewRay = normalize(vec3(pLocal, -CAMERA));',
    '  vec3 front;',
    '',
    '  if (!enterSolid(origin, viewRay, front)) {',
    '    float shDist = sdBox2(pLocal - vec2(0.0, 6.5), u_pill.zw, u_radius);',
    '    float shadowAlpha = (1.0 - smoothstep(-2.0, 13.5, shDist)) * mix(0.16, 0.44, u_dark);',
    '    float contact = (1.0 - smoothstep(-1.5, 4.5, sdBox2(pLocal - vec2(0.0, 2.0), u_pill.zw, u_radius))) * mix(0.08, 0.22, u_dark);',
    '    float caust = (1.0 - smoothstep(0.0, 8.0, abs(shDist - 2.0))) * smoothstep(-4.0, 14.0, pLocal.y) * mix(0.08, 0.05, u_dark);',
    '    vec3 shCol = mix(vec3(0.12, 0.09, 0.06), vec3(0.0, 0.0, 0.02), u_dark);',
    '    vec3 caustCol = mix(vec3(1.0, 0.96, 0.88), vec3(0.75, 0.88, 1.0), u_dark);',
    '    float a = clamp(shadowAlpha + contact, 0.0, 0.65);',
    '    vec3 outCol = mix(shCol, caustCol, clamp(caust * 3.0, 0.0, 0.45));',
    '    gl_FragColor = vec4(outCol * a, a);',
    '    return;',
    '  }',
    '',
    '  vec3 normal = solid(front).yzw;',
    '  float ior = 1.48;',
    '  vec3 inside = refract(viewRay, normal, 1.0 / ior);',
    '  float pathLength = 0.0;',
    '  vec3 rear = exitSolid(front, inside, pathLength);',
    '  vec3 rearNormal = solid(rear).yzw;',
    '  vec3 outgoing = refract(inside, -rearNormal, ior);',
    '  float tirBounce = 0.0;',
    '  if (dot(outgoing, outgoing) < 0.01) {',
    '    tirBounce = 1.0;',
    '    inside = reflect(inside, rearNormal);',
    '    float secondLen = 0.0;',
    '    rear = exitSolid(rear, inside, secondLen);',
    '    pathLength += secondLen;',
    '    rearNormal = solid(rear).yzw;',
    '    outgoing = refract(inside, -rearNormal, ior);',
    '    if (dot(outgoing, outgoing) < 0.01) outgoing = reflect(inside, rearNormal);',
    '  }',
    '',
    '  float lensEdgeMask = 0.0;',
    '  float lensBodyMask = 0.0;',
    '  float lensTopRim = 0.0;',
    '  if (u_lens.z > 2.0 && u_lens.w > 2.0) {',
    '    float ld = sdBox2(front.xy - u_lens.xy, u_lens.zw, u_lensRadius);',
    '    lensBodyMask = 1.0 - smoothstep(-1.5, 1.5, ld);',
    '    lensEdgeMask = 1.0 - smoothstep(0.0, 4.5, abs(ld + 1.0));',
    '    lensTopRim = lensEdgeMask * clamp(-normal.y * 0.9 + 0.4, 0.0, 1.0);',
    '  }',
    '',
    '  float grazing = 1.0 - max(dot(normal, -viewRay), 0.0);',
    '  float f0 = pow((ior - 1.0) / (ior + 1.0), 2.0);',
    '  float fresnel = f0 + (1.0 - f0) * pow(grazing, 3.2);',
    '  vec3 reflected = environmentColor(reflect(viewRay, normal), pixel);',
    '',
    '  vec3 toLight = normalize(vec3(u_light - front.xy, 360.0));',
    '  vec3 halfVec = normalize(toLight - viewRay);',
    '  float spec = pow(max(dot(normal, halfVec), 0.0), 120.0) * (0.34 + u_press * 0.36);',
    '  float broadSpec = pow(max(dot(normal, halfVec), 0.0), 22.0) * (0.10 + u_press * 0.14);',
    '',
    '  float rimFactor = smoothstep(-12.0, -0.5, outerDist);',
    '  float dispersionAngle = atan(rearNormal.y, rearNormal.x);',
    '  vec3 prism = 0.5 + 0.5 * cos(dispersionAngle + vec3(0.0, 2.094, 4.188));',
    '  vec3 causticColor = mix(vec3(1.0, 0.99, 0.96), prism, 0.28);',
    '  float tirGlow = tirBounce * (0.42 + 0.32 * rimFactor) + lensEdgeMask * (0.28 + 0.25 * grazing);',
    '',
    '  float outerCrease = 1.0 - smoothstep(0.0, 2.2, abs(outerDist + 0.75));',
    '  float topSpecularRim = clamp(-normal.y * 0.92 + 0.22, 0.0, 1.0) * (1.0 - smoothstep(0.0, 3.2, abs(outerDist + 1.6)));',
    '  float dropletCrease = lensEdgeMask * (0.48 + 0.42 * grazing);',
    '',
    '  vec3 baseVeilCol = mix(vec3(0.99, 0.975, 0.94), vec3(0.14, 0.17, 0.24), u_dark);',
    '  vec3 edgeThicknessCol = mix(vec3(0.92, 0.96, 1.0), vec3(0.45, 0.65, 0.96), u_dark);',
    '  vec3 glassColor = mix(baseVeilCol, reflected, clamp(fresnel * 1.12, 0.0, 0.90));',
    '  glassColor = mix(glassColor, edgeThicknessCol, rimFactor * 0.24);',
    '  glassColor += causticColor * tirGlow * 0.85;',
    '  glassColor += vec3(1.0, 0.995, 0.98) * (spec + broadSpec + topSpecularRim * mix(0.60, 0.64, u_dark) + lensTopRim * 0.68);',
    '  vec3 dropletTint = mix(vec3(1.0, 0.99, 0.96), vec3(0.76, 0.86, 1.0), u_dark);',
    '  glassColor = mix(glassColor, dropletTint, lensBodyMask * mix(0.50, 0.24, u_dark));',
    '  vec3 rimContour = mix(vec3(0.24, 0.20, 0.17), vec3(0.84, 0.91, 1.0), u_dark);',
    '  glassColor = mix(glassColor, rimContour, outerCrease * mix(0.28, 0.30, u_dark));',
    '  glassColor = mix(glassColor, rimContour, dropletCrease * mix(0.28, 0.38, u_dark));',
    '',
    '  float centerAlpha = mix(0.22, 0.26, u_dark) + lensBodyMask * mix(0.38, 0.22, u_dark);',
    '  float rimAlpha = clamp(fresnel * 0.84 + tirGlow * 0.60 + outerCrease * 0.42 + spec + topSpecularRim * 0.44 + dropletCrease * 0.45, 0.0, 0.88);',
    '  float alpha = clamp(max(centerAlpha, rimAlpha), 0.0, 0.92);',
    '  float coverage = smoothstep(0.6 / max(u_dpr, 1.0), -0.8 / max(u_dpr, 1.0), outerDist);',
    '  alpha *= max(coverage, step(outerDist, -1.0));',
    '',
    '  gl_FragColor = vec4(clamp(glassColor, 0.0, 1.0) * alpha, alpha);',
    '}'
  ].join('\n');

  function createSurfaceGlassWebGL(canvas) {
    var gl = canvas.getContext('webgl', {
      alpha: true,
      antialias: true,
      premultipliedAlpha: true,
      powerPreference: 'low-power'
    });
    if (!gl) return null;

    function compile(type, source) {
      var shader = gl.createShader(type);
      if (!shader) return null;
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        console.warn('liquid-glass-nav shader compile error:', gl.getShaderInfoLog(shader));
        gl.deleteShader(shader);
        return null;
      }
      return shader;
    }

    var vs = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    var fs = compile(gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
    if (!vs || !fs) return null;

    var program = gl.createProgram();
    gl.attachShader(program, vs);
    gl.attachShader(program, fs);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      console.warn('liquid-glass-nav program link error:', gl.getProgramInfoLog(program));
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
      return null;
    }

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);

    var aPos = gl.getAttribLocation(program, 'a_position');
    var uNames = [
      'u_resolution', 'u_size', 'u_dpr', 'u_pill', 'u_radius',
      'u_lens', 'u_lensRadius', 'u_lensLift',
      'u_pointer', 'u_pull', 'u_light', 'u_press', 'u_dark'
    ];
    var u = {};
    for (var i = 0; i < uNames.length; i++) {
      u[uNames[i]] = gl.getUniformLocation(program, uNames[i]);
    }

    var cssWidth = 1;
    var cssHeight = 1;
    var dpr = 1;
    var destroyed = false;

    function resize(w, h) {
      if (destroyed) return;
      cssWidth = Math.max(1, w);
      cssHeight = Math.max(1, h);
      dpr = Math.min(window.devicePixelRatio || 1, 2);
      var pw = Math.max(1, Math.round(cssWidth * dpr));
      var ph = Math.max(1, Math.round(cssHeight * dpr));
      if (canvas.width !== pw || canvas.height !== ph) {
        canvas.width = pw;
        canvas.height = ph;
      }
    }

    function draw(state) {
      if (destroyed) return;
      gl.viewport(0, 0, canvas.width, canvas.height);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.useProgram(program);

      gl.bindBuffer(gl.ARRAY_BUFFER, quad);
      gl.enableVertexAttribArray(aPos);
      gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

      gl.uniform2f(u.u_resolution, canvas.width, canvas.height);
      gl.uniform2f(u.u_size, cssWidth, cssHeight);
      gl.uniform1f(u.u_dpr, dpr);
      gl.uniform4f(u.u_pill, state.pillCx, state.pillCy, state.pillHw, state.pillHh);
      gl.uniform1f(u.u_radius, state.radius);
      gl.uniform4f(u.u_lens, state.lensCx, state.lensCy, state.lensHw, state.lensHh);
      gl.uniform1f(u.u_lensRadius, state.lensRadius);
      gl.uniform1f(u.u_lensLift, state.lensLift);
      gl.uniform2f(u.u_pointer, state.pointerX, state.pointerY);
      gl.uniform1f(u.u_pull, state.pull);
      gl.uniform2f(u.u_light, state.lightX, state.lightY);
      gl.uniform1f(u.u_press, state.press);
      gl.uniform1f(u.u_dark, state.dark);

      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }

    function destroy() {
      if (destroyed) return;
      destroyed = true;
      gl.deleteBuffer(quad);
      gl.deleteShader(vs);
      gl.deleteShader(fs);
      gl.deleteProgram(program);
    }

    return { resize: resize, draw: draw, destroy: destroy };
  }

  /* ------------------------------------------------------------
     Generic Ray-Traced Liquid Glass Surface Controller
     ------------------------------------------------------------ */
  var sharedMotionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
  var sharedSvgSupported = supportsSvgBackdropRefraction();

  function isDarkMode() {
    return document.body.getAttribute('data-theme') === 'dark';
  }

  function attachLiquidGlassSurface(hostEl, opts) {
    if (!hostEl) return null;
    if (hostEl.dataset.lgInit === '1' && hostEl._sfLgCtrl) {
      return hostEl._sfLgCtrl;
    }
    hostEl.dataset.lgInit = '1';

    opts = opts || {};
    var id = opts.id || 'surface';
    var filterId = 'sf-lg-filter-' + id;
    var bleedX = opts.bleedX !== undefined ? opts.bleedX : 10;
    var bleedY = opts.bleedY !== undefined ? opts.bleedY : 14;
    var maxDisp = opts.maxDisp !== undefined ? opts.maxDisp : 16;
    var pullMax = opts.pullMax !== undefined ? opts.pullMax : 4.8;
    var lensSelector = opts.lensSelector || null;
    var scrubSelector = opts.scrubSelector || null;
    var focusSelector = opts.focusSelector || null;

    hostEl.style.setProperty('--lg-bleed-x', bleedX + 'px');
    hostEl.style.setProperty('--lg-bleed-y', bleedY + 'px');

    var refractLayer = document.createElement('div');
    refractLayer.className = 'sf-lg-refract';
    refractLayer.setAttribute('aria-hidden', 'true');
    refractLayer.style.setProperty('--sf-lg-filter', 'url(#' + filterId + ')');

    var canvas = document.createElement('canvas');
    canvas.className = 'sf-lg-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var pillFallback = null;
    if (lensSelector) {
      pillFallback = document.createElement('div');
      pillFallback.className = 'sf-lg-pill-fallback';
      pillFallback.setAttribute('aria-hidden', 'true');
      hostEl.insertBefore(pillFallback, hostEl.firstChild);
      hostEl.insertBefore(canvas, pillFallback);
    } else {
      hostEl.insertBefore(canvas, hostEl.firstChild);
    }
    hostEl.insertBefore(refractLayer, canvas);
    hostEl.classList.add('sf-lg-surface', 'sf-lg-ready');

    var renderer = createSurfaceGlassWebGL(canvas);
    hostEl.dataset.lgWebgl = renderer ? '1' : '0';

    var useSvgRefract = sharedSvgSupported;
    hostEl.dataset.lgRefract = useSvgRefract ? 'svg' : 'css';

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
      hostEl.dataset.lgWebgl = '0';
    });

    var metrics = {
      width: 320,
      height: 56,
      radius: 28,
      tabs: []
    };

    var anim = {
      lensX: 0, lensVx: 0, targetLensX: 0,
      lensY: 28,
      lensW: 60, lensVw: 0, targetLensW: 60,
      lensH: 40,
      pull: 0, pullV: 0, targetPull: 0,
      press: 0, pressV: 0, targetPress: 0,
      lightX: 100, lightVx: 0, targetLightX: 100,
      lightY: -40, lightVy: 0, targetLightY: -40,
      dark: isDarkMode() ? 1 : 0, darkV: 0, targetDark: isDarkMode() ? 1 : 0,
      pointerX: -9999,
      pointerY: -9999,
      pointerInside: false,
      pointerDown: false,
      inputFocused: false,
      scrubbing: false,
      startClientX: 0,
      scrubTargetIdx: -1,
      initialized: false
    };

    var rafId = 0;
    var lastNow = 0;
    var lastFilterKey = '';
    var sleeping = false;

    function syncFallbackPill() {
      if (!pillFallback || !lensSelector) return;
      var pw = Math.max(32, anim.lensW);
      var ph = Math.max(28, anim.lensH);
      var px = anim.lensX - pw * 0.5;
      var py = anim.lensY - ph * 0.5;
      pillFallback.style.width = pw.toFixed(1) + 'px';
      pillFallback.style.height = ph.toFixed(1) + 'px';
      pillFallback.style.transform = 'translate3d(' + px.toFixed(1) + 'px, ' + py.toFixed(1) + 'px, 0)';
    }

    function measure(snap) {
      var rect = hostEl.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;

      var cs = getComputedStyle(hostEl);
      var parsedR = parseFloat(cs.borderTopLeftRadius) || 28;
      metrics.width = rect.width;
      metrics.height = rect.height;
      metrics.radius = clamp(parsedR, 0, Math.min(rect.width, rect.height) * 0.5);

      if (lensSelector) {
        var btnSelector = scrubSelector || lensSelector.replace(/\.active\b/g, '');
        var tabEls = Array.from(hostEl.querySelectorAll(btnSelector));
        var activeIdx = -1;
        metrics.tabs = tabEls.map(function (tab, i) {
          var tr = tab.getBoundingClientRect();
          var relLeft = tr.left - rect.left;
          var relTop = tr.top - rect.top;
          if (tab.matches(lensSelector) || tab.classList.contains('active')) activeIdx = i;
          return {
            el: tab,
            left: relLeft,
            top: relTop,
            width: tr.width,
            height: tr.height,
            cx: relLeft + tr.width * 0.5,
            cy: relTop + tr.height * 0.5
          };
        });

        if (activeIdx < 0 && metrics.tabs.length) activeIdx = 0;
        if (activeIdx >= 0) {
          var active = metrics.tabs[activeIdx];
          anim.targetLensX = active.cx;
          anim.lensY = active.cy || metrics.height * 0.5;
          anim.targetLensW = Math.max(36, active.width - 2);
          anim.lensH = Math.max(28, active.height - 2);
          if (!anim.initialized || snap) {
            anim.lensX = anim.targetLensX;
            anim.lensW = anim.targetLensW;
            anim.lensVx = 0;
            anim.lensVw = 0;
            anim.initialized = true;
          }
        }
      } else {
        anim.initialized = true;
      }

      if (!anim.pointerInside) {
        anim.targetLightX = bleedX + metrics.width * 0.24;
        anim.targetLightY = bleedY - metrics.height * 0.35;
        if (snap) {
          anim.lightX = anim.targetLightX;
          anim.lightY = anim.targetLightY;
        }
      }

      if (renderer) {
        renderer.resize(metrics.width + bleedX * 2, metrics.height + bleedY * 2);
      }

      if (useSvgRefract) {
        var fKey = Math.round(metrics.width) + 'x' + Math.round(metrics.height) + '@' + Math.round(metrics.radius);
        if (fKey !== lastFilterKey) {
          lastFilterKey = fKey;
          var ok = updateSvgDisplacementFilter(filterId, metrics.width, metrics.height, metrics.radius, maxDisp);
          if (!ok) {
            useSvgRefract = false;
            hostEl.dataset.lgRefract = 'css';
          }
        }
      }

      if (snap) {
        anim.targetDark = isDarkMode() ? 1 : 0;
        anim.dark = anim.targetDark;
        anim.darkV = 0;
        lastNow = performance.now();
        renderFrame(true);
      } else {
        syncFallbackPill();
        scheduleFrame();
      }
    }

    function updateActiveTarget() {
      if (anim.scrubbing) return;
      if (lensSelector) {
        var btnSelector = scrubSelector || lensSelector.replace(/\.active\b/g, '');
        var tabEls = Array.from(hostEl.querySelectorAll(btnSelector));
        var idx = tabEls.findIndex(function (t) { return t.matches(lensSelector) || t.classList.contains('active'); });
        if (idx >= 0 && metrics.tabs[idx]) {
          anim.targetLensX = metrics.tabs[idx].cx;
          anim.lensY = metrics.tabs[idx].cy || metrics.height * 0.5;
          anim.targetLensW = Math.max(36, metrics.tabs[idx].width - 2);
          anim.lensH = Math.max(28, metrics.tabs[idx].height - 2);
        }
      }
      anim.targetDark = isDarkMode() ? 1 : 0;
      scheduleFrame();
    }

    function tabIndexAtClientX(clientX) {
      var rect = hostEl.getBoundingClientRect();
      var x = clientX - rect.left;
      var bestIdx = -1;
      var bestDist = Infinity;
      for (var i = 0; i < metrics.tabs.length; i++) {
        var d = Math.abs(x - metrics.tabs[i].cx);
        if (d < bestDist) {
          bestDist = d;
          bestIdx = i;
        }
      }
      return bestIdx;
    }

    function updatePointer(e) {
      var rect = hostEl.getBoundingClientRect();
      var lx = e.clientX - rect.left;
      var ly = e.clientY - rect.top;
      anim.pointerX = lx + bleedX;
      anim.pointerY = ly + bleedY;
      anim.pointerInside = true;
      anim.targetLightX = anim.pointerX - 45;
      anim.targetLightY = anim.pointerY - 85;
      anim.targetPull = sharedMotionQuery && sharedMotionQuery.matches ? 0 : pullMax;
      scheduleFrame();
    }

    hostEl.addEventListener('pointerenter', updatePointer, { passive: true });
    hostEl.addEventListener('pointermove', function (e) {
      updatePointer(e);
      if (anim.pointerDown && anim.canScrub && metrics.tabs.length) {
        var dx = Math.abs(e.clientX - anim.startClientX);
        if (!anim.scrubbing && dx > 10) {
          anim.scrubbing = true;
        }
        if (anim.scrubbing) {
          var rect = hostEl.getBoundingClientRect();
          var minCx = metrics.tabs[0].cx;
          var maxCx = metrics.tabs[metrics.tabs.length - 1].cx;
          anim.targetLensX = clamp(e.clientX - rect.left, minCx, maxCx);
          anim.scrubTargetIdx = tabIndexAtClientX(e.clientX);
        }
      }
    }, { passive: true });

    hostEl.addEventListener('pointerleave', function () {
      anim.pointerInside = false;
      anim.targetPull = 0;
      anim.targetLightX = bleedX + metrics.width * 0.24;
      anim.targetLightY = bleedY - metrics.height * 0.35;
      scheduleFrame();
    }, { passive: true });

    hostEl.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      updatePointer(e);
      anim.pointerDown = true;
      anim.scrubbing = false;
      anim.scrubTargetIdx = -1;
      anim.canScrub = !!(scrubSelector && e.target && e.target.closest && e.target.closest(scrubSelector));
      anim.startClientX = e.clientX;
      anim.targetPress = 1.0;
      scheduleFrame();
    }, { passive: true });

    function finishPointer(e) {
      if (!anim.pointerDown) return;
      var wasScrubbing = anim.scrubbing;
      var scrubIdx = anim.scrubTargetIdx;
      anim.pointerDown = false;
      anim.scrubbing = false;
      anim.scrubTargetIdx = -1;
      anim.targetPress = anim.inputFocused ? 0.55 : 0.0;
      if (wasScrubbing && scrubIdx >= 0 && metrics.tabs[scrubIdx]) {
        metrics.tabs[scrubIdx].el.click();
        anim.targetLensX = metrics.tabs[scrubIdx].cx;
        anim.targetLensW = Math.max(36, metrics.tabs[scrubIdx].width - 2);
      } else if (e.type === 'pointercancel') {
        updateActiveTarget();
      }
      scheduleFrame();
    }

    window.addEventListener('pointerup', finishPointer, { passive: true });
    window.addEventListener('pointercancel', finishPointer, { passive: true });

    if (focusSelector) {
      var focusEl = hostEl.querySelector(focusSelector);
      if (focusEl) {
        focusEl.addEventListener('focus', function () {
          anim.inputFocused = true;
          if (!anim.pointerDown) anim.targetPress = 0.55;
          scheduleFrame();
        }, { passive: true });
        focusEl.addEventListener('blur', function () {
          anim.inputFocused = false;
          if (!anim.pointerDown) anim.targetPress = 0.0;
          scheduleFrame();
        }, { passive: true });
      }
    }

    function renderFrame(still) {
      var dropletHw = 0;
      var dropletHh = 0;
      if (lensSelector) {
        var stretch = still ? 0 : clamp(Math.abs(anim.lensVx) * 0.00028, 0, 0.22);
        var pressBoost = 1 + anim.press * 0.035;
        dropletHw = (anim.lensW * 0.5) * (1 + stretch) * pressBoost * 0.94;
        dropletHh = (anim.lensH * 0.5) * (1 - stretch * 0.42) * pressBoost * 0.94;
        syncFallbackPill();
      }

      if (renderer) {
        renderer.draw({
          pillCx: bleedX + metrics.width * 0.5,
          pillCy: bleedY + metrics.height * 0.5,
          pillHw: metrics.width * 0.5,
          pillHh: metrics.height * 0.5,
          radius: metrics.radius,
          lensCx: bleedX + anim.lensX,
          lensCy: bleedY + anim.lensY,
          lensHw: dropletHw,
          lensHh: dropletHh,
          lensRadius: Math.min(dropletHw, dropletHh),
          lensLift: 2.8 + anim.press * 1.4,
          pointerX: anim.pointerInside ? anim.pointerX : -9999,
          pointerY: anim.pointerInside ? anim.pointerY : -9999,
          pull: anim.pull,
          lightX: anim.lightX,
          lightY: anim.lightY,
          press: anim.press,
          dark: clamp(anim.dark, 0, 1)
        });
      }
    }

    function tick(now) {
      rafId = 0;
      if (sleeping || document.hidden) return;
      var dt = lastNow ? clamp((now - lastNow) / 1000, 0, 1 / 15) : 1 / 60;
      lastNow = now;

      var still = sharedMotionQuery && sharedMotionQuery.matches;
      if (still) {
        anim.lensX = anim.targetLensX;
        anim.lensW = anim.targetLensW;
        anim.pull = 0;
        anim.press = anim.targetPress;
        anim.lightX = anim.targetLightX;
        anim.lightY = anim.targetLightY;
        anim.dark = anim.targetDark;
        anim.lensVx = anim.lensVw = anim.pullV = anim.pressV = anim.lightVx = anim.lightVy = anim.darkV = 0;
      } else {
        if (lensSelector) {
          var r1 = stepSpring(anim.lensX, anim.lensVx, anim.targetLensX, dt, 380, 24);
          anim.lensX = r1[0]; anim.lensVx = r1[1];
          var r2 = stepSpring(anim.lensW, anim.lensVw, anim.targetLensW, dt, 380, 24);
          anim.lensW = r2[0]; anim.lensVw = r2[1];
        }
        var r3 = stepSpring(anim.pull, anim.pullV, anim.targetPull, dt, 260, 18);
        anim.pull = r3[0]; anim.pullV = r3[1];
        var r4 = stepSpring(anim.press, anim.pressV, anim.targetPress, dt, 420, 20);
        anim.press = r4[0]; anim.pressV = r4[1];
        var r5 = stepSpring(anim.lightX, anim.lightVx, anim.targetLightX, dt, 300, 24);
        anim.lightX = r5[0]; anim.lightVx = r5[1];
        var r6 = stepSpring(anim.lightY, anim.lightVy, anim.targetLightY, dt, 300, 24);
        anim.lightY = r6[0]; anim.lightVy = r6[1];
        var r7 = stepSpring(anim.dark, anim.darkV, anim.targetDark, dt, 320, 28);
        anim.dark = r7[0]; anim.darkV = r7[1];
      }

      renderFrame(still);

      var moving =
        (lensSelector && (
          Math.abs(anim.lensX - anim.targetLensX) > SINK_THRESH ||
          Math.abs(anim.lensVx) > 0.05 ||
          Math.abs(anim.lensW - anim.targetLensW) > SINK_THRESH ||
          Math.abs(anim.lensVw) > 0.05
        )) ||
        Math.abs(anim.pull - anim.targetPull) > SINK_THRESH ||
        Math.abs(anim.pullV) > 0.05 ||
        Math.abs(anim.press - anim.targetPress) > SINK_THRESH ||
        Math.abs(anim.pressV) > 0.05 ||
        Math.abs(anim.lightX - anim.targetLightX) > 0.05 ||
        Math.abs(anim.lightVx) > 0.1 ||
        Math.abs(anim.lightY - anim.targetLightY) > 0.05 ||
        Math.abs(anim.lightVy) > 0.1 ||
        Math.abs(anim.dark - anim.targetDark) > SINK_THRESH ||
        Math.abs(anim.darkV) > 0.05;

      if (moving && !still) {
        rafId = requestAnimationFrame(tick);
      }
    }

    function scheduleFrame() {
      if (!sleeping && !rafId && !document.hidden) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    function sleep() {
      sleeping = true;
      if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    }

    function wake(snap) {
      sleeping = false;
      anim.targetDark = isDarkMode() ? 1 : 0;
      if (snap) {
        anim.dark = anim.targetDark;
        anim.darkV = 0;
      }
      measure(!!snap);
    }

    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function () {
        if (!sleeping) measure(false);
      });
      ro.observe(hostEl);
    } else {
      window.addEventListener('resize', function () {
        if (!sleeping) measure(false);
      });
    }

    if (typeof MutationObserver === 'function') {
      if (lensSelector) {
        var selfObserver = new MutationObserver(updateActiveTarget);
        selfObserver.observe(hostEl, { subtree: true, attributes: true, attributeFilter: ['class'] });
      }
      var bodyObserver = new MutationObserver(function () {
        anim.targetDark = isDarkMode() ? 1 : 0;
        scheduleFrame();
      });
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden && !sleeping) scheduleFrame();
      else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    });

    if (sharedMotionQuery && typeof sharedMotionQuery.addEventListener === 'function') {
      sharedMotionQuery.addEventListener('change', function () {
        if (!sleeping) scheduleFrame();
      });
    }

    var ctrl = { measure: measure, wake: wake, sleep: sleep };
    hostEl._sfLgCtrl = ctrl;
    return ctrl;
  }

  /* ------------------------------------------------------------
     Bootstrap Main Surfaces & Lazy Ask AI Page Surfaces
     ------------------------------------------------------------ */
  var didInitSurfaces = false;

  function initAllLiquidGlassSurfaces() {
    if (didInitSurfaces) return;
    didInitSurfaces = true;

    var nav = document.getElementById('bottomNav');
    var searchInner = document.querySelector('#aiSearchBar > .ai-search-inner');
    var aiPage = document.getElementById('aiPage');

    var navCtrl = nav ? attachLiquidGlassSurface(nav, {
      id: 'nav',
      bleedX: 12,
      bleedY: 18,
      maxDisp: 18,
      pullMax: 5.5,
      lensSelector: '.nav-tab.active',
      scrubSelector: '.nav-tab'
    }) : null;

    var searchCtrl = searchInner ? attachLiquidGlassSurface(searchInner, {
      id: 'search',
      bleedX: 10,
      bleedY: 14,
      maxDisp: 16,
      pullMax: 4.8
    }) : null;

    if (navCtrl) navCtrl.wake(true);
    if (searchCtrl) searchCtrl.wake(true);

    function resnapMainSurfaces() {
      if (navCtrl) navCtrl.measure(true);
      if (searchCtrl) searchCtrl.measure(true);
    }
    if (document.fonts && document.fonts.ready) {
      document.fonts.ready.then(resnapMainSurfaces);
    }
    window.addEventListener('load', resnapMainSurfaces, { once: true });

    if (!aiPage) return;

    var aiControllers = null;
    var aiHeader = aiPage.querySelector('.ai-page-header');
    var aiModeBar = aiPage.querySelector('.ai-mode-bar');
    var aiSheetBar = document.getElementById('aiSheetBar');
    var aiSheetStatus = document.getElementById('aiSheetStatus');
    var aiPreviewTray = document.getElementById('aiImagePreviewTray');
    var aiInputBar = aiPage.querySelector('.ai-input-bar');

    function syncAiChromePadding() {
      if (!aiPage.classList.contains('open')) return;
      var pageRect = aiPage.getBoundingClientRect();
      if (pageRect.height < 40) return;

      var topEnd = 0;
      var topEls = [aiHeader, aiModeBar, aiSheetBar, aiSheetStatus];
      for (var i = 0; i < topEls.length; i++) {
        var tel = topEls[i];
        if (!tel || tel.offsetHeight <= 0) continue;
        if (getComputedStyle(tel).display === 'none') continue;
        topEnd = Math.max(topEnd, tel.getBoundingClientRect().bottom - pageRect.top);
      }

      var bottomStart = pageRect.height;
      var botEls = [aiPreviewTray, aiInputBar];
      for (var j = 0; j < botEls.length; j++) {
        var bel = botEls[j];
        if (!bel || bel.offsetHeight <= 0) continue;
        if (getComputedStyle(bel).display === 'none') continue;
        bottomStart = Math.min(bottomStart, bel.getBoundingClientRect().top - pageRect.top);
      }

      var topPad = Math.max(118, Math.round(topEnd + 14));
      var bottomPad = Math.max(88, Math.round((pageRect.height - bottomStart) + 14));
      aiPage.style.setProperty('--ai-chrome-top', topPad + 'px');
      aiPage.style.setProperty('--ai-chrome-bottom', bottomPad + 'px');
    }

    function ensureAiControllers() {
      if (aiControllers) return aiControllers;
      aiControllers = [];
      if (aiHeader) {
        aiControllers.push(attachLiquidGlassSurface(aiHeader, {
          id: 'ai-header',
          bleedX: 10,
          bleedY: 14,
          maxDisp: 16,
          pullMax: 4.8
        }));
      }
      if (aiModeBar) {
        aiControllers.push(attachLiquidGlassSurface(aiModeBar, {
          id: 'ai-mode',
          bleedX: 10,
          bleedY: 14,
          maxDisp: 16,
          pullMax: 4.8,
          lensSelector: '.ai-mode-btn.active',
          scrubSelector: '.ai-mode-btn'
        }));
      }
      if (aiInputBar) {
        aiControllers.push(attachLiquidGlassSurface(aiInputBar, {
          id: 'ai-input',
          bleedX: 10,
          bleedY: 14,
          maxDisp: 16,
          pullMax: 4.8,
          focusSelector: '#aiChatInput'
        }));
      }
      return aiControllers;
    }

    function syncAiOpenState() {
      var open = aiPage.classList.contains('open');
      if (open) {
        var list = ensureAiControllers();
        for (var i = 0; i < list.length; i++) {
          if (list[i]) list[i].wake(true);
        }
        syncAiChromePadding();
        requestAnimationFrame(function () {
          if (!aiPage.classList.contains('open')) return;
          for (var k = 0; k < list.length; k++) {
            if (list[k]) list[k].measure(true);
          }
          syncAiChromePadding();
        });
      } else if (aiControllers) {
        for (var j = 0; j < aiControllers.length; j++) {
          if (aiControllers[j]) aiControllers[j].sleep();
        }
      }
    }

    if (typeof MutationObserver === 'function') {
      var pageObserver = new MutationObserver(function () {
        syncAiOpenState();
      });
      pageObserver.observe(aiPage, { attributes: true, attributeFilter: ['class'] });

      var chromeObserver = new MutationObserver(function () {
        if (!aiPage.classList.contains('open')) return;
        requestAnimationFrame(function () {
          syncAiChromePadding();
          if (aiControllers) {
            for (var i = 0; i < aiControllers.length; i++) {
              if (aiControllers[i]) aiControllers[i].measure(false);
            }
          }
        });
      });
      [aiSheetBar, aiSheetStatus, aiPreviewTray].forEach(function (el) {
        if (el) chromeObserver.observe(el, { attributes: true, attributeFilter: ['style', 'class'], childList: true });
      });
    }

    aiPage.addEventListener('transitionend', function (e) {
      if (e.target === aiPage && aiPage.classList.contains('open')) {
        if (aiControllers) {
          for (var i = 0; i < aiControllers.length; i++) {
            if (aiControllers[i]) aiControllers[i].measure(true);
          }
        }
        syncAiChromePadding();
      }
    }, { passive: true });

    if (typeof ResizeObserver === 'function') {
      var pageRo = new ResizeObserver(function () {
        if (aiPage.classList.contains('open')) syncAiChromePadding();
      });
      pageRo.observe(aiPage);
    }

    if (aiPage.classList.contains('open')) {
      syncAiOpenState();
    }
  }

  if (document.getElementById('bottomNav') || document.getElementById('aiSearchBar')) {
    initAllLiquidGlassSurfaces();
  } else if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initAllLiquidGlassSurfaces);
  } else {
    initAllLiquidGlassSurfaces();
  }
})();
