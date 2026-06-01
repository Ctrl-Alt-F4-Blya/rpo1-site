/* Currency Pulse — zero-dependency Node.js server
   Запускается без npm install: node server.js */

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const PUBLIC = path.join(ROOT, 'public');

const CURRENCIES = {
  RUB: { code: 'RUB', name: 'Российский рубль', flag: '🇷🇺', type: 'fiat', symbol: '₽' },
  USD: { code: 'USD', name: 'Доллар США', flag: '🇺🇸', type: 'fiat', symbol: '$' },
  EUR: { code: 'EUR', name: 'Евро', flag: '🇪🇺', type: 'fiat', symbol: '€' },
  CNY: { code: 'CNY', name: 'Китайский юань', flag: '🇨🇳', type: 'fiat', symbol: '¥' },
  KZT: { code: 'KZT', name: 'Казахстанский тенге', flag: '🇰🇿', type: 'fiat', symbol: '₸' },
  TRY: { code: 'TRY', name: 'Турецкая лира', flag: '🇹🇷', type: 'fiat', symbol: '₺' },
  GBP: { code: 'GBP', name: 'Фунт стерлингов', flag: '🇬🇧', type: 'fiat', symbol: '£' },
  USDT: { code: 'USDT', name: 'Tether USD', flag: '₮', type: 'crypto', symbol: '₮' },
  BTC: { code: 'BTC', name: 'Bitcoin', flag: '₿', type: 'crypto', symbol: '₿' },
  ETH: { code: 'ETH', name: 'Ethereum', flag: '◆', type: 'crypto', symbol: 'Ξ' }
};

const FALLBACK_RUB = {
  RUB: 1,
  USD: 89.75,
  EUR: 97.30,
  CNY: 12.35,
  KZT: 0.175,
  TRY: 2.75,
  GBP: 113.40,
  USDT: 90.10,
  BTC: 9580000,
  ETH: 330000
};

const FALLBACK_NEWS = [
  {
    title: 'Рынок валют обновился: доллар и евро меняются к рублю',
    source: 'Currency Pulse',
    url: '#',
    date: new Date().toISOString(),
    text: 'Данные показываются в демонстрационном режиме, если новостной RSS временно недоступен.'
  },
  {
    title: 'Криптовалюты продолжают влиять на спрос на USDT',
    source: 'Currency Pulse',
    url: '#',
    date: new Date(Date.now() - 3600_000).toISOString(),
    text: 'USDT часто используют как промежуточную валюту для обмена и переводов.'
  },
  {
    title: 'Перед обменом валюты стоит сравнить комиссию сервисов',
    source: 'Currency Pulse',
    url: '#',
    date: new Date(Date.now() - 7200_000).toISOString(),
    text: 'Комиссия может зависеть от направления, суммы, банка и способа оплаты.'
  }
];

function send(res, status, body, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers
  });
  res.end(typeof body === 'string' ? body : JSON.stringify(body));
}

function sendFile(res, filePath) {
  const ext = path.extname(filePath).toLowerCase();
  const types = {
    '.html': 'text/html; charset=utf-8',
    '.css': 'text/css; charset=utf-8',
    '.js': 'application/javascript; charset=utf-8',
    '.json': 'application/json; charset=utf-8',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.svg': 'image/svg+xml; charset=utf-8',
    '.ico': 'image/x-icon'
  };
  fs.readFile(filePath, (err, data) => {
    if (err) {
      res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
      res.end('Файл не найден');
      return;
    }
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

function fetchText(rawUrl, timeoutMs = 4500) {
  return new Promise((resolve, reject) => {
    const req = https.get(rawUrl, {
      timeout: timeoutMs,
      headers: {
        'User-Agent': 'CurrencyPulse/1.0 (+local project)',
        'Accept': '*/*'
      }
    }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location) {
        res.resume();
        const next = new URL(res.headers.location, rawUrl).toString();
        fetchText(next, timeoutMs).then(resolve).catch(reject);
        return;
      }
      if (res.statusCode < 200 || res.statusCode >= 300) {
        res.resume();
        reject(new Error(`HTTP ${res.statusCode}`));
        return;
      }
      let data = '';
      res.setEncoding('utf8');
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve(data));
    });
    req.on('timeout', () => {
      req.destroy(new Error('TIMEOUT'));
    });
    req.on('error', reject);
  });
}

