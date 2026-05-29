const coins = [
  { symbol: "BTC", name: "Bitcoin", pair: "BTCUSDT", seed: 67420, accent: "#f7931a" },
  { symbol: "ETH", name: "Ethereum", pair: "ETHUSDT", seed: 3520, accent: "#8b8cff" },
  { symbol: "TON", name: "Toncoin", pair: "TONUSDT", seed: 6.42, accent: "#39a7ff" },
  { symbol: "SOL", name: "Solana", pair: "SOLUSDT", seed: 162, accent: "#14f195" },
  { symbol: "BNB", name: "BNB", pair: "BNBUSDT", seed: 598, accent: "#f3ba2f" },
  { symbol: "XRP", name: "XRP", pair: "XRPUSDT", seed: 0.62, accent: "#d4e4ff" },
  { symbol: "DOGE", name: "Dogecoin", pair: "DOGEUSDT", seed: 0.15, accent: "#c2a633" },
  { symbol: "ADA", name: "Cardano", pair: "ADAUSDT", seed: 0.48, accent: "#5b8cff" },
];

const state = {
  selected: "BTC",
  side: "buy",
  cash: 100000,
  holdings: {},
  trades: [],
  equity: [],
  live: false,
  market: {},
  timers: {},
};

const els = {};

function init() {
  cacheElements();
  loadDemoState();
  initializeMarkets();
  setConnectionMode(false);
  renderShell();
  attachEvents();
  seedHistory();
  connectRealtime();
  setInterval(updateSyntheticPrices, 1800);
  setInterval(refreshDynamicPanels, 1200);
  window.addEventListener("resize", drawAllCharts);
}

function cacheElements() {
  [
    "connectionStatus",
    "tickerStrip",
    "marketRows",
    "focusBadge",
    "focusName",
    "focusSymbol",
    "focusPrice",
    "focusChange",
    "focusVolume",
    "focusChart",
    "focusTrade",
    "tradeBadge",
    "tradePair",
    "tradeName",
    "tradePrice",
    "tradeChange",
    "tradeHigh",
    "tradeLow",
    "mainChart",
    "orderbook",
    "tradeTape",
    "orderPrice",
    "orderAmount",
    "orderTotal",
    "submitOrder",
    "cashBalance",
    "assetBalanceLabel",
    "assetBalance",
    "sidebarBalance",
    "sidebarPnl",
    "portfolioTotal",
    "equityChart",
    "holdingsRows",
    "historyRows",
    "clearHistory",
    "resetDemo",
  ].forEach((id) => {
    els[id] = document.getElementById(id);
  });
}

function loadDemoState() {
  try {
    const saved = JSON.parse(localStorage.getItem("novax-demo") || "{}");
    state.cash = Number.isFinite(saved.cash) ? saved.cash : state.cash;
    state.holdings = saved.holdings || {};
    state.trades = Array.isArray(saved.trades) ? saved.trades : [];
    state.equity = Array.isArray(saved.equity) ? saved.equity : [];
  } catch {
    saveDemoState();
  }
}

function saveDemoState() {
  localStorage.setItem(
    "novax-demo",
    JSON.stringify({
      cash: state.cash,
      holdings: state.holdings,
      trades: state.trades,
      equity: state.equity.slice(-160),
    }),
  );
}

function initializeMarkets() {
  coins.forEach((coin, index) => {
    const history = Array.from({ length: 120 }, (_, point) => {
      const wave = Math.sin((point + index * 7) / 9) * 0.012;
      const drift = (point - 60) * 0.00025;
      const noise = Math.sin((point + 1) * (index + 2)) * 0.003;
      return coin.seed * (1 + wave + drift + noise);
    });

    const price = history.at(-1);
    state.market[coin.symbol] = {
      ...coin,
      price,
      open: history[0],
      high: Math.max(...history),
      low: Math.min(...history),
      change: ((price - history[0]) / history[0]) * 100,
      volume: price * (220000 + index * 83000),
      history,
      lastTick: Date.now(),
    };
  });
}

