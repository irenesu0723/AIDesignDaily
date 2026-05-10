```js
const fs = require("fs");
const path = require("path");

const TODAY = new Date();
const yyyy = TODAY.getFullYear();
const mm = String(TODAY.getMonth() + 1).padStart(2, "0");
const dd = String(TODAY.getDate()).padStart(2, "0");

const WEEK = ["日","一","二","三","四","五","六"];

const currentDate = `${yyyy}/${Number(mm)}/${Number(dd)}（${WEEK[TODAY.getDay()]}）`;

const outputDir = path.join(process.cwd(), "data");
const historyDir = path.join(outputDir, "history");

if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

if (!fs.existsSync(historyDir)) {
  fs.mkdirSync(historyDir, { recursive: true });
}

const newsData = {
  currentDate,
  dates: [currentDate],
  items: [
    {
      category: "AI 設計",
      tag: "AI修圖",
      tool: "Evoto",
      important: true,
      title: "Evoto AI 修圖流程優化更新",
      summary: "Evoto 更新批次修膚與 AI 選圖效率，對商攝與電商修圖流程有直接幫助。",
      points: [
        "批次修膚速度提升",
        "AI 選圖流程更穩定",
        "商業人像修圖效率提升"
      ],
      url: "https://evoto.ai/",
      relatedUrl: "https://www.google.com/search?q=Evoto+AI+更新"
    },
    {
      category: "Adobe",
      tag: "Firefly",
      tool: "Adobe",
      important: true,
      title: "Adobe Firefly 新增生成式設計功能",
      summary: "Adobe 持續強化 Firefly 在 Photoshop 與設計工作流中的整合。",
      points: [
        "生成式填色功能提升",
        "Photoshop 整合更完整",
        "設計流程 AI 化"
      ],
      url: "https://www.adobe.com/tw/products/firefly.html",
      relatedUrl: "https://www.google.com/search?q=Adobe+Firefly+更新"
    },
    {
      category: "模型 / Agent",
      tag: "ChatGPT",
      tool: "OpenAI",
      important: true,
      title: "ChatGPT 強化 AI Agent 工作流程",
      summary: "AI Agent 與工作流程自動化持續成為近期 AI 主要方向。",
      points: [
        "Agent 工作流持續增強",
        "跨工具協作能力提升",
        "AI 自動化應用增加"
      ],
      url: "https://chatgpt.com/",
      relatedUrl: "https://www.google.com/search?q=ChatGPT+Agent+更新"
    }
  ]
};

fs.writeFileSync(
  path.join(outputDir, "news.json"),
  JSON.stringify(newsData, null, 2),
  "utf8"
);

const historyFile = `${yyyy}-${mm}-${dd}.json`;

fs.writeFileSync(
  path.join(historyDir, historyFile),
  JSON.stringify(newsData, null, 2),
  "utf8"
);

const indexPath = path.join(outputDir, "index.json");

let indexData = { dates: [] };

if (fs.existsSync(indexPath)) {
  try {
    indexData = JSON.parse(fs.readFileSync(indexPath, "utf8"));
  } catch (e) {
    indexData = { dates: [] };
  }
}

const exists = indexData.dates.some(
  item => item.file === historyFile
);

if (!exists) {
  indexData.dates.unshift({
    label: currentDate,
    file: historyFile
  });
}

fs.writeFileSync(
  indexPath,
  JSON.stringify(indexData, null, 2),
  "utf8"
);

console.log("AI Design Daily 更新完成");
```
