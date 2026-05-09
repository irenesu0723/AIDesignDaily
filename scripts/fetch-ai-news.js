// AI Design Daily - RSS + OpenAI 摘要分類
// 核心規則：
// 1. 第一優先：Evoto / Adobe / Firefly / Midjourney / Runway / ChatGPT / Gemini
// 2. 熱門常用 AI 工具為其次，有重大更新或新聞也收錄
// 3. 模型 / Agent 也會進今日 AI 重點
// 4. 分不到類別一律放「其他」
// 5. 自動產生 relatedUrl：Google 中文搜尋

const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const OUTPUT_PATH = path.join(__dirname, "../data/news.json");

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
    "evoto", "lightroom", "luminar", "firefly",
    "flair ai", "pebblely", "photoroom", "caspa ai",
    "midjourney", "leonardo", "flux", "ideogram", "stable diffusion",
    "looka", "brandmark", "logoai",
    "icons8", "svg.io", "illustration", "khroma",
    "figma", "framer", "relume", "v0",
    "canva", "adobe express", "gamma", "beautiful.ai", "tome",
    "tripo", "spline", "meshy", "masterpiece x",
    "pika", "animatediff", "tooncrafter", "viggle",
    "runway", "kling", "sora", "luma ai",
    "roomgpt", "interior ai", "vizcom",
    "idm-vton", "fashn ai", "try-on"
  ],
  "Adobe": [
    "adobe", "photoshop", "illustrator", "lightroom",
    "firefly", "premiere", "after effects", "adobe express"
  ],
  "模型 / Agent": [
    "chatgpt", "openai", "gemini", "claude",
    "grok", "deepseek", "perplexity", "agent"
  ],
  "其他": [
    "notion ai", "notebooklm", "mem", "craft ai",
    "n8n", "make", "zapier", "relay.app",
    "cursor", "windsurf", "bolt", "replit",
    "suno", "udio", "elevenlabs", "voicemod"
  ]
};

function stripHtml(html = "") {
  return html
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/\s+/g, " ")
    .trim();
}

function getTag(text, tag) {
  const match = text.match(new RegExp(`<${tag}[^>]*>([\\s\\S]*?)<\\/${tag}>`, "i"));
  return match ? stripHtml(match[1]) : "";
}

async function fetchRSS(url) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${res.status} ${res.statusText}`);

  const xml = await res.text();

  const blocks = [
    ...xml.matchAll(/<item[\s\S]*?<\/item>/gi),
    ...xml.matchAll(/<entry[\s\S]*?<\/entry>/gi)
  ].map(m => m[0]);

  return blocks.map(block => {
    const title = getTag(block, "title");
    const link =
      getTag(block, "link") ||
      (block.match(/<link[^>]+href="([^"]+)"/i)?.[1] ?? "");

    const summary =
      getTag(block, "description") ||
      getTag(block, "summary") ||
      getTag(block, "content");

    const published =
      getTag(block, "pubDate") ||
      getTag(block, "published") ||
      getTag(block, "updated");

    return {
      title,
      link,
      summary,
      published,
      source: url
    };
  }).filter(item => item.title && item.link);
}

function scoreItem(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  let score = 0;

  for (const tool of PRIORITY_TOOLS) {
    if (text.includes(tool)) score += 10;
  }

  for (const keywords of Object.values(TOOL_KEYWORDS)) {
    for (const keyword of keywords) {
      if (text.includes(keyword)) score += 3;
    }
  }

  const updateWords = [
    "update", "launch", "release", "new", "feature", "model",
    "beta", "available", "introduce", "announce",
    "更新", "推出", "發布", "發表", "新功能", "模型", "改版"
  ];

  for (const word of updateWords) {
    if (text.includes(word)) score += 2;
  }

  return score;
}

function isLikelyRelevant(item) {
  return scoreItem(item) >= 3;
}

function removeDuplicates(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.link || item.title;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function summarizeWithAI(items) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const input = `
你是「AI Design Daily」的 AI 設計情報編輯。

請從以下 RSS 資料中，挑出適合設計人、修圖人、內容創作者關注的 AI 重要更新。

最重要規則：
1. 第一優先核心關注工具：
Evoto、Adobe、Firefly、Midjourney、Runway、ChatGPT、Gemini。
只要這些工具有重大更新、官方發佈、新功能、模型更新、設計工作流相關消息，要優先收錄並排序靠前。

2. 熱門常用 AI 工具為第二優先：
若有重大更新、發佈新聞、新功能、重要模型更新，也要收錄。