async function seedHistory() {
  await Promise.all(
    coins.map(async (coin) => {
      try {
        const response = await fetch(
          `https://api.binance.com/api/v3/klines?symbol=${coin.pair}&interval=1m&limit=120`,
          { cache: "no-store" },
        );
        if (!response.ok) return;
        const rows = await response.json();
        if (!Array.isArray(rows) || rows.length < 10) return;

        const values = rows.map((row) => Number(row[4])).filter(Number.isFinite);
        if (!values.length) return;

        const item = state.market[coin.symbol];
        item.history = values;
        item.price = values.at(-1);
        item.open = values[0];
        item.high = Math.max(...values);
        item.low = Math.min(...values);
        item.change = ((item.price - item.open) / item.open) * 100;
        item.volume = Number(rows.at(-1)?.[7]) || item.volume;
      } catch {
        setConnectionMode(false);
      }
    }),
  );
  renderShell();
}

function connectRealtime() {
  const streams = coins.map((coin) => `${coin.pair.toLowerCase()}@ticker`).join("/");
  let socket;

  try {
    socket = new WebSocket(`wss://stream.binance.com:9443/stream?streams=${streams}`);
  } catch {
    setConnectionMode(false);
    return;
  }

  socket.addEventListener("open", () => setConnectionMode(true));

  socket.addEventListener("message", (event) => {
    try {
      const payload = JSON.parse(event.data);
      const data = payload.data || payload;
      const coin = coins.find((item) => item.pair === data.s);
      if (!coin) return;

      updateMarket(coin.symbol, {
        price: Number(data.c),
        open: Number(data.o),
        high: Number(data.h),
        low: Number(data.l),
        change: Number(data.P),
        volume: Number(data.q),
      });
      setConnectionMode(true);
    } catch {
      setConnectionMode(false);
    }
  });

  socket.addEventListener("close", () => {
    setConnectionMode(false);
    clearTimeout(state.timers.reconnect);
    state.timers.reconnect = setTimeout(connectRealtime, 3500);
  });

  socket.addEventListener("error", () => setConnectionMode(false));
}

function updateMarket(symbol, patch) {
  const item = state.market[symbol];
  if (!item || !Number.isFinite(patch.price)) return;

  item.price = patch.price;
  item.open = Number.isFinite(patch.open) ? patch.open : item.open;
  item.high = Number.isFinite(patch.high) ? patch.high : Math.max(item.high, patch.price);
  item.low = Number.isFinite(patch.low) ? patch.low : Math.min(item.low, patch.price);
  item.change = Number.isFinite(patch.change)
    ? patch.change
    : ((patch.price - item.open) / item.open) * 100;
  item.volume = Number.isFinite(patch.volume) ? patch.volume : item.volume;
  item.lastTick = Date.now();

  pushHistory(item, patch.price);
  renderShell();
}

function pushHistory(item, price) {
  const previous = item.history.at(-1);
  if (Math.abs((price - previous) / previous) < 0.00001) return;
  item.history.push(price);
  item.history = item.history.slice(-160);
}

function updateSyntheticPrices() {
  coins.forEach((coin, index) => {
    const item = state.market[coin.symbol];
    if (state.live && Date.now() - item.lastTick < 6500) return;

    const pulse = Math.sin(Date.now() / (12000 + index * 1000) + index) * 0.0016;
    const randomWalk = (Math.random() - 0.5) * 0.004;
    const next = Math.max(item.price * (1 + pulse + randomWalk), coin.seed * 0.15);
    const open = item.open || item.history[0];

    updateMarket(coin.symbol, {
      price: next,
      open,
      high: Math.max(item.high, next),
      low: Math.min(item.low, next),
      change: ((next - open) / open) * 100,
      volume: item.volume * (1 + (Math.random() - 0.48) * 0.02),
    });
  });

  if (!state.live) setConnectionMode(false);
}

function setConnectionMode(isLive) {
  state.live = isLive;
  els.connectionStatus.classList.toggle("live", isLive);
  els.connectionStatus.classList.toggle("demo", !isLive);
  els.connectionStatus.querySelector("span:last-child").textContent = isLive ? "Live Binance" : "Demo stream";
}

function renderShell() {
  renderTickerStrip();
  renderMarketRows();
  renderSelectedPanels();
  renderPortfolio();
  renderHistory();
  drawAllCharts();
}

