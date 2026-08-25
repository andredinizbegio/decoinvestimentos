/* ============================================================
 * site-app.js — Deco Investimentos · Área do Cliente
 *
 * Renderiza as carteiras exportadas pelo DecoAI dentro do site,
 * no mesmo padrão visual do site (glass cards, cores deco,
 * partículas de fundo). Nenhuma chamada externa: os dados são
 * embutidos no HTML pelo build (window.DECO_SITE_DATA).
 *
 * Autenticação 100% local e ZERO-KNOWLEDGE: os dados de cada
 * cliente estão CRIPTOGRAFADOS (AES-256-GCM) com uma chave derivada
 * da senha (PBKDF2-SHA256). O site nunca armazena senha nem dados em
 * texto puro; a senha digitada vira a chave de descriptografia.
 * Requer HTTPS (GitHub Pages provê). Nenhum dado sai do navegador.
 * ============================================================ */
(function () {
  'use strict';

  var DATA = window.DECO_SITE_DATA || { clients: [], projections: {} };
  var CLIENTS = DATA.clients || [];
  var PROJECTIONS = DATA.projections || {};

  var currentClient = null;

  /* ----------------------------------------------------------
   * Descriptografia zero-knowledge (PBKDF2-SHA256 + AES-256-GCM)
   *
   * A senha digitada vira a chave de descriptografia no navegador
   * via Web Crypto (crypto.subtle). Nenhuma chave está embutida no
   * site. Exige contexto seguro (HTTPS) — o domínio custom do
   * GitHub Pages provê.
   * ---------------------------------------------------------- */
  function toBytes(str) {
    var bytes = [];
    for (var i = 0; i < str.length; i++) {
      var code = str.charCodeAt(i);
      if (code < 0x80) {
        bytes.push(code);
      } else if (code < 0x800) {
        bytes.push(0xc0 | (code >> 6), 0x80 | (code & 63));
      } else {
        bytes.push(
          0xe0 | (code >> 12),
          0x80 | ((code >> 6) & 63),
          0x80 | (code & 63)
        );
      }
    }
    return new Uint8Array(bytes);
  }

  function b64ToBytes(b64) {
    var binary = atob(b64);
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function concatBytes(a, b) {
    var out = new Uint8Array(a.length + b.length);
    out.set(a, 0);
    out.set(b, a.length);
    return out;
  }

  function supportsSubtle() {
    return !!(window.crypto && window.crypto.subtle);
  }

  function deriveAesKey(password, saltB64, iterations) {
    return window.crypto.subtle
      .importKey('raw', toBytes(String(password || '')), 'PBKDF2', false, ['deriveBits'])
      .then(function (keyMaterial) {
        return window.crypto.subtle.deriveBits(
          { name: 'PBKDF2', hash: 'SHA-256', salt: b64ToBytes(saltB64), iterations: iterations },
          keyMaterial,
          256
        );
      })
      .then(function (bits) {
        return window.crypto.subtle.importKey('raw', bits, { name: 'AES-GCM' }, false, ['decrypt']);
      });
  }

  function decryptClient(record, password) {
    return deriveAesKey(password, record.salt, record.iterations).then(function (key) {
      var iv = b64ToBytes(record.iv);
      var tag = b64ToBytes(record.tag);
      var ciphertext = b64ToBytes(record.ciphertext);
      return window.crypto.subtle
        .decrypt(
          { name: 'AES-GCM', iv: iv, tagLength: 128 },
          key,
          concatBytes(ciphertext, tag)
        )
        .then(function (buffer) {
          return JSON.parse(new TextDecoder().decode(buffer));
        });
    });
  }

  /* ----------------------------------------------------------
   * Formatação pt-BR (mesma lógica do app)
   * ---------------------------------------------------------- */
  var brl = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  var brl0 = new Intl.NumberFormat('pt-BR', {
    style: 'currency',
    currency: 'BRL',
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  });
  var num2 = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
  var num1 = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
  });
  var num0 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 0 });
  var num4 = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });
  var sign1 = new Intl.NumberFormat('pt-BR', {
    minimumFractionDigits: 1,
    maximumFractionDigits: 1,
    signDisplay: 'always',
  });

  function isNumeric(v) {
    return v !== null && v !== undefined && !Number.isNaN(v);
  }
  function fmtCurrency(v) {
    return isNumeric(v) ? brl.format(v) : '—';
  }
  function fmtCurrency0(v) {
    return isNumeric(v) ? brl0.format(v) : '—';
  }
  function fmtPct(v, decimals) {
    if (!isNumeric(v)) return '—';
    var f = decimals === 1 ? num1 : num2;
    return f.format(v * 100) + '%';
  }
  function fmtPctSigned(v) {
    if (!isNumeric(v)) return '—';
    return sign1.format(v * 100) + '%';
  }
  function fmtQty(v) {
    return isNumeric(v) ? num4.format(v) : '—';
  }
  function fmtCompact(v) {
    if (!isNumeric(v)) return 'R$ 0';
    var abs = Math.abs(v);
    if (abs >= 1000000) return 'R$ ' + num0.format(v / 1000000) + 'MM';
    if (abs >= 1000) return 'R$ ' + num0.format(v / 1000) + 'k';
    return 'R$ ' + num0.format(v);
  }
  function fmtPlainNumber(v) {
    return isNumeric(v) ? num0.format(v) : '—';
  }

  var MONTHS_SHORT = ['Jan','Fev','Mar','Abr','Mai','Jun','Jul','Ago','Set','Out','Nov','Dez'];
  var MONTHS_FULL = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];

  function escapeHtml(text) {
    return String(text == null ? '' : text)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function $q(selector, root) {
    return (root || document).querySelector(selector);
  }
  function $qAll(selector, root) {
    return Array.prototype.slice.call((root || document).querySelectorAll(selector));
  }

  function formatDate(iso) {
    if (!iso) return '—';
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return m[3] + '/' + m[2] + '/' + m[1];
  }

  function card(title, subtitle, bodyHtml, extraClass) {
    return (
      '<div class="glass-card border rounded-3xl p-6 sm:p-8 min-w-0 ' + (extraClass || '') + '">' +
        '<h3 class="text-lg font-bold dark:text-white text-slate-600 mb-1">' + title + '</h3>' +
        (subtitle ? '<p class="text-[11px] dark:text-slate-400 text-slate-500 mb-6">' + subtitle + '</p>' : '') +
        bodyHtml +
      '</div>'
    );
  }

  function moneyInline(v, className) {
    return '<div class="text-sm sm:text-base font-extrabold ' + (className || 'text-[#72becf]') + ' mt-2">' + fmtCurrency(v) + '</div>';
  }

  /* ----------------------------------------------------------
   * Cabeçalho da carteira
   * ---------------------------------------------------------- */
  function renderHeader(client) {
    var updated = DATA.exportedAt ? formatDate(DATA.exportedAt) : '';
    return (
      '<div class="mb-8">' +
        '<div class="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">' +
          '<div>' +
            '<span class="text-xs font-bold uppercase tracking-widest text-[#00598a] dark:text-[#72becf] block mb-2 font-mono">ÁREA DO CLIENTE</span>' +
            '<h2 class="text-2xl sm:text-3xl font-extrabold tracking-tight dark:text-white text-slate-600 leading-tight">Carteira de ' + escapeHtml(client.name) + '</h2>' +
            '<p class="text-[11px] dark:text-slate-400 text-slate-500 mt-1">ID ' + escapeHtml(client.id) + ' · Atualizada em ' + escapeHtml(updated) + '</p>' +
          '</div>' +
          '<div class="flex items-center gap-3">' +
            '<button id="portfolio-refresh" type="button" class="px-4 py-2 rounded-full hero-ultra-glass dark:text-white text-slate-700 font-semibold text-xs border dark:border-[#387b8d]/25 border-slate-200 hover:bg-white/40 dark:hover:bg-white/10 transition-all hidden">Atualizar dados</button>' +
            '<button id="logout-btn" type="button" class="px-4 py-2 rounded-full hero-ultra-glass dark:text-white text-slate-700 font-semibold text-xs border dark:border-[#387b8d]/25 border-slate-200 hover:bg-white/40 dark:hover:bg-white/10 transition-all flex items-center gap-1.5">' +
              '<i data-lucide="log-out" class="w-3.5 h-3.5"></i> Sair' +
            '</button>' +
          '</div>' +
        '</div>' +
      '</div>'
    );
  }

  /* ----------------------------------------------------------
   * Informações do Cliente
   * ---------------------------------------------------------- */
  function renderClientInfo(client) {
    var info = client.info || {};
    var cols = [
      ['Início da Carteira', info.inicio],
      ['Último HWM', info.ultimoHwm],
      ['Aporte Mensal', fmtCurrency(parseFloat(info.aporteMensal))],
      ['Reserva de Emergência', fmtCurrency(parseFloat(info.reservaEmergencia))],
      ['Comentários', info.comentarios],
    ];
    var head = cols.map(function (c) {
      return '<th class="px-3 py-2 font-medium whitespace-nowrap text-left text-[10px] uppercase tracking-wider dark:text-slate-400 text-slate-500">' + escapeHtml(c[0]) + '</th>';
    }).join('');
    var body = cols.map(function (c) {
      var isComment = c[0] === 'Comentários';
      return '<td class="' + (isComment ? 'w-[50%] min-w-[360px] px-3 py-2 dark:text-slate-200 text-slate-700 text-xs leading-relaxed' : 'px-3 py-2 whitespace-nowrap dark:text-slate-200 text-slate-700 text-xs') + '">' + escapeHtml(c[1] || '—') + '</td>';
    }).join('');
    var html =
      '<div class="overflow-x-auto">' +
        '<table class="w-full">' +
          '<thead><tr class="border-b dark:border-slate-800/60 border-slate-200">' + head + '</tr></thead>' +
          '<tbody><tr class="border-b dark:border-slate-800/60 border-slate-200">' + body + '</tr></tbody>' +
        '</table>' +
      '</div>';
    return card('Informações do Cliente', 'Dados cadastrais da carteira', html);
  }

  /* ----------------------------------------------------------
   * Médias mensais de proventos (últimos 12M real / próximos 12M estimado)
   * ---------------------------------------------------------- */
  function monthlyAverages(client) {
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();

    var receivedByMonth = new Map();
    for (var i = 0; i < client.dividends.length; i++) {
      var row = client.dividends[i];
      var key = (row.paymentDate || '').slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      receivedByMonth.set(key, (receivedByMonth.get(key) || 0) + (isNumeric(row.receivedValue) ? row.receivedValue : 0));
    }
    var sumLast12 = 0;
    for (var offset = -12; offset < 0; offset++) {
      var d = new Date(currentYear, currentMonth + offset, 1);
      var k = d.getFullYear() + '-' + ('0' + (d.getMonth() + 1)).slice(-2);
      sumLast12 += receivedByMonth.get(k) || 0;
    }

    var monthByKey = new Map();
    MONTHS_FULL.forEach(function (name, index) {
      monthByKey.set(normalizeMonthName(name), index);
    });
    var estimatesByMonth = new Array(12).fill(0);
    for (var j = 0; j < client.position.length; j++) {
      var p = client.position[j];
      var symbol = (p.symbol || '').trim();
      var quantity = p.quantity;
      if (!symbol || !isNumeric(quantity)) continue;
      var valuation = PROJECTIONS[symbol] || {};
      var perShare = valuation.dividendPerShare;
      if (!isNumeric(perShare)) continue;
      var months = valuation.months || [];
      var percents = valuation.percents || [];
      for (var x = 0; x < months.length; x++) {
        var percent = percents[x];
        if (!isNumeric(percent)) continue;
        var monthIndex = monthByKey.get(normalizeMonthName(months[x]));
        if (monthIndex === undefined) continue;
        estimatesByMonth[monthIndex] += percent * perShare * quantity;
      }
    }
    var sumNext12 = 0;
    for (var m = 0; m < 12; m++) sumNext12 += estimatesByMonth[m];
    return { avgReal: sumLast12 / 12, avgEstimated: sumNext12 / 12 };
  }

  /* ----------------------------------------------------------
   * Cards de resumo (resumo.json)
   * ---------------------------------------------------------- */
  function renderResume(client) {
    var r = client.resume || {};
    var fields = [
      { label: 'PATRIMÔNIO (NAV)', icon: 'target', value: fmtCurrency(r.nav) },
      { label: 'INVESTIDO', icon: 'layers', value: fmtCurrency(r.investedAmount) },
      { label: 'RESULTADO', icon: 'trending-up', value: fmtCurrency(r.pnl) },
      { label: 'TWR TOTAL', icon: 'award', value: fmtPct(r.twrTotal) },
      { label: 'IRR', icon: 'percent', value: fmtPct(r.irr) },
      { label: 'PROVENTOS TOTAIS', icon: 'wallet', value: fmtCurrency(r.earningsTotal) },
    ].filter(function (f) {
      return f.value !== '—';
    });

    var avgs = monthlyAverages(client);
    var html = fields.map(function (f) {
      if (f.label === 'PROVENTOS TOTAIS') {
        return (
          '<div class="glass-card border rounded-2xl p-4 flex flex-col justify-between min-w-0 md:col-span-2">' +
            '<div class="flex items-center justify-between gap-2 text-[10px] text-slate-400 uppercase tracking-wider">' +
              '<span class="flex items-center gap-2"><i data-lucide="' + f.icon + '" class="w-3.5 h-3.5 text-[#72becf] shrink-0"></i><span class="truncate">' + f.label + '</span></span>' +
              '<span class="text-sm font-extrabold text-[#72becf] tabular-nums whitespace-nowrap">' + f.value + '</span>' +
            '</div>' +
            '<div class="mt-2 flex flex-col gap-1.5 border-t border-slate-200 dark:border-slate-800/60 pt-2">' +
              '<div class="flex items-center justify-between gap-3"><span class="text-[10px] text-slate-400 whitespace-nowrap">Média Últimos 12M (Real)</span><span class="text-[11px] font-semibold tabular-nums whitespace-nowrap">' + fmtCurrency(avgs.avgReal) + '</span></div>' +
              '<div class="flex items-center justify-between gap-3"><span class="text-[10px] text-slate-400 whitespace-nowrap">Média Próximos 12M (Estimado)</span><span class="text-[11px] font-semibold tabular-nums whitespace-nowrap">' + fmtCurrency(avgs.avgEstimated) + '</span></div>' +
            '</div>' +
          '</div>'
        );
      }
      return (
        '<div class="glass-card border rounded-2xl p-4 flex flex-col justify-between min-w-0">' +
          '<div class="flex items-center gap-2 text-[10px] text-slate-400 uppercase tracking-wider">' +
            '<i data-lucide="' + f.icon + '" class="w-3.5 h-3.5 text-[#72becf] shrink-0"></i>' +
            '<span class="truncate">' + f.label + '</span>' +
          '</div>' +
          '<div class="text-sm sm:text-base font-extrabold text-[#72becf] mt-2">' + f.value + '</div>' +
        '</div>'
      );
    }).join('');

    if (!html) return '';
    return '<div class="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">' + html + '</div>';
  }

  /* ----------------------------------------------------------
   * Hover nos gráficos (tooltips + realces, padrão do app)
   * ---------------------------------------------------------- */
  var CHART_STATE = {};
  var chartTip = null;

  function getChartTip() {
    if (!chartTip) {
      chartTip = document.createElement('div');
      chartTip.className = 'deco-chart-tooltip';
      chartTip.style.display = 'none';
      document.body.appendChild(chartTip);
    }
    return chartTip;
  }

  function showChartTip(html, e) {
    var tip = getChartTip();
    tip.innerHTML = html;
    tip.style.display = 'block';
    var pad = 14;
    var x = e.clientX + pad;
    var y = e.clientY + pad;
    var r = tip.getBoundingClientRect();
    if (x + r.width > window.innerWidth - pad) x = e.clientX - r.width - pad;
    if (y + r.height > window.innerHeight - pad) y = e.clientY - r.height - pad;
    tip.style.left = x + 'px';
    tip.style.top = y + 'px';
  }

  function hideChartTip() {
    if (chartTip) chartTip.style.display = 'none';
  }

  function donutTipHtml(item) {
    if (item.children && item.children.length) {
      var list = item.children.map(function (c) {
        return '<li class="text-slate-500 dark:text-slate-400"><span class="font-semibold text-slate-700 dark:text-slate-200">' + escapeHtml(c.symbol) + '</span> · ' + fmtCurrency(c.value) + ' (' + fmtPct(c.percent, 2) + ')</li>';
      }).join('');
      return '<p class="mb-1.5 font-semibold">Outros</p><ul class="space-y-1">' + list +
        '<li class="border-t border-slate-200 dark:border-slate-700 mt-1 pt-1"><span class="font-semibold">Total:</span> <span class="text-slate-500 dark:text-slate-400">' + fmtCurrency(item.value) + ' (' + fmtPct(item.percent, 2) + ')</span></li>' +
      '</ul>';
    }
    return '<p class="mb-1.5 font-semibold">' + escapeHtml(item.symbol) + '</p>' +
      '<ul class="space-y-0.5">' +
        '<li class="flex items-center justify-between gap-4"><span class="text-slate-500 dark:text-slate-400">Valor</span><span class="font-semibold tabular-nums">' + fmtCurrency(item.value) + '</span></li>' +
        '<li class="flex items-center justify-between gap-4"><span class="text-slate-500 dark:text-slate-400">Peso</span><span class="font-semibold tabular-nums">' + fmtPct(item.percent, 2) + '</span></li>' +
        '<li class="flex items-center justify-between gap-4"><span class="text-slate-500 dark:text-slate-400">Quantidade</span><span class="font-semibold tabular-nums">' + (isNumeric(item.quantity) ? num0.format(item.quantity) : '—') + '</span></li>' +
      '</ul>';
  }

  function estimatesTipHtml(pt) {
    return '<p class="mb-1.5 font-semibold">' + escapeHtml(pt.label) + '</p>' +
      '<p class="text-slate-500 dark:text-slate-400">' + (pt.isEstimate ? 'Estimado' : 'Recebido') + '</p>' +
      '<p class="mt-1 font-semibold tabular-nums">' + fmtCurrency(pt.value) + '</p>';
  }

  function dailyTipHtml(p) {
    var cdiRow = '';
    if (isFinite(p.cdi)) {
      cdiRow = '<li class="flex items-center gap-2"><span class="w-2 h-2 rounded-full shrink-0" style="background:#94a3b8"></span><span class="text-slate-500 dark:text-slate-400">CDI</span><span class="ms-auto font-semibold tabular-nums">' + fmtPct(p.cdi / 100) + '</span></li>';
    }
    var navRow = '';
    if (p.nav !== null && p.nav !== undefined && isFinite(p.nav)) {
      navRow = '<li class="flex items-center gap-2"><span class="w-2 h-2 rounded-full shrink-0" style="background:#387b8d"></span><span class="text-slate-500 dark:text-slate-400">Patrimônio</span><span class="ms-auto font-semibold tabular-nums">' + fmtCurrency(p.nav) + '</span></li>';
    }
    return '<p class="mb-1.5 font-semibold">' + escapeHtml(p.date) + '</p>' +
      '<ul class="space-y-1">' +
        '<li class="flex items-center gap-2"><span class="w-2 h-2 rounded-full shrink-0" style="background:#72becf"></span><span class="text-slate-500 dark:text-slate-400">TWR</span><span class="ms-auto font-semibold tabular-nums">' + fmtPct(p.twr / 100) + '</span></li>' +
        cdiRow +
        navRow +
      '</ul>';
  }

  function clearChartCursors(mount) {
    var g = mount.querySelector('#deco-daily-cursor');
    if (g) g.innerHTML = '';
    var bars = mount.querySelectorAll('.deco-bar-hover');
    for (var i = 0; i < bars.length; i++) bars[i].classList.remove('deco-bar-hover');
  }

  function setBarHover(mount, el) {
    var bars = mount.querySelectorAll('.deco-bar-hover');
    for (var i = 0; i < bars.length; i++) {
      if (bars[i] !== el) bars[i].classList.remove('deco-bar-hover');
    }
    el.classList.add('deco-bar-hover');
  }

  function handleDailyHover(mount, e) {
    var state = CHART_STATE.daily;
    var svgEl = mount.querySelector('[data-chart="daily"]');
    if (!state || !svgEl) return;
    var rect = svgEl.getBoundingClientRect();
    if (!rect.width) return;
    var fx = (e.clientX - rect.left) / rect.width;
    fx = Math.max(0, Math.min(1, fx));
    var idx = Math.round(fx * (state.points.length - 1));
    if (idx < 0 || idx >= state.points.length) return;
    var pt = state.points[idx];
    var g = mount.querySelector('#deco-daily-cursor');
    if (!g) return;
    var cx = state.points.length > 1 ? (idx / (state.points.length - 1)) * state.W : 0;
    var dots = '';
    var twrCoord = state.coordsTWR[idx];
    var cdiCoord = state.coordsCDI[idx];
    if (twrCoord) dots += '<circle cx="' + twrCoord.x.toFixed(1) + '" cy="' + twrCoord.y.toFixed(1) + '" r="3.5" fill="#72becf" stroke="#061016" stroke-width="1"></circle>';
    if (cdiCoord) dots += '<circle cx="' + cdiCoord.x.toFixed(1) + '" cy="' + cdiCoord.y.toFixed(1) + '" r="3" fill="#94a3b8" stroke="#061016" stroke-width="1"></circle>';
    g.innerHTML =
      '<line x1="' + cx.toFixed(1) + '" y1="0" x2="' + cx.toFixed(1) + '" y2="' + state.H + '" stroke="#94a3b8" stroke-opacity="0.6" stroke-width="1"></line>' +
      dots;
    showChartTip(dailyTipHtml(pt), e);
  }

  function handleChartHover(mount, e) {
    var el = e.target && e.target.closest ? e.target.closest('[data-chart]') : null;
    if (!el) {
      clearChartCursors(mount);
      hideChartTip();
      return;
    }
    var chart = el.getAttribute('data-chart');
    var idx = Number(el.getAttribute('data-index') || 0);
    if (chart === 'donut') {
      var item = (CHART_STATE.donut || {})[idx];
      if (item) showChartTip(donutTipHtml(item), e);
    } else if (chart === 'semiannual') {
      var p = (CHART_STATE.semiannual || [])[idx];
      if (p) {
        showChartTip('<p class="font-semibold tabular-nums">' + fmtCurrency(p.total) + '</p>', e);
        setBarHover(mount, el);
      }
    } else if (chart === 'estimates') {
      var pt = (CHART_STATE.estimates || [])[idx];
      if (pt) {
        showChartTip(estimatesTipHtml(pt), e);
        setBarHover(mount, el);
      }
    } else if (chart === 'daily') {
      handleDailyHover(mount, e);
    } else {
      hideChartTip();
    }
  }

  function onPortfolioMouseMove(e) {
    var mount = document.getElementById('portfolio-view');
    if (mount) handleChartHover(mount, e);
  }

  function onPortfolioMouseLeave() {
    var mount = document.getElementById('portfolio-view');
    if (mount) clearChartCursors(mount);
    hideChartTip();
  }

  /* ----------------------------------------------------------
   * Posição Atual — donut de alocação (posicao_atual.csv)
   * ---------------------------------------------------------- */
  var DONUT_PALETTE = ['#f97316','#06b6d4','#3b82f6','#eab308','#ec4899','#14b8a6','#818cf8','#a78bfa','#34d399','#94a3b8'];
  var OTHERS_COLOR = '#94a3b8';

  function allocationItems(client) {
    var bySymbol = new Map();
    var hasAllocation = false;
    for (var i = 0; i < client.position.length; i++) {
      var row = client.position[i];
      var symbol = (row.symbol || '').trim();
      if (!symbol) continue;
      var quantity = isNumeric(row.quantity) ? row.quantity : 0;
      var marketValue = isNumeric(row.marketValue) ? row.marketValue : 0;
      var allocation = isNumeric(row.allocation) ? row.allocation : 0;
      if (row.allocation != null && String(row.allocation) !== '') hasAllocation = true;
      var e = bySymbol.get(symbol) || { quantity: 0, value: 0, allocation: 0 };
      e.quantity += quantity;
      e.value += marketValue;
      e.allocation += allocation;
      bySymbol.set(symbol, e);
    }
    var total = 0;
    bySymbol.forEach(function (e) { total += e.value; });
    var computed = [];
    bySymbol.forEach(function (e, symbol) {
      var percent = hasAllocation && e.allocation > 0 ? e.allocation : total > 0 ? e.value / total : 0;
      computed.push({
        symbol: symbol,
        value: hasAllocation && e.allocation > 0 ? e.allocation * total : e.value,
        percent: percent,
        quantity: e.quantity,
      });
    });
    computed.sort(function (a, b) { return b.value - a.value; });
    var others = computed.filter(function (i) { return i.percent < 0.03; });
    var main = computed.filter(function (i) { return i.percent >= 0.03; });
    if (others.length === 0) return computed;
    return main.concat([{
      symbol: 'Outros',
      value: others.reduce(function (s, i) { return s + i.value; }, 0),
      percent: others.reduce(function (s, i) { return s + i.percent; }, 0),
      quantity: others.reduce(function (s, i) { return s + i.quantity; }, 0),
      children: others,
    }]);
  }

  function renderAllocation(client) {
    var items = allocationItems(client);
    if (!items.length) return card('Posição Atual', 'Nenhuma posição encontrada.', '<p class="text-xs dark:text-slate-300 text-slate-600">Execute o WF10 para carregar a carteira.</p>');

    var total = items.reduce(function (s, i) { return s + i.value; }, 0);
    CHART_STATE.donut = items;
    var C = 2 * Math.PI * 45;
    var GAP = 1.5;
    var usable = Math.max(C - GAP * items.length, 1);
    var offset = 0;
    var segments = items.map(function (item, index) {
      var color = item.symbol === 'Outros' ? OTHERS_COLOR : DONUT_PALETTE[index % DONUT_PALETTE.length];
      var segLen = Math.max(item.percent * usable, 1);
      var circle =
        '<circle cx="60" cy="60" r="45" fill="none" stroke="' + color + '" stroke-width="14" ' +
        'stroke-dasharray="' + segLen + ' ' + (C - segLen) + '" stroke-dashoffset="' + (-offset) + '" ' +
        'data-chart="donut" data-index="' + index + '" ' +
        'class="animate-donut" style="animation-delay:' + (index * 0.15) + 's; cursor:pointer;"></circle>';
      offset += segLen + GAP;
      return { item: item, color: color, circle: circle };
    });

    var svg =
      '<svg class="w-full h-full transform -rotate-90" viewBox="0 0 120 120">' +
        '<circle cx="60" cy="60" r="45" fill="none" stroke="rgba(255,255,255,0.05)" stroke-width="14"></circle>' +
        segments.map(function (s) { return s.circle; }).join('') +
      '</svg>';

    var legend = items.map(function (item, index) {
      var color = item.symbol === 'Outros' ? OTHERS_COLOR : DONUT_PALETTE[index % DONUT_PALETTE.length];
      return (
        '<div class="flex items-center gap-1.5" title="' + escapeHtml(fmtCurrency(item.value)) + '">' +
          '<span class="w-2.5 h-2.5 rounded-full" style="background-color:' + color + '"></span>' +
          '<span class="dark:text-slate-300 text-slate-700">' + escapeHtml(item.symbol) + ' (' + fmtPct(item.percent, 1) + ')</span>' +
        '</div>'
      );
    }).join('');

    var html =
      '<div class="flex flex-col sm:flex-row items-center justify-center gap-6 my-4">' +
        '<div class="relative w-48 h-48 flex items-center justify-center">' +
          svg +
          '<div class="absolute text-center">' +
            '<span class="text-xs font-bold dark:text-white text-slate-600 block">Ativos</span>' +
          '</div>' +
        '</div>' +
        '<div class="grid grid-cols-2 gap-x-4 gap-y-2 text-[11px] font-medium">' + legend + '</div>' +
      '</div>';

    return card('Posição Atual', 'Alocação por ativo com base na posição atual da carteira · Total ' + fmtCurrency(total), html);
  }

  /* ----------------------------------------------------------
   * Proventos Semestrais (dividendos.csv)
   * ---------------------------------------------------------- */
  function semesterOf(date) {
    var m = /^(\d{4})-(\d{2})/.exec(date || '');
    if (!m) return '';
    return m[1] + '-' + (Number(m[2]) <= 6 ? 'H1' : 'H2');
  }
  function currentSemester() {
    var now = new Date();
    return now.getFullYear() + '-' + (now.getMonth() + 1 <= 6 ? 'H1' : 'H2');
  }
  function semesterLabel(semester) {
    var m = /^(\d{4})-(H1|H2)$/.exec(semester);
    if (!m) return semester;
    return m[1].slice(2) + 'S' + (m[2] === 'H1' ? '1' : '2');
  }

  function renderSemiannual(client) {
    var bySemester = new Map();
    for (var i = 0; i < client.dividends.length; i++) {
      var row = client.dividends[i];
      var semester = semesterOf(row.paymentDate);
      if (!semester) continue;
      var value = isNumeric(row.receivedValue) ? row.receivedValue : 0;
      bySemester.set(semester, (bySemester.get(semester) || 0) + value);
    }
    var points = [];
    bySemester.forEach(function (total, semester) { points.push({ semester: semester, total: total }); });
    points.sort(function (a, b) { return a.semester.localeCompare(b.semester); });
    points = points.filter(function (p) { return p.semester <= currentSemester(); });

    if (!points.length) return card('Proventos Semestrais', 'Dividendos recebidos agregados por semestre', '<p class="text-xs dark:text-slate-300 text-slate-600">Nenhum provento registrado.</p>');

    var current = currentSemester();
    var max = points.reduce(function (m, p) { return Math.max(m, p.total); }, 0) || 1;
    CHART_STATE.semiannual = points;
    var bars = points.map(function (p, index) {
      var isCurrent = p.semester === current;
      var height = Math.round((p.total / max) * 150);
      return (
        '<div class="flex-1 flex flex-col items-center gap-1 z-10 self-stretch justify-end rounded-t" data-chart="semiannual" data-index="' + index + '">' +
          '<span class="text-[9px] text-[#72becf] font-mono">' + fmtCompact(p.total) + '</span>' +
          '<div class="w-full rounded-t animate-bar ' + (isCurrent ? 'bg-slate-500 shadow-lg' : 'bg-[#387b8d]') + '" style="height:' + Math.max(height, 6) + 'px; animation-delay:' + (index * 0.05) + 's;"></div>' +
          '<span class="text-[9px] text-slate-400">' + semesterLabel(p.semester) + '</span>' +
        '</div>'
      );
    }).join('');

    var html =
      '<div class="h-48 flex items-end justify-between gap-1.5 pt-6 pb-2 px-2 border-b dark:border-slate-800/80 border-slate-200 relative overflow-x-auto">' +
        bars +
      '</div>';
    return card('Proventos Semestrais', 'Dividendos recebidos agregados por semestre', html);
  }

  /* ----------------------------------------------------------
   * Estimativa de Dividendos Futuros (posição + dividendos +
   * projections_master)
   * ---------------------------------------------------------- */
  function normalizeMonthName(name) {
    return (name || '')
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  }
  function monthKeyOf(date) {
    return date.getFullYear() + '-' + String(date.getMonth() + 1).padStart(2, '0');
  }
  function shortMonthLabel(date) {
    return MONTHS_SHORT[date.getMonth()] + '/' + String(date.getFullYear()).slice(2);
  }

  function renderEstimates(client) {
    var now = new Date();
    var currentYear = now.getFullYear();
    var currentMonth = now.getMonth();

    var monthByKey = new Map();
    MONTHS_FULL.forEach(function (name, index) {
      monthByKey.set(normalizeMonthName(name), index);
    });

    var receivedByMonth = new Map();
    for (var i = 0; i < client.dividends.length; i++) {
      var row = client.dividends[i];
      var date = row.paymentDate || '';
      var key = date.slice(0, 7);
      if (!/^\d{4}-\d{2}$/.test(key)) continue;
      receivedByMonth.set(key, (receivedByMonth.get(key) || 0) + (isNumeric(row.receivedValue) ? row.receivedValue : 0));
    }

    var estimatesByMonth = new Array(12).fill(0);
    for (var j = 0; j < client.position.length; j++) {
      var p = client.position[j];
      var symbol = (p.symbol || '').trim();
      var quantity = p.quantity;
      if (!symbol || !isNumeric(quantity)) continue;
      var valuation = PROJECTIONS[symbol] || {};
      var perShare = valuation.dividendPerShare;
      if (!isNumeric(perShare)) continue;
      var months = valuation.months || [];
      var percents = valuation.percents || [];
      for (var k = 0; k < months.length; k++) {
        var percent = percents[k];
        if (!isNumeric(percent)) continue;
        var monthIndex = monthByKey.get(normalizeMonthName(months[k]));
        if (monthIndex === undefined) continue;
        estimatesByMonth[monthIndex] += percent * perShare * quantity;
      }
    }

    var points = [];
    for (var offset = -12; offset < 12; offset++) {
      var date = new Date(currentYear, currentMonth + offset, 1);
      var isEstimate = offset >= 0;
      var key = monthKeyOf(date);
      points.push({
        key: key,
        label: shortMonthLabel(date),
        value: isEstimate ? estimatesByMonth[date.getMonth()] : (receivedByMonth.get(key) || 0),
        isEstimate: isEstimate,
      });
    }

    if (!client.position.length) {
      return card('Histórico | Estimativa de Dividendos Futuros', 'Dividendos recebidos nos últimos 12 meses e estimativas para os próximos 12 meses', '<p class="text-xs dark:text-slate-300 text-slate-600">Nenhuma posição encontrada.</p>');
    }

    var max = points.reduce(function (m, pt) { return Math.max(m, pt.value); }, 0) || 1;
    CHART_STATE.estimates = points;
    var bars = points.map(function (pt, index) {
      var height = Math.round((pt.value / max) * 150);
      return (
        '<div class="flex flex-col items-center gap-1 min-w-[26px] self-stretch justify-end rounded-t" data-chart="estimates" data-index="' + index + '">' +
          '<span class="text-[8px] ' + (pt.isEstimate ? 'text-slate-400' : 'text-[#72becf]') + '">' + fmtCompact(pt.value) + '</span>' +
          '<div class="w-4 rounded-t animate-bar ' + (pt.isEstimate ? 'bg-slate-500' : 'bg-[#387b8d]') + '" style="height:' + Math.max(height, 4) + 'px; animation-delay:' + (index * 0.02) + 's;"></div>' +
          '<span class="text-[8px] ' + (pt.isEstimate && index === points.length - 1 ? 'text-white font-bold' : 'text-slate-400') + '">' + pt.label + '</span>' +
        '</div>'
      );
    }).join('');

    var html =
      '<div class="h-48 flex items-end justify-between gap-1 pt-6 pb-2 px-1 relative border-b dark:border-slate-800/80 border-slate-200 overflow-x-auto min-w-full">' +
        bars +
      '</div>' +
      '<div class="flex items-center gap-4 mt-4 text-[10px] text-slate-400 font-medium">' +
        '<span class="flex items-center gap-1.5"><span class="w-3 h-1 bg-[#387b8d] rounded-full"></span> Recebido</span>' +
        '<span class="flex items-center gap-1.5"><span class="w-3 h-1 bg-slate-500 rounded-full"></span> Estimado</span>' +
      '</div>';
    return card('Histórico | Estimativa de Dividendos Futuros', 'Dividendos recebidos nos últimos 12 meses e estimativas para os próximos 12 meses', html);
  }

  /* ----------------------------------------------------------
   * Rentabilidade Diária (TWR vs CDI) — SVG de linha
   * ---------------------------------------------------------- */
  function dailySeries(client) {
    var pts = [];
    for (var i = 0; i < client.daily.length; i++) {
      var row = client.daily[i];
      if (!/^\d{4}-\d{2}-\d{2}/.test(row.date || '')) continue;
      if (!isNumeric(row.twr)) continue;
      pts.push({
        date: row.date,
        twr: row.twr * 100,
        cdi: isNumeric(row.cdi) ? row.cdi * 100 : NaN,
        nav: isNumeric(row.nav) ? row.nav : null,
      });
    }
    var step = Math.ceil(pts.length / 320);
    var out = [];
    for (var k = 0; k < pts.length; k += step) out.push(pts[k]);
    if (!out.length) out.push({ date: '', twr: 0, cdi: 0, nav: null });
    return out;
  }

  function linePath(points, get, w, h, min, max) {
    var span = (max - min) || 1;
    var coords = [];
    for (var i = 0; i < points.length; i++) {
      var v = get(points[i]);
      if (!isFinite(v)) continue;
      var x = points.length > 1 ? (i / (points.length - 1)) * w : 0;
      var y = h - 12 - ((v - min) / span) * (h - 30);
      coords.push([x, y]);
    }
    if (!coords.length) return '';
    var d = 'M ' + coords[0][0].toFixed(1) + ' ' + coords[0][1].toFixed(1);
    for (var c = 1; c < coords.length; c++) {
      d += ' L ' + coords[c][0].toFixed(1) + ' ' + coords[c][1].toFixed(1);
    }
    return d;
  }

  function xyCoords(points, get, w, h, min, max) {
    var span = (max - min) || 1;
    var out = new Array(points.length);
    for (var i = 0; i < points.length; i++) {
      var v = get(points[i]);
      if (!isFinite(v)) { out[i] = null; continue; }
      var x = points.length > 1 ? (i / (points.length - 1)) * w : 0;
      var y = h - 12 - ((v - min) / span) * (h - 30);
      out[i] = { x: x, y: y };
    }
    return out;
  }

  function axisDateLabel(date) {
    var m = /^(\d{4})-(\d{2})-(\d{2})/.exec(date || '');
    if (!m) return date;
    return MONTHS_SHORT[Number(m[2]) - 1] + '/' + m[3];
  }

  function renderDaily(client) {
    var points = dailySeries(client);
    var W = 800;
    var H = 200;
    var min = Infinity;
    var max = -Infinity;
    points.forEach(function (p) {
      if (isFinite(p.twr)) { if (p.twr < min) min = p.twr; if (p.twr > max) max = p.twr; }
      if (isFinite(p.cdi)) { if (p.cdi < min) min = p.cdi; if (p.cdi > max) max = p.cdi; }
    });
    if (!isFinite(min) || !isFinite(max)) min = 0;
    if (!isFinite(max)) max = 1;
    if (min === max) { min -= 1; max += 1; }

    CHART_STATE.daily = {
      points: points,
      W: W,
      H: H,
      coordsTWR: xyCoords(points, function (p) { return p.twr; }, W, H, min, max),
      coordsCDI: xyCoords(points, function (p) { return p.cdi; }, W, H, min, max),
    };

    var dTWR = linePath(points, function (p) { return p.twr; }, W, H, min, max);
    var dCDI = linePath(points, function (p) { return p.cdi; }, W, H, min, max);

    var grid = [0, 0.25, 0.5, 0.75, 1].map(function (f) {
      var y = H - 12 - f * (H - 30);
      return '<line x1="0" y1="' + y + '" x2="' + W + '" y2="' + y + '" stroke="rgba(255,255,255,0.08)" stroke-width="1"></line>';
    }).join('');

    var labelCount = 7;
    var labels = [];
    for (var i = 0; i < labelCount; i++) {
      var idx = Math.round((i / (labelCount - 1)) * (points.length - 1));
      labels.push('<span>' + escapeHtml(axisDateLabel(points[idx].date)) + '</span>');
    }

    var html =
      '<div class="relative h-64 w-full flex items-center justify-center pt-4">' +
        '<svg class="w-full h-full overflow-visible" viewBox="0 0 ' + W + ' ' + H + '" preserveAspectRatio="none" data-chart="daily">' +
          grid +
          '<path d="' + dCDI + '" fill="none" stroke="#94a3b8" stroke-width="2" stroke-dasharray="4 4" opacity="0.6"></path>' +
          '<path d="' + dTWR + '" fill="none" stroke="#72becf" stroke-width="3.5" class="animate-chart-line"></path>' +
          '<g id="deco-daily-cursor"></g>' +
        '</svg>' +
      '</div>' +
      '<div class="flex justify-between items-center text-[10px] text-slate-400 mt-4 pt-3 border-t dark:border-slate-800/50">' + labels.join('') + '</div>';

    return card('Rentabilidade Diária', 'TWR acumulado da carteira vs CDI ao longo do tempo', html);
  }

  /* ----------------------------------------------------------
   * Rentabilidade Mensal — tabela
   * ---------------------------------------------------------- */
  function monthlyYears(client) {
    var rows = client.monthly || [];
    var cumulative = [];
    for (var i = 0; i < rows.length; i++) {
      var row = rows[i];
      var m = /^(\d{4})-(\d{2})/.exec(row.date || '');
      if (!m) continue;
      var year = Number(m[1]);
      var month = Number(m[2]);
      var twr = isNumeric(row.twr) ? row.twr : null;
      var cdi = isNumeric(row.cdi) && row.cdi > 0 ? row.cdi : null;
      cumulative.push({ year: year, month: month, twr: twr, cdi: cdi });
    }
    cumulative.sort(function (a, b) { return a.year - b.year || a.month - b.month; });

    var yearMap = new Map();
    var prevTwr = null;
    var prevCdi = null;
    var lastTwr = null;
    var lastCdi = null;
    for (var j = 0; j < cumulative.length; j++) {
      var p = cumulative[j];
      var entry = yearMap.get(p.year);
      if (!entry) {
        entry = { year: p.year, endTwr: null, endCdi: null, startTwr: lastTwr, startCdi: lastCdi, points: [] };
        yearMap.set(p.year, entry);
      }
      var twr = p.twr !== null && prevTwr !== null ? (1 + p.twr) / (1 + prevTwr) - 1 : p.twr;
      var cdi = p.cdi !== null && prevCdi !== null ? (1 + p.cdi) / (1 + prevCdi) - 1 : p.cdi;
      entry.points.push({ month: p.month, twr: twr, cdi: cdi });
      if (p.twr !== null) { prevTwr = p.twr; lastTwr = p.twr; entry.endTwr = p.twr; }
      if (p.cdi !== null) { prevCdi = p.cdi; lastCdi = p.cdi; entry.endCdi = p.cdi; }
    }

    var years = [];
    yearMap.forEach(function (entry) {
      var byMonth = new Map(entry.points.map(function (p) { return [p.month, p]; }));
      var months = MONTHS_SHORT.map(function (_, index) {
        var mo = index + 1;
        var p = byMonth.get(mo);
        if (!p) return { month: mo, twr: null, cdi: null, vsCdi: null };
        return {
          month: mo,
          twr: p.twr,
          cdi: p.cdi,
          vsCdi: p.twr !== null && p.cdi !== null ? p.twr - p.cdi : null,
        };
      });
      var twrTotal = entry.endTwr !== null && entry.startTwr !== null ? (1 + entry.endTwr) / (1 + entry.startTwr) - 1 : entry.endTwr;
      var cdiTotal = entry.endCdi !== null && entry.startCdi !== null ? (1 + entry.endCdi) / (1 + entry.startCdi) - 1 : entry.endCdi;
      years.push({
        year: entry.year,
        months: months,
        twrTotal: twrTotal,
        cdiTotal: cdiTotal,
        vsCdiTotal: twrTotal !== null && cdiTotal !== null ? twrTotal - cdiTotal : null,
      });
    });
    years.sort(function (a, b) { return b.year - a.year; });
    return years;
  }

  function cell(v, isVs, isMuted) {
    if (v === null || v === undefined) return '<td class="px-2 py-2 text-right whitespace-nowrap tabular-nums text-xs">—</td>';
    if (isVs) {
      var cls = v >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400';
      return '<td class="px-2 py-2 text-right whitespace-nowrap tabular-nums text-xs ' + cls + ' font-medium">' + (v >= 0 ? '+' : '') + fmtPct(v) + '</td>';
    }
    var valueHtml = fmtPct(v);
    if (isMuted) valueHtml = '<span class="text-slate-400">' + valueHtml + '</span>';
    return '<td class="px-2 py-2 text-right whitespace-nowrap tabular-nums text-xs">' + valueHtml + '</td>';
  }

  function renderMonthly(client) {
    var years = monthlyYears(client);
    if (!years.length) return card('Rentabilidade Mensal', 'Rentabilidade mensal da carteira versus CDI', '<p class="text-xs dark:text-slate-300 text-slate-600">Nenhum dado de rentabilidade mensal.</p>');

    var head =
      '<th class="px-2 py-2 font-medium text-left text-[10px] uppercase tracking-wider dark:text-slate-400 text-slate-500">Indicador</th>' +
      MONTHS_SHORT.map(function (m) {
        return '<th class="px-2 py-2 text-right font-medium text-[10px] uppercase tracking-wider dark:text-slate-400 text-slate-500">' + m + '</th>';
      }).join('') +
      '<th class="px-2 py-2 text-right font-medium text-[10px] uppercase tracking-wider dark:text-slate-400 text-slate-500">Total</th>';

    var body = years.map(function (year) {
      var rows =
        '<tr class="border-b dark:border-slate-800/60 border-slate-200"><td colspan="14" class="px-2 pt-2 pb-1 text-xs font-semibold dark:text-slate-300 text-slate-500">' + year.year + '</td></tr>' +
        '<tr class="border-b dark:border-slate-800/60 border-slate-200"><td class="px-2 py-2 font-medium whitespace-nowrap text-xs">TWR</td>' +
          year.months.map(function (mo) { return cell(mo.twr, false, false); }).join('') + cell(year.twrTotal, false, false) + '</tr>' +
        '<tr class="border-b dark:border-slate-800/60 border-slate-200"><td class="px-2 py-2 font-medium whitespace-nowrap text-xs">CDI</td>' +
          year.months.map(function (mo) { return cell(mo.cdi, false, true); }).join('') + cell(year.cdiTotal, false, true) + '</tr>' +
        '<tr class="border-b dark:border-slate-800/60 border-slate-200"><td class="px-2 py-2 font-medium whitespace-nowrap text-xs">vs CDI</td>' +
          year.months.map(function (mo) { return cell(mo.vsCdi, true, false); }).join('') + cell(year.vsCdiTotal, true, false) + '</tr>';
      return rows;
    }).join('');

    var html =
      '<div class="overflow-x-auto">' +
        '<table class="w-full min-w-[1080px]">' +
          '<thead><tr class="border-b dark:border-slate-800/60 border-slate-200">' + head + '</tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>';
    return card('Rentabilidade Mensal', 'Rentabilidade mensal da carteira versus CDI, com o total de cada ano', html);
  }

  /* ----------------------------------------------------------
   * Posição Atual Detalhada — tabela ordenável
   * ---------------------------------------------------------- */
  var POS_COLUMNS = [
    { key: 'allocation', label: '%', type: 'pct', center: true },
    { key: 'name', label: 'Ticker', type: 'text' },
    { key: 'description', label: 'Empresa', type: 'text' },
    { key: 'quantity', label: 'Qtd.', type: 'qty' },
    { key: 'dividendYield', label: 'Yeld', type: 'pct' },
    { key: 'averagePrice', label: 'Preço Médio', type: 'cur' },
    { key: 'currentPrice', label: 'Preço Atual', type: 'cur' },
    { key: 'investedAmount', label: 'Valor Investido', type: 'cur' },
    { key: 'marketValue', label: 'Valor Atual', type: 'cur' },
    { key: 'priceDiference', label: 'Δ Preço', type: 'cur' },
    { key: 'priceDeltaPercent', label: 'Δ %', type: 'pctSigned' },
    { key: 'earnings', label: 'Dividendos', type: 'cur0' },
    { key: 'pnl', label: 'Lucro/Perda', type: 'cur0' },
    { key: 'irr', label: 'TIR', type: 'pct' },
    { key: 'twr', label: 'TWR', type: 'pct' },
  ];

  function posCellValue(row, col) {
    if (col.type === 'cur' || col.type === 'qty' || col.type === 'cur0' || col.type === 'pct' || col.type === 'pctSigned') {
      var v = row[col.key];
      return isNumeric(v) ? v : null;
    }
    if (col.type === 'text') return (row[col.key] || '').trim() || null;
    return row[col.key];
  }

  function posDeltaPrice(row) {
    var cur = isNumeric(row.currentPrice) ? row.currentPrice : null;
    var avg = isNumeric(row.averagePrice) ? row.averagePrice : null;
    if (cur === null || avg === null) return null;
    return cur - avg;
  }
  function posDeltaPercent(row) {
    var diff = posDeltaPrice(row);
    var avg = isNumeric(row.averagePrice) ? row.averagePrice : null;
    if (diff === null || avg === null || avg === 0) return null;
    return (diff / avg) * 100;
  }

  var posSort = { column: null, direction: 'asc' };

  function posSortValue(row, col) {
    if (col.key === 'priceDiference') return posDeltaPrice(row);
    if (col.key === 'priceDeltaPercent') return posDeltaPercent(row);
    return posCellValue(row, col);
  }

  function renderPositionTable(client) {
    var rows = client.position.slice();
    if (posSort.column) {
      var col = POS_COLUMNS.filter(function (c) { return c.key === posSort.column; })[0];
      var multiplier = posSort.direction === 'asc' ? 1 : -1;
      rows.sort(function (a, b) {
        var va = posSortValue(a, col);
        var vb = posSortValue(b, col);
        if (va === null && vb === null) return 0;
        if (va === null) return 1;
        if (vb === null) return -1;
        if (typeof va === 'number' && typeof vb === 'number') return (va - vb) * multiplier;
        return String(va).localeCompare(String(vb), 'pt-BR') * multiplier;
      });
    }

    var head = POS_COLUMNS.map(function (col) {
      var arrow = posSort.column === col.key ? (posSort.direction === 'asc' ? ' ▲' : ' ▼') : '';
      return '<th class="px-2 py-2 text-[11px] font-medium ' + (col.center ? 'text-center' : 'text-left') + ' cursor-pointer select-none whitespace-nowrap" data-sort="' + col.key + '">' + col.label + arrow + '</th>';
    }).join('');

    var body = rows.map(function (row) {
      return '<tr class="border-b dark:border-slate-800/60 border-slate-200 hover:bg-white/5 transition-colors">' +
        POS_COLUMNS.map(function (col) {
          var valueHtml;
          if (col.key === 'priceDiference') {
            valueHtml = fmtCurrency(posDeltaPrice(row));
          } else if (col.key === 'priceDeltaPercent') {
            valueHtml = fmtPctSigned(posDeltaPercent(row));
          } else {
            var raw = row[col.key];
            switch (col.type) {
              case 'pct': valueHtml = fmtPct(raw, 1); break;
              case 'pctSigned': valueHtml = fmtPctSigned(raw); break;
              case 'cur': valueHtml = fmtCurrency(raw); break;
              case 'cur0': valueHtml = fmtCurrency0(raw); break;
              case 'qty': valueHtml = fmtQty(raw); break;
              default: valueHtml = escapeHtml(raw == null ? '' : String(raw));
            }
          }
          var extra = col.type === 'text' && col.key === 'description' ? ' text-[10px]' : ' text-[11px]';
          return '<td class="px-2 py-2 whitespace-nowrap tabular-nums' + extra + (col.center ? ' text-center' : '') + '">' + valueHtml + '</td>';
        }).join('') +
      '</tr>';
    }).join('');

    var html =
      '<div class="overflow-x-auto">' +
        '<table class="w-full min-w-[860px]">' +
          '<thead><tr class="border-b dark:border-slate-800/60 border-slate-200">' + head + '</tr></thead>' +
          '<tbody>' + body + '</tbody>' +
        '</table>' +
      '</div>';
    return card('Posição Atual Detalhada', 'Todas as posições da carteira com os dados do posicao_atual.csv', html);
  }

  /* ----------------------------------------------------------
   * Montagem da carteira completa (mesma ordem do app)
   * ---------------------------------------------------------- */
  function renderPortfolio(client) {
    var mount = document.getElementById('portfolio-view');
    if (!mount) return;

    var html =
      renderHeader(client) +
      renderClientInfo(client) +
      '<div class="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8 mt-8">' +
        renderAllocation(client) +
        renderSemiannual(client) +
      '</div>' +
      '<div class="mb-8">' + renderEstimates(client) + '</div>' +
      '<div class="mb-8">' + renderResume(client) + '</div>' +
      '<div class="mb-8">' + renderDaily(client) + '</div>' +
      '<div class="mb-8">' + renderMonthly(client) + '</div>' +
      '<div>' + renderPositionTable(client) + '</div>';

    mount.innerHTML = html;
    mount.classList.remove('hidden');
    mount.classList.add('flex', 'flex-col');

    if (window.setShapeTarget) window.setShapeTarget('barchart');

    if (typeof lucide !== 'undefined' && lucide.createIcons) lucide.createIcons();

    if (!mount.__chartsBound) {
      mount.__chartsBound = true;
      mount.addEventListener('mousemove', onPortfolioMouseMove);
      mount.addEventListener('mouseleave', onPortfolioMouseLeave);
    }

    var sortHead = mount.querySelectorAll('th[data-sort]');
    Array.prototype.forEach.call(sortHead, function (th) {
      th.addEventListener('click', function () {
        var key = th.getAttribute('data-sort');
        if (posSort.column === key) {
          posSort.direction = posSort.direction === 'asc' ? 'desc' : 'asc';
        } else {
          posSort.column = key;
          posSort.direction = 'asc';
        }
        renderPortfolio(client);
      });
    });

    var logout = document.getElementById('logout-btn');
    if (logout) logout.addEventListener('click', logoutClient);

    mount.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  /* ----------------------------------------------------------
   * Login / Logout
   * ---------------------------------------------------------- */
  function setHeaderButtonLabel(text) {
    var btn = document.getElementById('login-btn');
    if (btn) btn.textContent = text;
  }

  function openLoginModal() {
    var modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.classList.remove('hidden');
    modal.classList.add('flex');
    var error = document.getElementById('login-error');
    if (error) error.classList.add('hidden');
    var user = document.getElementById('login-user');
    if (user) user.focus();
  }

  function closeLoginModal() {
    var modal = document.getElementById('login-modal');
    if (!modal) return;
    modal.classList.add('hidden');
    modal.classList.remove('flex');
  }

  function showLoginError(message) {
    var error = document.getElementById('login-error');
    if (!error) return;
    error.textContent = message || 'Usuário ou senha inválidos.';
    error.classList.remove('hidden');
  }

  function logoutClient() {
    currentClient = null;
    try { sessionStorage.removeItem('deco_site_session'); } catch (e) {}
    setHeaderButtonLabel('Login');
    var mount = document.getElementById('portfolio-view');
    if (mount) {
      mount.classList.add('hidden');
      mount.classList.remove('flex');
      mount.innerHTML = '';
    }
    closeLoginModal();
    document.getElementById('hero').scrollIntoView({ behavior: 'smooth' });
  }

  async function loginUser(username, password) {
    var normalized = String(username || '').trim();
    if (!normalized || !password) {
      showLoginError('Informe usuário e senha.');
      return false;
    }
    if (!supportsSubtle()) {
      showLoginError('O login exige HTTPS. Abra o site pelo domínio www.decoinvestimentos.com.br.');
      return false;
    }
    var record = null;
    for (var i = 0; i < CLIENTS.length; i++) {
      if (String(CLIENTS[i].login || '').trim().toLowerCase() === normalized.toLowerCase()) {
        record = CLIENTS[i];
        break;
      }
    }
    if (!record) {
      showLoginError('Usuário ou senha inválidos.');
      return false;
    }
    try {
      var client = await decryptClient(record, password);
      currentClient = client;
      closeLoginModal();
      setHeaderButtonLabel(client.name || normalized);
      renderPortfolio(client);
      return true;
    } catch (err) {
      showLoginError('Usuário ou senha inválidos.');
      return false;
    }
  }

  /* ----------------------------------------------------------
   * Init
   * ---------------------------------------------------------- */
  function init() {
    var loginBtn = document.getElementById('login-btn');
    if (loginBtn) loginBtn.addEventListener('click', openLoginModal);

    var modal = document.getElementById('login-modal');
    var form = document.getElementById('login-form');
    if (modal) {
      Array.prototype.forEach.call(modal.querySelectorAll('[data-login-close]'), function (el) {
        el.addEventListener('click', closeLoginModal);
      });
    }
    if (form) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        var user = document.getElementById('login-user');
        var password = document.getElementById('login-password');
        loginUser(user.value, password.value);
      });
    }
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') closeLoginModal();
    });

    var refreshBtn = document.getElementById('portfolio-refresh');
    if (refreshBtn) {
      refreshBtn.addEventListener('click', function () {
        if (currentClient) renderPortfolio(currentClient);
      });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

  window.DecoSiteApp = {
    login: loginUser,
    logout: logoutClient,
    openLogin: openLoginModal,
  };
})();