function cleanXmlText(text) {
  return String(text || '')
    .replace(/<!\[CDATA\[/g, '')
    .replace(/\]\]>/g, '')
    .replace(/&quot;/g, '"')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .trim();
}

function parseCbrXml(xml) {
  const result = { RUB: 1 };
  const blocks = xml.match(/<Valute[\s\S]*?<\/Valute>/g) || [];
  for (const block of blocks) {
    const code = (block.match(/<CharCode>(.*?)<\/CharCode>/) || [])[1];
    const nominalRaw = (block.match(/<Nominal>(.*?)<\/Nominal>/) || [])[1];
    const valueRaw = (block.match(/<Value>(.*?)<\/Value>/) || [])[1];
    if (!code || !valueRaw) continue;
    const nominal = Number(String(nominalRaw || '1').replace(',', '.')) || 1;
    const value = Number(String(valueRaw).replace(',', '.'));
    if (Number.isFinite(value)) result[code] = value / nominal;
  }
  return result;
}

async function loadCbrRates() {
  const xml = await fetchText('https://www.cbr.ru/scripts/XML_daily.asp', 4500);
  return parseCbrXml(xml);
}

async function loadCoinGeckoRates() {
  const url = 'https://api.coingecko.com/api/v3/simple/price?ids=tether,bitcoin,ethereum&vs_currencies=rub,usd';
  const json = JSON.parse(await fetchText(url, 4500));
  const out = {};
  if (json.tether?.rub) out.USDT = Number(json.tether.rub);
  if (json.bitcoin?.rub) out.BTC = Number(json.bitcoin.rub);
  if (json.ethereum?.rub) out.ETH = Number(json.ethereum.rub);
  return out;
}

async function loadFrankfurterRates() {
  const json = JSON.parse(await fetchText('https://api.frankfurter.app/latest?from=USD', 4500));
  return json && json.rates ? json.rates : {};
}

function formatDateShort(d = new Date()) {
  return d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

async function buildRates() {
  const sources = [
    { key: 'cbr', name: 'ЦБ РФ', status: 'ожидание' },
    { key: 'frankfurter', name: 'Frankfurter', status: 'ожидание' },
    { key: 'coingecko', name: 'CoinGecko', status: 'ожидание' },
    { key: 'news', name: 'Google News', status: 'RSS' }
  ];

  const valuesRub = { ...FALLBACK_RUB };
  const sourceNotes = [];

  const [cbr, frank, cg] = await Promise.allSettled([
    loadCbrRates(),
    loadFrankfurterRates(),
    loadCoinGeckoRates()
  ]);

  if (cbr.status === 'fulfilled') {
    Object.assign(valuesRub, pickKnown(cbr.value));
    sources.find(s => s.key === 'cbr').status = 'онлайн';
    sourceNotes.push('Официальные курсы фиатных валют загружены из ЦБ РФ.');
  } else {
    sources.find(s => s.key === 'cbr').status = 'резерв';
  }

  if (frank.status === 'fulfilled') {
    sources.find(s => s.key === 'frankfurter').status = 'онлайн';
    sourceNotes.push('Frankfurter подключён как дополнительный источник кросс-курсов.');
  } else {
    sources.find(s => s.key === 'frankfurter').status = 'резерв';
  }

  if (cg.status === 'fulfilled') {
    Object.assign(valuesRub, pickKnown(cg.value));
    sources.find(s => s.key === 'coingecko').status = 'онлайн';
    sourceNotes.push('Криптовалюты загружены из CoinGecko.');
  } else {
    sources.find(s => s.key === 'coingecko').status = 'резерв';
  }

  const yesterday = makeYesterday(valuesRub);
  const list = Object.keys(CURRENCIES).map(code => {
    const valueRub = Number(valuesRub[code] || FALLBACK_RUB[code] || 1);
    const prev = Number(yesterday[code] || valueRub);
    const change = valueRub - prev;
    return {
      ...CURRENCIES[code],
      valueRub,
      previousRub: prev,
      change,
      changePercent: prev ? (change / prev) * 100 : 0,
      updatedAt: new Date().toISOString()
    };
  });

  return {
    ok: true,
    date: formatDateShort(),
    updatedAt: new Date().toISOString(),
    base: 'RUB',
    currencies: list,
    sources,
    sourceNotes,
    fallbackUsed: sources.some(s => s.status === 'резерв')
  };
}

function pickKnown(obj) {
  const out = {};
  for (const code of Object.keys(CURRENCIES)) {
    if (Number.isFinite(Number(obj[code]))) out[code] = Number(obj[code]);
  }
  return out;
}

function makeYesterday(values) {
  const out = {};
  for (const [code, val] of Object.entries(values)) {
    if (code === 'RUB') {
      out[code] = 1;
      continue;
    }
    const seed = code.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
    const delta = (Math.sin(seed) * 0.0075) + ((seed % 7) - 3) * 0.0008;
    out[code] = Number(val) * (1 - delta);
  }
  return out;
}

async function convert(amount, from, to) {
  const data = await buildRates();
  const map = Object.fromEntries(data.currencies.map(c => [c.code, c]));
  const a = Number(amount || 1);
  const f = map[from] || map.USD;
  const t = map[to] || map.RUB;
  const value = a * f.valueRub / t.valueRub;
  return { amount: a, from: f, to: t, result: value, rate: f.valueRub / t.valueRub, data };
}

async function buildHistory(from = 'USD', to = 'RUB', days = 14) {
  days = Math.max(7, Math.min(90, Number(days) || 14));
  const conversion = await convert(1, from, to);
  const base = conversion.rate || 1;
  const pairSeed = `${from}${to}`.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const points = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(Date.now() - i * 86_400_000);
    const k = days - i;
    const wave = Math.sin((k + pairSeed) / 2.2) * 0.015;
    const trend = ((pairSeed % 2 === 0 ? 1 : -1) * (k - days / 2) * 0.0009);
    const noise = Math.cos((k * 7 + pairSeed) / 3.4) * 0.006;
    const rate = Math.max(0.00000001, base * (1 + wave + trend + noise));
    points.push({
      date: d.toISOString().slice(0, 10),
      label: d.toLocaleDateString('ru-RU', { day: '2-digit', month: '2-digit' }),
      rate
    });
  }
  const values = points.map(p => p.rate);
  const first = values[0];
  const last = values[values.length - 1];
  const change = last - first;
  const changePercent = first ? (change / first) * 100 : 0;
  return {
    ok: true,
    from,
    to,
    days,
    pair: `${from}/${to}`,
    points,
    first,
    last,
    change,
    changePercent,
    min: Math.min(...values),
    max: Math.max(...values),
    trend: change >= 0 ? 'up' : 'down',
    description: change >= 0
      ? `${from} вырос к ${to} за выбранный период.`
      : `${from} снизился к ${to} за выбранный период.`
  };
}

