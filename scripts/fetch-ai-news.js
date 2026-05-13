const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const DATA_DIR = path.join(__dirname, "../data");
const HISTORY_DIR = path.join(DATA_DIR, "history");
const LATEST_PATH = path.join(DATA_DIR, "news.json");
const INDEX_PATH = path.join(DATA_DIR, "index.json");

const RSS_SOURCES = [
  "https://openai.com/news/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://www.adobe.com/newsroom.rss",
  "https://huggingface.co/blog/feed.xml"
];

const PRIORITY_TOOLS = [
  "evoto",
  "adobe",
  "firefly",
  "midjourney",
  "runway",
  "chatgpt",
  "gemini"
];

const TOOL_KEYWORDS = {
  "AI 設計": [
    "evoto",
    "lightroom",
    "luminar",
    "firefly",
    "flair ai",
    "pebblely",
    "photoroom",
    "caspa ai",
    "midjourney",
    "leonardo",
    "flux",
    "ideogram",
    "stable diffusion",
    "looka",
    "brandmark",
    "logoai",
    "icons8",
    "svg.io",
    "illustration",
    "khroma",
    "figma",
    "framer",
    "relume",
    "v0",
    "canva",
    "adobe express",
    "gamma",
    "beautiful.ai",
    "tome",
    "tripo",
    "spline",
    "meshy",
    "masterpiece x",
    "pika",
    "animatediff",
    "tooncrafter",
    "viggle",
    "runway",
    "kling",
    "sora",
    "luma ai",
    "roomgpt",
    "interior ai",
    "vizcom",
    "idm-vton",
    "fashn ai",
    "try-on",
    "krea",
    "dzine",
    "reve",
    "higgsfield",
    "mokker"
  ],

  "Adobe": [
    "adobe",
    "photoshop",
    "illustrator",
    "lightroom",
    "firefly",
    "premiere",
    "after effects",
    "adobe express"
  ],

  "模型 / Agent": [
    "chatgpt",
    "openai",
    "gemini",
    "claude",
    "grok",
    "deepseek",
    "perplexity",
    "agent"
  ],

  "其他": [
    "notion ai",
    "notebooklm",
    "mem",
    "craft ai",
    "n8n",
    "make",
    "zapier",
    "relay.app",
    "cursor",
    "windsurf",
    "bolt",
    "replit",
    "suno",
    "udio",
    "elevenlabs",
    "voicemod"
  ]
};