function renderTickerStrip() {
  els.tickerStrip.innerHTML = coins
    .map((coin) => {
      const item = state.market[coin.symbol];
      return `
        <article class="ticker-card">
          <button type="button" data-select="${coin.symbol}" title="${coin.name}">
            <span class="ticker-top">
              <strong>${coin.symbol}</strong>
              <span class="${item.change >= 0 ? "positive" : "negative"}">${formatPercent(item.change)}</span>
            </span>
            <span>${formatMoney(item.price)}</span>
          </button>
        </article>
      `;
    })
    .join("");
}

function renderMarketRows() {
  els.marketRows.innerHTML = coins
    .map((coin) => {
      const item = state.market[coin.symbol];
      return `
        <tr data-select="${coin.symbol}" class="${state.selected === coin.symbol ? "selected" : ""}">
          <td>
            <div class="table-asset">
              <span class="coin-badge" style="background:${coinGradient(coin)}">${coin.symbol}</span>
              <span><strong>${coin.name}</strong><small>${coin.symbol}/USDT</small></span>
            </div>
          </td>
          <td><strong>${formatMoney(item.price)}</strong></td>
          <td class="${item.change >= 0 ? "positive" : "negative"}">${formatPercent(item.change)}</td>
          <td><canvas class="sparkline" data-spark="${coin.symbol}" width="112" height="40"></canvas></td>
          <td><button class="row-button" type="button" data-trade="${coin.symbol}">Trade</button></td>
        </tr>
      `;
    })
    .join("");
}

function renderSelectedPanels() {
  const item = currentMarket();
  const assetBalance = state.holdings[item.symbol] || 0;

  els.focusBadge.textContent = item.symbol;
  els.focusBadge.style.background = coinGradient(item);
  els.focusName.textContent = item.name;
  els.focusSymbol.textContent = `${item.symbol}/USDT`;
  els.focusPrice.textContent = formatMoney(item.price);
  els.focusChange.textContent = formatPercent(item.change);
  els.focusChange.className = item.change >= 0 ? "positive" : "negative";
  els.focusVolume.textContent = formatCompact(item.volume);

  els.tradeBadge.textContent = item.symbol;
  els.tradeBadge.style.background = coinGradient(item);
  els.tradePair.textContent = `${item.symbol}/USDT`;
  els.tradeName.textContent = item.name;
  els.tradePrice.textContent = formatMoney(item.price);
  els.tradeChange.textContent = formatPercent(item.change);
  els.tradeChange.className = item.change >= 0 ? "positive" : "negative";
  els.tradeHigh.textContent = formatMoney(item.high);
  els.tradeLow.textContent = formatMoney(item.low);

  if (document.activeElement !== els.orderPrice && els.orderPrice.dataset.manual !== "true") {
    els.orderPrice.value = priceInputValue(item.price);
  }

  els.assetBalanceLabel.textContent = item.symbol;
  els.assetBalance.textContent = assetBalance.toFixed(6);
  els.cashBalance.textContent = formatMoney(state.cash);
  updateOrderTotal();
  renderOrderbook();
  renderTape();
}

function renderOrderbook() {
  const item = currentMarket();
  const asks = Array.from({ length: 8 }, (_, index) => {
    const price = item.price * (1 + (index + 1) * 0.0009);
    const amount = 0.15 + Math.random() * (index + 1) * 0.18;
    return { side: "ask", price, amount };
  }).reverse();
  const bids = Array.from({ length: 8 }, (_, index) => {
    const price = item.price * (1 - (index + 1) * 0.0009);
    const amount = 0.18 + Math.random() * (index + 1) * 0.2;
    return { side: "bid", price, amount };
  });

  els.orderbook.innerHTML = [...asks, ...bids]
    .map((row, index) => {
      const depth = Math.min(92, 18 + row.amount * 13 + index * 1.5);
      return `
        <div class="order-row ${row.side}" style="--depth:${depth}%">
          <span class="${row.side === "ask" ? "negative" : "positive"}">${formatOrderPrice(row.price)}</span>
          <span>${row.amount.toFixed(4)}</span>
        </div>
      `;
    })
    .join("");
}