3. 模型 / Agent 更新也要進「今日 AI 重點」。
例如 ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類功能。

4. 音樂 / 配音、文件筆記、工作流、自動化、Coding 類放「其他」。

5. 分不到分類一律放「其他」。

6. 不要收錄純商業、財報、融資、股價、企業人事新聞，除非直接影響 AI 工具功能。

7. 只保留最重要的 3～8 則。

分類規則：
- AI 設計：人像修圖、商品修圖、去背、放大清晰、生圖、LOGO、ICON/插圖、UI/網頁、排版設計、3D建模、動畫、影片、室內建築、AI試穿。
- Adobe：Photoshop、Illustrator、Firefly、Lightroom、Premiere、After Effects、Adobe Express 等 Adobe 軟體更新。
- 模型 / Agent：ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類更新。
- 其他：音樂/配音、文件筆記、工作流、自動化、Coding 或無法分類的 AI 消息。

輸出要求：
- 使用繁體中文。
- 標題要像設計情報摘要，不要太工程化。
- summary 一句話即可。
- points 2～3 點，簡短清楚。
- important：第一優先核心工具的重要更新設為 true，其餘通常為 false。
- relatedUrl：請產生 Google 中文搜尋連結，格式為 https://www.google.com/search?q=...
  搜尋字串請使用「工具名稱 + 更新標題 + 中文」。

RSS 資料：
${JSON.stringify(items.slice(0, 40), null, 2)}
`;

  const schema = {
    type: "object",
    additionalProperties: false,
    required: ["items"],
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
      }
    }
  };

  const res = await fetch("https://api.openai.com/v1/responses", {
    method: "POST",
    headers: {
      "Authorization": `Bearer ${OPENAI_API_KEY}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      model: MODEL,
      input,
      text: {
        format: {
          type: "json_schema",
          name: "ai_design_daily_news",
          schema,
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
    data.output?.flatMap(o => o.content || [])
      .map(c => c.text || "")
      .join("");

  const parsed = JSON.parse(text);

  parsed.items = parsed.items.map(item => ({
    ...item,
    category: ["AI 設計", "Adobe", "模型 / Agent", "其他"].includes(item.category)
      ? item.category
      : "其他",
    relatedUrl: item.relatedUrl || makeRelatedUrl(item.tool, item.title)
  }));

  return parsed;
}

function makeRelatedUrl(tool, title) {
  const query = `${tool || "AI"} ${title || "AI 更新"} 中文`;
  return `https://www.google.com/search?q=${encodeURIComponent(query)}`;
}

function getTaipeiDate(offsetDays = 0) {
  const now = new Date();
  now.setDate(now.getDate() + offsetDays);

  const parts = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(now);

  const y = parts.find(p => p.type === "year").value;
  const m = parts.find(p => p.type === "month").value;
  const d = parts.find(p => p.type === "day").value;
  const w = parts.find(p => p.type === "weekday").value.replace("週", "");

  return `${y}/${m}/${d}（${w}）`;
}

function runTests() {
  console.assert(scoreItem({ title: "Evoto new AI retouch update", summary: "" }) >= 10, "Evoto 應為高優先");
  console.assert(scoreItem({ title: "Random company funding news", summary: "" }) < 10, "一般商業新聞不應高分");
  console.assert(makeRelatedUrl("Evoto", "AI 修圖更新").includes("google.com/search"), "relatedUrl 應為 Google 搜尋");
}

async function main() {
  runTests();

  const all = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRSS(source);
      all.push(...items);
    } catch (err) {
      console.warn("RSS 讀取失敗：", source, err.message);
    }
  }

  const relevant = removeDuplicates(all)
    .filter(isLikelyRelevant)
    .sort((a, b) => scoreItem(b) - scoreItem(a));

  const aiResult = await summarizeWithAI(relevant);

  const output = {
    currentDate: getTaipeiDate(0),
    dates: [
      getTaipeiDate(0),
      getTaipeiDate(-1),
      getTaipeiDate(-2),
      getTaipeiDate(-3),
      getTaipeiDate(-4),
      getTaipeiDate(-5),
      getTaipeiDate(-6)
    ],
    items: aiResult.items
  };

  fs.mkdirSync(path.dirname(OUTPUT_PATH), { recursive: true });
  fs.writeFileSync(OUTPUT_PATH, JSON.stringify(output, null, 2), "utf8");

  console.log(`已更新 ${OUTPUT_PATH}`);
  console.log(`收錄 ${output.items.length} 則 AI 重點`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});