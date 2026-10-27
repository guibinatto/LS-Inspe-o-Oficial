/* LS Pricer — motor de fórmulas.
 * Interpreta as fórmulas da planilha original (mesma lógica, célula a célula),
 * com semântica de matriz dinâmica do Excel, avaliação preguiçosa e cache.
 */
(function (root) {
  'use strict';

  // ---------- valores ----------
  class XErr { constructor(code) { this.code = code; } toString() { return this.code; } }
  const E = {
    NA: new XErr('#N/A'), VALUE: new XErr('#VALUE!'), REF: new XErr('#REF!'),
    DIV0: new XErr('#DIV/0!'), NUM: new XErr('#NUM!'), NAME: new XErr('#NAME?'), CIRC: new XErr('#CIRC!'),
  };
  const isErr = (v) => v instanceof XErr;
  class Ref { constructor(sheet, r1, c1, r2, c2) { this.sheet = sheet; this.r1 = r1; this.c1 = c1; this.r2 = r2; this.c2 = c2; }
    get rows() { return this.r2 - this.r1 + 1; } get cols() { return this.c2 - this.c1 + 1; } }
  class Arr { constructor(rows) { this.v = rows; } get rows() { return this.v.length; } get cols() { return this.v[0].length; } }

  function colToNum(s) { let n = 0; for (const ch of s) n = n * 26 + (ch.charCodeAt(0) - 64); return n; }
  function numToCol(n) { let s = ''; while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = (n - m - 1) / 26; } return s; }
  function parseAddr(a) { const m = /^\$?([A-Z]{1,3})\$?(\d+)$/.exec(a); return m ? { r: +m[2], c: colToNum(m[1]) } : null; }
  function addr(r, c) { return numToCol(c) + r; }

  // ---------- tokenizador ----------
  function tokenize(src) {
    const t = []; let i = 0; const n = src.length;
    while (i < n) {
      const ch = src[i];
      if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') { i++; continue; }
      if (ch === '"') {
        let s = ''; i++;
        while (i < n) { if (src[i] === '"') { if (src[i + 1] === '"') { s += '"'; i += 2; continue; } i++; break; } s += src[i++]; }
        t.push({ t: 'str', v: s }); continue;
      }
      if (ch === "'") { // 'Nome da aba'!
        let s = ''; i++;
        while (i < n) { if (src[i] === "'") { if (src[i + 1] === "'") { s += "'"; i += 2; continue; } i++; break; } s += src[i++]; }
        if (src[i] !== '!') throw new Error('esperado ! após aba');
        i++; t.push({ t: 'sheet', v: s }); continue;
      }
      if (ch === '#') {
        const m = /^#(N\/A|VALUE!|REF!|DIV\/0!|NUM!|NAME\?|NULL!)/.exec(src.slice(i));
        if (m) { t.push({ t: 'err', v: m[0] }); i += m[0].length; continue; }
      }
      if (/[0-9.]/.test(ch)) {
        const m = /^(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?/.exec(src.slice(i));
        // pode ser linha em referência de linha (1:1) — não usado na planilha
        t.push({ t: 'num', v: parseFloat(m[0]) }); i += m[0].length; continue;
      }
      if (/[A-Za-z_$\\]/.test(ch)) {
        const m = /^[A-Za-z_$\\][A-Za-z0-9_.$\\À-ÿ]*/.exec(src.slice(i));
        let w = m[0]; i += w.length;
        if (src[i] === '!') { i++; t.push({ t: 'sheet', v: w }); continue; }
        if (src[i] === '(') { t.push({ t: 'func', v: w.toUpperCase().replace(/^_XLFN\./, '') }); continue; }
        if (/^\$?[A-Z]{1,3}\$?\d+$/.test(w)) { t.push({ t: 'ref', v: w.replace(/\$/g, '') }); continue; }
        const up = w.toUpperCase();
        if (up === 'TRUE' || up === 'FALSE') { t.push({ t: 'bool', v: up === 'TRUE' }); continue; }
        t.push({ t: 'name', v: up }); continue;
      }
      const two = src.substr(i, 2);
      if (two === '<>' || two === '<=' || two === '>=') { t.push({ t: 'op', v: two }); i += 2; continue; }
      if ('+-*/^&=<>%:(),{};'.includes(ch)) { t.push({ t: 'op', v: ch }); i++; continue; }
      throw new Error('caractere inesperado: ' + ch + ' em ' + src);
    }
    return t;
  }

  // ---------- parser (precedência do Excel) ----------
  function parse(src) {
    const toks = tokenize(src); let p = 0;
    const peek = () => toks[p]; const next = () => toks[p++];
    const isOp = (v) => toks[p] && toks[p].t === 'op' && toks[p].v === v;
    function expect(v) { if (!isOp(v)) throw new Error('esperado ' + v + ' em ' + src); p++; }
    function cmp() {
      let l = concat();
      while (peek() && peek().t === 'op' && ['=', '<>', '<', '>', '<=', '>='].includes(peek().v)) { const o = next().v; l = { k: 'bin', o, l, r: concat() }; }
      return l;
    }
    function concat() { let l = add(); while (isOp('&')) { p++; l = { k: 'bin', o: '&', l, r: add() }; } return l; }
    function add() { let l = mul(); while (isOp('+') || isOp('-')) { const o = next().v; l = { k: 'bin', o, l, r: mul() }; } return l; }
    function mul() { let l = pow(); while (isOp('*') || isOp('/')) { const o = next().v; l = { k: 'bin', o, l, r: pow() }; } return l; }
    function pow() { let l = pct(); while (isOp('^')) { p++; l = { k: 'bin', o: '^', l, r: pct() }; } return l; }
    function pct() { let x = unary(); while (isOp('%')) { p++; x = { k: 'pct', x }; } return x; }
    function unary() {
      if (isOp('-')) { p++; return { k: 'neg', x: unary() }; }
      if (isOp('+')) { p++; return unary(); }
      return range();
    }
    function range() { let l = primary(); while (isOp(':')) { p++; l = { k: 'range', l, r: primary() }; } return l; }
    function primary() {
      const tk = next();
      if (!tk) throw new Error('fim inesperado: ' + src);
      switch (tk.t) {
        case 'num': return { k: 'lit', v: tk.v };
        case 'str': return { k: 'lit', v: tk.v };
        case 'bool': return { k: 'lit', v: tk.v };
        case 'err': return { k: 'lit', v: new XErr(tk.v) };
        case 'ref': return { k: 'ref', a: tk.v, s: null };
        case 'name': return { k: 'name', n: tk.v };
        case 'sheet': {
          const r = next();
          if (r.t !== 'ref') throw new Error('ref esperada após aba em ' + src);
          let node = { k: 'ref', a: r.v, s: tk.v };
          if (isOp(':') && toks[p + 1] && toks[p + 1].t === 'ref') { p++; const r2 = next(); node = { k: 'area', a: r.v, b: r2.v, s: tk.v }; }
          return node;
        }
        case 'func': {
          expect('('); const args = [];
          if (!isOp(')')) {
            for (;;) {
              if (isOp(',')) { args.push({ k: 'missing' }); p++; continue; }
              if (isOp(')')) { args.push({ k: 'missing' }); break; }
              args.push(cmp());
              if (isOp(',')) { p++; if (isOp(')')) { args.push({ k: 'missing' }); break; } continue; }
              break;
            }
          }
          expect(')');
          return { k: 'fn', f: tk.v, args };
        }
        case 'op':
          if (tk.v === '(') { const e = cmp(); expect(')'); return e; }
          if (tk.v === '{') { // constante de matriz
            const rows = [[]];
            for (;;) {
              const neg = isOp('-') ? (p++, -1) : 1; const v = next();
              rows[rows.length - 1].push(v.t === 'num' ? neg * v.v : v.v);
              if (isOp(',')) { p++; continue; } if (isOp(';')) { p++; rows.push([]); continue; }
              expect('}'); break;
            }
            return { k: 'lit', v: new Arr(rows) };
          }
      }
      throw new Error('token inesperado ' + JSON.stringify(tk) + ' em ' + src);
    }
    const ast = cmp();
    if (p < toks.length) throw new Error('sobrou texto em ' + src);
    return ast;
  }

  // ---------- conversões ----------
  function numToStr(n) {
    if (Number.isInteger(n)) return String(n);
    let s = n.toPrecision(15);
    if (s.includes('e')) { const [m, e] = s.split('e'); return m.replace(/\.?0+$/, '') + 'E' + (e[0] === '-' ? e : '+' + e); }
    if (s.includes('.')) s = s.replace(/\.?0+$/, '');
    return s;
  }
  function toStr(v) {
    if (v === null || v === undefined) return '';
    if (typeof v === 'number') return numToStr(v);
    if (typeof v === 'boolean') return v ? 'TRUE' : 'FALSE';
    return String(v);
  }
  function strToNum(s) {
    const t = s.trim(); if (t === '') return null;
    if (/^[+-]?(\d+\.?\d*|\.\d+)([eE][+-]?\d+)?%?$/.test(t)) { const pc = t.endsWith('%'); const n = parseFloat(t); return pc ? n / 100 : n; }
    if (/^[+-]?\d+,\d+%?$/.test(t)) { const pc = t.endsWith('%'); const n = parseFloat(t.replace(',', '.')); return pc ? n / 100 : n; } // 7,5
    return null;
  }
  function toNum(v) {
    if (v === null || v === undefined || v === '') return v === '' ? E.VALUE : 0;
    if (typeof v === 'number') return v;
    if (typeof v === 'boolean') return v ? 1 : 0;
    if (isErr(v)) return v;
    const n = strToNum(v); return n === null ? E.VALUE : n;
  }
  function toBool(v) {
    if (v === null || v === undefined) return false;
    if (typeof v === 'boolean') return v; if (typeof v === 'number') return v !== 0;
    if (isErr(v)) return v;
    const u = String(v).toUpperCase(); if (u === 'TRUE') return true; if (u === 'FALSE') return false; return E.VALUE;
  }
  function typeRank(v) { return typeof v === 'number' ? 1 : typeof v === 'string' ? 2 : typeof v === 'boolean' ? 3 : 0; }
  function compare(a, b) { // retorna -1/0/1 ou erro
    if (isErr(a)) return a; if (isErr(b)) return b;
    if (a === null || a === undefined) a = typeof b === 'string' ? '' : typeof b === 'boolean' ? false : 0;
    if (b === null || b === undefined) b = typeof a === 'string' ? '' : typeof a === 'boolean' ? false : 0;
    const ta = typeRank(a), tb = typeRank(b);
    if (ta !== tb) return ta < tb ? -1 : 1;
    if (ta === 2) { const x = a.toLowerCase(), y = b.toLowerCase(); return x < y ? -1 : x > y ? 1 : 0; }
    if (ta === 3) { return a === b ? 0 : (a ? 1 : -1); }
    return a < b ? -1 : a > b ? 1 : 0;
  }
  function wildToRegex(pat, anchored = true) {
    let r = '';
    for (let i = 0; i < pat.length; i++) {
      const c = pat[i];
      if (c === '~' && i + 1 < pat.length) { r += pat[++i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); continue; }
      if (c === '*') r += '[\\s\\S]*'; else if (c === '?') r += '[\\s\\S]'; else r += c.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    }
    return new RegExp(anchored ? '^' + r + '$' : r, 'i');
  }
  const hasWild = (s) => /[*?~]/.test(s);

  function round(n, d) {
    const f = Math.pow(10, d);
    const x = Math.abs(n) * f;
    const r = Math.round(x + (x > 1e-9 ? x * 1e-15 : 0));
    return Math.sign(n) * r / f;
  }

  // TEXT(valor; formato) — cobre os formatos usados na planilha
  function textFmt(v, fmt) {
    const n = typeof v === 'number' ? v : toNum(v);
    if (isErr(n)) return typeof v === 'string' ? v : n;
    let f = fmt; let pct = false;
    if (f.endsWith('%')) { pct = true; f = f.slice(0, -1); }
    const x = pct ? n * 100 : n;
    const m = /^(#,##)?(0+)(?:\.(0+))?$/.exec(f);
    if (!m) return numToStr(n);
    const dec = m[3] ? m[3].length : 0;
    const neg = x < 0; let s = round(Math.abs(x), dec).toFixed(dec);
    let [ip, fp] = s.split('.');
    ip = ip.padStart(m[2].length, '0');
    if (m[1]) ip = ip.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
    if (m[1]) ip = ip.replace(/,/g, '.'); // separadores do Brasil: 1.234,56
    s = ip + (fp ? ',' + fp : '');
    if (neg && +s.replace(/[,.]/g, '') !== 0) s = '-' + s;
    return s + (pct ? '%' : '');
  }

  // ---------- pasta de trabalho ----------
  class Workbook {
    constructor(model) {
      this.sheets = new Map(); this.order = [];
      for (const s of model.sheets) {
        const cells = new Map();
        for (const [a, v] of Object.entries(s.cells)) cells.set(a, v);
        this.sheets.set(s.name.toUpperCase(), { name: s.name, cells, meta: s });
        this.order.push(s.name);
      }
      this.names = {}; this.nameAst = {};
      for (const [k, v] of Object.entries(model.names)) this.names[k] = v;
      this.astCache = new Map();
      this.cache = new Map(); this.inProgress = new Set();
      this.arrCache = new Map(); this.matchIdx = new Map();
      this.version = 0;
    }
    sheet(name) { return this.sheets.get(name.toUpperCase()); }
    raw(sheet, a) { const s = this.sheet(sheet); return s ? s.cells.get(a) : undefined; }
    isFormula(sheet, a) { const v = this.raw(sheet, a); return typeof v === 'string' && v[0] === '='; }
    setRaw(sheet, a, v) {
      const s = this.sheet(sheet);
      if (v === null || v === undefined || v === '') s.cells.delete(a); else s.cells.set(a, v);
      this.invalidate();
    }
    // aplica um conjunto de alterações {aba: {célula: valor|null}}
    applyDoc(doc) {
      for (const [sh, cells] of Object.entries(doc || {})) {
        const s = this.sheet(sh); if (!s) continue;
        for (const [a, v] of Object.entries(cells)) { if (v === null || v === undefined || v === '') s.cells.delete(a); else s.cells.set(a, v); }
      }
      this.invalidate();
    }
    invalidate() { this.cache.clear(); this.arrCache.clear(); this.matchIdx.clear(); this.version++; }

    ast(f) {
      let a = this.astCache.get(f);
      if (!a) { try { a = parse(f.slice(1)); } catch (e) { a = { k: 'lit', v: E.NAME, err: e.message }; } this.astCache.set(f, a); }
      return a;
    }
    // valor de uma célula (sheetName já canônico)
    get(sheetName, a) {
      const key = sheetName + '!' + a;
      if (this.cache.has(key)) return this.cache.get(key);
      const s = this.sheet(sheetName);
      if (!s) return E.REF;
      const raw = s.cells.get(a);
      if (!(typeof raw === 'string' && raw[0] === '=')) return raw === undefined ? null : raw;
      if (this.inProgress.has(key)) return E.CIRC;
      this.inProgress.add(key);
      let v;
      try {
        const pa = parseAddr(a);
        v = this.eval(this.ast(raw), { sheet: s.name, r: pa.r, c: pa.c });
        v = this.finalize(v, pa);
      } finally { this.inProgress.delete(key); }
      this.cache.set(key, v);
      return v;
    }
    value(sheetName, a) { const s = this.sheet(sheetName); return s ? this.get(s.name, a) : E.REF; }
    finalize(v, pa) {
      if (v instanceof Ref) {
        const z = (x) => (x === null || x === undefined ? 0 : x); // =A1 com A1 vazia dá 0
        if (v.rows === 1 && v.cols === 1) return z(this.get(v.sheet, addr(v.r1, v.c1)));
        if (v.cols === 1 && pa.r >= v.r1 && pa.r <= v.r2) return z(this.get(v.sheet, addr(pa.r, v.c1)));
        if (v.rows === 1 && pa.c >= v.c1 && pa.c <= v.c2) return z(this.get(v.sheet, addr(v.r1, pa.c)));
        v = this.toArr(v);
      }
      if (v instanceof Arr) v = v.v[0][0];
      if (v === undefined) v = null;
      return v;
    }
    toArr(ref) {
      if (!(ref instanceof Ref)) return ref;
      const key = ref.sheet + '!' + ref.r1 + ',' + ref.c1 + ',' + ref.r2 + ',' + ref.c2;
      let a = this.arrCache.get(key);
      if (a) return a;
      const rows = [];
      for (let r = ref.r1; r <= ref.r2; r++) { const row = []; for (let c = ref.c1; c <= ref.c2; c++) row.push(this.get(ref.sheet, addr(r, c))); rows.push(row); }
      a = new Arr(rows); this.arrCache.set(key, a);
      return a;
    }
    // desreferencia para escalar ou Arr
    deref(v, ctx) {
      if (v instanceof Ref) {
        if (v.rows === 1 && v.cols === 1) return this.get(v.sheet, addr(v.r1, v.c1));
        if (ctx && !ctx.arr) return this.intersect(v, ctx);
        return this.toArr(v);
      }
      return v;
    }
    // interseção implícita (fórmula comum, sem matriz): mesma linha/coluna da célula
    intersect(v, ctx) {
      if (v.cols === 1 && ctx.r >= v.r1 && ctx.r <= v.r2) return this.get(v.sheet, addr(ctx.r, v.c1));
      if (v.rows === 1 && ctx.c >= v.c1 && ctx.c <= v.c2) return this.get(v.sheet, addr(v.r1, ctx.c));
      return E.VALUE;
    }
    // parâmetro do tipo intervalo/matriz: nunca intersecta
    argArr(node, ctx) { if (!node || node.k === 'missing') return undefined; const v = this.eval(node, ctx); return v instanceof Ref ? (v.rows === 1 && v.cols === 1 ? this.get(v.sheet, addr(v.r1, v.c1)) : this.toArr(v)) : v; }
    resolveName(n, ctx) {
      const def = this.names[n];
      if (def === undefined) return E.NAME;
      if (!this.nameAst[n]) {
        let t = def.trim();
        if (t.startsWith('"')) this.nameAst[n] = { k: 'lit', v: t.slice(1, -1) };
        else { try { this.nameAst[n] = parse(t); } catch (e) { this.nameAst[n] = { k: 'lit', v: E.NAME }; } }
      }
      return this.eval(this.nameAst[n], ctx);
    }
    refOf(sheet, a, b) {
      const s = this.sheet(sheet); if (!s) return E.REF;
      const p1 = parseAddr(a), p2 = parseAddr(b || a);
      return new Ref(s.name, Math.min(p1.r, p2.r), Math.min(p1.c, p2.c), Math.max(p1.r, p2.r), Math.max(p1.c, p2.c));
    }
    eval(node, ctx) {
      switch (node.k) {
        case 'lit': return node.v;
        case 'missing': return undefined;
        case 'ref': return this.refOf(node.s || ctx.sheet, node.a);
        case 'area': return this.refOf(node.s || ctx.sheet, node.a, node.b);
        case 'name': return this.resolveName(node.n, ctx);
        case 'range': {
          const l = this.eval(node.l, ctx), r = this.eval(node.r, ctx);
          if (!(l instanceof Ref) || !(r instanceof Ref)) return E.REF;
          return new Ref(l.sheet, Math.min(l.r1, r.r1), Math.min(l.c1, r.c1), Math.max(l.r2, r.r2), Math.max(l.c2, r.c2));
        }
        case 'neg': return lift1(this.deref(this.eval(node.x, ctx), ctx), (x) => { const n = toNum(x); return isErr(n) ? n : -n; });
        case 'pct': return lift1(this.deref(this.eval(node.x, ctx), ctx), (x) => { const n = toNum(x); return isErr(n) ? n : n / 100; });
        case 'bin': return lift2(this.deref(this.eval(node.l, ctx), ctx), this.deref(this.eval(node.r, ctx), ctx), BIN[node.o]);
        case 'fn': {
          const f = FN[node.f];
          if (!f) return E.NAME;
          return f.call(this, node.args, ctx);
        }
      }
      return E.VALUE;
    }
    // avalia argumento já desreferenciado (escalar ou Arr)
    arg(node, ctx) { return node ? this.deref(this.eval(node, ctx), ctx) : undefined; }
    argRaw(node, ctx) { return node ? this.eval(node, ctx) : undefined; }
  }

  // ---------- operações elemento a elemento ----------
  function lift1(a, f) { return a instanceof Arr ? new Arr(a.v.map((r) => r.map(f))) : f(a); }
  function bget(a, i, j) { const r = a.rows === 1 ? 0 : i, c = a.cols === 1 ? 0 : j; return (a.v[r] && a.v[r][c] !== undefined) ? a.v[r][c] : E.NA; }
  function lift2(a, b, f) {
    const aa = a instanceof Arr, bb = b instanceof Arr;
    if (!aa && !bb) return f(a, b);
    const A = aa ? a : new Arr([[a]]), B = bb ? b : new Arr([[b]]);
    const R = Math.max(A.rows, B.rows), C = Math.max(A.cols, B.cols); const out = [];
    for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(f(bget(A, i, j), bget(B, i, j))); out.push(row); }
    return new Arr(out);
  }
  function liftN(args, f) { // args: valores (escalar ou Arr)
    let R = 1, C = 1, any = false;
    for (const a of args) if (a instanceof Arr) { any = true; R = Math.max(R, a.rows); C = Math.max(C, a.cols); }
    if (!any) return f(...args);
    const out = [];
    for (let i = 0; i < R; i++) { const row = []; for (let j = 0; j < C; j++) row.push(f(...args.map((a) => a instanceof Arr ? bget(a, i, j) : a))); out.push(row); }
    return new Arr(out);
  }
  const arith = (op) => (a, b) => { const x = toNum(a); if (isErr(x)) return x; const y = toNum(b); if (isErr(y)) return y; return op(x, y); };
  const BIN = {
    '+': arith((x, y) => x + y), '-': arith((x, y) => x - y), '*': arith((x, y) => x * y),
    '/': arith((x, y) => y === 0 ? E.DIV0 : x / y),
    '^': arith((x, y) => { const r = Math.pow(x, y); return Number.isFinite(r) ? r : E.NUM; }),
    '&': (a, b) => isErr(a) ? a : isErr(b) ? b : toStr(a) + toStr(b),
    '=': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c === 0; },
    '<>': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c !== 0; },
    '<': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c < 0; },
    '>': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c > 0; },
    '<=': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c <= 0; },
    '>=': (a, b) => { const c = compare(a, b); return isErr(c) ? c : c >= 0; },
  };
  function flat(v) { if (v instanceof Arr) { const o = []; for (const r of v.v) for (const x of r) o.push(x); return o; } return [v]; }

  // critério de COUNTIF/SUMIF
  function makeCrit(c) {
    if (typeof c === 'number' || typeof c === 'boolean') return (v) => typeof v === typeof c && v === c || (typeof v === 'string' && strToNum(v) === c && typeof c === 'number');
    if (c === null || c === undefined) return (v) => v === null || v === undefined || v === '';
    if (isErr(c)) return (v) => isErr(v) && v.code === c.code;
    const s = String(c);
    const m = /^(<>|<=|>=|=|<|>)?([\s\S]*)$/.exec(s); const op = m[1] || ''; const rhs = m[2];
    const rn = strToNum(rhs);
    if (op === '' || op === '=') {
      if (rhs === '') return op === '=' ? (v) => v === null || v === undefined || v === '' : (v) => v === null || v === undefined || v === '';
      if (rn !== null) return (v) => (typeof v === 'number' && v === rn) || (typeof v === 'string' && strToNum(v) === rn);
      const up = rhs.toUpperCase();
      if (up === 'TRUE' || up === 'FALSE') return (v) => typeof v === 'boolean' && v === (up === 'TRUE');
      if (hasWild(rhs)) { const re = wildToRegex(rhs); return (v) => typeof v === 'string' && re.test(v); }
      const low = rhs.toLowerCase(); return (v) => typeof v === 'string' && v.toLowerCase() === low;
    }
    if (op === '<>') {
      if (rhs === '') return (v) => !(v === null || v === undefined || v === '');
      if (rn !== null) return (v) => !(typeof v === 'number' && v === rn);
      if (hasWild(rhs)) { const re = wildToRegex(rhs); return (v) => !(typeof v === 'string' && re.test(v)); }
      const low = rhs.toLowerCase(); return (v) => !(typeof v === 'string' && v.toLowerCase() === low);
    }
    if (rn !== null) {
      const cmpf = { '<': (x) => x < rn, '>': (x) => x > rn, '<=': (x) => x <= rn, '>=': (x) => x >= rn }[op];
      return (v) => typeof v === 'number' && cmpf(v);
    }
    const low = rhs.toLowerCase();
    const cmps = { '<': (x) => x < low, '>': (x) => x > low, '<=': (x) => x <= low, '>=': (x) => x >= low }[op];
    return (v) => typeof v === 'string' && cmps(v.toLowerCase());
  }

  function scalar(fn) { // função escalar com "lift" automático em matrizes
    return function (args, ctx) {
      const vals = args.map((a) => a.k === 'missing' ? undefined : this.arg(a, ctx));
      return liftN(vals, (...xs) => { for (const x of xs) if (isErr(x)) return x; return fn(...xs); });
    };
  }
  function scalarE(fn) { // idem, mas a função trata erros
    return function (args, ctx) { const vals = args.map((a) => this.arg(a, ctx)); return liftN(vals, fn); };
  }
  const sval = (v) => (v === null || v === undefined) ? '' : toStr(v);

  const FN = {
    IF(args, ctx) {
      if (ctx.arr) ctx = { ...ctx, arr: false }; // IF não avalia em matriz sem Ctrl+Shift+Enter
      const c = this.arg(args[0], ctx);
      const pick = (b) => b ? (args[1] ? (args[1].k === 'missing' ? 0 : this.argRaw(args[1], ctx)) : true)
        : (args[2] ? (args[2].k === 'missing' ? 0 : this.argRaw(args[2], ctx)) : false);
      if (!(c instanceof Arr)) { const b = toBool(c); if (isErr(b)) return b; const r = pick(b); return r === undefined ? 0 : r; }
      const t = args[1] ? this.arg(args[1], ctx) : true; const f = args[2] ? this.arg(args[2], ctx) : false;
      return liftN([c, t, f], (cc, tt, ff) => { const b = toBool(cc); if (isErr(b)) return b; return b ? tt : ff; });
    },
    IFERROR(args, ctx) {
      const v = this.argRaw(args[0], ctx);
      const d = this.deref(v, ctx);
      if (d instanceof Arr) { const alt = this.arg(args[1], ctx); return liftN([d, alt], (x, y) => isErr(x) ? y : x); }
      if (isErr(d)) { const r = this.argRaw(args[1], ctx); return r === undefined ? 0 : r; }
      return v; // mantém Ref (útil em INDEX:INDEX)
    },
    ISERROR: scalarE((x) => isErr(x)),
    ISNUMBER: scalarE((x) => typeof x === 'number'),
    ISBLANK: scalarE((x) => x === null || x === undefined),
    ISTEXT: scalarE((x) => typeof x === 'string'),
    NOT: scalar((x) => { const b = toBool(x); return isErr(b) ? b : !b; }),
    TRUE: () => true, FALSE: () => false, NA: () => E.NA,
    AND(args, ctx) { let r = true, seen = false; for (const a of args) for (const x of flat(this.argArr(a, ctx))) { if (isErr(x)) return x; if (x === null || typeof x === 'string') continue; seen = true; if (!toBool(x)) r = false; } return seen ? r : E.VALUE; },
    OR(args, ctx) { let r = false, seen = false; for (const a of args) for (const x of flat(this.argArr(a, ctx))) { if (isErr(x)) return x; if (x === null || typeof x === 'string') continue; seen = true; if (toBool(x)) r = true; } return seen ? r : E.VALUE; },
    SUM(args, ctx) { let s = 0; for (const a of args) { const raw = this.argRaw(a, ctx); const v = this.deref(raw); for (const x of flat(v)) { if (isErr(x)) return x; if (typeof x === 'number') s += x; else if (!(raw instanceof Ref || v instanceof Arr) && x !== null) { const n = toNum(x); if (isErr(n)) return n; s += n; } } } return s; },
    MAX(args, ctx) { let m = -Infinity; for (const a of args) for (const x of flat(this.argArr(a, ctx))) { if (isErr(x)) return x; if (typeof x === 'number' && x > m) m = x; } return m === -Infinity ? 0 : m; },
    MIN(args, ctx) { let m = Infinity; for (const a of args) for (const x of flat(this.argArr(a, ctx))) { if (isErr(x)) return x; if (typeof x === 'number' && x < m) m = x; } return m === Infinity ? 0 : m; },
    N(args, ctx) { const v = this.arg(args[0], ctx); const x = v instanceof Arr ? v.v[0][0] : v; return typeof x === 'number' ? x : typeof x === 'boolean' ? (x ? 1 : 0) : isErr(x) ? x : 0; },
    ABS: scalar((x) => { const n = toNum(x); return isErr(n) ? n : Math.abs(n); }),
    COUNT(args, ctx) { let n = 0; for (const a of args) for (const x of flat(this.argArr(a, ctx))) if (typeof x === 'number') n++; return n; },
    COUNTA(args, ctx) { let n = 0; for (const a of args) for (const x of flat(this.argArr(a, ctx))) if (x !== null && x !== undefined) n++; return n; },
    COUNTBLANK(args, ctx) { let n = 0; for (const x of flat(this.argArr(args[0], ctx))) if (x === null || x === undefined || x === '') n++; return n; },
    SUMPRODUCT(args, ctx) {
      const arrs = args.map((a) => { const v = this.argArr(a, { ...ctx, arr: true }); return v instanceof Arr ? v : new Arr([[v]]); });
      const R = arrs[0].rows, C = arrs[0].cols; let s = 0;
      for (const a of arrs) if (a.rows !== R || a.cols !== C) return E.VALUE;
      for (let i = 0; i < R; i++) for (let j = 0; j < C; j++) {
        let p = 1; for (const a of arrs) { const x = a.v[i][j]; if (isErr(x)) return x; p *= typeof x === 'number' ? x : (typeof x === 'boolean' && arrs.length === 1 ? (x ? 1 : 0) : 0); }
        s += p;
      }
      return s;
    },
    COUNTIF(args, ctx) {
      const rng = this.argArr(args[0], ctx); const crit = this.arg(args[1], ctx);
      const items = flat(rng);
      return lift1(crit, (c) => { const f = makeCrit(c); let n = 0; for (const x of items) if (f(x)) n++; return n; });
    },
    COUNTIFS(args, ctx) {
      const pairs = [];
      for (let i = 0; i < args.length; i += 2) pairs.push([flat(this.argArr(args[i], ctx)), this.arg(args[i + 1], ctx)]);
      const crits = pairs.map((p) => p[1]);
      return liftN(crits, (...cs) => {
        const fs = cs.map(makeCrit); let n = 0; const len = pairs[0][0].length;
        for (let k = 0; k < len; k++) { let ok = true; for (let q = 0; q < fs.length; q++) if (!fs[q](pairs[q][0][k])) { ok = false; break; } if (ok) n++; }
        return n;
      });
    },
    SUMIF(args, ctx) {
      const rngRaw = this.argRaw(args[0], ctx); const rng = flat(this.deref(rngRaw));
      let sumv;
      if (args[2]) {
        const sr = this.argRaw(args[2], ctx);
        if (sr instanceof Ref && rngRaw instanceof Ref) sumv = flat(this.toArr(new Ref(sr.sheet, sr.r1, sr.c1, sr.r1 + rngRaw.rows - 1, sr.c1 + rngRaw.cols - 1)));
        else sumv = flat(this.deref(sr));
      } else sumv = rng;
      const crit = this.arg(args[1], ctx);
      return lift1(crit, (c) => { const f = makeCrit(c); let s = 0; for (let k = 0; k < rng.length; k++) if (f(rng[k]) && typeof sumv[k] === 'number') s += sumv[k]; return s; });
    },
    ROUND: scalar((x, d) => { const n = toNum(x); if (isErr(n)) return n; const dd = toNum(d === undefined ? 0 : d); return isErr(dd) ? dd : round(n, Math.trunc(dd)); }),
    ROUNDUP: scalar((x, d) => { const n = toNum(x), f = Math.pow(10, Math.trunc(toNum(d || 0))); return Math.sign(n) * Math.ceil(Math.abs(n) * f - 1e-9) / f; }),
    ROUNDDOWN: scalar((x, d) => { const n = toNum(x), f = Math.pow(10, Math.trunc(toNum(d || 0))); return Math.sign(n) * Math.floor(Math.abs(n) * f + 1e-9) / f; }),
    INT: scalar((x) => { const n = toNum(x); return isErr(n) ? n : Math.floor(n); }),
    MOD: scalar((a, b) => { const x = toNum(a), y = toNum(b); if (isErr(x)) return x; if (isErr(y)) return y; if (y === 0) return E.DIV0; return x - y * Math.floor(x / y); }),
    VALUE: scalar((x) => { if (typeof x === 'number') return x; if (x === null || x === undefined) return 0; const n = strToNum(String(x)); return n === null ? E.VALUE : n; }),
    TEXT: scalar((v, f) => textFmt(v === undefined || v === null ? 0 : v, sval(f))),
    LEN: scalar((x) => sval(x).length),
    LEFT: scalar((s, n) => { const k = n === undefined ? 1 : toNum(n); if (isErr(k)) return k; if (k < 0) return E.VALUE; return sval(s).slice(0, Math.trunc(k)); }),
    RIGHT: scalar((s, n) => { const k = n === undefined ? 1 : toNum(n); if (isErr(k)) return k; if (k < 0) return E.VALUE; const t = sval(s); return Math.trunc(k) === 0 ? '' : t.slice(-Math.trunc(k)); }),
    MID: scalar((s, st, n) => { const a = toNum(st), b = toNum(n); if (isErr(a)) return a; if (isErr(b)) return b; if (a < 1 || b < 0) return E.VALUE; return sval(s).substr(Math.trunc(a) - 1, Math.trunc(b)); }),
    UPPER: scalar((s) => sval(s).toUpperCase()),
    LOWER: scalar((s) => sval(s).toLowerCase()),
    TRIM: scalar((s) => sval(s).replace(/ +/g, ' ').replace(/^ | $/g, '')),
    REPT: scalar((s, n) => { const k = toNum(n); if (isErr(k)) return k; if (k < 0) return E.VALUE; return sval(s).repeat(Math.trunc(k)); }),
    CONCATENATE: scalar((...xs) => xs.map(sval).join('')),
    SUBSTITUTE: scalar((s, a, b, inst) => {
      const t = sval(s), f = sval(a), r = sval(b); if (f === '') return t;
      if (inst === undefined) return t.split(f).join(r);
      let k = Math.trunc(toNum(inst)), idx = -1, from = 0;
      while (k-- > 0) { idx = t.indexOf(f, from); if (idx < 0) return t; from = idx + 1; }
      return t.slice(0, idx) + r + t.slice(idx + f.length);
    }),
    SEARCH: scalar((f, s, st) => {
      const find = sval(f), within = sval(s); const start = st === undefined ? 1 : toNum(st);
      if (isErr(start)) return start; if (start < 1 || start > within.length + 1) return E.VALUE;
      if (find === '') return start;
      const sub = within.slice(start - 1);
      if (hasWild(find)) { const m = wildToRegex(find, false).exec(sub); return m ? m.index + start : E.VALUE; }
      const i = sub.toLowerCase().indexOf(find.toLowerCase()); return i < 0 ? E.VALUE : i + start;
    }),
    FIND: scalar((f, s, st) => {
      const find = sval(f), within = sval(s); const start = st === undefined ? 1 : toNum(st);
      if (start < 1 || start > within.length + 1) return E.VALUE;
      const i = within.indexOf(find, start - 1); return i < 0 ? E.VALUE : i + 1;
    }),
    ROW(args, ctx) {
      if (!args.length || args[0].k === 'missing') return ctx.r;
      const r = this.argRaw(args[0], ctx); if (!(r instanceof Ref)) return E.VALUE;
      if (r.rows === 1) return r.r1;
      const o = []; for (let i = r.r1; i <= r.r2; i++) o.push([i]); return new Arr(o);
    },
    COLUMN(args, ctx) {
      if (!args.length) return ctx.c;
      const r = this.argRaw(args[0], ctx); if (!(r instanceof Ref)) return E.VALUE; return r.c1;
    },
    CHOOSE(args, ctx) {
      const i = toNum(this.arg(args[0], ctx)); if (isErr(i)) return i;
      const k = Math.trunc(i); if (k < 1 || k >= args.length) return E.VALUE;
      return this.argRaw(args[k], ctx);
    },
    INDEX(args, ctx) {
      const src = this.argRaw(args[0], ctx);
      const rArg = args[1] && args[1].k !== 'missing' ? this.arg(args[1], ctx) : 0;
      const cArg = args[2] && args[2].k !== 'missing' ? this.arg(args[2], ctx) : 0;
      if (isErr(src)) return src;
      const one = (rr, cc) => {
        let r = toNum(rr), c = toNum(cc); if (isErr(r)) return r; if (isErr(c)) return c;
        r = Math.trunc(r); c = Math.trunc(c);
        if (src instanceof Ref) {
          if (src.rows === 1 && args.length === 2) { c = r; r = 1; }
          if (r < 0 || c < 0 || r > src.rows || c > src.cols) return E.REF;
          if (r === 0 && c === 0) return src;
          if (r === 0) return new Ref(src.sheet, src.r1, src.c1 + c - 1, src.r2, src.c1 + c - 1);
          if (c === 0) { if (src.cols === 1) c = 1; else return new Ref(src.sheet, src.r1 + r - 1, src.c1, src.r1 + r - 1, src.c2); }
          return new Ref(src.sheet, src.r1 + r - 1, src.c1 + c - 1, src.r1 + r - 1, src.c1 + c - 1);
        }
        const a = src instanceof Arr ? src : new Arr([[src]]);
        if (a.rows === 1 && args.length === 2) { c = r; r = 1; }
        if (r === 0) r = 1; if (c === 0) c = 1;
        if (r > a.rows || c > a.cols || r < 1 || c < 1) return E.REF;
        return a.v[r - 1][c - 1];
      };
      if (rArg instanceof Arr || cArg instanceof Arr) return liftN([rArg, cArg], (r, c) => this.deref(one(r, c)));
      return one(rArg, cArg);
    },
    MATCH(args, ctx) {
      const lv = this.arg(args[0], ctx);
      const raw = this.argRaw(args[1], ctx);
      const arr = this.deref(raw);
      const type = args[2] && args[2].k !== 'missing' ? toNum(this.arg(args[2], ctx)) : 1;
      const list = flat(arr);
      const key = raw instanceof Ref ? raw.sheet + '!' + raw.r1 + ',' + raw.c1 + ',' + raw.r2 + ',' + raw.c2 : null;
      const doOne = (v) => {
        if (isErr(v)) return v;
        if (v === null || v === undefined) v = typeof list[0] === 'string' ? '' : 0;
        if (type === 0) {
          if (typeof v === 'string' && hasWild(v)) { const re = wildToRegex(v); for (let i = 0; i < list.length; i++) if (typeof list[i] === 'string' && re.test(list[i])) return i + 1; return E.NA; }
          if (key) { // índice para buscas exatas repetidas
            let idx = this.matchIdx.get(key);
            if (!idx) { idx = new Map(); for (let i = list.length - 1; i >= 0; i--) { const x = list[i]; if (x === null || x === undefined || isErr(x)) continue; idx.set(typeof x === 'string' ? 's' + x.toLowerCase() : typeof x + x, i + 1); } this.matchIdx.set(key, idx); }
            const k = typeof v === 'string' ? 's' + v.toLowerCase() : typeof v + v; return idx.has(k) ? idx.get(k) : E.NA;
          }
          for (let i = 0; i < list.length; i++) { const c = compare(list[i], v); if (list[i] !== null && !isErr(c) && c === 0 && typeRank(list[i]) === typeRank(v)) return i + 1; }
          return E.NA;
        }
        // aproximada (binária como o Excel)
        let lo = 0, hi = list.length - 1, best = -1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1; let x = list[mid];
          if (x === null || x === undefined || isErr(x) || typeRank(x) !== typeRank(v)) { // procura vizinho válido
            let j = mid - 1; while (j >= lo && (list[j] === null || isErr(list[j]) || typeRank(list[j]) !== typeRank(v))) j--;
            if (j < lo) { lo = mid + 1; continue; } x = list[j];
            const c = compare(x, v); if (type >= 0 ? c <= 0 : c >= 0) { best = j; lo = mid + 1; } else hi = j - 1; continue;
          }
          const c = compare(x, v);
          if (type >= 0 ? c <= 0 : c >= 0) { best = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return best < 0 ? E.NA : best + 1;
      };
      return lift1(lv, doOne);
    },
    LOOKUP(args, ctx) {
      const actx = { ...ctx, arr: true }; const lv = this.arg(args[0], actx); const vec = flat(this.argArr(args[1], actx));
      const res = args[2] ? flat(this.argArr(args[2], actx)) : vec;
      return lift1(lv, (v) => {
        let best = -1;
        for (let i = 0; i < vec.length; i++) { const x = vec[i]; if (x === null || isErr(x) || typeRank(x) !== typeRank(v)) continue; if (compare(x, v) <= 0) best = i; }
        return best < 0 ? E.NA : (res[best] === undefined ? E.NA : res[best]);
      });
    },
    VLOOKUP(args, ctx) {
      const lv = this.arg(args[0], ctx); const tb = this.argArr(args[1], ctx); const ci = toNum(this.arg(args[2], ctx));
      const exact = args[3] ? !toBool(this.arg(args[3], ctx)) : false;
      const t = tb instanceof Arr ? tb : new Arr([[tb]]);
      for (let i = 0; i < t.rows; i++) if (compare(t.v[i][0], lv) === 0) return t.v[i][ci - 1];
      if (exact) return E.NA;
      return E.NA;
    },
    INDIRECT(args, ctx) {
      const s = sval(this.arg(args[0], ctx)).trim();
      const m = /^(?:'((?:[^']|'')+)'|([^!]+))?!?\$?([A-Z]{1,3}\$?\d+)(?::\$?([A-Z]{1,3}\$?\d+))?$/i.exec(s.includes('!') ? s : '!' + s);
      if (!m) { if (this.names[s.toUpperCase()]) return this.resolveName(s.toUpperCase(), ctx); return E.REF; }
      const sheet = m[1] ? m[1].replace(/''/g, "'") : (m[2] || ctx.sheet);
      if (!this.sheet(sheet)) return E.REF;
      return this.refOf(sheet, m[3].replace(/\$/g, '').toUpperCase(), m[4] ? m[4].replace(/\$/g, '').toUpperCase() : null);
    },
    OFFSET(args, ctx) {
      const base = this.argRaw(args[0], ctx); if (!(base instanceof Ref)) return E.VALUE;
      const dr = Math.trunc(toNum(this.arg(args[1], ctx))), dc = Math.trunc(toNum(this.arg(args[2], ctx)));
      const h = args[3] && args[3].k !== 'missing' ? Math.trunc(toNum(this.arg(args[3], ctx))) : base.rows;
      const w = args[4] && args[4].k !== 'missing' ? Math.trunc(toNum(this.arg(args[4], ctx))) : base.cols;
      if ([dr, dc, h, w].some((x) => Number.isNaN(x)) || h < 1 || w < 1) return E.REF;
      const r1 = base.r1 + dr, c1 = base.c1 + dc; if (r1 < 1 || c1 < 1) return E.REF;
      return new Ref(base.sheet, r1, c1, r1 + h - 1, c1 + w - 1);
    },
  };

  // lista de uma validação de dados (fórmula ou lista literal)
  Workbook.prototype.listValues = function (sheet, formula, r, c) {
    const f = formula.trim();
    if (f.startsWith('"')) return f.slice(1, -1).split(',');
    let v;
    try { v = this.eval(parse(f), { sheet, r, c }); } catch (e) { return []; }
    if (typeof v === 'string' && v.includes(',') && this.names[f.toUpperCase()]) return v.split(',');
    const d = this.deref(v);
    return flat(d).filter((x) => x !== null && x !== undefined && x !== '' && !isErr(x)).map((x) => x);
  };

  root.PricerEngine = { Workbook, parse, tokenize, XErr, isErr, Ref, Arr, addr, parseAddr, colToNum, numToCol, E, numToStr };
})(typeof window !== 'undefined' ? window : globalThis);