function renderTape() {
  const item = currentMarket();
  els.tradeTape.innerHTML = Array.from({ length: 9 }, (_, index) => {
    const isBuy = Math.random() > 0.48;
    const price = item.price * (1 + (Math.random() - 0.5) * 0.002);
    const amount = Math.random() * 2.4 + 0.02;
    return `
      <div class="tape-row">
        <span class="${isBuy ? "positive" : "negative"}">${isBuy ? "Buy" : "Sell"}</span>
        <span>${formatOrderPrice(price)}</span>
        <span>${amount.toFixed(4)}</span>
      </div>
    `;
  }).join("");
}

function renderPortfolio() {
  const total = portfolioValue();
  const pnl = ((total - 100000) / 100000) * 100;
  state.equity.push(total);
  state.equity = state.equity.slice(-160);

  els.sidebarBalance.textContent = formatMoney(total);
  els.sidebarPnl.textContent = `P&L ${formatPercent(pnl)}`;
  els.sidebarPnl.className = pnl >= 0 ? "positive" : "negative";
  els.portfolioTotal.textContent = formatMoney(total);

  const rows = [
    { symbol: "USDT", name: "Tether", balance: state.cash, value: state.cash },
    ...coins.map((coin) => {
      const balance = state.holdings[coin.symbol] || 0;
      const value = balance * state.market[coin.symbol].price;
      return { ...coin, balance, value };
    }),
  ].filter((item) => item.value > 0.01 || item.symbol === "USDT");

  els.holdingsRows.innerHTML = rows
    .map((row) => {
      const share = total ? (row.value / total) * 100 : 0;
      return `
        <tr>
          <td>
            <div class="table-asset">
              <span class="coin-badge" style="background:${row.symbol === "USDT" ? "linear-gradient(135deg,#26a17b,#55eadf)" : coinGradient(row)}">${row.symbol}</span>
              <span><strong>${row.name || row.symbol}</strong><small>${row.symbol === "USDT" ? "Cash" : `${row.symbol}/USDT`}</small></span>
            </div>
          </td>
          <td>${row.symbol === "USDT" ? formatMoney(row.balance) : row.balance.toFixed(6)}</td>
          <td><strong>${formatMoney(row.value)}</strong></td>
          <td>
            <div class="allocation">
              <span>${share.toFixed(2)}%</span>
              <div class="allocation-bar"><span style="--share:${Math.min(100, share)}%"></span></div>
            </div>
          </td>
        </tr>
      `;
    })
    .join("");
}

function renderHistory() {
  if (!state.trades.length) {
    els.historyRows.innerHTML = `<tr><td colspan="6"><div class="empty-state">Сделок пока нет</div></td></tr>`;
    return;
  }

  els.historyRows.innerHTML = state.trades
    .slice(0, 80)
    .map(
      (trade) => `
        <tr data-select="${trade.symbol}">
          <td>${new Date(trade.time).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit" })}</td>
          <td>${trade.symbol}/USDT</td>
          <td class="${trade.side === "buy" ? "positive" : "negative"}">${trade.side === "buy" ? "Buy" : "Sell"}</td>
          <td>${formatMoney(trade.price)}</td>
          <td>${trade.amount.toFixed(6)}</td>
          <td>${formatMoney(trade.total)}</td>
        </tr>
      `,
    )
    .join("");
}

