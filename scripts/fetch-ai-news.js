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
  const keywords = [
    "ai", "artificial intelligence", "image", "photo", "design",
    "adobe", "photoshop", "illustrator", "firefly", "figma",
    "video", "animation", "3d", "model", "agent",
    "gemini", "chatgpt", "claude", "midjourney", "runway", "sora"
  ];
  return keywords.some(k => text.includes(k));
}

async function summarizeWithAI(items) {
  if (!OPENAI_API_KEY) {
    throw new Error("Missing OPENAI_API_KEY");
  }

  const input = `
你是 AI 設計情報編輯。請從以下資料中，挑出適合「AI Design Daily」的內容。

分類規則：
1. AI 設計：人像修圖、商品修圖、去背、放大清晰、生圖、LOGO、ICON/插圖、UI/網頁、排版設計、3D建模、動畫、影片、音樂/配音、室內建築、AI試穿。
2. Adobe：Photoshop、Illustrator、Firefly、Lightroom、Premiere、After Effects、Adobe Express 等 Adobe 軟體更新。
3. 模型 / Agent：ChatGPT、Gemini、Claude、Grok、DeepSeek、Perplexity、Agent 類更新。
4. 其他：文件筆記、工作流、自動化、Coding 或其他 AI 消息。

請輸出繁體中文，語氣簡潔，重點要像設計人會看的情報摘要。
只保留最重要的 3～8 則。

RSS 資料：
${JSON.stringify(items.slice(0, 20), null, 2)}
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

function getTaipeiDate() {
  const now = new Date();
  const date = new Intl.DateTimeFormat("zh-TW", {
    timeZone: "Asia/Taipei",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    weekday: "short"
  }).formatToParts(now);

  const y = date.find(p => p.type === "year").value;
  const m = date.find(p => p.type === "month").value;
  const d = date.find(p => p.type === "day").value;
  const w = date.find(p => p.type === "weekday").value;

  return `${y}/${m}/${d}（${w.replace("週", "")}）`;
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
    currentDate: getTaipeiDate(),
    dates: [getTaipeiDate()],
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