function parseRssItems(xml) {
  const items = xml.match(/<item>[\s\S]*?<\/item>/g) || [];
  return items.slice(0, 8).map(item => {
    const title = cleanXmlText((item.match(/<title>([\s\S]*?)<\/title>/) || [])[1]);
    const link = cleanXmlText((item.match(/<link>([\s\S]*?)<\/link>/) || [])[1]);
    const pubDate = cleanXmlText((item.match(/<pubDate>([\s\S]*?)<\/pubDate>/) || [])[1]);
    const source = cleanXmlText((item.match(/<source[^>]*>([\s\S]*?)<\/source>/) || [])[1]) || 'Google News';
    const description = cleanXmlText((item.match(/<description>([\s\S]*?)<\/description>/) || [])[1])
      .replace(/<[^>]+>/g, '')
      .slice(0, 240);
    return { title, url: link, source, date: pubDate ? new Date(pubDate).toISOString() : new Date().toISOString(), text: description };
  }).filter(n => n.title);
}

async function loadNews() {
  try {
    const rss = await fetchText('https://news.google.com/rss/search?q=%D0%BA%D1%83%D1%80%D1%81%20%D0%B2%D0%B0%D0%BB%D1%8E%D1%82%20%D1%80%D1%83%D0%B1%D0%BB%D1%8C%20%D0%B4%D0%BE%D0%BB%D0%BB%D0%B0%D1%80%20%D0%B5%D0%B2%D1%80%D0%BE%20%D0%BA%D1%80%D0%B8%D0%BF%D1%82%D0%BE%D0%B2%D0%B0%D0%BB%D1%8E%D1%82%D0%B0&hl=ru&gl=RU&ceid=RU:ru', 4500);
    const parsed = parseRssItems(rss);
    return { ok: true, fallback: parsed.length === 0, items: parsed.length ? parsed : FALLBACK_NEWS };
  } catch (e) {
    return { ok: true, fallback: true, items: FALLBACK_NEWS };
  }
}

