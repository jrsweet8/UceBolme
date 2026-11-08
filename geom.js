/* geom.js — küçük koordinat geometrisi yardımcı modülü.
 * Tüm çizimler bu fonksiyonlardan beslenir; sayfada hiçbir koordinat elle girilmez.
 * Not: SVG koordinatlarında y aşağı doğru artar.
 */
(function (global) {
  'use strict';

  const P = (x, y) => ({ x, y });
  const add = (a, b) => P(a.x + b.x, a.y + b.y);
  const sub = (a, b) => P(a.x - b.x, a.y - b.y);
  const mul = (a, k) => P(a.x * k, a.y * k);
  const dot = (a, b) => a.x * b.x + a.y * b.y;
  const cross = (a, b) => a.x * b.y - a.y * b.x;
  const len = (a) => Math.hypot(a.x, a.y);
  const dist = (a, b) => len(sub(a, b));
  const unit = (a) => { const l = len(a); return P(a.x / l, a.y / l); };
  const lerp = (a, b, t) => P(a.x + (b.x - a.x) * t, a.y + (b.y - a.y) * t);
  const mid = (a, b) => lerp(a, b, 0.5);
  const rotate = (v, t) => P(v.x * Math.cos(t) - v.y * Math.sin(t), v.x * Math.sin(t) + v.y * Math.cos(t));
  const angle = (c, p) => Math.atan2(p.y - c.y, p.x - c.x);
  const onCircle = (c, r, t) => P(c.x + r * Math.cos(t), c.y + r * Math.sin(t));

  /** İki çemberin kesişimi (0 veya 2 nokta). */
  function circleCircle(c1, r1, c2, r2) {
    const d = dist(c1, c2);
    if (d < 1e-12 || d > r1 + r2 + 1e-12 || d < Math.abs(r1 - r2) - 1e-12) return [];
    const a = (r1 * r1 - r2 * r2 + d * d) / (2 * d);
    const h = Math.sqrt(Math.max(0, r1 * r1 - a * a));
    const u = unit(sub(c2, c1));
    const m = add(c1, mul(u, a));
    const n = P(-u.y, u.x);
    return [add(m, mul(n, h)), sub(m, mul(n, h))];
  }

  /** a-b doğrusu ile c merkezli r yarıçaplı çemberin kesişimi. */
  function lineCircle(a, b, c, r) {
    const d = unit(sub(b, a));
    const f = sub(a, c);
    const B = dot(f, d), C = dot(f, f) - r * r;
    const disc = B * B - C;
    if (disc < -1e-12) return [];
    const s = Math.sqrt(Math.max(0, disc));
    return [add(a, mul(d, -B - s)), add(a, mul(d, -B + s))];
  }

  /** p1p2 ve p3p4 doğrularının kesişimi. */
  function lineLine(p1, p2, p3, p4) {
    const r = sub(p2, p1), s = sub(p4, p3);
    const den = cross(r, s);
    if (Math.abs(den) < 1e-14) return null;
    const t = cross(sub(p3, p1), s) / den;
    return add(p1, mul(r, t));
  }

  /** p noktasından ab doğrusuna inilen dikmenin ayağı. */
  function foot(p, a, b) {
    const ab = sub(b, a);
    const t = dot(sub(p, a), ab) / dot(ab, ab);
    return add(a, mul(ab, t));
  }

  /** A'dan D merkezli r yarıçaplı çembere teğetlerin değme noktaları
   *  (AD çaplı yardımcı çember ile kesişim — Thales). */
  function tangentPoints(A, D, r) {
    return circleCircle(mid(A, D), dist(A, D) / 2, D, r);
  }

  /** p noktası a→b doğrusunun hangi yanında (işaret). */
  const side = (a, b, p) => cross(sub(b, a), sub(p, a));
  /** Noktalardan, a→b doğrusuna göre istenen yanda (s = ±1) olanı seç.
   *  SVG'de (y aşağı) s = −1, a→b soldan sağa iken "üst" yandır. */
  function pickSide(pts, a, b, s) {
    return pts.slice().sort((p, q) => s * side(a, b, q) - s * side(a, b, p))[0];
  }

  /** Teğet-dikme çekirdeği: D merkezli r çemberine A'dan teğet, E'den AB'ye dikme → F. */
  function tangentFoot(A, B, D, r, s = -1) {
    const E = pickSide(tangentPoints(A, D, r), A, B, s);
    const F = foot(E, A, B);
    return { D, r, E, F };
  }

  /** r = AB/(d+1) seçimiyle teğet-dikme: AF:FB = (d−1):1. */
  function tangentDivide(A, B, d) {
    const AB = dist(A, B);
    const r = AB / (d + 1);
    const D = sub(B, mul(unit(sub(B, A)), r));
    return tangentFoot(A, B, D, r);
  }

  global.Geo = {
    P, add, sub, mul, dot, cross, len, dist, unit, lerp, mid, rotate, angle, onCircle,
    circleCircle, lineCircle, lineLine, foot, tangentPoints, side, pickSide,
    tangentFoot, tangentDivide,
  };
})(window);
