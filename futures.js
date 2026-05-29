(function () {
  const originalCacheElements = cacheElements;
  const originalAttachEvents = attachEvents;
  const originalRenderShell = renderShell;
  const originalResetDemo = resetDemo;
  const originalResetPortfolio = resetPortfolio;
  const originalRefreshDynamicPanels = refreshDynamicPanels;

  function ensureFuturesState() {
    state.mode = state.mode === "futures" ? "futures" : "spot";
    state.futuresLeverage = clampLeverage(state.futuresLeverage || 5);
    state.positions = Array.isArray(state.positions) ? state.positions : [];
  }

  cacheElements = function () {
    originalCacheElements();
    [
      "futuresControls",
      "futuresSummary",
      "futuresMargin",
      "futuresLiquidation",
      "leverageInput",
      "leverageValue",
      "futuresRows",
      "futuresPositionsPanel",
    ].forEach((id) => {
      els[id] = document.getElementById(id);
    });
  };

  loadDemoState = function () {
    try {
      const saved = JSON.parse(localStorage.getItem("novax-demo") || "{}");
      state.mode = saved.mode === "futures" ? "futures" : "spot";
      state.futuresLeverage = clampLeverage(saved.futuresLeverage || 5);
      state.cash = Number.isFinite(saved.cash) ? saved.cash : state.cash;
      state.holdings = saved.holdings || {};
      state.positions = Array.isArray(saved.positions) ? saved.positions : [];
      state.trades = Array.isArray(saved.trades) ? saved.trades : [];
      state.equity = Array.isArray(saved.equity) ? saved.equity : [];
      state.admin = {
        ...state.admin,
        ...(saved.admin || {}),
        markets: saved.admin?.markets || {},
      };
    } catch {
      saveDemoState();
    }
  };

  saveDemoState = function () {
    ensureFuturesState();
    localStorage.setItem(
      "novax-demo",
      JSON.stringify({
        cash: state.cash,
        mode: state.mode,
        futuresLeverage: state.futuresLeverage,
        holdings: state.holdings,
        positions: state.positions,
        trades: state.trades,
        equity: state.equity.slice(-160),
        admin: state.admin,
      }),
    );
  };

  attachEvents = function () {
    originalAttachEvents();

    els.leverageInput?.addEventListener("input", () => {
      state.futuresLeverage = clampLeverage(els.leverageInput.value);
      updateOrderTotal();
      renderFuturesPositions();
      saveDemoState();
    });

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.mode = button.dataset.mode;
        els.orderAmount.value = "";
        updateOrderTotal();
        renderShell();
        saveDemoState();
      });
    });

    document.body.addEventListener("click", (event) => {
      const closeTarget = event.target.closest("[data-close-position]");
      if (closeTarget) closeFuturesPosition(closeTarget.dataset.closePosition);
    });
  };

  renderShell = function () {
    ensureFuturesState();
    originalRenderShell();
    renderFuturesPositions();
  };

  renderSelectedPanels = function () {
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

    els.futuresControls.hidden = state.mode !== "futures";
    els.futuresSummary.hidden = state.mode !== "futures";
    els.futuresPositionsPanel.hidden = state.mode !== "futures" && !state.positions.length;
    els.leverageInput.value = state.futuresLeverage;
    els.leverageValue.textContent = `${state.futuresLeverage}x`;

    document.querySelectorAll("[data-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.mode === state.mode);
    });
    document.querySelectorAll("[data-side]").forEach((button) => {
      button.textContent = state.mode === "futures"
        ? (button.dataset.side === "buy" ? "Long" : "Short")
        : (button.dataset.side === "buy" ? "Buy" : "Sell");
    });

    els.assetBalanceLabel.textContent = item.symbol;
    els.assetBalance.textContent = assetBalance.toFixed(6);
    els.cashBalance.textContent = formatMoney(state.cash);
    updateOrderTotal();
    renderOrderbook();
    renderTape();
  };

  updateOrderTotal = function () {
    const item = currentMarket();
    const price = Number(els.orderPrice.value) || item.price;
    const amount = Number(els.orderAmount.value) || 0;
    const total = price * amount;
    const fee = total * (state.admin.feeRate / 100);
    const margin = state.mode === "futures" ? total / state.futuresLeverage : 0;
    const liquidation = estimateLiquidationPrice(price, state.side, state.futuresLeverage);

    els.orderTotal.textContent = state.mode === "futures" ? formatMoney(margin + fee) : formatMoney(total + fee);
    els.futuresMargin.textContent = formatMoney(margin);
    els.futuresLiquidation.textContent = amount ? formatMoney(liquidation) : "-";
    els.submitOrder.textContent = state.admin.tradingEnabled
      ? `${orderSideLabel()} ${item.symbol}`
      : "Trading disabled";
    els.submitOrder.disabled = !state.admin.tradingEnabled;
    els.submitOrder.classList.toggle("sell-submit", state.side === "sell");
  };

  setQuickAmount = function (percent) {
    const item = currentMarket();
    const price = Number(els.orderPrice.value) || item.price;
    const pct = percent / 100;

    if (state.mode === "futures") {
      els.orderAmount.value = (((state.cash * pct) * state.futuresLeverage) / price).toFixed(6);
    } else if (state.side === "buy") {
      els.orderAmount.value = ((state.cash * pct) / price).toFixed(6);
    } else {
      els.orderAmount.value = ((state.holdings[item.symbol] || 0) * pct).toFixed(6);
    }

    updateOrderTotal();
  };

  submitOrder = function () {
    if (state.mode === "futures") {
      submitFuturesOrder();
      return;
    }

    const item = currentMarket();
    const price = Math.max(Number(els.orderPrice.value) || item.price, 0);
    const amount = Math.max(Number(els.orderAmount.value) || 0, 0);
    const total = price * amount;
    const fee = total * (state.admin.feeRate / 100);
    const totalWithFee = total + fee;

    if (!state.admin.tradingEnabled || !amount || !total) {
      pulseTicket();
      return;
    }

    if (state.side === "buy" && totalWithFee > state.cash + 0.000001) {
      pulseTicket();
      return;
    }

    if (state.side === "sell" && amount > (state.holdings[item.symbol] || 0) + 0.000001) {
      pulseTicket();
      return;
    }

    if (state.side === "buy") {
      state.cash -= totalWithFee;
      state.holdings[item.symbol] = (state.holdings[item.symbol] || 0) + amount;
    } else {
      state.cash += Math.max(total - fee, 0);
      state.holdings[item.symbol] = Math.max((state.holdings[item.symbol] || 0) - amount, 0);
    }

    state.trades.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      time: Date.now(),
      mode: "spot",
      symbol: item.symbol,
      side: state.side,
      price,
      amount,
      total,
      fee,
    });

    els.orderAmount.value = "";
    saveDemoState();
    renderShell();
  };

  renderPortfolio = function () {
    const total = portfolioValue();
    const pnl = ((total - 100000) / 100000) * 100;
    state.equity.push(total);
    state.equity = state.equity.slice(-160);

    els.sidebarBalance.textContent = formatMoney(total);
    els.sidebarPnl.textContent = `P&L ${formatPercent(pnl)}`;
    els.sidebarPnl.className = pnl >= 0 ? "positive" : "negative";
    els.portfolioTotal.textContent = formatMoney(total);

    const futuresValue = futuresEquityValue();
    const rows = [
      { symbol: "USDT", name: "Tether", balance: state.cash, value: state.cash },
      ...coins.map((coin) => {
        const balance = state.holdings[coin.symbol] || 0;
        const value = balance * state.market[coin.symbol].price;
        return { ...coin, balance, value };
      }),
      { symbol: "FUT", name: "Futures", balance: state.positions.length, value: futuresValue, synthetic: true },
    ].filter((item) => item.value > 0.01 || item.symbol === "USDT" || (item.synthetic && state.positions.length));

    els.holdingsRows.innerHTML = rows
      .map((row) => {
        const share = total ? (row.value / total) * 100 : 0;
        return `
          <tr>
            <td>
              <div class="table-asset">
                <span class="coin-badge" style="background:${row.symbol === "USDT" ? "linear-gradient(135deg,#26a17b,#55eadf)" : coinGradient(row)}">${row.symbol}</span>
                <span><strong>${row.name || row.symbol}</strong><small>${row.symbol === "USDT" ? "Cash" : row.synthetic ? "Margin + PnL" : `${row.symbol}/USDT`}</small></span>
              </div>
            </td>
            <td>${row.symbol === "USDT" ? formatMoney(row.balance) : row.synthetic ? `${row.balance} поз.` : row.balance.toFixed(6)}</td>
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
  };

  renderHistory = function () {
    if (!state.trades.length) {
      els.historyRows.innerHTML = `<tr><td colspan="7"><div class="empty-state">Сделок пока нет</div></td></tr>`;
      return;
    }

    els.historyRows.innerHTML = state.trades
      .slice(0, 80)
      .map(
        (trade) => `
          <tr data-select="${trade.symbol}">
            <td>${new Date(trade.time).toLocaleString("ru-RU", { hour: "2-digit", minute: "2-digit", second: "2-digit", day: "2-digit", month: "2-digit" })}</td>
            <td>${trade.symbol}/USDT</td>
            <td>${trade.mode === "futures" ? "Futures" : "Spot"}</td>
            <td class="${["buy", "long", "close-short"].includes(trade.side) ? "positive" : "negative"}">${historySideLabel(trade)}</td>
            <td>${formatMoney(trade.price)}</td>
            <td>${trade.amount.toFixed(6)}</td>
            <td>${formatMoney(trade.total)}${Number.isFinite(trade.pnl) ? ` <span class="${trade.pnl >= 0 ? "positive" : "negative"}">/ ${formatMoney(trade.pnl)}</span>` : ""}</td>
          </tr>
        `,
      )
      .join("");
  };

  exportHistoryCsv = function () {
    const header = ["time", "symbol", "mode", "side", "price", "amount", "total", "fee", "pnl"];
    const rows = state.trades.map((trade) => [
      new Date(trade.time).toISOString(),
      `${trade.symbol}/USDT`,
      trade.mode || "spot",
      trade.side,
      trade.price,
      trade.amount,
      trade.total,
      trade.fee || 0,
      trade.pnl || 0,
    ]);
    const csv = [header, ...rows].map((row) => row.join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "flipchange-trades.csv";
    link.click();
    URL.revokeObjectURL(url);
  };

  resetDemo = function () {
    originalResetDemo();
    state.positions = [];
    state.mode = "spot";
    saveDemoState();
    renderShell();
  };

  resetPortfolio = function () {
    originalResetPortfolio();
    state.positions = [];
    saveDemoState();
    renderShell();
  };

  refreshDynamicPanels = function () {
    originalRefreshDynamicPanels();
    renderFuturesPositions();
  };

  updateMarket = (function (originalUpdateMarket) {
    return function (symbol, patch) {
      originalUpdateMarket(symbol, patch);
      processLiquidations(symbol);
    };
  })(updateMarket);

  portfolioValue = function () {
    const spotValue = coins.reduce((sum, coin) => {
      return sum + (state.holdings[coin.symbol] || 0) * state.market[coin.symbol].price;
    }, state.cash);
    return spotValue + futuresEquityValue();
  };

  window.renderFuturesPositions = function renderFuturesPositions() {
    if (!els.futuresRows) return;

    if (!state.positions.length) {
      els.futuresRows.innerHTML = `<tr><td colspan="8"><div class="empty-state">Открытых фьючерсных позиций нет</div></td></tr>`;
      return;
    }

    els.futuresRows.innerHTML = state.positions
      .map((position) => {
        const snapshot = futuresSnapshot(position);
        return `
          <tr data-select="${position.symbol}">
            <td>${position.symbol}/USDT</td>
            <td class="${position.side === "long" ? "positive" : "negative"}">${position.side === "long" ? "Long" : "Short"}</td>
            <td>${position.leverage}x</td>
            <td>${formatMoney(position.entryPrice)}</td>
            <td>${formatMoney(position.margin)}</td>
            <td class="${snapshot.pnl >= 0 ? "positive" : "negative"}">${formatMoney(snapshot.pnl)} (${formatPercent(snapshot.pnlPercent)})</td>
            <td>${formatMoney(snapshot.liquidation)}</td>
            <td><button class="row-button" type="button" data-close-position="${position.id}">Закрыть</button></td>
          </tr>
        `;
      })
      .join("");
  };

  window.submitFuturesOrder = function submitFuturesOrder() {
    const item = currentMarket();
    const price = Math.max(Number(els.orderPrice.value) || item.price, 0);
    const amount = Math.max(Number(els.orderAmount.value) || 0, 0);
    const notional = price * amount;
    const leverage = clampLeverage(state.futuresLeverage);
    const margin = notional / leverage;
    const fee = notional * (state.admin.feeRate / 100);

    if (!state.admin.tradingEnabled || !amount || !notional || margin + fee > state.cash + 0.000001) {
      pulseTicket();
      return;
    }

    const side = state.side === "buy" ? "long" : "short";
    const position = {
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      time: Date.now(),
      symbol: item.symbol,
      side,
      entryPrice: price,
      amount,
      notional,
      leverage,
      margin,
      fee,
    };

    state.cash -= margin + fee;
    state.positions.unshift(position);
    state.trades.unshift({
      id: position.id,
      time: position.time,
      mode: "futures",
      symbol: item.symbol,
      side,
      price,
      amount,
      total: notional,
      fee,
      leverage,
    });

    els.orderAmount.value = "";
    saveDemoState();
    renderShell();
  };

  window.closeFuturesPosition = function closeFuturesPosition(id) {
    const index = state.positions.findIndex((position) => position.id === id);
    if (index < 0) return;

    const position = state.positions[index];
    const snapshot = futuresSnapshot(position);
    const closeFee = snapshot.notional * (state.admin.feeRate / 100);
    const cashBack = Math.max(position.margin + snapshot.pnl - closeFee, 0);

    state.cash += cashBack;
    state.positions.splice(index, 1);
    state.trades.unshift({
      id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
      time: Date.now(),
      mode: "futures",
      symbol: position.symbol,
      side: position.side === "long" ? "close-long" : "close-short",
      price: snapshot.markPrice,
      amount: position.amount,
      total: snapshot.notional,
      fee: closeFee,
      leverage: position.leverage,
      pnl: snapshot.pnl - closeFee,
    });

    saveDemoState();
    renderShell();
  };

  window.processLiquidations = function processLiquidations(symbol) {
    const liquidated = [];
    state.positions = state.positions.filter((position) => {
      if (position.symbol !== symbol) return true;

      const snapshot = futuresSnapshot(position);
      const shouldLiquidate = position.side === "long"
        ? snapshot.markPrice <= snapshot.liquidation
        : snapshot.markPrice >= snapshot.liquidation;

      if (shouldLiquidate) liquidated.push({ position, snapshot });
      return !shouldLiquidate;
    });

    liquidated.forEach(({ position, snapshot }) => {
      state.trades.unshift({
        id: crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random()}`,
        time: Date.now(),
        mode: "futures",
        symbol: position.symbol,
        side: "liquidation",
        price: snapshot.markPrice,
        amount: position.amount,
        total: snapshot.notional,
        fee: 0,
        leverage: position.leverage,
        pnl: -position.margin,
      });
    });
  };

  window.futuresEquityValue = function futuresEquityValue() {
    return state.positions.reduce((sum, position) => {
      const snapshot = futuresSnapshot(position);
      return sum + position.margin + snapshot.pnl;
    }, 0);
  };

  window.futuresSnapshot = function futuresSnapshot(position) {
    const markPrice = state.market[position.symbol]?.price || position.entryPrice;
    const direction = position.side === "long" ? 1 : -1;
    const pnl = (markPrice - position.entryPrice) * position.amount * direction;
    const pnlPercent = position.margin ? (pnl / position.margin) * 100 : 0;
    return {
      markPrice,
      notional: markPrice * position.amount,
      pnl,
      pnlPercent,
      liquidation: estimateLiquidationPrice(position.entryPrice, position.side === "long" ? "buy" : "sell", position.leverage),
    };
  };

  window.estimateLiquidationPrice = function estimateLiquidationPrice(entryPrice, side, leverage) {
    const maintenance = 0.006;
    const buffer = (1 / clampLeverage(leverage)) - maintenance;
    const move = Math.max(0.004, buffer);
    return side === "buy" ? entryPrice * (1 - move) : entryPrice * (1 + move);
  };

  window.clampLeverage = function clampLeverage(value) {
    return Math.min(50, Math.max(1, Math.round(Number(value) || 5)));
  };

  window.orderSideLabel = function orderSideLabel() {
    if (state.mode === "futures") return state.side === "buy" ? "Long" : "Short";
    return state.side === "buy" ? "Buy" : "Sell";
  };

  window.historySideLabel = function historySideLabel(trade) {
    const labels = {
      buy: "Buy",
      sell: "Sell",
      long: `Long ${trade.leverage || ""}x`,
      short: `Short ${trade.leverage || ""}x`,
      "close-long": "Close Long",
      "close-short": "Close Short",
      liquidation: "Liquidation",
    };
    return labels[trade.side] || trade.side;
  };
})();