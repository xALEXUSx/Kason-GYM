/* Графіки на SVG — без бібліотек, працюють без інтернету. */
var CHARTS = (function () {
  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"]/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]; }); }
  function fmt(x) { return String(Math.round(x * 10) / 10).replace('.', ','); }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function range(min, max) { if (min === max) { var d = Math.abs(min) * 0.1 || 1; return [min - d, max + d]; } var p = (max - min) * 0.1; return [min - p, max + p]; }

  /* series: [{pts:[{t,v,pr}], color, width, dots, dash, area}] */
  function line(series, o) {
    o = o || {};
    var W = 340, H = o.h || 180, L = 38, R = 10, T = 12, B = 24;
    var all = []; series.forEach(function (s) { all = all.concat(s.pts); });
    if (!all.length) return '<div class="empty">' + (o.empty || 'Ще немає даних') + '</div>';
    var t0 = Math.min.apply(null, all.map(function (p) { return p.t; })), t1 = Math.max.apply(null, all.map(function (p) { return p.t; }));
    if (t0 === t1) { t0 -= 864e5 * 3; t1 += 864e5 * 3; }
    var vr = range(Math.min.apply(null, all.map(function (p) { return p.v; })), Math.max.apply(null, all.map(function (p) { return p.v; })));
    var x = function (t) { return L + (t - t0) / (t1 - t0) * (W - L - R); }, y = function (v) { return T + (1 - (v - vr[0]) / (vr[1] - vr[0])) * (H - T - B); };
    var g = '';
    [0.15, 0.5, 0.85].forEach(function (f) { var v = vr[0] + (vr[1] - vr[0]) * f; g += '<line class="gl" x1="' + L + '" x2="' + (W - R) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '"/><text class="tl" x="' + (L - 5) + '" y="' + (y(v) + 3.5).toFixed(1) + '" text-anchor="end">' + fmt(v) + '</text>'; });
    var d0 = new Date(t0), d1 = new Date(t1), dm = new Date((t0 + t1) / 2);
    g += '<text class="tl" x="' + L + '" y="' + (H - 6) + '">' + pad(d0.getDate()) + '.' + pad(d0.getMonth() + 1) + '</text>';
    g += '<text class="tl" x="' + ((L + W - R) / 2) + '" y="' + (H - 6) + '" text-anchor="middle">' + pad(dm.getDate()) + '.' + pad(dm.getMonth() + 1) + '</text>';
    g += '<text class="tl" x="' + (W - R) + '" y="' + (H - 6) + '" text-anchor="end">' + pad(d1.getDate()) + '.' + pad(d1.getMonth() + 1) + '</text>';
    series.forEach(function (s, si) {
      if (!s.pts.length) return;
      var path = s.pts.map(function (p, i) { return (i ? 'L' : 'M') + x(p.t).toFixed(1) + ',' + y(p.v).toFixed(1); }).join(' ');
      if (s.area) {
        var id = 'ga' + si + Math.round(Math.random() * 1e6);
        g += '<defs><linearGradient id="' + id + '" x1="0" x2="0" y1="0" y2="1"><stop offset="0" style="stop-color:' + s.color + '" stop-opacity=".28"/><stop offset="1" style="stop-color:' + s.color + '" stop-opacity="0"/></linearGradient></defs>';
        g += '<path d="' + path + ' L' + x(s.pts[s.pts.length - 1].t).toFixed(1) + ',' + (H - B) + ' L' + x(s.pts[0].t).toFixed(1) + ',' + (H - B) + ' Z" fill="url(#' + id + ')"/>';
      }
      g += '<path d="' + path + '" fill="none" style="stroke:' + s.color + '" stroke-width="' + (s.width || 2.5) + '"' + (s.dash ? ' stroke-dasharray="4 4"' : '') + ' stroke-linejoin="round" stroke-linecap="round"/>';
      if (s.dots !== false) s.pts.forEach(function (p) {
        g += p.pr ? '<circle cx="' + x(p.t).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="6" style="fill:var(--card);stroke:var(--gold)" stroke-width="3"/>'
                  : '<circle cx="' + x(p.t).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '" r="3.2" style="fill:' + s.color + '"/>';
      });
    });
    return '<svg class="chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' + esc(o.label || 'графік') + '">' + g + '</svg>';
  }

  /* Горизонтальні смуги з цільовою зоною: rows [{label, v, color}] */
  function hbars(rows, o) {
    o = o || {};
    var lo = o.lo || 10, hi = o.hi || 20, mx = Math.max(hi + 4, Math.max.apply(null, rows.map(function (r) { return r.v; }).concat([0])) + 2);
    return '<div class="hb">' + rows.map(function (r) {
      var w = Math.min(100, r.v / mx * 100);
      return '<div class="hbr"><div class="hbl">' + esc(r.label) + '</div><div class="hbt"><div class="hbz" style="left:' + (lo / mx * 100) + '%;width:' + ((hi - lo) / mx * 100) + '%"></div>' +
        '<div class="hbf" style="width:' + w + '%;background:' + (r.v >= lo ? 'var(--ok)' : r.v > 0 ? 'var(--accent)' : 'transparent') + '"></div></div><div class="hbv">' + fmt(r.v) + '</div></div>';
    }).join('') + '</div><div class="legend"><span><i class="z"></i>' + esc(o.zoneLabel || 'орієнтир ' + lo + '–' + hi + ' підходів') + '</span></div>';
  }

  /* Кільце прогресу */
  function ring(val, max, label, sub) {
    var r = 30, c = 2 * Math.PI * r, f = Math.max(0, Math.min(1, max ? val / max : 0));
    return '<svg class="ring" viewBox="0 0 80 80" aria-label="' + esc(label) + '"><circle cx="40" cy="40" r="' + r + '" fill="none" style="stroke:var(--soft)" stroke-width="8"/>' +
      '<circle cx="40" cy="40" r="' + r + '" fill="none" style="stroke:' + (f >= 1 ? 'var(--ok)' : 'var(--accent)') + '" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + (c * f).toFixed(1) + ' ' + c.toFixed(1) + '" transform="rotate(-90 40 40)"/>' +
      '<text x="40" y="38" text-anchor="middle" class="rv">' + esc(label) + '</text><text x="40" y="53" text-anchor="middle" class="rs">' + esc(sub || '') + '</text></svg>';
  }

  /* Карта м'язів: v — підходи за період, mx — для «повної» заливки. */
  function bodyMap(v, mx) {
    mx = mx || 12;
    function c(k) { var x = v[k] || 0; if (!x) return 'var(--bm-0)'; var f = Math.min(1, x / mx); return 'var(--accent);fill-opacity:' + (0.3 + f * 0.7).toFixed(2); }
    function t(k) { return (v[k] ? fmt(v[k]) : '0'); }
    var base = 'style="fill:var(--bm-base)"';
    function sil(ox) {
      return '<g transform="translate(' + ox + ',0)">' +
        '<circle cx="60" cy="20" r="13" ' + base + '/><rect x="54" y="31" width="12" height="10" rx="4" ' + base + '/>' +
        '<path d="M34 46 Q60 38 86 46 L90 92 Q88 120 80 132 L40 132 Q32 120 30 92 Z" ' + base + '/>' +
        '<path d="M30 50 Q20 54 19 80 L16 128 Q15 140 22 142 Q28 141 28 128 L32 84 Z" ' + base + '/>' +
        '<path d="M90 50 Q100 54 101 80 L104 128 Q105 140 98 142 Q92 141 92 128 L88 84 Z" ' + base + '/>' +
        '<path d="M40 130 L58 130 L57 210 Q57 236 52 252 L44 252 Q41 236 41 210 Z" ' + base + '/>' +
        '<path d="M62 130 L80 130 L79 210 Q79 236 76 252 L68 252 Q63 236 63 210 Z" ' + base + '/></g>';
    }
    var front = sil(0) +
      '<g><title>Плечі ' + t('delts') + '</title><ellipse cx="34" cy="56" rx="9" ry="10" style="fill:' + c('delts') + '"/><ellipse cx="86" cy="56" rx="9" ry="10" style="fill:' + c('delts') + '"/></g>' +
      '<g><title>Груди ' + t('chest') + '</title><path d="M42 52 Q51 47 59 51 L59 74 Q50 78 42 72 Z" style="fill:' + c('chest') + '"/><path d="M78 52 Q69 47 61 51 L61 74 Q70 78 78 72 Z" style="fill:' + c('chest') + '"/></g>' +
      '<g><title>Біцепс ' + t('biceps') + '</title><ellipse cx="25" cy="82" rx="6" ry="13" style="fill:' + c('biceps') + '"/><ellipse cx="95" cy="82" rx="6" ry="13" style="fill:' + c('biceps') + '"/></g>' +
      '<g><title>Передпліччя ' + t('forearms') + '</title><ellipse cx="20" cy="114" rx="5" ry="13" style="fill:' + c('forearms') + '"/><ellipse cx="100" cy="114" rx="5" ry="13" style="fill:' + c('forearms') + '"/></g>' +
      '<g><title>Прес ' + t('abs') + '</title><rect x="51" y="78" width="18" height="44" rx="6" style="fill:' + c('abs') + '"/></g>' +
      '<g><title>Косі ' + t('obliques') + '</title><path d="M42 80 L49 82 L49 120 L41 116 Z" style="fill:' + c('obliques') + '"/><path d="M78 80 L71 82 L71 120 L79 116 Z" style="fill:' + c('obliques') + '"/></g>' +
      '<g><title>Квадрицепс ' + t('quads') + '</title><ellipse cx="49" cy="165" rx="8" ry="27" style="fill:' + c('quads') + '"/><ellipse cx="71" cy="165" rx="8" ry="27" style="fill:' + c('quads') + '"/></g>';
    var back = sil(130) + '<g transform="translate(130,0)">' +
      '<g><title>Трапеції ' + t('traps') + '</title><path d="M46 44 Q60 34 74 44 L68 58 L52 58 Z" style="fill:' + c('traps') + '"/></g>' +
      '<g><title>Задні дельти ' + t('reardelts') + '</title><ellipse cx="34" cy="56" rx="9" ry="10" style="fill:' + c('reardelts') + '"/><ellipse cx="86" cy="56" rx="9" ry="10" style="fill:' + c('reardelts') + '"/></g>' +
      '<g><title>Спина ' + t('lats') + '</title><path d="M42 60 L58 60 L58 98 Q48 96 44 86 Z" style="fill:' + c('lats') + '"/><path d="M78 60 L62 60 L62 98 Q72 96 76 86 Z" style="fill:' + c('lats') + '"/></g>' +
      '<g><title>Трицепс ' + t('triceps') + '</title><ellipse cx="25" cy="82" rx="6" ry="13" style="fill:' + c('triceps') + '"/><ellipse cx="95" cy="82" rx="6" ry="13" style="fill:' + c('triceps') + '"/></g>' +
      '<g><title>Поперек ' + t('lowback') + '</title><rect x="51" y="100" width="18" height="22" rx="5" style="fill:' + c('lowback') + '"/></g>' +
      '<g><title>Сідниці ' + t('glutes') + '</title><ellipse cx="50" cy="136" rx="10" ry="11" style="fill:' + c('glutes') + '"/><ellipse cx="70" cy="136" rx="10" ry="11" style="fill:' + c('glutes') + '"/></g>' +
      '<g><title>Задня поверхня стегна ' + t('hams') + '</title><ellipse cx="49" cy="176" rx="7.5" ry="24" style="fill:' + c('hams') + '"/><ellipse cx="71" cy="176" rx="7.5" ry="24" style="fill:' + c('hams') + '"/></g>' +
      '<g><title>Литки ' + t('calves') + '</title><ellipse cx="49" cy="222" rx="6" ry="16" style="fill:' + c('calves') + '"/><ellipse cx="71" cy="222" rx="6" ry="16" style="fill:' + c('calves') + '"/></g></g>';
    return '<svg class="bodymap" viewBox="0 0 250 260" role="img" aria-label="карта мʼязів">' + front + back +
      '<text x="60" y="258" text-anchor="middle" class="tl">спереду</text><text x="190" y="258" text-anchor="middle" class="tl">ззаду</text></svg>';
  }

  /* Календар місяця: marks {YYYY-MM-DD: 't'|'d'} */
  function month(ym, marks, todayStr) {
    var y = Number(ym.slice(0, 4)), m = Number(ym.slice(5, 7)) - 1;
    var first = new Date(y, m, 1), days = new Date(y, m + 1, 0).getDate(), lead = (first.getDay() + 6) % 7;
    var h = '<div class="cal">' + ['пн', 'вт', 'ср', 'чт', 'пт', 'сб', 'нд'].map(function (d) { return '<div class="ch">' + d + '</div>'; }).join('');
    for (var i = 0; i < lead; i++) h += '<div></div>';
    for (var d = 1; d <= days; d++) {
      var ds = y + '-' + pad(m + 1) + '-' + pad(d), k = marks[ds] || '';
      h += '<div class="cd ' + k + (ds === todayStr ? ' today' : '') + '">' + d + '</div>';
    }
    return h + '</div>';
  }
  return { line: line, hbars: hbars, ring: ring, bodyMap: bodyMap, month: month };
})();
if (typeof module !== 'undefined') module.exports = CHARTS;