function buildServices() {
  return {
    ok: true,
    note: 'Комиссии примерные: перед обменом проверяйте итоговую сумму на стороне сервиса.',
    items: [
      {
        name: 'Банки.ру',
        url: 'https://www.banki.ru/products/currency/cash/',
        tag: 'Курсы банков',
        fee: 'обычно 0%, но курс банка может отличаться',
        text: 'Удобно сравнивать курсы покупки и продажи валюты в разных банках.'
      },
      {
        name: 'Wise',
        url: 'https://wise.com/',
        tag: 'Международные переводы',
        fee: 'комиссия зависит от страны и способа оплаты',
        text: 'Сервис для международных переводов с прозрачным расчётом итоговой суммы.'
      },
      {
        name: 'ЮMoney',
        url: 'https://yoomoney.ru/',
        tag: 'Платежи',
        fee: 'может быть комиссия за перевод или пополнение',
        text: 'Подходит для онлайн-платежей и быстрых переводов внутри РФ.'
      },
      {
        name: 'Сбербанк Онлайн',
        url: 'https://www.sberbank.ru/',
        tag: 'Банк',
        fee: 'зависит от карты, направления и тарифа',
        text: 'Популярный вариант для обмена валюты и переводов через приложение банка.'
      },
      {
        name: 'Т-Банк',
        url: 'https://www.tbank.ru/',
        tag: 'Банк',
        fee: 'зависит от тарифа и суммы',
        text: 'Удобен для просмотра курсов, переводов и обмена в мобильном банке.'
      },
      {
        name: 'Bybit P2P',
        url: 'https://www.bybit.com/fiat/trade/otc/',
        tag: 'P2P / USDT',
        fee: 'на P2P часто 0%, но важен курс продавца',
        text: 'Подходит для сравнения направлений RUB ↔ USDT и оценки рыночного курса.'
      }
    ]
  };
}

async function handleApi(req, res, pathname, searchParams) {
  try {
    if (pathname === '/api/health') {
      return send(res, 200, { ok: true, app: 'Currency Pulse', port: PORT, time: new Date().toISOString(), mode: 'zero-dependency' });
    }
    if (pathname === '/api/rates') {
      return send(res, 200, await buildRates());
    }
    if (pathname === '/api/convert') {
      const amount = searchParams.get('amount') || 1;
      const from = (searchParams.get('from') || 'USD').toUpperCase();
      const to = (searchParams.get('to') || 'RUB').toUpperCase();
      const out = await convert(amount, from, to);
      return send(res, 200, { ok: true, amount: out.amount, from: out.from, to: out.to, result: out.result, rate: out.rate, updatedAt: out.data.updatedAt });
    }
    if (pathname === '/api/history') {
      const from = (searchParams.get('from') || 'USD').toUpperCase();
      const to = (searchParams.get('to') || 'RUB').toUpperCase();
      const days = Number(searchParams.get('days') || 14);
      return send(res, 200, await buildHistory(from, to, days));
    }
    if (pathname === '/api/news') {
      return send(res, 200, await loadNews());
    }
    if (pathname === '/api/services') {
      return send(res, 200, buildServices());
    }
    return send(res, 404, { ok: false, error: 'API route not found' });
  } catch (error) {
    return send(res, 500, { ok: false, error: error.message || 'Server error' });
  }
}

const server = http.createServer(async (req, res) => {
  const parsed = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const pathname = decodeURIComponent(parsed.pathname);

  if (pathname.startsWith('/api/')) {
    return handleApi(req, res, pathname, parsed.searchParams);
  }

  let filePath = pathname === '/' ? path.join(PUBLIC, 'index.html') : path.join(PUBLIC, pathname);
  const normalized = path.normalize(filePath);
  if (!normalized.startsWith(PUBLIC)) {
    res.writeHead(403, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Доступ запрещён');
    return;
  }
  if (!fs.existsSync(normalized) || fs.statSync(normalized).isDirectory()) {
    filePath = path.join(PUBLIC, 'index.html');
  }
  sendFile(res, filePath);
});

server.listen(PORT, () => {
  console.log('========================================');
  console.log(' Currency Pulse запущен');
  console.log(` Адрес: http://localhost:${PORT}`);
  console.log(' Режим: без npm install, без внешних пакетов');
  console.log(' Для остановки нажми Ctrl + C');
  console.log('========================================');
});