function stripHtml(html) {
  return String(html || "")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(text, tag) {
  const pattern = new RegExp("<" + tag + "[^>]*>([\\s\\S]*?)<\\/" + tag + ">", "i");
  const match = String(text || "").match(pattern);
  return match ? stripHtml(match[1]) : "";
}

async function fetchRSS(url) {
  const res = await fetch(url);

  if (!res.ok) {
    throw new Error(res.status + " " + res.statusText);
  }

  const xml = await res.text();

  const itemBlocks = Array.from(xml.matchAll(/<item[\s\S]*?<\/item>/gi)).map(function(m) {
    return m[0];
  });

  const entryBlocks = Array.from(xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)).map(function(m) {
    return m[0];
  });

  const blocks = itemBlocks.concat(entryBlocks);

  return blocks.map(function(block) {
    const title = getTag(block, "title");

    const link =
      getTag(block, "link") ||
      ((block.match(/<link[^>]+href="([^"]+)"/i) || [])[1] || "");

    const summary =
      getTag(block, "description") ||
      getTag(block, "summary") ||
      getTag(block, "content");

    const published =
      getTag(block, "pubDate") ||
      getTag(block, "published") ||
      getTag(block, "updated");

    return {
      title: title,
      link: link,
      summary: summary,
      published: published,
      source: url
    };
  }).filter(function(item) {
    return item.title && item.link;
  });
}

function scoreItem(item) {
  const text = String((item.title || "") + " " + (item.summary || "")).toLowerCase();
  let score = 0;

  PRIORITY_TOOLS.forEach(function(tool) {
    if (text.includes(tool)) score += 10;
  });

  Object.values(TOOL_KEYWORDS).forEach(function(keywords) {
    keywords.forEach(function(keyword) {
      if (text.includes(keyword)) score += 3;
    });
  });

  const updateWords = [
    "update",
    "launch",
    "release",
    "new",
    "feature",
    "model",
    "beta",
    "available",
    "introduce",
    "announce",
    "更新",
    "推出",
    "發布",
    "發表",
    "新功能",
    "模型",
    "改版"
  ];

  updateWords.forEach(function(word) {
    if (text.includes(word)) score += 2;
  });

  return score;
}

function isLikelyRelevant(item) {
  return scoreItem(item) >= 3;
}

function removeDuplicates(items) {
  const seen = new Set();

  return items.filter(function(item) {
    const key = item.link || item.title;

    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function makeRelatedUrl(tool, title) {
  const query = String(tool || "AI") + " " + String(title || "AI 更新") + " 中文";
  return "https://www.google.com/search?q=" + encodeURIComponent(query);
}

async function summarizeWithAI(items) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const input = [
    "你是「AI Design Daily」的 AI 設計情報編輯。",
    "",
    "請從以下 RSS 資料中，挑出適合設計人、修圖人、內容創作者關注的 AI 重要更新。",
    "",
    "最重要規則：",
    "1. 第一優先核心關注工具：Evoto、Adobe、Firefly、Midjourney、Runway、ChatGPT、Gemini。",
    "只要這些工具有重大更新、官方發佈、新功能、模型更新、設計工作流相關消息，要優先收錄並排序靠前。",
    "",
    "2. 熱門常用 AI 工具為第二優先：",
    "若有重大更新、發佈新聞、新功能、重要模型更新，也要收錄。",
    "",
    "3. 模型 / Agent 更新也要進「今日 AI 重點」。",
    "例如 ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類功能。",
    "",
    "4. 音樂 / 配音、文件筆記、工作流、自動化、Coding 類放「其他」。",
    "",
    "5. 分不到分類一律放「其他」。",
    "",
    "6. 不要收錄純商業、財報、融資、股價、企業人事新聞，除非直接影響 AI 工具功能。",
    "",
    "7. 不要限制固定幾則，只要是重要更新就收錄；但避免收錄重複或太弱的新聞。",
    "",
    "分類規則：",
    "- AI 設計：人像修圖、商品修圖、AI 商攝、AI MODEL、去背、放大清晰、生圖、LOGO、ICON/插圖、UI/網頁、排版設計、3D建模、動畫、影片、室內建築、AI試穿。",
    "- Adobe：Photoshop、Illustrator、Firefly、Lightroom、Premiere、After Effects、Adobe Express 等 Adobe 軟體更新。",
    "- 模型 / Agent：ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類更新。",
    "- 其他：音樂/配音、文件筆記、工作流、自動化、Coding 或無法分類的 AI 消息。",
    "",
    "另外請根據今日消息歸納 2～4 則 AI 設計趨勢。",
    "趨勢不是單篇新聞，而是設計人應該注意的方向。",
    "例如：AI MODEL 一致性、AI 商攝、影片生成、AI Agent 工作流。",
    "",
    "輸出要求：",
    "- 所有輸出必須為繁體中文。",
    "- title 必須翻譯為繁體中文。",
    "- 不可直接使用英文新聞標題。",
    "- 若原文為英文，請改寫成中文 AI 情報摘要風格。",
    "- tag 也需使用繁體中文。",
    "- 標題要像設計情報摘要，不要太工程化。",
    "- summary 一句話即可。",
    "- points 2～3 點，簡短清楚。",
    "- important：第一優先核心工具的重要更新設為 true，其餘通常為 false。",
    "- relatedUrl：請產生 Google 中文搜尋連結，格式為 https://www.google.com/search?q=...",
    "  搜尋字串請使用「工具名稱 + 更新標題 + 中文」。",
    "",
    "RSS 資料：",
    JSON.stringify(items.slice(0, 60), null, 2)
  ].join("\n");

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items", "trends"],
    properties: {
      items: {
        type: "array",
        items: {
          type: "object",
          additionalProperties: false,
          required: [
            "category",
            "tag",
            "tool",
            "important",
            "title",
            "summary",
            "points",
            "url",
            "relatedUrl"
          ],
          properties: {
            category: {
              type: "string",
              enum: ["AI 設計", "Adobe", "模型 / Agent", "其他"]
            },
            tag: { type: "string" },
            tool: { type: "string" },
            important: { type: "boolean" },
            title: { type: "string" },
            summary: { type: "string" },
            points: {
              type: "array",
              minItems: 2,
              maxItems: 3,
              items: { type: "string" }
            },
            url: { type: "string" },
            relatedUrl: { type: "string" }
          }
        }
      },
      trends: {
        type: "array",
        minItems: 2,
        maxItems: 4,
        items: {
          type: "object",
          additionalProperties: false,
          required: ["title", "summary"],
          properties: {
            title: { type: "string" },
            summary: { type: "string" }
          }
        }
      }
    }
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      Authorization: "Bearer " + OPENAI_API_KEY,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input: input,
      text: {
        format: {
          type: "json_schema",
          name: "ai_design_daily_news",
          schema: schema,
          strict: true
        }
      }
    })
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(JSON.stringify(data, null, 2));
  }

  const text =
    data.output_text ||
    (data.output || [])
      .flatMap(function(outputItem) {
        return outputItem.content || [];
      })
      .map(function(contentItem) {
        return contentItem.text || "";
      })
      .join("");

  const parsed = JSON.parse(text);

  parsed.items = (parsed.items || []).map(function(item) {
    return {
      category: ["AI 設計", "Adobe", "模型 / Agent", "其他"].includes(item.category)
        ? item.category
        : "其他",
      tag: item.tag || item.tool || "AI",
      tool: item.tool || "AI",
      important: Boolean(item.important),
      title: item.title || "未命名更新",
      summary: item.summary || "尚無摘要。",
      points: Array.isArray(item.points) && item.points.length
        ? item.points
        : ["尚無功能重點。", "請查看原文了解更多資訊。"],
      url: item.url || "#",
      relatedUrl: item.relatedUrl || makeRelatedUrl(item.tool, item.title)
    };
  });

  parsed.trends = Array.isArray(parsed.trends) && parsed.trends.length
    ? parsed.trends.map(function(trend) {
        return {
          title: trend.title || "AI 設計趨勢",
          summary: trend.summary || "今日尚無明確趨勢摘要。"
        };
      })
    : [
        {
          title: "AI 設計工具更新",
          summary: "今日 AI 工具更新較分散，建議優先關注核心工具與設計工作流影響。"
        },
        {
          title: "AI 工作流整合",
          summary: "模型與工具逐漸從單點功能走向完整工作流程支援。"
        }
      ];

  return parsed;
}


