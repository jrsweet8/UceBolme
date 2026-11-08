/* app.js — teğet-dikme yöntemi öğretim sitesi.
 * Yapılar (construction) geom.js ile hesaplanır, SVG'ye adım adım çizilir.
 * İşlem sayaçları, yapı adımlarındaki öğelerin "op" alanından otomatik sayılır:
 *   op: 'C' → pergel (çember/yay), op: 'L' → cetvel (doğru).
 */
(function () {
  'use strict';
  const G = window.Geo;
  const NS = 'http://www.w3.org/2000/svg';
  const mqReduce = window.matchMedia('(prefers-reduced-motion: reduce)');
  const reduced = () => mqReduce.matches;
  const fmt = (v) => (Math.round(v * 100) / 100).toString();
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => Array.from(r.querySelectorAll(s));

  /* ------------------------------------------------------------------ */
  /* 1. Yapı öğeleri (primitive) — sayılan işlemler burada etiketlenir     */
  /* ------------------------------------------------------------------ */
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  /** Pergel: c merkezli r yarıçaplı yay; "around" noktalarının çevresinde kısa parçalar. */
  function compassArc(c, r, around, arcLen, role = 'build') {
    const half = clamp(arcLen / r, 0.08, 0.4);
    const pieces = around.map((p) => { const a = G.angle(c, p); return [a - half, a + half]; });
    return { t: 'arc', c, r, pieces, role, op: 'C' };
  }
  /** Pergel: a0 → a1 açıları arasında sürekli yay (kısa yoldan), uçlarda pay ile. */
  function compassSpan(c, r, a0, a1, pad, role = 'build') {
    let d = a1 - a0;
    while (d > Math.PI) d -= 2 * Math.PI;
    while (d < -Math.PI) d += 2 * Math.PI;
    const lo = Math.min(a0, a0 + d) - pad, hi = Math.max(a0, a0 + d) + pad;
    return { t: 'arc', c, r, pieces: [[lo, hi]], role, op: 'C' };
  }
  /** Pergel: tam çember. */
  const compassCircle = (c, r, role = 'build', start = 0) => ({ t: 'circle', c, r, role, op: 'C', start });
  /** Cetvel: a ve b'den geçen doğru parçası, iki uçtan ext oranında uzatılmış. */
  function ruler(a, b, role = 'build', ext = 0, extB) {
    const v = G.sub(b, a);
    return { t: 'seg', a: G.sub(a, G.mul(v, ext)), b: G.add(b, G.mul(v, extB === undefined ? ext : extB)), role, op: 'L' };
  }
  /* Sayılmayan (görsel) öğeler */
  const seg = (a, b, role, extra = {}) => Object.assign({ t: 'seg', a, b, role }, extra);
  const pt = (p, label, role, dir) => ({ t: 'pt', p, label, role, dir });
  const dot = (p, role = 'aux') => ({ t: 'pt', p, label: '', role, small: true });
  const txt = (p, s, role) => ({ t: 'text', p, s, role });
  const right = (at, toA, toB, role = 'note') => ({ t: 'right', at, d1: G.unit(G.sub(toA, at)), d2: G.unit(G.sub(toB, at)), role });
  const poly = (pts, cls) => ({ t: 'poly', pts, role: 'hl', cls });
  const dirs = (A, B) => {
    const u = G.unit(G.sub(B, A));
    const up = G.P(u.y, -u.x), dn = G.P(-u.y, u.x);
    const mix = (a, b, k = 1) => G.unit(G.add(a, G.mul(b, k)));
    return { u, up, dn, lf: G.mul(u, -1), rt: u, mix };
  };

  /* ------------------------------------------------------------------ */
  /* 2. Teğet-dikme yapısı (Hakan Şimşek)                                  */
  /* ------------------------------------------------------------------ */
  /* d = 3 : AB'yi iki kez yarıla (r = AB/4), teğet-dikme → FB = AB/3
   * d = 7 : üç kez yarıla (r = AB/8), teğet-dikme → FB = AB/7
   * d = 11: d = 3 yapısı + özyineleme d → d² + d − 1 (F₁D yarıçaplı, B'den geçen çember) */
  function buildTangent(A, B, opt = {}) {
    const d = opt.d || 3;
    const { up, dn, lf, rt, mix } = dirs(A, B);
    const AB = G.dist(A, B), arcLen = 0.09 * AB, K = 0.62, UP = -1, DN = 1;
    const steps = [];
    steps.push({
      cap: `Verilen: AB doğru parçası. Amaç: yalnızca pergel ve işaretsiz cetvel kullanarak AF : FB = ${d - 1} : 1, yani FB = AB/${d} olacak biçimde F noktasını bulmak.`,
      items: [seg(A, B, 'given'), pt(A, 'A', 'given', lf), pt(B, 'B', 'given', rt)],
    });
    // Orta nokta: iki eşit yay + kesişimlerden geçen doğru
    const midpoint = (P, Q) => {
      const R = K * G.dist(P, Q);
      const X = G.circleCircle(P, R, Q, R);
      const Xu = G.pickSide(X, A, B, UP), Xd = G.pickSide(X, A, B, DN);
      const M = G.lineLine(Xu, Xd, P, Q);
      return { M, items: [compassArc(P, R, [Xu, Xd], arcLen), compassArc(Q, R, [Xu, Xd], arcLen), dot(Xu), dot(Xd), ruler(Xu, Xd, 'aux', 0.12)] };
    };
    const lblDn = mix(dn, lf, 0.8);

    // 1) Yarılamalar
    const halvings = d === 7 ? 3 : 2;
    const names = halvings === 3 ? ['C', 'K', 'D'] : ['C', 'D'];
    let P = A, C = null;
    for (let h = 0; h < halvings; h++) {
      const m = midpoint(P, B);
      const nm = names[h], last = h === halvings - 1;
      let cap = h === 0
        ? 'C, AB’nin orta noktası: A ve B merkezli, eşit yarıçaplı iki yay çiz. Yayların kesişimlerinden geçen doğru AB’yi C’de keser.'
        : `${nm}, ${names[h - 1]}B’nin orta noktası: aynı işlemi ${names[h - 1]} ve B için tekrarla.`;
      if (last) cap += ` Böylece DB = r = AB/${2 ** halvings} ve AD = ${2 ** halvings - 1}r olur.`;
      steps.push({ cap, items: [...m.items, pt(m.M, nm, 'build', lblDn)] });
      P = m.M; if (h === 0) C = m.M;
    }
    const D = P, r = G.dist(D, B);
    steps.push({
      cap: `D merkezli, DB = r yarıçaplı çemberi çiz. A bu çemberin dışındadır (AD = ${2 ** halvings - 1}r > r).`,
      items: [compassCircle(D, r, 'build', 0), txt(G.add(D, G.mul(G.add(up, rt), r * 0.42)), 'r', 'build')],
    });

    // 2) Teğet-dikme motifi (D merkezli ρ yarıçaplı çember için)
    const stage = (Dc, rho, s, Flabel, final) => {
      const Dn = `D${s}`;
      const m3 = midpoint(A, Dc), M = m3.M;
      steps.push({
        cap: `Teğeti kurmak için A${Dn}’nin orta noktası M${s}’yi bul (yine iki yay ve bir doğru).`,
        items: [...m3.items, pt(M, `M${s}`, 'aux', lblDn)],
      });
      const T = G.circleCircle(M, G.dist(M, Dc), Dc, rho);
      const E = G.pickSide(T, A, B, UP), E2 = G.pickSide(T, A, B, DN);
      steps.push({
        cap: `M${s} merkezli, A${Dn} çaplı yardımcı çemberi çiz. ${Dn} merkezli çemberi E${s}’de keser. Thales teoremine göre ∠AE${s}${Dn} = 90°.`,
        items: [Object.assign(compassCircle(M, G.dist(M, Dc), 'aux', Math.PI), { dash: true }), pt(E, `E${s}`, 'tangent', mix(up, rt, 0.25)), pt(E2, s ? '' : 'E′', 'aux', mix(dn, rt, 0.25))],
      });
      steps.push({
        cap: `A’dan E${s}’ye doğru çiz: AE${s} çembere E${s}’de teğettir, çünkü ${Dn}E${s} yarıçapına diktir.`,
        items: [ruler(A, E, 'tangent', 0, 0.18), seg(Dc, E, 'note', { dash: true }), right(E, A, Dc)],
      });
      const role = final ? 'result' : 'build';
      let F;
      if (opt.short) {
        F = G.lineLine(E, E2, A, B);
        steps.push({
          cap: `Kısa yol: E${s} ve E${s}′ AB’ye göre simetriktir; bu iki noktadan geçen doğru doğrudan AB’ye diktir ve AB’yi ${Flabel}’de keser.`,
          items: [ruler(E, E2, 'build', 0.06), pt(F, Flabel, role, mix(dn, lf, 0.9)), right(F, B, E)],
        });
      } else {
        const h = G.dist(E, G.foot(E, A, B)); // yalnızca uygun bir pergel açıklığı seçmek için
        const rr = 1.3 * h;
        const [G1, G2] = G.lineCircle(A, B, E, rr);
        steps.push({
          cap: `E${s}’den AB’ye dikme: E${s} merkezli bir yay çiz; yay AB’yi G₁ ve G₂ noktalarında keser.`,
          items: [compassArc(E, rr, [G1, G2], arcLen), pt(G1, 'G₁', 'aux', mix(dn, lf, 0.6)), pt(G2, 'G₂', 'aux', mix(dn, rt, 0.6))],
        });
        const H = G.pickSide(G.circleCircle(G1, rr, G2, rr), A, B, DN);
        steps.push({
          cap: 'G₁ ve G₂ merkezli, eşit yarıçaplı iki yay çiz; AB’nin öbür yanında H’de kesişirler.',
          items: [compassArc(G1, rr, [H], arcLen), compassArc(G2, rr, [H], arcLen), pt(H, 'H', 'aux', mix(dn, rt, 0.6))],
        });
        F = G.lineLine(E, H, A, B);
        steps.push({
          cap: `E${s} ile H’yi birleştir: bu doğru AB’ye diktir ve AB’yi ${Flabel}’de keser.`,
          items: [ruler(E, H, 'build', 0.06), pt(F, Flabel, role, mix(dn, lf, 0.9)), right(F, B, E)],
        });
      }
      return { E, E2, F };
    };

    const s1 = stage(D, r, '', d === 11 ? 'F₁' : 'F', d !== 11);
    let F = s1.F, rLast = r;
    if (d === 11) {
      const rho = G.dist(s1.F, D);
      const D2 = G.lineCircle(A, B, B, rho).sort((p, q) => G.dist(A, p) - G.dist(A, q))[0];
      steps.push({
        cap: 'Özyineleme (d → d² + d − 1): pergeli F₁D uzunluğuna aç ve B merkezli bir yayla AB’yi D₂’de kes. F₁D = r/3 olduğundan D₂B = AB/12.',
        items: [compassArc(B, rho, [D2], arcLen * 0.6), pt(D2, 'D₂', 'build', mix(dn, rt, 0.6))],
      });
      steps.push({
        cap: 'D₂ merkezli, D₂B yarıçaplı çemberi çiz (B’den geçer). Şimdi aynı teğet-dikme motifini bu küçük çember için tekrarlayacağız.',
        items: [compassCircle(D2, rho, 'build', 0)],
      });
      F = stage(D2, rho, '₂', 'F', true).F;
      rLast = rho;
    }
    const off = G.mul(dn, 0.13 * AB);
    steps.push({
      cap: `Sonuç: son çemberin yarıçapı r = AB/${d + 1} ve merkezinin A’ya uzaklığı ${d}r olduğundan, DE² = DF · DA ile DF = r/${d} bulunur. Böylece FB = AB/${d} ve AF : FB = ${d - 1} : 1${d === 3 ? ' — F, AB’yi üçe böler' : ''}.`,
      items: [seg(A, F, 'result', { cls: 'thick' }), seg(F, B, 'result2', { cls: 'thick' }),
        txt(G.add(G.mid(A, F), off), `${d - 1} pay`, 'result'),
        txt(d === 3 ? G.add(G.mid(F, B), off) : G.add(B, G.add(G.mul(rt, 0.06 * AB), G.mul(dn, 0.2 * AB))), '1 pay', 'result')],
    });
    return { steps, meta: { A, B, C, D, E: s1.E, E2: s1.E2, F, r, rLast, d } };
  }

  /* ------------------------------------------------------------------ */
  /* 3. Thales (kesen) yöntemi — Öklid VI.9                               */
  /* ------------------------------------------------------------------ */
  function buildThales(A, B, d, opt = {}) {
    const { u, lf, rt, dn, mix } = dirs(A, B);
    const AB = G.dist(A, B), arcLen = 0.06 * AB;
    const v = G.rotate(u, -0.56); // yardımcı ışının yönü (keyfi seçim): AB'den ≈32° yukarı
    const nv = G.P(v.y, -v.x);
    const s = 0.88 * AB / d; // keyfi pergel açıklığı
    const steps = [];
    steps.push({
      cap: `Verilen: AB doğru parçası. Amaç: AB’yi ${d} eşit parçaya bölmek (AF : FB = ${d - 1} : 1 olan F noktası dahil).`,
      items: [seg(A, B, 'given'), pt(A, 'A', 'given', lf), pt(B, 'B', 'given', rt)],
    });
    const Pend = G.add(A, G.mul(v, s * (d + 0.7)));
    steps.push({
      cap: 'A’dan, AB ile açı yapan keyfi bir yardımcı ışın çiz.',
      items: [ruler(A, Pend, 'aux', 0)],
    });
    const Ps = [A];
    const arcs = [], pts = [];
    for (let k = 1; k <= d; k++) {
      // pergel açıklığı s ile ışın üzerinde bir sonraki nokta (doğru-çember kesişimi)
      const cand = G.lineCircle(A, Pend, Ps[k - 1], s);
      const Pk = cand.sort((p, q) => G.dot(G.sub(q, A), v) - G.dot(G.sub(p, A), v))[0];
      Ps.push(Pk);
      arcs.push(compassArc(Ps[k - 1], s, [Pk], arcLen, 'build'));
      pts.push(pt(Pk, `P${sub(k)}`, 'build', nv));
    }
    const Pd = Ps[d];
    steps.push({
      cap: `Pergel açıklığını sabit tutarak ışın üzerinde ${d} eşit adım at: AP₁ = P₁P₂ = … = P${sub(d - 1)}P${sub(d)}.`,
      items: arcs.flatMap((a, i) => [a, pts[i]]),
    });
    steps.push({
      cap: `P${sub(d)} ile B’yi birleştir.`,
      items: [ruler(Pd, B, 'build', 0)],
    });
    // Açı kopyalama ile paraleller
    const rho = 0.5 * s;
    const aA = G.angle(Pd, A), aB = G.angle(Pd, B);
    const X1 = G.onCircle(Pd, rho, aA), Y1 = G.onCircle(Pd, rho, aB);
    const w = G.dist(X1, Y1);
    const sgn = Math.sign(G.side(Pd, A, Y1));
    steps.push({
      cap: `Paralel için ∠AP${sub(d)}B açısını kopyalayacağız: P${sub(d)} merkezli bir yay çiz; ışını X’te, P${sub(d)}B’yi Y’de kessin.`,
      items: [compassSpan(Pd, rho, aA, aB, 0.15, 'aux'), pt(X1, 'X', 'aux', nv), pt(Y1, 'Y', 'aux', mix(rt, nv, 0.6))],
    });
    const ks = opt.all ? Array.from({ length: d - 1 }, (_, i) => d - 1 - i) : [d - 1];
    const Fs = {};
    ks.forEach((k) => {
      const Pk = Ps[k];
      const X2 = G.onCircle(Pk, rho, aA);
      const Y2 = G.circleCircle(Pk, rho, X2, w).find((p) => Math.sign(G.side(Pk, A, p)) === sgn);
      steps.push({
        cap: `Açıyı P${sub(k)}’ye taşı: aynı açıklıkla P${sub(k)} merkezli yay; sonra pergeli XY uzunluğuna açıp ışın üzerindeki kesişimden yay çiz.`,
        items: [compassSpan(Pk, rho, aA, aB, 0.15, 'aux'), compassArc(X2, w, [Y2], arcLen * 0.8, 'aux'), dot(X2), dot(Y2)],
      });
      const Fk = G.lineLine(Pk, Y2, A, B);
      Fs[k] = Fk;
      const label = opt.all ? `F${sub(k)}` : 'F';
      steps.push({
        cap: `P${sub(k)}’den geçen doğru P${sub(d)}B’ye paraleldir; AB’yi ${label}’de keser (A${label} = ${k}/${d} · AB).`,
        items: [ruler(Pk, Fk, 'build', 0, 0.12), pt(Fk, label, 'result', mix(dn, lf, 0.5))],
      });
    });
    const F = Fs[d - 1];
    const off = G.mul(dn, 0.11 * AB);
    const finalItems = opt.all
      ? [...Array.from({ length: d }, (_, i) => {
        const a = i === 0 ? A : Fs[i], b = i === d - 1 ? B : Fs[i + 1];
        return seg(a, b, i % 2 ? 'result2' : 'result', { cls: 'thick' });
      })]
      : [seg(A, F, 'result', { cls: 'thick' }), seg(F, B, 'result2', { cls: 'thick' }),
        txt(G.add(G.mid(A, F), off), `${d - 1} pay`, 'result'), txt(G.add(G.mid(F, B), off), '1 pay', 'result')];
    steps.push({
      cap: opt.all
        ? `Sonuç: paraleller AB’yi ${d} eşit parçaya böler (Thales / temel orantı teoremi).`
        : `Sonuç: AF : FB = ${d - 1} : 1 (Thales / temel orantı teoremi).`,
      items: finalItems,
    });
    return { steps, meta: { A, B, F, Fs, Ps } };
  }
  function sub(n) { return String(n).replace(/\d/g, (c) => '₀₁₂₃₄₅₆₇₈₉'[c]); }

  /* ------------------------------------------------------------------ */
  /* 4. SVG çizici                                                        */
  /* ------------------------------------------------------------------ */
  const n2 = (v) => v.toFixed(2);
  function arcD(c, r, a0, a1) {
    const p0 = G.onCircle(c, r, a0), p1 = G.onCircle(c, r, a1);
    return `M${n2(p0.x)} ${n2(p0.y)}A${n2(r)} ${n2(r)} 0 ${Math.abs(a1 - a0) > Math.PI ? 1 : 0} ${a1 > a0 ? 1 : 0} ${n2(p1.x)} ${n2(p1.y)}`;
  }
  function circleD(c, r, a0 = 0) {
    const p0 = G.onCircle(c, r, a0), p1 = G.onCircle(c, r, a0 + Math.PI);
    return `M${n2(p0.x)} ${n2(p0.y)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(p1.x)} ${n2(p1.y)}A${n2(r)} ${n2(r)} 0 0 1 ${n2(p0.x)} ${n2(p0.y)}`;
  }
  function el(name, attrs = {}, cls = '') {
    const e = document.createElementNS(NS, name);
    for (const k in attrs) e.setAttribute(k, attrs[k]);
    if (cls) e.setAttribute('class', cls);
    return e;
  }
  /** Bir öğeyi SVG öğesine dönüştürür. u: ölçek birimi (viewBox genişliği / 500). */
  function drawItem(it, u) {
    let e;
    const rc = `r-${it.role}`;
    switch (it.t) {
      case 'seg':
        e = el('path', { d: `M${n2(it.a.x)} ${n2(it.a.y)}L${n2(it.b.x)} ${n2(it.b.y)}` }, `ln ${rc}`); break;
      case 'arc':
        e = el('path', { d: it.pieces.map(([a, b]) => arcD(it.c, it.r, a, b)).join('') }, `ln ${rc}`); break;
      case 'circle':
        e = el('path', { d: circleD(it.c, it.r, it.start || 0) }, `ln ${rc}`); break;
      case 'right': {
        const s = 11 * u, a = G.add(it.at, G.mul(it.d1, s)), b = G.add(a, G.mul(it.d2, s)), c = G.add(it.at, G.mul(it.d2, s));
        e = el('path', { d: `M${n2(a.x)} ${n2(a.y)}L${n2(b.x)} ${n2(b.y)}L${n2(c.x)} ${n2(c.y)}` }, `ln thin ${rc}`); break;
      }
      case 'poly':
        e = el('path', { d: 'M' + it.pts.map((p) => `${n2(p.x)} ${n2(p.y)}`).join('L') + 'Z' }, `poly ${rc}`); break;
      case 'text':
        e = el('text', { x: n2(it.p.x), y: n2(it.p.y), 'text-anchor': 'middle', 'dominant-baseline': 'middle' }, `lbl ${rc}`);
        e.textContent = it.s; break;
      case 'pt': {
        e = el('g', {}, `ptg ${rc}`);
        e.appendChild(el('circle', { cx: n2(it.p.x), cy: n2(it.p.y), r: n2((it.small ? 2.4 : 3.6) * u) }, 'dot'));
        if (it.label) {
          const q = G.add(it.p, G.mul(it.dir || G.P(0, -1), 17 * u));
          const t = el('text', { x: n2(q.x), y: n2(q.y), 'text-anchor': 'middle', 'dominant-baseline': 'central' }, 'lbl');
          t.textContent = it.label;
          e.appendChild(t);
        }
        break;
      }
    }
    if (it.dash) e.classList.add('dash');
    if (it.cls) it.cls.split(' ').forEach((c) => e.classList.add(c));
    return e;
  }
  /** Öğelerin sınır kutusu → viewBox. */
  function boundsOf(items, u) {
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    const addP = (p) => { x0 = Math.min(x0, p.x); y0 = Math.min(y0, p.y); x1 = Math.max(x1, p.x); y1 = Math.max(y1, p.y); };
    items.forEach((it) => {
      if (it.t === 'seg') { addP(it.a); addP(it.b); }
      else if (it.t === 'circle') { addP(G.P(it.c.x - it.r, it.c.y - it.r)); addP(G.P(it.c.x + it.r, it.c.y + it.r)); }
      else if (it.t === 'arc') it.pieces.forEach(([a, b]) => { for (let i = 0; i <= 8; i++) addP(G.onCircle(it.c, it.r, a + (b - a) * i / 8)); });
      else if (it.t === 'pt') { addP(it.p); if (it.label && u) addP(G.add(it.p, G.mul(it.dir || G.P(0, -1), 28 * u))); }
      else if (it.t === 'text') addP(it.p);
    });
    return { x0, y0, x1, y1 };
  }
  function setScale(svg, u) {
    svg.style.setProperty('--sw', (2.2 * u).toFixed(3) + 'px');
    svg.style.setProperty('--fs', (16 * u).toFixed(3) + 'px');
  }
  function renderStatic(svg, items, u) {
    let g = svg.querySelector('g.layer');
    if (!g) { g = el('g', {}, 'layer'); svg.appendChild(g); }
    g.textContent = '';
    items.forEach((it) => g.appendChild(drawItem(it, u)));
    return g;
  }

  /* ------------------------------------------------------------------ */
  /* 5. Oynatıcı denetimi (Player ve Düello ortak)                        */
  /* ------------------------------------------------------------------ */
  const controllers = [];
  let lastActive = null;
  class Ctl {
    initCtl(host) {
      this.speed = 1; this.playing = false; this.timer = null;
      controllers.push(this);
      this.root.addEventListener('pointerdown', () => { lastActive = this; });
      this.root.addEventListener('focusin', () => { lastActive = this; });
      if (!host) return;
      host.classList.add('controls');
      host.innerHTML = `
        <button type="button" data-a="first" aria-label="Başa sar" title="Başa sar">⏮</button>
        <button type="button" data-a="prev" aria-label="Geri" title="Geri (←)">◀ Geri</button>
        <button type="button" data-a="play" class="primary" aria-label="Oynat" title="Oynat / Duraklat">▶ Oynat</button>
        <button type="button" data-a="next" aria-label="İleri" title="İleri (→)">İleri ▶</button>
        <label class="speed">Hız
          <select data-a="speed" aria-label="Animasyon hızı">
            <option value="0.5">0.5×</option><option value="1" selected>1×</option><option value="2">2×</option><option value="4">4×</option>
          </select></label>`;
      this.btn = {};
      $$('[data-a]', host).forEach((b) => { this.btn[b.dataset.a] = b; });
      this.btn.first.onclick = () => { this.stop(); this.first(); this.ui(); };
      this.btn.prev.onclick = () => this.stepBack();
      this.btn.next.onclick = () => this.stepFwd();
      this.btn.play.onclick = () => this.togglePlay();
      this.btn.speed.onchange = (e) => this.setSpeed(+e.target.value);
    }
    setSpeed(s) { this.speed = s; }
    play() { if (this.atEnd()) this.first(); this.playing = true; this.ui(); this.tick(); }
    tick() {
      if (!this.playing) return;
      if (this.atEnd()) { this.stop(); return; }
      const d = this.next();
      this.ui();
      this.timer = setTimeout(() => this.tick(), d + 650 / this.speed);
    }
    stop() { this.playing = false; clearTimeout(this.timer); this.ui(); }
    togglePlay() { this.playing ? this.stop() : this.play(); }
    stepFwd() { this.stop(); this.next(); this.ui(); }
    stepBack() { this.stop(); this.prev(); this.ui(); }
    ui() {
      if (!this.btn) return;
      this.btn.play.textContent = this.playing ? '⏸ Duraklat' : '▶ Oynat';
      this.btn.play.setAttribute('aria-label', this.playing ? 'Duraklat' : 'Oynat');
      this.btn.prev.disabled = this.atStart();
      this.btn.first.disabled = this.atStart();
      this.btn.next.disabled = this.atEnd();
    }
  }

  class Player extends Ctl {
    constructor(root, build, { controls = true, label = 'Geometrik yapı' } = {}) {
      super();
      this.root = root; this.build = build; this.i = 0;
      root.classList.add('player');
      root.innerHTML = `
        <div class="fig"><svg class="geo" role="img" aria-label="${label}"><g class="layer"></g></svg></div>
        <div class="pmeta"><span class="stepno"></span><span class="counters"></span></div>
        <p class="caption" aria-live="polite"></p>
        <div class="ctlhost"></div>`;
      this.svg = $('svg', root); this.layer = $('g.layer', root);
      this.capEl = $('.caption', root); this.stepEl = $('.stepno', root); this.cntEl = $('.counters', root);
      this.initCtl(controls ? $('.ctlhost', root) : null);
      if (!controls) $('.ctlhost', root).remove();
      this.load(build());
    }
    load(model) {
      this.model = model; this.steps = model.steps;
      const all = this.steps.flatMap((s) => s.items);
      let b = boundsOf(all, 0);
      const u0 = Math.max(b.x1 - b.x0, 1) / 500;
      b = boundsOf(all, u0);
      const pad = 0.05 * Math.max(b.x1 - b.x0, b.y1 - b.y0);
      this.vb = [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad];
      this.svg.setAttribute('viewBox', this.vb.map(n2).join(' '));
      this.u = this.vb[2] / 500;
      setScale(this.svg, this.u);
      this.show(0, false);
    }
    rebuild() { this.stop(); this.load(this.build()); }
    counts(upto = this.i) {
      let c = 0, l = 0;
      for (let s = 0; s <= upto; s++) this.steps[s].items.forEach((it) => { if (it.op === 'C') c++; else if (it.op === 'L') l++; });
      return { c, l };
    }
    totals() { return this.counts(this.steps.length - 1); }
    show(i, animate) {
      this.i = i;
      this.layer.textContent = '';
      const base = reduced() || !animate ? 0 : 620 / this.speed;
      let cursor = 0;
      for (let s = 0; s <= i; s++) {
        for (const it of this.steps[s].items) {
          const e = drawItem(it, this.u);
          if (s < i && (it.role === 'aux' || it.role === 'note')) e.classList.add('past');
          if (s === i && i > 0) e.classList.add('cur');
          this.layer.appendChild(e);
          if (s === i && base > 0) {
            if (it.t === 'pt' || it.t === 'text' || it.t === 'poly') { fadeIn(e, cursor, 260 / this.speed); cursor += 90 / this.speed; }
            else {
              const k = it.t === 'circle' ? 1.5 : it.t === 'arc' ? 0.75 : it.t === 'right' ? 0.35 : 0.9;
              drawStroke(e, cursor, base * k);
              cursor += base * k * 0.92;
            }
          }
        }
      }
      const n = this.steps.length - 1;
      this.stepEl.textContent = i === 0 ? `Başlangıç · ${n} adım` : `Adım ${i} / ${n}`;
      this.capEl.textContent = this.steps[i].cap;
      const { c, l } = this.counts(i);
      this.cntEl.innerHTML = `<span class="cnt" title="Pergel ile çizilen çember/yay sayısı"><b>${c}</b> pergel</span><span class="cnt" title="Cetvel ile çizilen doğru sayısı"><b>${l}</b> cetvel</span>`;
      this.ui();
      if (this.onShow) this.onShow(i);
      return cursor + (base ? 200 : 0);
    }
    next() { return this.i < this.steps.length - 1 ? this.show(this.i + 1, true) : 0; }
    prev() { if (this.i > 0) this.show(this.i - 1, false); }
    first() { this.show(0, false); }
    atEnd() { return this.i >= this.steps.length - 1; }
    atStart() { return this.i === 0; }
  }
  function drawStroke(e, delay, dur) {
    e.setAttribute('pathLength', '1');
    e.style.strokeDasharray = '1 2';
    e.style.strokeDashoffset = '1';
    getComputedStyle(e).strokeDashoffset; // stil hesaplamasını zorla
    e.style.transition = `stroke-dashoffset ${dur}ms ease-in-out ${delay}ms`;
    e.style.strokeDashoffset = '0';
    setTimeout(() => {
      e.removeAttribute('pathLength');
      e.style.strokeDasharray = ''; e.style.strokeDashoffset = ''; e.style.transition = '';
    }, delay + dur + 60);
  }
  function fadeIn(e, delay, dur) {
    e.style.opacity = '0';
    getComputedStyle(e).opacity;
    e.style.transition = `opacity ${dur}ms ease ${delay}ms`;
    e.style.opacity = '1';
    setTimeout(() => { e.style.transition = ''; e.style.opacity = ''; }, delay + dur + 60);
  }

  /* Ortak "verilen" parça: tüm oynatıcılarda A ve B aynı, koordinatlar parametreden türetilir. */
  const SEG_LEN = 400;
  const givenAB = () => [G.P(0, 0), G.P(SEG_LEN, 0)];

  /* ------------------------------------------------------------------ */
  /* 6. Düello                                                            */
  /* ------------------------------------------------------------------ */
  class Duel extends Ctl {
    constructor(root) {
      super();
      this.root = root;
      this.short = false;
      this.L = new Player($('#duel-left', root), () => buildTangent(...givenAB(), { short: this.short }), { controls: false, label: 'Teğet-dikme yöntemi' });
      this.R = new Player($('#duel-right', root), () => buildThales(...givenAB(), 3, { all: false }), { controls: false, label: 'Thales yöntemi' });
      this.initCtl($('#duel-controls', root));
      $('#duel-short', root).addEventListener('change', (e) => { this.short = e.target.checked; this.stop(); this.L.rebuild(); this.R.first(); this.summary(); this.ui(); });
      this.summary(); this.ui();
    }
    setSpeed(s) { this.speed = s; this.L.speed = s; this.R.speed = s; }
    next() { return Math.max(this.L.next(), this.R.next()); }
    prev() { this.L.prev(); this.R.prev(); }
    first() { this.L.first(); this.R.first(); }
    atEnd() { return this.L.atEnd() && this.R.atEnd(); }
    atStart() { return this.L.atStart() && this.R.atStart(); }
    summary() {
      const a = this.L.totals(), b = this.R.totals();
      const sa = this.L.steps.length - 1, sb = this.R.steps.length - 1;
      $('#duel-table tbody', this.root).innerHTML = `
        <tr><th scope="row">Pergel (çember/yay)</th><td>${a.c}</td><td>${b.c}</td></tr>
        <tr><th scope="row">Cetvel (doğru)</th><td>${a.l}</td><td>${b.l}</td></tr>
        <tr class="tot"><th scope="row">Toplam işlem</th><td>${a.c + a.l}</td><td>${b.c + b.l}</td></tr>
        <tr><th scope="row">Animasyon adımı</th><td>${sa}</td><td>${sb}</td></tr>
        <tr><th scope="row">Keyfi seçim gerekir mi?</th><td>Hayır</td><td>Evet (ışın yönü, adım boyu)</td></tr>`;
    }
  }

  /* ------------------------------------------------------------------ */
  /* 7. Kanıt şekli                                                       */
  /* ------------------------------------------------------------------ */
  function initProofs() {
    const svg = $('#proof-svg');
    const [A, B] = givenAB();
    const m = buildTangent(A, B).meta;
    const { D, E, F, r } = m;
    const { dn, lf, rt, up, mix } = dirs(A, B);
    const items = [
      poly([A, E, D], 'tri tri-AED'), poly([D, F, E], 'tri tri-DFE'), poly([A, F, E], 'tri tri-AFE'),
      seg(A, B, 'given'), { t: 'circle', c: D, r, role: 'build' },
      seg(A, E, 'tangent', { cls: 'hl-AE' }), seg(D, E, 'build', { cls: 'hl-DE' }), seg(E, F, 'build', { cls: 'hl-EF' }),
      seg(A, D, 'given', { cls: 'hl-AD' }), seg(D, F, 'given', { cls: 'hl-DF' }),
      right(E, A, D), right(F, B, E),
      pt(A, 'A', 'given', lf), pt(B, 'B', 'given', rt), pt(D, 'D', 'build', dn), pt(E, 'E', 'tangent', up), pt(F, 'F', 'result', mix(dn, lf, 0.9)),
      txt(G.add(G.mid(D, E), G.mul(G.unit(G.sub(G.mid(D, E), F)), 12)), 'r', 'build'),
    ];
    let b = boundsOf(items, 1.1); const pad = 18;
    svg.setAttribute('viewBox', [b.x0 - pad, b.y0 - pad, b.x1 - b.x0 + 2 * pad, b.y1 - b.y0 + 2 * pad].map(n2).join(' '));
    const u = (b.x1 - b.x0 + 2 * pad) / 500;
    setScale(svg, u);
    renderStatic(svg, items, u);
    const tabs = $$('#proof-tabs [role=tab]');
    const select = (t) => {
      tabs.forEach((x) => { const on = x === t; x.setAttribute('aria-selected', on); x.tabIndex = on ? 0 : -1; $('#' + x.getAttribute('aria-controls')).hidden = !on; });
      svg.dataset.hl = t.dataset.hl;
    };
    tabs.forEach((t, i) => {
      t.addEventListener('click', () => select(t));
      t.addEventListener('keydown', (e) => {
        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
          e.preventDefault(); e.stopPropagation();
          const n = tabs[(i + (e.key === 'ArrowRight' ? 1 : tabs.length - 1)) % tabs.length]; n.focus(); select(n);
        }
      });
    });
    select(tabs[0]);
  }

  /* ------------------------------------------------------------------ */
  /* 8. İnversiyon animasyonu                                             */
  /* ------------------------------------------------------------------ */
  function initInversion() {
    const svg = $('#inv-svg');
    const W = 640, H = 300; svg.setAttribute('viewBox', `0 0 ${W} ${H}`);
    const u = W / 500; setScale(svg, u);
    const D = G.P(0.74 * W, H / 2), r = 0.11 * W;
    const L = G.P(10, H / 2), R = G.P(W - 10, H / 2);
    const slider = $('#inv-x'), out = $('#inv-out'), btn = $('#inv-play');
    const xmin = 1.08, xmax = 6.2;
    let x = 3, t = 0, playing = !reduced(), raf = 0, last = 0;
    function draw() {
      const A = G.P(D.x - x * r, D.y);
      const T = G.tangentPoints(A, D, r);
      const E = G.pickSide(T, A, D, -1), E2 = G.pickSide(T, A, D, 1);
      const F = G.foot(E, A, D);
      const { dn, up, lf, mix } = dirs(A, D);
      renderStatic(svg, [
        seg(L, R, 'given'), { t: 'circle', c: D, r, role: 'build' },
        seg(A, G.add(E, G.mul(G.sub(E, A), 0.2)), 'tangent'), seg(A, G.add(E2, G.mul(G.sub(E2, A), 0.2)), 'tangent', { cls: 'faint' }),
        seg(D, E, 'note', { dash: true }), seg(E, E2, 'result'),
        right(F, D, E),
        pt(A, 'A', 'given', mix(up, lf, 0.4)), pt(D, 'D', 'build', mix(dn, G.mul(lf, -1), 0.4)), pt(E, 'E', 'tangent', up), pt(F, 'F', 'result', mix(dn, lf, 0.7)),
      ], u);
      const DA = x * r, DF = G.dist(D, F);
      out.innerHTML = `<span>DA = <b>${x.toFixed(2)} r</b></span><span>DF = <b>${(DF / r).toFixed(3)} r</b></span><span>DF · DA = <b>${(DF * DA / (r * r)).toFixed(6)} r²</b></span>`;
      slider.value = x.toFixed(3);
    }
    function frame(ts) {
      if (!playing) return;
      const dt = last ? Math.min(ts - last, 60) : 16; last = ts;
      t += dt / 2600;
      x = xmin + (xmax - xmin) * (0.5 - 0.5 * Math.cos(t));
      draw();
      raf = requestAnimationFrame(frame);
    }
    function setPlaying(p) {
      playing = p; btn.textContent = p ? '⏸ Duraklat' : '▶ Oynat';
      cancelAnimationFrame(raf); last = 0;
      if (p) { t = Math.acos(clamp(1 - 2 * (x - xmin) / (xmax - xmin), -1, 1)); raf = requestAnimationFrame(frame); }
    }
    slider.min = xmin; slider.max = xmax; slider.step = 0.01;
    slider.addEventListener('input', () => { setPlaying(false); x = +slider.value; draw(); });
    btn.addEventListener('click', () => setPlaying(!playing));
    // Görünür değilken animasyonu durdur
    new IntersectionObserver((es) => es.forEach((e) => { if (!e.isIntersecting && playing) { cancelAnimationFrame(raf); last = 0; } else if (e.isIntersecting && playing) raf = requestAnimationFrame(frame); })).observe(svg);
    draw(); setPlaying(playing);
  }

  /* ------------------------------------------------------------------ */
  /* 9. Tema, KaTeX, klavye, sunum modu                                  */
  /* ------------------------------------------------------------------ */
  function initTheme() {
    const btn = $('#theme-btn');
    const sysDark = window.matchMedia('(prefers-color-scheme: dark)');
    let saved = null;
    try { saved = localStorage.getItem('theme'); } catch (e) { /* yok say */ }
    const cur = () => document.documentElement.dataset.theme || (sysDark.matches ? 'dark' : 'light');
    const apply = (t) => { if (t) document.documentElement.dataset.theme = t; btn.setAttribute('aria-label', cur() === 'dark' ? 'Açık temaya geç' : 'Koyu temaya geç'); btn.textContent = cur() === 'dark' ? '☀' : '☾'; };
    apply(saved);
    btn.addEventListener('click', () => { const t = cur() === 'dark' ? 'light' : 'dark'; apply(t); try { localStorage.setItem('theme', t); } catch (e) { /* yok say */ } });
  }
  function initKatex() {
    $$('[data-tex]').forEach((e) => {
      const tex = e.dataset.tex;
      if (window.katex) {
        try { window.katex.render(tex, e, { displayMode: e.classList.contains('math-d'), throwOnError: false }); return; } catch (err) { /* düş */ }
      }
      e.textContent = tex.replace(/\\[a-z]+/gi, ' ').replace(/[{}]/g, '');
      e.classList.add('tex-fallback');
    });
  }
  /* Giriş videosu: siyah açılış/kapanış karelerini gösterme.
   * Video 0 s'de siyah başlıyor ve son ~0,5 s'de siyaha kararıyor (59,3 s).
   * Bu yüzden başlık karesinde (2,8 s) bekler, "Kaynak" kartında (58,8 s) durur. */
  function initVideo() {
    const v = $('figure.video video');
    if (!v) return;
    const POSTER = 2.8, END = 58.8;
    let started = false;
    const showPoster = () => { if (!started && v.currentTime < POSTER) v.currentTime = POSTER; };
    if (v.readyState >= 1) showPoster(); else v.addEventListener('loadedmetadata', showPoster, { once: true });
    v.addEventListener('play', () => {
      if (!started && v.currentTime <= POSTER + 0.05) v.currentTime = 0; // ilk oynatmada baştan başla
      if (v.currentTime >= END - 0.05) v.currentTime = 0; // sondaysa yeniden başlat
      started = true;
    });
    v.addEventListener('timeupdate', () => {
      if (v.currentTime >= END && !v.paused) { v.pause(); v.currentTime = END; }
    });
    v.addEventListener('ended', () => { v.currentTime = END; });
  }
  const isTyping = (t) => t && (t.tagName === 'INPUT' || t.tagName === 'SELECT' || t.tagName === 'TEXTAREA' || t.isContentEditable);
  function visibleCtl() {
    if (document.body.classList.contains('present')) {
      const s = $('section.slide.active');
      return controllers.find((c) => s && s.contains(c.root)) || null;
    }
    const vh = window.innerHeight;
    let best = null, bestV = 0;
    controllers.forEach((c) => {
      const r = c.root.getBoundingClientRect();
      const v = Math.max(0, Math.min(r.bottom, vh) - Math.max(r.top, 0));
      if (v > bestV) { bestV = v; best = c; }
    });
    if (lastActive) { const r = lastActive.root.getBoundingClientRect(); if (r.bottom > 0 && r.top < vh) return lastActive; }
    return bestV > 80 ? best : null;
  }
  // Sunum modu
  const slides = () => $$('main > section.slide');
  let slideIdx = 0;
  function showSlide(i) {
    const ss = slides();
    slideIdx = clamp(i, 0, ss.length - 1);
    ss.forEach((s, k) => s.classList.toggle('active', k === slideIdx));
    $('#present-ind').textContent = `${slideIdx + 1} / ${ss.length}`;
    window.scrollTo(0, 0);
  }
  function enterPresent() {
    document.body.classList.add('present');
    const ss = slides(); const vh = window.innerHeight;
    const i = ss.findIndex((s) => s.getBoundingClientRect().bottom > vh * 0.3);
    showSlide(i < 0 ? 0 : i);
    const de = document.documentElement;
    if (de.requestFullscreen) de.requestFullscreen().catch(() => { });
  }
  function exitPresent() {
    if (!document.body.classList.contains('present')) return;
    const s = slides()[slideIdx];
    document.body.classList.remove('present');
    slides().forEach((x) => x.classList.remove('active'));
    if (document.fullscreenElement) document.exitFullscreen().catch(() => { });
    if (s) s.scrollIntoView();
  }
  function initKeys() {
    $('#present-btn').addEventListener('click', enterPresent);
    $('#present-exit').addEventListener('click', exitPresent);
    $('#present-prev').addEventListener('click', () => showSlide(slideIdx - 1));
    $('#present-next').addEventListener('click', () => showSlide(slideIdx + 1));
    document.addEventListener('fullscreenchange', () => { if (!document.fullscreenElement) exitPresent(); });
    document.addEventListener('keydown', (e) => {
      if (isTyping(e.target) || e.altKey || e.ctrlKey || e.metaKey) return;
      const present = document.body.classList.contains('present');
      const c = visibleCtl();
      if (e.key === 'ArrowRight' && c) { e.preventDefault(); c.stepFwd(); }
      else if (e.key === 'ArrowLeft' && c) { e.preventDefault(); c.stepBack(); }
      else if (present && (e.key === ' ' || e.key === 'Enter') && !(e.target.tagName === 'BUTTON' && e.key === 'Enter')) {
        e.preventDefault();
        if (e.shiftKey) { if (c && !c.atStart()) c.stepBack(); else showSlide(slideIdx - 1); }
        else if (c && !c.atEnd()) c.stepFwd(); else showSlide(slideIdx + 1);
      }
      else if (present && e.key === 'PageDown') { e.preventDefault(); showSlide(slideIdx + 1); }
      else if (present && e.key === 'PageUp') { e.preventDefault(); showSlide(slideIdx - 1); }
      else if (present && e.key === 'Escape') exitPresent();
    });
  }

  /* ------------------------------------------------------------------ */
  /* 10. Self-test (konsolda: selfTest())                                 */
  /* ------------------------------------------------------------------ */
  function selfTest({ quiet = false } = {}) {
    const TOL = 1e-9;
    const rows = []; let pass = 0, fail = 0;
    const check = (test, got, exp) => {
      const err = Math.abs(got - exp);
      const ok = Number.isFinite(got) && err <= TOL * Math.max(1, Math.abs(exp));
      rows.push({ test, beklenen: exp, bulunan: got, hata: err, sonuç: ok ? '✓' : '✗' });
      ok ? pass++ : fail++;
    };
    let seed = 20261108;
    const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
    const randSeg = () => {
      const A = G.P(rnd() * 200 - 100, rnd() * 200 - 100);
      const L = 1 + rnd() * 99, th = rnd() * 2 * Math.PI;
      return [A, G.add(A, G.P(L * Math.cos(th), L * Math.sin(th)))];
    };
    const ratio = (A, B, F) => G.dist(A, F) / G.dist(F, B);
    // (1) Her d için AF/FB = d − 1  (r = AB/(d+1))
    [2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 15, 17, 20, 33, 65, 131].forEach((d) => {
      for (let k = 0; k < 3; k++) { const [A, B] = randSeg(); check(`d=${d} (rastgele #${k + 1})`, ratio(A, B, G.tangentDivide(A, B, d).F), d - 1); }
    });
    // (2) Genel formül AF/FB = (AB − 2r)/r, 0 < r < AB/2
    for (let k = 0; k < 8; k++) {
      const [A, B] = randSeg(); const AB = G.dist(A, B); const r = AB * (0.02 + 0.46 * rnd());
      const D = G.sub(B, G.mul(G.unit(G.sub(B, A)), r));
      check(`genel formül r=${(r / AB).toFixed(3)}·AB`, ratio(A, B, G.tangentFoot(A, B, D, r).F), (AB - 2 * r) / r);
    }
    // (3) Özyineleme d → 2d − 1 (BF çaplı çember)
    {
      const [A, B] = randSeg(); let d = 3; let F = G.tangentDivide(A, B, d).F;
      for (let k = 0; k < 4; k++) {
        const D = G.mid(B, F), r = G.dist(F, B) / 2; F = G.tangentFoot(A, B, D, r).F; d = 2 * d - 1;
        check(`özyineleme 2d−1 → d=${d}`, ratio(A, B, F), d - 1);
      }
    }
    // (4) Özyineleme d → d² + d − 1 (FD yarıçaplı, B'ye içten teğet çember)
    {
      const [A, B] = randSeg(); let d = 3; let st = G.tangentDivide(A, B, d);
      for (let k = 0; k < 2; k++) {
        const rho = G.dist(st.F, st.D); const D = G.sub(B, G.mul(G.unit(G.sub(B, A)), rho));
        st = G.tangentFoot(A, B, D, rho); d = d * d + d - 1;
        check(`özyineleme d²+d−1 → d=${d}`, ratio(A, B, st.F), d - 1);
      }
    }
    // (5) İnversiyon: DF · DA = r²
    for (let k = 0; k < 4; k++) {
      const [A, B] = randSeg(); const AB = G.dist(A, B); const r = AB * (0.05 + 0.4 * rnd());
      const D = G.sub(B, G.mul(G.unit(G.sub(B, A)), r)); const { F } = G.tangentFoot(A, B, D, r);
      check(`inversiyon DF·DA/r² #${k + 1}`, G.dist(D, F) * G.dist(D, A) / (r * r), 1);
    }
    // (6) Animasyonlu yapıların kendisi (adım adım pergel-cetvel hesabı)
    {
      const [A, B] = givenAB();
      check('animasyon: teğet-dikme (tam) AF/FB', ratio(A, B, buildTangent(A, B).meta.F), 2);
      check('animasyon: teğet-dikme (EE′ kısa) AF/FB', ratio(A, B, buildTangent(A, B, { short: true }).meta.F), 2);
      for (let k = 0; k < 3; k++) { const [a, b] = randSeg(); check(`animasyon: teğet-dikme rastgele #${k + 1}`, ratio(a, b, buildTangent(a, b).meta.F), 2); }
      [3, 7, 11].forEach((d) => {
        check(`animasyon: teğet-dikme d=${d} AF/FB`, ratio(A, B, buildTangent(A, B, { d }).meta.F), d - 1);
        check(`animasyon: teğet-dikme d=${d} (kısa) AF/FB`, ratio(A, B, buildTangent(A, B, { d, short: true }).meta.F), d - 1);
        const [a, b] = randSeg(); check(`animasyon: teğet-dikme d=${d} rastgele`, ratio(a, b, buildTangent(a, b, { d }).meta.F), d - 1);
      });
      [3, 4, 5, 9].forEach((d) => {
        const m = buildThales(A, B, d, { all: true });
        check(`animasyon: Thales d=${d} AF/FB`, ratio(A, B, m.meta.F), d - 1);
        for (let k = 1; k < d; k++) check(`animasyon: Thales d=${d} AF${k}/AB`, G.dist(A, m.meta.Fs[k]) / G.dist(A, B), k / d);
      });
    }
    if (!quiet || fail) {
      console.groupCollapsed(`%cselfTest: ${pass}/${pass + fail} test geçti (tolerans ${TOL})`, `color:${fail ? '#c0392b' : '#2f9a5b'};font-weight:bold`);
      console.table(rows);
      console.groupEnd();
    }
    return { pass, fail, total: pass + fail, rows };
  }
  window.selfTest = selfTest;
  window.__geo = { buildTangent, buildThales };

  /* ------------------------------------------------------------------ */
  /* Başlat                                                               */
  /* ------------------------------------------------------------------ */
  function init() {
    initTheme();
    initKatex();
    let tgD = 3;
    const tgP = new Player($('#tangent-player'), () => buildTangent(...givenAB(), { d: tgD }), { label: 'Teğet-dikme yapısı adım adım' });
    $$('#tangent-d input').forEach((inp) => inp.addEventListener('change', () => { tgD = +inp.value; tgP.rebuild(); }));
    let thD = 3;
    const thP = new Player($('#thales-player'), () => buildThales(...givenAB(), thD, { all: true }), { label: 'Thales yöntemi adım adım' });
    $$('#thales-d input').forEach((inp) => inp.addEventListener('change', () => { thD = +inp.value; thP.rebuild(); }));
    new Duel($('#duel'));
    initProofs();
    initInversion();
    initKeys();
    initVideo();
    const res = selfTest({ quiet: false });
    const badge = $('#selftest-badge');
    if (badge) { badge.textContent = `Self-test: ${res.pass}/${res.total} ✓`; badge.classList.toggle('bad', res.fail > 0); if (res.fail) badge.textContent = `Self-test: ${res.fail} hata!`; }
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init); else init();
})();