function attachEvents() {
  document.querySelectorAll("[data-view]").forEach((button) => {
    button.addEventListener("click", () => showView(button.dataset.view));
  });

  document.body.addEventListener("click", (event) => {
    const selectTarget = event.target.closest("[data-select]");
    if (selectTarget) {
      selectCoin(selectTarget.dataset.select);
    }

    const tradeTarget = event.target.closest("[data-trade]");
    if (tradeTarget) {
      selectCoin(tradeTarget.dataset.trade);
      showView("trade");
    }

    const pctTarget = event.target.closest("[data-pct]");
    if (pctTarget) setQuickAmount(Number(pctTarget.dataset.pct));
  });

  els.focusTrade.addEventListener("click", () => showView("trade"));
  els.orderPrice.addEventListener("input", () => {
    els.orderPrice.dataset.manual = "true";
    updateOrderTotal();
  });
  els.orderAmount.addEventListener("input", updateOrderTotal);
  els.submitOrder.addEventListener("click", submitOrder);
  els.clearHistory.addEventListener("click", clearHistory);
  els.resetDemo.addEventListener("click", resetDemo);

  document.querySelectorAll("[data-side]").forEach((button) => {
    button.addEventListener("click", () => {
      state.side = button.dataset.side;
      document.querySelectorAll("[data-side]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      updateOrderTotal();
    });
  });
}

function showView(view) {
  document.querySelectorAll(".view").forEach((panel) => panel.classList.remove("active"));
  document.getElementById(view).classList.add("active");
  document.querySelectorAll(".nav-item").forEach((button) => {
    button.classList.toggle("active", button.dataset.view === view);
  });
  requestAnimationFrame(drawAllCharts);
}

function selectCoin(symbol) {
  if (!state.market[symbol]) return;
  state.selected = symbol;
  els.orderPrice.dataset.manual = "false";
  renderShell();
}

function currentMarket() {
  return state.market[state.selected];
}

function updateOrderTotal() {
  const item = currentMarket();
  const price = Number(els.orderPrice.value) || item.price;
  const amount = Number(els.orderAmount.value) || 0;
  const total = price * amount;
  els.orderTotal.textContent = formatMoney(total);
  els.submitOrder.textContent = `${state.side === "buy" ? "Buy" : "Sell"} ${item.symbol}`;
  els.submitOrder.classList.toggle("sell-submit", state.side === "sell");
}

function setQuickAmount(percent) {
  const item = currentMarket();
  const price = Number(els.orderPrice.value) || item.price;
  const pct = percent / 100;

  if (state.side === "buy") {
    els.orderAmount.value = ((state.cash * pct) / price).toFixed(6);
  } else {
    els.orderAmount.value = ((state.holdings[item.symbol] || 0) * pct).toFixed(6);
  }

  updateOrderTotal();
}

function submitOrder() {
  const item = currentMarket();
  const price = Math.max(Number(els.orderPrice.value) || item.price, 0);
  const amount = Math.max(Number(els.orderAmount.value) || 0, 0);
  const total = price * amount;

  if (!amount || !total) {
    pulseTicket();
    return;
  }

  if (state.side === "buy" && total > state.cash + 0.000001) {
    pulseTicket();
    return;
  }

  if (state.side === "sell" && amount > (state.holdings[item.symbol] || 0) + 0.000001) {
    pulseTicket();
    return;
  }

  if (state.side === "buy") {
    state.cash -= total;
    state.holdings[item.symbol] = (state.holdings[item.symbol] || 0) + amount;
  } else {
    state.cash += total;
    state.holdings[item.symbol] = Math.max((state.holdings[item.symbol] || 0) - amount, 0);
  }

  state.trades.unshift({
    id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
    time: Date.now(),
    symbol: item.symbol,
    side: state.side,
    price,
    amount,
    total,
  });

  els.orderAmount.value = "";
  saveDemoState();
  renderShell();
}

function pulseTicket() {
  els.submitOrder.animate(
    [
      { transform: "translateX(0)" },
      { transform: "translateX(-5px)" },
      { transform: "translateX(5px)" },
      { transform: "translateX(0)" },
    ],
    { duration: 220 },
  );
}

function clearHistory() {
  state.trades = [];
  saveDemoState();
  renderHistory();
}

function resetDemo() {
  state.cash = 100000;
  state.holdings = {};
  state.trades = [];
  state.equity = [];
  els.orderAmount.value = "";
  saveDemoState();
  renderShell();
}

function refreshDynamicPanels() {
  renderOrderbook();
  renderTape();
  renderPortfolio();
  drawAllCharts();
  saveDemoState();
}

function portfolioValue() {
  return coins.reduce((sum, coin) => {
    return sum + (state.holdings[coin.symbol] || 0) * state.market[coin.symbol].price;
  }, state.cash);
}

function drawAllCharts() {
  drawLineChart(els.focusChart, currentMarket().history, currentMarket().change >= 0);
  drawLineChart(els.mainChart, currentMarket().history, currentMarket().change >= 0, true);
  drawLineChart(els.equityChart, state.equity.length > 1 ? state.equity : [100000, portfolioValue()], portfolioValue() >= 100000, true);
  document.querySelectorAll("[data-spark]").forEach((canvas) => {
    const item = state.market[canvas.dataset.spark];
    drawLineChart(canvas, item.history, item.change >= 0);
  });
}

function drawLineChart(canvas, values, positive = true, grid = false) {
  if (!canvas || !values.length) return;

  if (!canvas.dataset.baseHeight) {
    canvas.dataset.baseHeight = canvas.getAttribute("height") || "120";
  }

  const rect = canvas.getBoundingClientRect();
  const dpr = window.devicePixelRatio || 1;
  const styleHeight = Number.parseFloat(getComputedStyle(canvas).height);
  const baseHeight = Number(canvas.dataset.baseHeight) || 120;
  const width = Math.max(rect.width, 80);
  const height = Math.max(36, Math.min(styleHeight || baseHeight, 480));
  canvas.style.height = `${height}px`;
  canvas.width = Math.round(width * dpr);
  canvas.height = Math.round(height * dpr);

  const ctx = canvas.getContext("2d");
  ctx.scale(dpr, dpr);
  ctx.clearRect(0, 0, width, height);

  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const pad = grid ? 24 : 4;
  const chartW = width - pad * 2;
  const chartH = height - pad * 2;

  if (grid) {
    ctx.strokeStyle = "rgba(255,255,255,0.075)";
    ctx.lineWidth = 1;
    for (let i = 0; i < 5; i += 1) {
      const y = pad + (chartH / 4) * i;
      ctx.beginPath();
      ctx.moveTo(pad, y);
      ctx.lineTo(width - pad, y);
      ctx.stroke();
    }
  }

  const points = values.map((value, index) => ({
    x: pad + (chartW * index) / Math.max(values.length - 1, 1),
    y: pad + chartH - ((value - min) / range) * chartH,
  }));

  const gradient = ctx.createLinearGradient(0, pad, 0, height - pad);
  gradient.addColorStop(0, positive ? "rgba(95,240,160,0.32)" : "rgba(255,93,114,0.32)");
  gradient.addColorStop(1, "rgba(146,92,255,0)");

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.lineTo(width - pad, height - pad);
  ctx.lineTo(pad, height - pad);
  ctx.closePath();
  ctx.fillStyle = gradient;
  ctx.fill();

  ctx.beginPath();
  points.forEach((point, index) => {
    if (index === 0) ctx.moveTo(point.x, point.y);
    else ctx.lineTo(point.x, point.y);
  });
  ctx.strokeStyle = positive ? "#5ff0a0" : "#ff5d72";
  ctx.lineWidth = grid ? 2.4 : 1.8;
  ctx.lineJoin = "round";
  ctx.lineCap = "round";
  ctx.stroke();

  const last = points.at(-1);
  if (last && grid) {
    ctx.beginPath();
    ctx.arc(last.x, last.y, 4.5, 0, Math.PI * 2);
    ctx.fillStyle = "#ffffff";
    ctx.fill();
  }
}

function coinGradient(coin) {
  return `linear-gradient(135deg, ${coin.accent || "#ff4ecd"}, #925cff)`;
}

function formatMoney(value) {
  const decimals = Math.abs(value) >= 100 ? 2 : Math.abs(value) >= 1 ? 3 : 5;
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  }).format(value || 0);
}

function formatOrderPrice(value) {
  return (value || 0).toLocaleString("en-US", {
    minimumFractionDigits: value >= 100 ? 2 : value >= 1 ? 4 : 5,
    maximumFractionDigits: value >= 100 ? 2 : value >= 1 ? 4 : 5,
  });
}

function priceInputValue(value) {
  return value >= 100 ? value.toFixed(2) : value >= 1 ? value.toFixed(4) : value.toFixed(5);
}

function formatPercent(value) {
  const sign = value > 0 ? "+" : "";
  return `${sign}${(value || 0).toFixed(2)}%`;
}

function formatCompact(value) {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD",
    notation: "compact",
    maximumFractionDigits: 2,
  }).format(value || 0);
}

document.addEventListener("DOMContentLoaded", init);
