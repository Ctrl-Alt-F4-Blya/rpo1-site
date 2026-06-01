const state = {
  currencies: [],
  from: 'USD',
  to: 'RUB',
  amount: 1,
  lastRates: null,
  services: []
};

const $ = (id) => document.getElementById(id);
const fmt = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 4 });
const fmtMoney = new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 });

function nice(num, max = 4) {
  const n = Number(num);
  if (!Number.isFinite(n)) return '—';
  if (Math.abs(n) >= 1000000) return new Intl.NumberFormat('ru-RU', { notation: 'compact', maximumFractionDigits: 2 }).format(n);
  if (Math.abs(n) >= 1000) return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 2 }).format(n);
  if (Math.abs(n) >= 1) return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: max }).format(n);
  return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 8 }).format(n);
}

async function api(url) {
  const res = await fetch(url, { cache: 'no-store' });
  if (!res.ok) throw new Error('Ошибка запроса ' + url);
  return res.json();
}

function currencyOption(c) {
  return `${c.flag} ${c.code}`;
}

function fillSelects() {
  const from = $('from');
  const to = $('to');
  const html = state.currencies.map(c => `<option value="${c.code}">${currencyOption(c)} · ${c.name}</option>`).join('');
  from.innerHTML = html;
  to.innerHTML = html;
  from.value = state.from;
  to.value = state.to;
}

function renderRates(data) {
  $('rates-date').textContent = data.date || '';
  const priority = ['USD', 'EUR', 'USDT', 'BTC'];
  const list = priority.map(code => data.currencies.find(c => c.code === code)).filter(Boolean);
  $('rate-list').classList.remove('skeleton-area');
  $('rate-list').innerHTML = list.map(c => {
    const up = c.change >= 0;
    return `<div class="rate-item">
      <div class="rate-main">
        <span class="flag">${c.flag}</span>
        <div><div class="rate-code">${c.code}</div><div class="rate-name">${c.name}</div></div>
      </div>
      <div class="rate-value">${nice(c.valueRub, 4)}</div>
      <div class="change ${up ? 'up' : 'down'}">${up ? '↑' : '↓'} ${nice(Math.abs(c.change), 4)}</div>
    </div>`;
  }).join('');

  $('sources').innerHTML = data.sources.map(s => {
    const reserve = s.status === 'резерв';
    return `<div class="source-pill"><span>${s.name}</span><span class="${reserve ? 'reserve' : ''}">${s.status}</span></div>`;
  }).join('');
}

function getCurrency(code) {
  return state.currencies.find(c => c.code === code) || state.currencies[0];
}

function calcLocal() {
  const from = getCurrency(state.from);
  const to = getCurrency(state.to);
  const amount = Number($('amount').value || 0);
  if (!from || !to) return null;
  const result = amount * from.valueRub / to.valueRub;
  return { from, to, amount, result, rate: from.valueRub / to.valueRub };
}

function renderConverter() {
  const out = calcLocal();
  if (!out) return;
  const { from, to, amount, result, rate } = out;
  $('pair-title').textContent = `1 ${from.code} в ${to.code}`;
  $('from-amount-view').textContent = nice(amount, 4);
  $('from-code-view').textContent = `${from.flag} ${from.code}`;
  $('to-result-view').textContent = nice(result, 4);
  $('to-code-view').textContent = `${to.flag} ${to.code}`;
  $('forward-rate').textContent = `1 ${from.code} = ${nice(rate, 6)} ${to.code}`;
  $('reverse-rate').textContent = `1 ${to.code} = ${nice(1 / rate, 6)} ${from.code}`;
  renderFees(result, to.code);
}

function renderFees(result, code) {
  const feeModels = [
    ['Банк / карта', 0.007, 'примерно 0,7%'],
    ['P2P / USDT', 0.002, 'примерно 0,2%'],
    ['Переводный сервис', 0.015, 'примерно 1,5%']
  ];
  $('fees').innerHTML = feeModels.map(([name, fee, label]) => {
    const total = result * (1 - fee);
    return `<div class="fee-row"><span>${name}: ${label}</span><b>≈ ${nice(total, 4)} ${code}</b></div>`;
  }).join('');
}

function swapCurrencies() {
  const tmp = state.from;
  state.from = state.to;
  state.to = tmp;
  $('from').value = state.from;
  $('to').value = state.to;
  renderConverter();
  loadHistory();
}

async function loadRates() {
  try {
    const data = await api('/api/rates');
    state.lastRates = data;
    state.currencies = data.currencies;
    fillSelects();
    renderRates(data);
    renderConverter();
    loadHistory();
  } catch (e) {
    $('rate-list').innerHTML = `<p class="muted">Не удалось загрузить курсы. Проверь запуск сервера.</p>`;
  }
}

