const fs = require("fs");
const path = require("path");

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const MODEL = process.env.OPENAI_MODEL || "gpt-5-mini";

const RSS_SOURCES = [
  "https://openai.com/news/rss.xml",
  "https://blog.google/technology/ai/rss/",
  "https://www.adobe.com/newsroom.rss",
  "https://huggingface.co/blog/feed.xml"
];

const OUTPUT_PATH = path.join(__dirname, "../data/news.json");

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

    return { title, link, summary, source: url };
  }).filter(item => item.title && item.link);
}

function isLikelyRelevant(item) {
  const text = `${item.title} ${item.summary}`.toLowerCase();

  const allKeywords = Object.values(TOOL_KEYWORDS).flat();

  const designWords = [
    "ai", "image", "photo", "design", "designer", "creative",
    "video", "animation", "3d", "logo", "icon", "illustration",
    "ui", "website", "web", "photoshop", "illustrator",
    "firefly", "generative", "model", "agent"
  ];

  return [...allKeywords, ...designWords].some(k => text.includes(k));
}

async function summarizeWithAI(items) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const input = `
你是「AI Design Daily」的 AI 設計情報編輯。

請從以下 RSS 資料中，挑出適合設計人、修圖人、內容創作者關注的 AI 重要更新。

收錄原則：
1. 只要與熱門 AI 工具的重要更新、官方發佈、新功能、模型更新、設計工作流相關，就要收錄。
2. Evoto、Adobe、Photoshop、Firefly、Lightroom、Midjourney、Runway、Kling、Sora、Figma、Canva、ChatGPT、Gemini、Claude、Perplexity 等工具優先。
3. 模型 / Agent 更新也要進「今日 AI 重點」。
4. 音樂 / 配音、文件筆記、工作流、Coding 類放「其他」。
5. 分不到分類就放「其他」。
6. 只保留最重要的 3～8 則。
7. 不要收錄純商業、財報、融資、股價、企業人事新聞，除非直接影響 AI 工具功能。

分類規則：
- AI 設計：人像修圖、商品修圖、去背、放大清晰、生圖、LOGO、ICON/插圖、UI/網頁、排版設計、3D建模、動畫、影片、室內建築、AI試穿。
- Adobe：Photoshop、Illustrator、Firefly、Lightroom、Premiere、After Effects、Adobe Express 等 Adobe 軟體更新。
- 模型 / Agent：ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類更新。
- 其他：音樂/配音、文件筆記、工作流、自動化、Coding 或無法分類的 AI 消息。

請輸出繁體中文。
標題要像設計情報摘要，不要太工程化。
summary 一句話即可。
points 2～3 點，簡短清楚。

RSS 資料：
${JSON.stringify(items.slice(0, 30), null, 2)}
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
          required: ["category", "tag", "tool", "important", "title", "summary", "points", "url"],
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
            url: { type: "string" }
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

  return JSON.parse(text);
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

async function main() {
  const all = [];

  for (const source of RSS_SOURCES) {
    try {
      const items = await fetchRSS(source);
      all.push(...items);
    } catch (err) {
      console.warn("RSS 讀取失敗：", source, err.message);
    }
  }

  const relevant = all.filter(isLikelyRelevant);
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
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});