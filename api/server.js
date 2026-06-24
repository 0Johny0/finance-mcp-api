const express = require("express");
const { Client } = require("@modelcontextprotocol/sdk/client/index.js");
const { StdioClientTransport } = require("@modelcontextprotocol/sdk/client/stdio.js");
const { spawn } = require("child_process");

const app = express();
app.use(express.json());

let mcpClient = null;
let initPromise = null;

// ============================================================
// 启动 MCP 子进程并建立连接
// ============================================================
function initMCP() {
  if (initPromise) return initPromise;

  initPromise = (async () => {
    const financeProcess = spawn(
      "node",
      ["/app/finance-mcp/build/index.js"],
      {
        env: {
          ...process.env,
          TUSHARE_TOKEN: process.env.TUSHARE_TOKEN || "",
        },
        stdio: ["pipe", "pipe", "pipe"],
      }
    );

    financeProcess.stderr.on("data", (d) =>
      console.error("[FinanceMCP stderr]", d.toString())
    );

    const transport = new StdioClientTransport({
      stdin: financeProcess.stdin,
      stdout: financeProcess.stdout,
    });

    mcpClient = new Client({
      name: "finance-api-wrapper",
      version: "1.0.0",
    });
    await mcpClient.connect(transport);

    const { tools } = await mcpClient.listTools();
    console.log(
      "✅ FinanceMCP 已连接，可用工具:",
      tools.map((t) => t.name).join(", ")
    );
  })();

  return initPromise;
}

// ============================================================
// 通用 MCP 调用封装
// ============================================================
async function callFinanceTool(toolName, args = {}) {
  await initMCP();
  const result = await mcpClient.callTool({
    name: toolName,
    arguments: args,
  });
  const text = result.content?.[0]?.text;
  try {
    return JSON.parse(text);
  } catch {
    return { raw: text };
  }
}

// ============================================================
// 日期工具（默认最近 60 天）
// ============================================================
function fmt(d) {
  return d.toISOString().slice(0, 10).replace(/-/g, "");
}
function defaultEnd() {
  return fmt(new Date());
}
function defaultStart() {
  const d = new Date();
  d.setDate(d.getDate() - 60);
  return fmt(d);
}

// ============================================================
// 路由
// ============================================================

// 健康检查
app.get("/health", async (_req, res) => {
  try {
    const ts = await callFinanceTool("current_timestamp");
    res.json({ status: "ok", timestamp: ts });
  } catch (e) {
    res.status(503).json({ status: "error", message: e.message });
  }
});

// 指数数据
// GET /api/index?code=DJI.GI&start_date=20260601&end_date=20260624
app.get("/api/index", async (req, res) => {
  try {
    const { code, start_date, end_date } = req.query;
    if (!code) return res.status(400).json({ error: "缺少 code 参数" });

    const data = await callFinanceTool("index_data", {
      code,
      start_date: start_date || defaultStart(),
      end_date: end_date || defaultEnd(),
    });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 股票/期货数据
// GET /api/stock?code=CL.NYM&market_type=futures&indicators=macd,rsi
app.get("/api/stock", async (req, res) => {
  try {
    const { code, start_date, end_date, market_type, indicators } = req.query;
    if (!code) return res.status(400).json({ error: "缺少 code 参数" });

    const args = {
      code,
      start_date: start_date || defaultStart(),
      end_date: end_date || defaultEnd(),
    };
    if (market_type) args.market_type = market_type;
    if (indicators) args.indicators = indicators;

    const data = await callFinanceTool("stock_data", args);
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// 聚合看板：道指 + 纳指 + WTI 一次返回
// GET /api/dashboard
app.get("/api/dashboard", async (_req, res) => {
  try {
    const start = defaultStart();
    const end = defaultEnd();

    const [dji, ixic, wti] = await Promise.all([
      callFinanceTool("index_data", {
        code: "DJI.GI",
        start_date: start,
        end_date: end,
      }),
      callFinanceTool("index_data", {
        code: "IXIC.GI",
        start_date: start,
        end_date: end,
      }),
      callFinanceTool("stock_data", {
        code: "CL.NYM",
        market_type: "futures",
        start_date: start,
        end_date: end,
      }),
    ]);

    res.json({
      timestamp: new Date().toISOString(),
      dowJones: dji,
      nasdaq: ixic,
      wtiCrude: wti,
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// ============================================================
// 启动服务
// ============================================================
const PORT = process.env.API_PORT || 3100;

initMCP()
  .then(() => {
    app.listen(PORT, "0.0.0.0", () => {
      console.log(`🚀 Finance REST API 已启动: http://0.0.0.0:${PORT}`);
      console.log("   GET /health        - 健康检查");
      console.log("   GET /api/index     - 指数数据");
      console.log("   GET /api/stock     - 股票/期货数据");
      console.log("   GET /api/dashboard - 聚合看板");
    });
  })
  .catch((err) => {
    console.error("❌ MCP 初始化失败:", err);
    process.exit(1);
  });
