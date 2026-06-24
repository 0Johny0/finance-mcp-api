const express = require("express");
const https = require("https");

const app = express();
app.use(express.json());

// ============================================================
// Yahoo Finance 数据获取
// ============================================================
const SYMBOLS = {
  dowJones: "^DJI",      // 道琼斯工业指数
  nasdaq: "^IXIC",       // 纳斯达克综合指数
  wtiCrude: "CL=F",      // WTI 原油期货
};

function fetchYahoo(symbol, range = "3mo", interval = "1d") {
  return new Promise((resolve, reject) => {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;

    https
      .get(url, { headers: { "User-Agent": "Mozilla/5.0" } }, (res) => {
        let data = "";
        res.on("data", (chunk) => (data += chunk));
        res.on("end", () => {
          try {
            const json = JSON.parse(data);
            const result = json.chart?.result?.[0];
            if (!result) return reject(new Error(`无数据: ${symbol}`));

            const meta = result.meta;
            const timestamps = result.timestamp || [];
            const quote = result.indicators?.quote?.[0] || {};

            // 组装日线数据
            const daily = timestamps
              .map((ts, i) => ({
                date: new Date(ts * 1000).toISOString().slice(0, 10),
                open: quote.open?.[i],
                high: quote.high?.[i],
                low: quote.low?.[i],
                close: quote.close?.[i],
                volume: quote.volume?.[i],
              }))
              .filter((d) => d.close != null);

            // 最新行情摘要
            const latest = daily[daily.length - 1];
            const prev = daily.length >= 2 ? daily[daily.length - 2] : null;
            const change = prev ? latest.close - prev.close : 0;
            const changePercent = prev ? (change / prev.close) * 100 : 0;

            resolve({
              symbol,
              name: meta.shortName || symbol,
              currency: meta.currency,
              latest: {
                date: latest.date,
                close: latest.close,
                open: latest.open,
                high: latest.high,
                low: latest.low,
                volume: latest.volume,
                change: Math.round(change * 100) / 100,
                changePercent: Math.round(changePercent * 100) / 100,
                isUp: change >= 0,
              },
              history: daily,
            });
          } catch (e) {
            reject(e);
          }
        });
      })
      .on("error", reject);
  });
}

// ============================================================
// 路由
// ============================================================

// 健康检查
app.get("/health", (_req, res) => {
  res.json({ status: "ok", timestamp: new Date().toISOString() });
});

// 聚合看板（WidgetKit 主要调这个）
// GET /api/dashboard?range=1mo
app.get("/api/dashboard", async (req, res) => {
  try {
    const range = req.query.range || "3mo";

    const [dji, ixic, wti] = await Promise.all([
      fetchYahoo(SYMBOLS.dowJones, range),
      fetchYahoo(SYMBOLS.nasdaq, range),
      fetchYahoo(SYMBOLS.wtiCrude, range),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      range,
      dowJones: dji,
      nasdaq: ixic,
      wtiCrude: wti,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 单品种查询
// GET /api/quote?symbol=^DJI&range=1mo
app.get("/api/quote", async (req, res) => {
  try {
    const { symbol, range } = req.query;
    if (!symbol) return res.status(400).json({ error: "缺少 symbol 参数" });

    const data = await fetchYahoo(symbol, range || "3mo");
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 启动
// ============================================================
const PORT = process.env.API_PORT || 3100;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Market API 已启动: http://0.0.0.0:${PORT}`);
  console.log("   GET /health        - 健康检查");
  console.log("   GET /api/dashboard  - 道指+纳指+WTI 聚合");
  console.log("   GET /api/quote?symbol=^DJI - 单品种查询");
});