function getTaipeiDateParts(offsetDays) {

  const nowUTC = new Date();

  const taipeiTime = new Date(
    nowUTC.getTime() + (8 * 60 * 60 * 1000)
  );

  taipeiTime.setDate(
    taipeiTime.getDate() + (offsetDays || 0)
  );

  const y = taipeiTime.getUTCFullYear();

  const m = String(
    taipeiTime.getUTCMonth() + 1
  ).padStart(2, "0");

  const d = String(
    taipeiTime.getUTCDate()
  ).padStart(2, "0");

  const WEEK = ["日","一","二","三","四","五","六"];

  const w = WEEK[taipeiTime.getUTCDay()];

  return {
    fileDate: y + "-" + m + "-" + d,
    label:
      y +
      "/" +
      Number(m) +
      "/" +
      Number(d) +
      "（" +
      w +
      "）"
  };
}



function readJsonIfExists(filePath, fallback) {
  try {
    if (!fs.existsSync(filePath)) return fallback;
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  } catch {
    return fallback;
  }
}

function updateDateIndex(todayLabel, todayFile) {
  const existing = readJsonIfExists(INDEX_PATH, { dates: [] });
  const dates = Array.isArray(existing.dates) ? existing.dates : [];

  const withoutToday = dates.filter(function(item) {
    return item.file !== todayFile;
  });

  const updated = [
    { label: todayLabel, file: todayFile }
  ].concat(withoutToday).slice(0, 90);

  fs.writeFileSync(INDEX_PATH, JSON.stringify({ dates: updated }, null, 2), "utf8");
}

function runTests() {
  console.assert(scoreItem({ title: "Evoto new AI retouch update", summary: "" }) >= 10, "Evoto 應為高優先");
  console.assert(scoreItem({ title: "Random company funding news", summary: "" }) < 10, "一般商業新聞不應高分");
  console.assert(makeRelatedUrl("Evoto", "AI 修圖更新").includes("google.com/search"), "relatedUrl 應為 Google 搜尋");

  const today = getTaipeiDateParts(0);
  console.assert(/^\d{4}-\d{2}-\d{2}$/.test(today.fileDate), "fileDate 格式應為 YYYY-MM-DD");
}

async function main() {
  runTests();

  const all = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRSS(source);
      all.push.apply(all, items);
    } catch (err) {
      console.warn("RSS 讀取失敗：", source, err.message);
    }
  }

  const relevant = removeDuplicates(all)
    .filter(isLikelyRelevant)
    .sort(function(a, b) {
      return scoreItem(b) - scoreItem(a);
    });

  if (!relevant.length) {
    throw new Error("沒有抓到符合條件的 AI 更新，請檢查 RSS 來源或關鍵字。");
  }

  const aiResult = await summarizeWithAI(relevant);

  const today = getTaipeiDateParts(0);

  console.log("台灣日期：", today);
  console.log("historyFile：", today.fileDate + ".json");
  console.log("currentLabel：", today.label);

  const historyFile = today.fileDate + ".json";
  const historyPath = path.join(HISTORY_DIR, historyFile);

  const output = {
    currentDate: today.label,
    updatedAt: new Date().toLocaleString("sv-SE", {
      timeZone: "Asia/Taipei"
    }),
    dates: [today.label],
    trends: aiResult.trends,
    items: aiResult.items
  };

  fs.mkdirSync(DATA_DIR, { recursive: true });
  fs.mkdirSync(HISTORY_DIR, { recursive: true });

  fs.writeFileSync(LATEST_PATH, JSON.stringify(output, null, 2), "utf8");
  fs.writeFileSync(historyPath, JSON.stringify(output, null, 2), "utf8");
  updateDateIndex(today.label, historyFile);

  console.log("已更新 " + LATEST_PATH);
  console.log("已備份 " + historyPath);
  console.log("已更新 " + INDEX_PATH);
  console.log("收錄 " + output.items.length + " 則 AI 重點");
  console.log("收錄 " + output.trends.length + " 則 AI 設計趨勢");
}

main().catch(function(err) {
  console.error(err);
  process.exit(1);
});
