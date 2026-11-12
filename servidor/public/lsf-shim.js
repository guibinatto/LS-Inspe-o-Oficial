/* LS Fire — o Pricer rodando no servidor da empresa.
 * O Pricer foi feito para o banco do claude.ai (window.claude.use('db' | 'user' | 'downloads' | 'assets')).
 * Este arquivo oferece as mesmas funções, falando com o servidor LS Fire (/api/db, /api/me, /api/assets).
 * As permissões valem no servidor: aqui é só o transporte. Recursos que dependem do Claude (leitura de documentos
 * com IA, e-mail pelo Microsoft 365) não existem no servidor e respondem "indisponível" (null).
 */
(function () {
  'use strict';
  if (window.claude && window.claude.use) return;
  var H = { 'Content-Type': 'application/json', 'X-LSF': '1' };
  var meP = null, seq = 0, subs = [], timer = null, rodando = false;

  function sair() { location.replace('/login?volta=' + encodeURIComponent(location.pathname + location.search)); }
  function erroDe(r, j) { var e = new Error((j && j.error) || ('Erro ' + r.status)); e.code = r.status === 403 ? 'permission_denied' : r.status === 404 ? 'not_found' : r.status === 429 ? 'rate_limited' : r.status === 401 ? 'unauthenticated' : 'unavailable'; e.status = r.status; return e; }
  function chama(url, corpo, metodo) {
    return fetch(url, { method: metodo || (corpo === undefined ? 'GET' : 'POST'), credentials: 'same-origin', headers: H, body: corpo === undefined ? undefined : JSON.stringify(corpo) })
      .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (r.status === 401) { sair(); throw erroDe(r, j); } if (!r.ok) throw erroDe(r, j); return j; }); });
  }
  function me() { return meP || (meP = chama('/api/me')); }
  var clone = function (x) { return x == null ? x : JSON.parse(JSON.stringify(x)); };
  function snapDoc(path, r) { var d = r && r.exists ? r.data : null; return { id: path.split('/').pop(), ref: docRef(path), exists: !!(r && r.exists), data: function () { return clone(d); } }; }
  function snapCol(path, docs) {
    var lista = (docs || []).map(function (x) { return { id: x.id, exists: true, ref: docRef(path + '/' + x.id), data: function () { return clone(x.data); } }; });
    return { docs: lista, size: lista.length, empty: !lista.length, forEach: function (f) { lista.forEach(f); } };
  }

  // ---- inscrições (onSnapshot): busca na hora e de novo quando o servidor avisa que algo mudou ----
  function inscreve(s) {
    subs.push(s); roda(s);
    agenda(0);
    return function () { s.off = true; subs = subs.filter(function (x) { return x !== s; }); };
  }
  function roda(s) {
    var p = s.tipo === 'doc' ? chama('/api/db/get', { path: s.path }).then(function (r) { return [snapDoc(s.path, r), JSON.stringify(r)]; })
      : chama('/api/db/query', { path: s.path, where: s.q.where, orderBy: s.q.orderBy, limit: s.q.limit }).then(function (r) { return [snapCol(s.path, r.docs), JSON.stringify(r.docs)]; });
    return p.then(function (x) { if (s.off || x[1] === s.ultimo) return; s.ultimo = x[1]; try { s.cb(x[0]); } catch (e) { console.error(e); } })
      .catch(function (e) { if (!s.off && s.err) try { s.err(e); } catch (er) { /* */ } });
  }
  function confere() {
    if (rodando) return Promise.resolve(); rodando = true;
    return chama('/api/db/changes?since=' + seq).then(function (r) {
      var tudo = r.tudo, mud = r.paths || [], antes = seq; seq = r.seq;
      if (!antes && !tudo && !mud.length) return;
      var pais = {}; mud.forEach(function (p) { pais[p.split('/').slice(0, -1).join('/')] = 1; });
      return Promise.all(subs.filter(function (s) { return tudo || !antes || (s.tipo === 'doc' ? mud.indexOf(s.path) >= 0 : pais[s.path]); }).map(roda));
    }).catch(function () { /* sem rede: tenta de novo */ }).then(function () { rodando = false; });
  }
  function agenda(ms) { clearTimeout(timer); timer = setTimeout(function () { confere().then(function () { agenda(document.hidden ? 15000 : 3000); }); }, ms); }
  document.addEventListener('visibilitychange', function () { if (!document.hidden) agenda(0); });

  function docRef(path) {
    return {
      id: path.split('/').pop(), path: path,
      get: function () { return chama('/api/db/get', { path: path }).then(function (r) { return snapDoc(path, r); }); },
      set: function (d) { return chama('/api/db/set', { path: path, data: clone(d) }).then(function (r) { agenda(50); return r; }); },
      update: function (d) { return chama('/api/db/update', { path: path, data: clone(d) }).then(function (r) { agenda(50); return r; }); },
      delete: function () { return chama('/api/db/delete', { path: path }).then(function (r) { agenda(50); return r; }); },
      acquire: function (o) { o = o || {}; return chama('/api/db/acquire', { path: path, holder: o.holder, ttlMs: o.ttlMs }); },
      onSnapshot: function (cb, err) { return inscreve({ tipo: 'doc', path: path, cb: cb, err: err }); },
    };
  }
  function colRef(path, q) {
    q = q || { where: [], orderBy: [], limit: 0 };
    var nova = function (m) { var n = { where: q.where.slice(), orderBy: q.orderBy.slice(), limit: q.limit }; m(n); return colRef(path, n); };
    return {
      id: path.split('/').pop(), path: path,
      where: function (f, op, v) { return nova(function (n) { n.where.push([f, op, v]); }); },
      orderBy: function (f, dir) { return nova(function (n) { n.orderBy.push([f, dir === 'desc' ? 'desc' : 'asc']); }); },
      limit: function (k) { return nova(function (n) { n.limit = k; }); },
      doc: function (id) { return docRef(path + '/' + id); },
      get: function () { return chama('/api/db/query', { path: path, where: q.where, orderBy: q.orderBy, limit: q.limit }).then(function (r) { return snapCol(path, r.docs); }); },
      onSnapshot: function (cb, err) { return inscreve({ tipo: 'col', path: path, q: q, cb: cb, err: err }); },
    };
  }
  var db = { doc: docRef, collection: function (p) { return colRef(p); } };

  var user = {
    id: function () { return me().then(function (m) { return m.id; }); },
    isOwner: function () { return me().then(function (m) { return m.pricer === 'admin'; }); },
    canEdit: function () { return me().then(function (m) { return m.nivelPricer >= 3; }); },
    can: function (n) { return me().then(function (m) { return n === 'data.write' ? m.nivelPricer >= 2 : null; }); },
    me: function () { return me().then(function (m) { return { id: m.id, name: m.nome || m.login, email: m.email || '' }; }); },
    profiles: function (ids) { return chama('/api/pessoas', { ids: ids || [] }).then(function (r) { return r.pessoas || {}; }).catch(function () { return {}; }); },
    search: function (q) { return chama('/api/pessoas?q=' + encodeURIComponent(q || '')).then(function (r) { return r.pessoas || []; }).catch(function () { return []; }); },
  };

  var downloads = {
    save: function (o) {
      return new Promise(function (ok, falha) {
        try {
          var d = o.data, b = d instanceof Blob ? d : new Blob([d instanceof ArrayBuffer || ArrayBuffer.isView(d) ? d : String(d)], { type: o.mimeType || 'application/octet-stream' });
          var u = URL.createObjectURL(b), a = document.createElement('a'); a.href = u; a.download = o.filename || 'arquivo'; document.body.appendChild(a); a.click(); a.remove();
          setTimeout(function () { URL.revokeObjectURL(u); }, 30000); ok({ ok: true });
        } catch (e) { falha(e); }
      });
    },
  };

  var assets = {
    upload: function (blob, opt) {
      return fetch('/api/assets', { method: 'POST', credentials: 'same-origin', headers: { 'Content-Type': (opt && opt.contentType) || blob.type || 'application/octet-stream', 'X-LSF': '1', 'X-Filename': encodeURIComponent((blob && blob.name) || '') }, body: blob })
        .then(function (r) { return r.json().catch(function () { return {}; }).then(function (j) { if (!r.ok) throw erroDe(r, j); return j; }); });
    },
    list: function () { return chama('/api/assets'); },
    delete: function (id) { return chama('/api/assets/' + encodeURIComponent(id), {}, 'DELETE'); },
  };

  window.LSF = { servidor: true, me: me, sair: function () { return chama('/api/logout', {}).catch(function () {}).then(function () { location.replace('/login'); }); }, api: chama };
  window.claude = {
    use: function (nome) {
      return me().then(function (m) {
        if (nome === 'db') return m.nivelPricer >= 1 ? db : null;
        if (nome === 'user') return user;
        if (nome === 'downloads') return downloads;
        if (nome === 'assets') return m.nivelPricer >= 2 ? assets : null;
        return null; // sample (IA), mcp (e-mail), room, comments…: não existem no servidor
      }).catch(function () { return null; });
    },
  };
})();
