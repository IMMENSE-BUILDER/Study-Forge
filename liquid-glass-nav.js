/* ============================================================
   StudyForged — Ray-Traced Liquid Glass Navigation Engine
   3D SDF raymarching, Snell refraction, Total Internal Reflection
   border caustics, chromatic dispersion, and damped spring physics
   adapted from MuhammadaliMS/liquid-glass (MIT License, Copyright (c) 2026 zerowing).

   Hybrid dual-layer architecture for live scrolling PWA DOM:
   1. Live-DOM Refraction Layer: CPU-computed 3D ray-traced Snell + TIR
      displacement map driving a 3-channel sRGB SVG <feDisplacementMap>
      backdrop-filter (Chromium) with frosted CSS fallback elsewhere.
   2. Transparent WebGL 3D Glass Surface: real-time raymarched dual-solid
      SDF (outer pill + smooth-min blended active droplet lens) rendering
      Fresnel rims, softbox reflections, pointer-reactive liquid bulge,
      TIR border caustics & dispersion, specular glints, and contact shadow.
   ============================================================ */
(function () {
  'use strict';

  var BLEED_X = 12;
  var BLEED_Y = 18;
  var MAX_DISP = 18;
  var GLASS_IOR = 1.48;
  var RAY_CAMERA = 780;
  var RAY_BACK = -165;
  var SINK_THRESH = 0.001;

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

  function buildRayTracedDisplacementURL(width, height, radius) {
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

        // Ray from camera (0, 0, RAY_CAMERA) through (lx, ly, 0)
        var rdx = lx;
        var rdy = ly;
        var rdz = -RAY_CAMERA;
        var rlen = Math.hypot(rdx, rdy, rdz);
        rdx /= rlen;
        rdy /= rlen;
        rdz /= rlen;

        // AABB slab intersect for fast start
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
                // TIR internal bounce at curved border bevel
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
                // Grazing or TIR-flipped ray bends strongly along border tangent
                var edgeTaper = clamp(-sdRoundedBox2D(lx, ly, hw, hh, r) / 4.0, 0.0, 1.0);
                dxOut = clamp(outgoing[0] * MAX_DISP * 1.1 * edgeTaper, -MAX_DISP, MAX_DISP);
                dyOut = clamp(outgoing[1] * MAX_DISP * 1.1 * edgeTaper, -MAX_DISP, MAX_DISP);
              } else {
                var rayDist = (RAY_BACK - rzPos) / oz;
                var bgX = (rxPos + outgoing[0] * rayDist) * RAY_CAMERA / (RAY_CAMERA - RAY_BACK);
                var bgY = (ryPos + outgoing[1] * rayDist) * RAY_CAMERA / (RAY_CAMERA - RAY_BACK);
                var rawDx = bgX - lx;
                var rawDy = bgY - ly;
                var dEdge = sdRoundedBox2D(lx, ly, hw, hh, r);
                var edgeFade = clamp(-dEdge / 1.5, 0.0, 1.0);
                dxOut = clamp(rawDx * edgeFade, -MAX_DISP, MAX_DISP);
                dyOut = clamp(rawDy * edgeFade, -MAX_DISP, MAX_DISP);
              }
            }
          }
        }

        // Encode displacement into sRGB PNG channels (neutral = 128)
        data[idx] = clamp(Math.round(128 + (dxOut / MAX_DISP) * 127), 0, 255);
        data[idx + 1] = clamp(Math.round(128 + (dyOut / MAX_DISP) * 127), 0, 255);
        data[idx + 2] = 128;
        data[idx + 3] = 255;
      }
    }

    ctx.putImageData(img, 0, 0);
    return { url: offCanvas.toDataURL('image/png'), width: W, height: H };
  }

  function ensureSvgFilterElement() {
    var svg = document.getElementById('sf-lg-svg');
    if (svg) return svg;
    var ns = 'http://www.w3.org/2000/svg';
    svg = document.createElementNS(ns, 'svg');
    svg.id = 'sf-lg-svg';
    svg.setAttribute('aria-hidden', 'true');
    svg.style.cssText = 'position:fixed;width:0;height:0;overflow:hidden;pointer-events:none;left:-9999px;top:-9999px;';
    var defs = document.createElementNS(ns, 'defs');
    var filter = document.createElementNS(ns, 'filter');
    filter.id = 'sf-lg-nav-filter';
    filter.setAttribute('color-interpolation-filters', 'sRGB');
    defs.appendChild(filter);
    svg.appendChild(defs);
    document.body.appendChild(svg);
    return svg;
  }

  function updateSvgDisplacementFilter(width, height, radius) {
    var map = buildRayTracedDisplacementURL(width, height, radius);
    if (!map) return false;
    var svg = ensureSvgFilterElement();
    var filter = svg.querySelector('#sf-lg-nav-filter');
    if (!filter) return false;
    var ns = 'http://www.w3.org/2000/svg';
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
      var node = document.createElementNS(ns, tag);
      for (var k in attrs) {
        if (Object.prototype.hasOwnProperty.call(attrs, k)) {
          node.setAttribute(k, String(attrs[k]));
        }
      }
      return node;
    }

    // Optical polish softens high-frequency text behind the dock while keeping refracted shapes rich
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

    // Subtle chromatic RGB dispersion along the refracted curved borders
    filter.appendChild(el('feDisplacementMap', {
      in: 'softSrc',
      in2: 'dispMap',
      scale: (MAX_DISP * 0.96).toFixed(2),
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
      scale: MAX_DISP.toFixed(2),
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
      scale: (MAX_DISP * 1.04).toFixed(2),
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
    'uniform float u_press;',     // 0..1 active press highlight
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
    '// Outer capsule outline with liquid pointer bulge (ported from glass.frag).',
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
    '// 3D dual-solid SDF: main domed glass capsule + smooth-min blended active droplet.',
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
    '  // Warm-cream studio sky in light mode, cool moonlit studio in dark mode',
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
    '    // Floating soft drop shadow + subtle caustic glow under curved bottom edge',
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
    '  // Active sliding droplet mask & edge normal strength',
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
    '  // Specular highlights tracking pointer/light position',
    '  vec3 toLight = normalize(vec3(u_light - front.xy, 360.0));',
    '  vec3 halfVec = normalize(toLight - viewRay);',
    '  float spec = pow(max(dot(normal, halfVec), 0.0), 120.0) * (0.34 + u_press * 0.36);',
    '  float broadSpec = pow(max(dot(normal, halfVec), 0.0), 22.0) * (0.10 + u_press * 0.14);',
    '',
    '  // Curved-border TIR caustics & subtle prismatic chromatic fire at glass rims',
    '  float rimFactor = smoothstep(-12.0, -0.5, outerDist);',
    '  float dispersionAngle = atan(rearNormal.y, rearNormal.x);',
    '  vec3 prism = 0.5 + 0.5 * cos(dispersionAngle + vec3(0.0, 2.094, 4.188));',
    '  vec3 causticColor = mix(vec3(1.0, 0.99, 0.96), prism, 0.28);',
    '  float tirGlow = tirBounce * (0.42 + 0.32 * rimFactor) + lensEdgeMask * (0.28 + 0.25 * grazing);',
    '',
    '  // Crisp optical boundary bevel & catchlight rims',
    '  float outerCrease = 1.0 - smoothstep(0.0, 1.8, abs(outerDist + 0.5));',
    '  float topSpecularRim = clamp(-normal.y * 0.85 + 0.4, 0.0, 1.0) * (1.0 - smoothstep(0.0, 3.2, abs(outerDist + 1.5)));',
    '  float dropletCrease = lensEdgeMask * (0.48 + 0.42 * grazing);',
    '',
    '  // Beer-Lambert glass tint + balanced translucent crystal veil for crisp icon/label readability',
    '  vec3 baseVeilCol = mix(vec3(0.99, 0.975, 0.94), vec3(0.14, 0.17, 0.24), u_dark);',
    '  vec3 edgeThicknessCol = mix(vec3(0.92, 0.96, 1.0), vec3(0.45, 0.65, 0.96), u_dark);',
    '  vec3 glassColor = mix(baseVeilCol, reflected, clamp(fresnel * 1.18, 0.0, 0.92));',
    '  glassColor = mix(glassColor, edgeThicknessCol, rimFactor * 0.24);',
    '  glassColor += causticColor * tirGlow;',
    '  glassColor += vec3(1.0, 0.995, 0.98) * (spec + broadSpec + topSpecularRim * mix(0.62, 0.72, u_dark) + lensTopRim * 0.68);',
    '  // Raised active crystal droplet pillow (bright frosted milk-crystal in light, glowing ice in dark)',
    '  vec3 dropletTint = mix(vec3(1.0, 0.99, 0.96), vec3(0.76, 0.86, 1.0), u_dark);',
    '  glassColor = mix(glassColor, dropletTint, lensBodyMask * mix(0.50, 0.24, u_dark));',
    '  // Optical rim contour so the curved crystal edge & active droplet read clearly on both themes',
    '  vec3 rimContour = mix(vec3(0.24, 0.20, 0.17), vec3(0.88, 0.94, 1.0), u_dark);',
    '  glassColor = mix(glassColor, rimContour, outerCrease * mix(0.28, 0.36, u_dark));',
    '  glassColor = mix(glassColor, rimContour, dropletCrease * mix(0.28, 0.38, u_dark));',
    '',
    '  float centerAlpha = mix(0.22, 0.26, u_dark) + lensBodyMask * mix(0.38, 0.22, u_dark);',
    '  float rimAlpha = clamp(fresnel * 0.88 + tirGlow * 0.68 + outerCrease * 0.45 + spec + topSpecularRim * 0.48 + dropletCrease * 0.45, 0.0, 0.95);',
    '  float alpha = clamp(max(centerAlpha, rimAlpha), 0.0, 0.96);',
    '  float coverage = clamp(0.5 - outerDist * u_dpr, 0.0, 1.0);',
    '  alpha *= max(coverage, step(outerDist, -1.0));',
    '',
    '  gl_FragColor = vec4(clamp(glassColor, 0.0, 1.0) * alpha, alpha);',
    '}'
  ].join('\n');

  function createNavGlassWebGL(canvas) {
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
     Bootstrap & Spring Choreography on #bottomNav
     ------------------------------------------------------------ */
  function initLiquidGlassNav() {
    var nav = document.getElementById('bottomNav');
    if (!nav || nav.dataset.lgInit === '1') return;
    nav.dataset.lgInit = '1';

    // Insert backing refraction layer, WebGL glass canvas, and CSS fallback pill BEFORE tabs
    var refractLayer = document.createElement('div');
    refractLayer.className = 'sf-lg-refract';
    refractLayer.setAttribute('aria-hidden', 'true');

    var canvas = document.createElement('canvas');
    canvas.className = 'sf-lg-canvas';
    canvas.setAttribute('aria-hidden', 'true');

    var pillFallback = document.createElement('div');
    pillFallback.className = 'sf-lg-pill-fallback';
    pillFallback.setAttribute('aria-hidden', 'true');

    nav.insertBefore(pillFallback, nav.firstChild);
    nav.insertBefore(canvas, pillFallback);
    nav.insertBefore(refractLayer, canvas);
    nav.classList.add('sf-lg-ready');

    var motionQuery = window.matchMedia ? window.matchMedia('(prefers-reduced-motion: reduce)') : null;
    var isDarkMode = function () { return document.body.getAttribute('data-theme') === 'dark'; };

    var renderer = createNavGlassWebGL(canvas);
    nav.dataset.lgWebgl = renderer ? '1' : '0';

    var useSvgRefract = supportsSvgBackdropRefraction();
    nav.dataset.lgRefract = useSvgRefract ? 'svg' : 'css';

    canvas.addEventListener('webglcontextlost', function (e) {
      e.preventDefault();
      if (renderer) {
        renderer.destroy();
        renderer = null;
      }
      nav.dataset.lgWebgl = '0';
    });

    var metrics = {
      width: 340,
      height: 62,
      radius: 31,
      tabs: [] // { left, width, height, cx, cy } relative to nav
    };

    var anim = {
      lensX: 0, lensVx: 0, targetLensX: 0,
      lensW: 60, lensVw: 0, targetLensW: 60,
      lensH: 48,
      pull: 0, pullV: 0, targetPull: 0,
      press: 0, pressV: 0, targetPress: 0,
      lightX: 120, lightVx: 0, targetLightX: 120,
      lightY: -40, lightVy: 0, targetLightY: -40,
      dark: isDarkMode() ? 1 : 0, darkV: 0, targetDark: isDarkMode() ? 1 : 0,
      pointerX: -9999,
      pointerY: -9999,
      pointerInside: false,
      pointerDown: false,
      scrubbing: false,
      startClientX: 0,
      startClientY: 0,
      scrubTargetIdx: -1,
      initialized: false
    };

    var rafId = 0;
    var lastNow = 0;
    var lastFilterKey = '';

    function measureNav(snap) {
      var rect = nav.getBoundingClientRect();
      if (rect.width < 20 || rect.height < 20) return;

      var cs = getComputedStyle(nav);
      var parsedR = parseFloat(cs.borderTopLeftRadius) || 32;
      metrics.width = rect.width;
      metrics.height = rect.height;
      metrics.radius = clamp(parsedR, 0, Math.min(rect.width, rect.height) * 0.5);

      var tabEls = Array.from(nav.querySelectorAll('.nav-tab'));
      var activeIdx = -1;
      metrics.tabs = tabEls.map(function (tab, i) {
        var tr = tab.getBoundingClientRect();
        var relLeft = tr.left - rect.left;
        var relTop = tr.top - rect.top;
        if (tab.classList.contains('active')) activeIdx = i;
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
        anim.targetLensW = Math.max(36, active.width - 2);
        anim.lensH = Math.max(32, active.height - 2);
        if (!anim.initialized || snap) {
          anim.lensX = anim.targetLensX;
          anim.lensW = anim.targetLensW;
          anim.lensVx = 0;
          anim.lensVw = 0;
          anim.initialized = true;
        }
      }

      if (!anim.pointerInside) {
        anim.targetLightX = BLEED_X + metrics.width * 0.24;
        anim.targetLightY = BLEED_Y - metrics.height * 0.35;
        if (!anim.initialized || snap) {
          anim.lightX = anim.targetLightX;
          anim.lightY = anim.targetLightY;
        }
      }

      if (renderer) {
        renderer.resize(metrics.width + BLEED_X * 2, metrics.height + BLEED_Y * 2);
      }

      if (useSvgRefract) {
        var fKey = Math.round(metrics.width) + 'x' + Math.round(metrics.height) + '@' + Math.round(metrics.radius);
        if (fKey !== lastFilterKey) {
          lastFilterKey = fKey;
          var ok = updateSvgDisplacementFilter(metrics.width, metrics.height, metrics.radius);
          if (!ok) {
            useSvgRefract = false;
            nav.dataset.lgRefract = 'css';
          }
        }
      }

      syncFallbackPill();
      scheduleFrame();
    }

    function syncFallbackPill() {
      var pw = Math.max(32, anim.lensW);
      var ph = Math.max(30, anim.lensH);
      var px = anim.lensX - pw * 0.5;
      var py = (metrics.height - ph) * 0.5;
      pillFallback.style.width = pw.toFixed(1) + 'px';
      pillFallback.style.height = ph.toFixed(1) + 'px';
      pillFallback.style.transform = 'translate3d(' + px.toFixed(1) + 'px, ' + py.toFixed(1) + 'px, 0)';
    }

    function updateActiveTargetFromMutation() {
      if (anim.scrubbing) return;
      var tabEls = Array.from(nav.querySelectorAll('.nav-tab'));
      var idx = tabEls.findIndex(function (t) { return t.classList.contains('active'); });
      if (idx >= 0 && metrics.tabs[idx]) {
        anim.targetLensX = metrics.tabs[idx].cx;
        anim.targetLensW = Math.max(36, metrics.tabs[idx].width - 2);
        scheduleFrame();
      }
      anim.targetDark = isDarkMode() ? 1 : 0;
      scheduleFrame();
    }

    function tabIndexAtClientX(clientX) {
      var rect = nav.getBoundingClientRect();
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
      var rect = nav.getBoundingClientRect();
      var lx = e.clientX - rect.left;
      var ly = e.clientY - rect.top;
      anim.pointerX = lx + BLEED_X;
      anim.pointerY = ly + BLEED_Y;
      anim.pointerInside = true;
      anim.targetLightX = anim.pointerX - 45;
      anim.targetLightY = anim.pointerY - 85;
      anim.targetPull = motionQuery && motionQuery.matches ? 0 : 5.5;
      scheduleFrame();
    }

    nav.addEventListener('pointerenter', updatePointer, { passive: true });
    nav.addEventListener('pointermove', function (e) {
      updatePointer(e);
      if (anim.pointerDown) {
        var dx = Math.abs(e.clientX - anim.startClientX);
        if (!anim.scrubbing && dx > 10) {
          anim.scrubbing = true;
        }
        if (anim.scrubbing) {
          var rect = nav.getBoundingClientRect();
          var clampedX = clamp(e.clientX - rect.left, anim.lensW * 0.5 + 4, metrics.width - anim.lensW * 0.5 - 4);
          anim.targetLensX = clampedX;
          anim.scrubTargetIdx = tabIndexAtClientX(e.clientX);
        }
      }
    }, { passive: true });

    nav.addEventListener('pointerleave', function () {
      anim.pointerInside = false;
      anim.targetPull = 0;
      anim.targetLightX = BLEED_X + metrics.width * 0.24;
      anim.targetLightY = BLEED_Y - metrics.height * 0.35;
      scheduleFrame();
    }, { passive: true });

    nav.addEventListener('pointerdown', function (e) {
      if (e.button !== undefined && e.button > 0) return;
      updatePointer(e);
      anim.pointerDown = true;
      anim.scrubbing = false;
      anim.scrubTargetIdx = -1;
      anim.startClientX = e.clientX;
      anim.startClientY = e.clientY;
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
      anim.targetPress = 0.0;
      if (wasScrubbing && scrubIdx >= 0 && metrics.tabs[scrubIdx]) {
        metrics.tabs[scrubIdx].el.click();
        anim.targetLensX = metrics.tabs[scrubIdx].cx;
        anim.targetLensW = Math.max(36, metrics.tabs[scrubIdx].width - 2);
      } else if (e.type === 'pointercancel') {
        updateActiveTargetFromMutation();
      }
      scheduleFrame();
    }

    window.addEventListener('pointerup', finishPointer, { passive: true });
    window.addEventListener('pointercancel', finishPointer, { passive: true });

    function tick(now) {
      rafId = 0;
      if (document.hidden) return;
      var dt = lastNow ? clamp((now - lastNow) / 1000, 0, 1 / 15) : 1 / 60;
      lastNow = now;

      var still = motionQuery && motionQuery.matches;
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
        var r1 = stepSpring(anim.lensX, anim.lensVx, anim.targetLensX, dt, 380, 24);
        anim.lensX = r1[0]; anim.lensVx = r1[1];
        var r2 = stepSpring(anim.lensW, anim.lensVw, anim.targetLensW, dt, 380, 24);
        anim.lensW = r2[0]; anim.lensVw = r2[1];
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

      // Liquid squash-and-stretch as the active droplet glides across tabs
      var stretch = still ? 0 : clamp(Math.abs(anim.lensVx) * 0.00028, 0, 0.22);
      var pressBoost = 1 + anim.press * 0.035;
      var dropletHw = (anim.lensW * 0.5) * (1 + stretch) * pressBoost;
      var dropletHh = (anim.lensH * 0.5) * (1 - stretch * 0.42) * pressBoost;

      syncFallbackPill();

      if (renderer) {
        renderer.draw({
          pillCx: BLEED_X + metrics.width * 0.5,
          pillCy: BLEED_Y + metrics.height * 0.5,
          pillHw: metrics.width * 0.5,
          pillHh: metrics.height * 0.5,
          radius: metrics.radius,
          lensCx: BLEED_X + anim.lensX,
          lensCy: BLEED_Y + metrics.height * 0.5,
          lensHw: dropletHw * 0.94,
          lensHh: dropletHh * 0.94,
          lensRadius: Math.min(dropletHw * 0.94, dropletHh * 0.94),
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

      var moving =
        Math.abs(anim.lensX - anim.targetLensX) > SINK_THRESH ||
        Math.abs(anim.lensVx) > 0.05 ||
        Math.abs(anim.lensW - anim.targetLensW) > SINK_THRESH ||
        Math.abs(anim.lensVw) > 0.05 ||
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
      if (!rafId && !document.hidden) {
        lastNow = performance.now();
        rafId = requestAnimationFrame(tick);
      }
    }

    if (typeof ResizeObserver === 'function') {
      var ro = new ResizeObserver(function () { measureNav(false); });
      ro.observe(nav);
    } else {
      window.addEventListener('resize', function () { measureNav(false); });
    }

    if (typeof MutationObserver === 'function') {
      var navObserver = new MutationObserver(updateActiveTargetFromMutation);
      navObserver.observe(nav, { subtree: true, attributes: true, attributeFilter: ['class'] });

      var bodyObserver = new MutationObserver(function () {
        anim.targetDark = isDarkMode() ? 1 : 0;
        scheduleFrame();
      });
      bodyObserver.observe(document.body, { attributes: true, attributeFilter: ['data-theme'] });
    }

    document.addEventListener('visibilitychange', function () {
      if (!document.hidden) scheduleFrame();
      else if (rafId) {
        cancelAnimationFrame(rafId);
        rafId = 0;
      }
    });

    if (motionQuery && typeof motionQuery.addEventListener === 'function') {
      motionQuery.addEventListener('change', function () { scheduleFrame(); });
    }

    // Wait a microtask/frame so initBottomNav & initTheme finish setting active tab & theme
    requestAnimationFrame(function () {
      anim.targetDark = isDarkMode() ? 1 : 0;
      anim.dark = anim.targetDark;
      measureNav(true);
    });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initLiquidGlassNav);
  } else {
    initLiquidGlassNav();
  }
})();