function drawChart(canvas, history) {
  const dpr = window.devicePixelRatio || 1;
  const rect = canvas.getBoundingClientRect();
  canvas.width = Math.floor(rect.width * dpr);
  canvas.height = Math.floor(rect.height * dpr);
  const ctx = canvas.getContext('2d');
  ctx.scale(dpr, dpr);

  const w = rect.width;
  const h = rect.height;
  const pad = { l: 42, r: 18, t: 18, b: 42 };
  ctx.clearRect(0, 0, w, h);

  const points = history.points;
  const values = points.map(p => p.rate);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;

  ctx.lineWidth = 1;
  ctx.strokeStyle = '#dce5fb';
  ctx.fillStyle = '#6c7895';
  ctx.font = '12px Inter, system-ui, sans-serif';

  for (let i = 0; i <= 4; i++) {
    const y = pad.t + (h - pad.t - pad.b) * i / 4;
    ctx.beginPath();
    ctx.moveTo(pad.l, y);
    ctx.lineTo(w - pad.r, y);
    ctx.stroke();
    const labelVal = max - range * i / 4;
    ctx.fillText(nice(labelVal, 3), 4, y + 4);
  }

  const coords = points.map((p, i) => {
    const x = pad.l + (w - pad.l - pad.r) * i / Math.max(1, points.length - 1);
    const y = pad.t + (h - pad.t - pad.b) * (1 - (p.rate - min) / range);
    return { x, y, p };
  });

  const grad = ctx.createLinearGradient(0, pad.t, 0, h - pad.b);
  grad.addColorStop(0, 'rgba(49, 87, 255, .25)');
  grad.addColorStop(1, 'rgba(49, 87, 255, 0)');
  ctx.beginPath();
  coords.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y));
  ctx.lineTo(coords[coords.length - 1].x, h - pad.b);
  ctx.lineTo(coords[0].x, h - pad.b);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  ctx.beginPath();
  coords.forEach((c, i) => i ? ctx.lineTo(c.x, c.y) : ctx.moveTo(c.x, c.y));
  ctx.lineWidth = 4;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.strokeStyle = history.trend === 'up' ? '#1aa75a' : '#e14b55';
  ctx.stroke();

  coords.forEach((c, i) => {
    if (i === 0 || i === coords.length - 1 || i % Math.ceil(coords.length / 5) === 0) {
      ctx.beginPath();
      ctx.fillStyle = '#ffffff';
      ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = history.trend === 'up' ? '#1aa75a' : '#e14b55';
      ctx.lineWidth = 2;
      ctx.stroke();
    }
  });

  ctx.fillStyle = '#6c7895';
  ctx.font = '12px Inter, system-ui, sans-serif';
  const step = Math.max(1, Math.ceil(points.length / 5));
  coords.forEach((c, i) => {
    if (i % step === 0 || i === coords.length - 1) {
      ctx.fillText(c.p.label, c.x - 16, h - 16);
    }
  });

  const last = coords[coords.length - 1];
  ctx.fillStyle = history.trend === 'up' ? '#1aa75a' : '#e14b55';
  ctx.font = 'bold 13px Inter, system-ui, sans-serif';
  ctx.fillText(`${history.trend === 'up' ? 'рост' : 'падение'} ${nice(history.changePercent, 2)}%`, Math.max(pad.l, last.x - 110), Math.max(22, last.y - 14));
}

async function loadHistory() {
  const days = $('days').value || 14;
  $('chart-title').textContent = `${state.from} / ${state.to}`;
  $('chart-subtitle').textContent = `Динамика за ${days} дней`;
  try {
    const history = await api(`/api/history?from=${encodeURIComponent(state.from)}&to=${encodeURIComponent(state.to)}&days=${encodeURIComponent(days)}`);
    drawChart($('chartCanvas'), history);
    $('stat-change').textContent = `${history.change >= 0 ? '+' : ''}${nice(history.change, 5)} (${history.changePercent >= 0 ? '+' : ''}${nice(history.changePercent, 2)}%)`;
    $('stat-change').className = history.change >= 0 ? 'up' : 'down';
    $('stat-min').textContent = nice(history.min, 5);
    $('stat-max').textContent = nice(history.max, 5);
    $('chart-note').textContent = history.description + ' График строится по выбранной паре валют.';
  } catch (e) {
    $('chart-note').textContent = 'Не удалось построить график. Проверь сервер.';
  }
}

async function loadServices() {
  try {
    const data = await api('/api/services');
    state.services = data.items;
    $('service-list').innerHTML = data.items.map(s => `<article class="service-card">
      <span class="tag">${s.tag}</span>
      <h3>${s.name}</h3>
      <p>${s.text}</p>
      <p class="fee">Комиссия: ${s.fee}</p>
      <a class="card-link" href="${s.url}" target="_blank" rel="noreferrer">Открыть сайт →</a>
    </article>`).join('');
  } catch (e) {
    $('service-list').innerHTML = '<p class="muted">Сервисы временно недоступны.</p>';
  }
}

async function loadNews() {
  try {
    const data = await api('/api/news');
    $('news-list').innerHTML = data.items.map(n => {
      const d = new Date(n.date);
      const date = Number.isNaN(d.getTime()) ? '' : d.toLocaleString('ru-RU', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
      const link = n.url && n.url !== '#' ? n.url : '#';
      return `<article class="news-card">
        <div class="news-meta">${n.source || 'Новость'} · ${date}</div>
        <h3>${n.title}</h3>
        <p>${n.text || ''}</p>
        <a class="card-link" href="${link}" target="_blank" rel="noreferrer">Читать →</a>
      </article>`;
    }).join('');
  } catch (e) {
    $('news-list').innerHTML = '<p class="muted">Новости временно недоступны.</p>';
  }
}

function bind() {
  $('amount').addEventListener('input', () => {
    state.amount = Number($('amount').value || 0);
    renderConverter();
  });
  $('clear-amount').addEventListener('click', () => {
    $('amount').value = '';
    renderConverter();
  });
  $('from').addEventListener('change', () => {
    state.from = $('from').value;
    renderConverter();
    loadHistory();
  });
  $('to').addEventListener('change', () => {
    state.to = $('to').value;
    renderConverter();
    loadHistory();
  });
  $('swap').addEventListener('click', swapCurrencies);
  $('swap-top').addEventListener('click', swapCurrencies);
  $('convert').addEventListener('click', renderConverter);
  $('days').addEventListener('change', loadHistory);
  $('refresh').addEventListener('click', () => {
    $('rate-list').innerHTML = '<div class="skel wide"></div><div class="skel mid"></div><p>Обновление...</p>';
    loadRates();
    loadNews();
  });
  window.addEventListener('resize', () => loadHistory());
}

bind();
loadRates();
loadServices();
loadNews();
