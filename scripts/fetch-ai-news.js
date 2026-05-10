const fs = require("fs");
const gplay = require("google-play-scraper");
const { chromium } = require("playwright");

const IOS_APP_ID = "1274334474";
const IOS_APP_URL =
  "https://apps.apple.com/tw/app/lativ-%E6%8F%90%E4%BE%9B%E5%B9%B3%E5%83%B9%E4%B8%94%E9%AB%98%E5%93%81%E8%B3%AA%E6%9C%8D%E9%A3%BE/id1274334474";
const ANDROID_APP_ID = "tw.com.lativ.shopping";
const START_DATE = "2025-01-01";

function toDateString(value) {
  if (!value) return new Date().toISOString().slice(0, 10);
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return new Date().toISOString().slice(0, 10);
  return d.toISOString().slice(0, 10);
}

function cleanText(value = "") {
  return String(value)
    .replace(/\s+/g, " ")
    .replace(/\u00a0/g, " ")
    .trim();
}

function normalizeReview(r = {}, platform = "") {
  return {
    title: r.title || r.reviewTitle || "",
    text: r.text || r.content || r.review || "",
    star: Number(r.score || r.rating || r.star || 0),
    userName: r.userName || r.user || r.author || r.nickname || "USER NAME",
    date: toDateString(r.date || r.updated || r.dateTime),
    platform,
    replyText: r.replyText || r.reply || r.developerReply || r.response || "",
    replyDate: r.replyDate ? toDateString(r.replyDate) : ""
  };
}

function extractReplyFromPopupText(text = "") {
  const lines = String(text)
    .split(/\n+/)
    .map(v => v.trim())
    .filter(Boolean);

  const replyIndex = lines.findIndex(line =>
    line.includes("開發者回覆") ||
    line.includes("Developer Response") ||
    line.includes("Developer’s Response")
  );

  if (replyIndex === -1) return "";

  const replyLines = [];

  for (let i = replyIndex + 1; i < lines.length; i++) {
    const line = lines[i];

    if (!line) continue;
    if (line.includes("開發者回覆")) continue;
    if (/^\d{4}\/\d{1,2}\/\d{1,2}$/.test(line)) continue;
    if (/^\d{4}-\d{1,2}-\d{1,2}$/.test(line)) continue;
    if (/^\d{1,2}月\d{1,2}日$/.test(line)) continue;
    if (/^\d+★/.test(line)) break;
    if (line === "更多") break;

    replyLines.push(line);
  }

  return cleanText(replyLines.join(" "));
}

async function getPopupText(page) {
  const candidates = [
    '[role="dialog"]',
    '.we-modal',
    '.modal',
    '.overlay',
    '[class*="modal"]',
    '[class*="dialog"]',
    '[class*="overlay"]'
  ];

  for (const selector of candidates) {
    const loc = page.locator(selector).last();
    try {
      if (await loc.isVisible({ timeout: 800 })) {
        const text = await loc.innerText({ timeout: 2000 });
        if (text && text.includes("開發者回覆")) return text;
      }
    } catch {}
  }

  return "";
}

async function fetchIosWebReplies() {
  const replies = [];
  let browser;

  try {
    browser = await chromium.launch({ headless: true });

    const page = await browser.newPage({
      locale: "zh-TW",
      viewport: { width: 1440, height: 1200 },
      userAgent:
        "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/120 Safari/537.36"
    });

    await page.goto(IOS_APP_URL, { waitUntil: "networkidle", timeout: 60000 });
    await page.waitForTimeout(4000);

    for (let i = 0; i < 8; i++) {
      await page.mouse.wheel(0, 2200);
      await page.waitForTimeout(1200);
    }

    const moreButtons = page.locator(
      'button:has-text("更多"), button:has-text("More"), a:has-text("更多"), a:has-text("More")'
    );

    const count = await moreButtons.count();
    console.log(`iOS More buttons found: ${count}`);

    for (let i = 0; i < count; i++) {
      try {
        const btn = moreButtons.nth(i);
        if (!(await btn.isVisible())) continue;

        await btn.scrollIntoViewIfNeeded();
        await page.waitForTimeout(500);
        await btn.click({ timeout: 8000 });
        await page.waitForTimeout(1400);

        const popupText = await getPopupText(page);
        const replyText = extractReplyFromPopupText(popupText);

        if (replyText) {
          replies.push({ replyText });
          console.log(`iOS reply caught: ${replyText.slice(0, 30)}`);
        }

        await page.keyboard.press("Escape").catch(() => {});
        await page.waitForTimeout(700);
      } catch (error) {
        console.log(`iOS dialog skipped ${i + 1}: ${error.message}`);
        await page.keyboard.press("Escape").catch(() => {});
      }
    }

    console.log(`iOS web replies found: ${replies.length}`);
    return replies;
  } catch (error) {
    console.log(`iOS Playwright replies skipped: ${error.message}`);
    return [];
  } finally {
    if (browser) await browser.close();
  }
}

async function fetchIosReviews() {
  const all = [];

  for (let page = 1; page <= 10; page++) {
    const url = `https://itunes.apple.com/tw/rss/customerreviews/page=${page}/id=${IOS_APP_ID}/sortby=mostrecent/json`;

    try {
      const res = await fetch(url);
      if (!res.ok) break;

      const json = await res.json();
      const entries = json.feed?.entry || [];

      const reviews = entries
        .filter(item => item["im:rating"] && item.content)
        .map(item => ({
          title: item.title?.label || "",
          text: item.content?.label || "",
          rating: Number(item["im:rating"]?.label || 0),
          author: item.author?.name?.label || "USER NAME",
          updated: item.updated?.label || new Date().toISOString()
        }));

      console.log(`iOS RSS page ${page}: ${reviews.length}`);

      if (!reviews.length) break;

      all.push(...reviews);

      const oldest = normalizeReview(reviews[reviews.length - 1], "ios").date;
      if (oldest < START_DATE) break;
    } catch (error) {
      console.log(`iOS RSS stopped: ${error.message}`);
      break;
    }
  }

  let normalized = all.map(r => normalizeReview(r, "ios"));
  const webReplies = await fetchIosWebReplies();

  normalized = normalized.map((review, index) => {
    const reply = webReplies[index];
    if (!reply || !reply.replyText) return review;

    return {
      ...review,
      replyText: reply.replyText,
      replyDate: reply.replyDate || ""
    };
  });

  console.log(`iOS web replies merged: ${webReplies.length}`);
  return normalized;
}

async function fetchAndroidReviews() {
  let all = [];
  let token = null;

  for (let page = 1; page <= 30; page++) {
    const result = await gplay.reviews({
      appId: ANDROID_APP_ID,
      sort: 2,
      num: 150,
      lang: "zh_TW",
      country: "tw",
      paginate: true,
      nextPaginationToken: token
    });

    const list = result.data || [];
    all.push(...list);

    console.log(`Android page ${page}: ${list.length}`);

    token = result.nextPaginationToken;
    if (!token || !list.length) break;

    const oldest = normalizeReview(list[list.length - 1], "android").date;
    if (oldest < START_DATE) break;
  }

  return all.map(r => normalizeReview(r, "android"));
}

function mergeReviews(oldReviews = [], newReviews = [], platform = "") {
  const map = new Map();

  [...oldReviews, ...newReviews].forEach(raw => {
    const review = normalizeReview(raw, platform);
    if (!review.text) return;

    const key = [
      review.platform || "",
      review.text || "",
      review.userName || "",
      review.date || ""
    ].join("__");

    const existed = map.get(key);

    map.set(key, {
      ...(existed || {}),
      ...review,
      replyText: review.replyText || existed?.replyText || "",
      replyDate: review.replyDate || existed?.replyDate || ""
    });
  });

  return Array.from(map.values()).sort(
    (a, b) => new Date(b.date) - new Date(a.date)
  );
}

function readOldData() {
  if (!fs.existsSync("data.json")) {
    return { reviews: { ios: [], android: [] } };
  }

  try {
    const old = JSON.parse(fs.readFileSync("data.json", "utf8"));
    return {
      reviews: {
        ios: old.reviews?.ios || [],
        android: old.reviews?.android || []
      }
    };
  } catch {
    return { reviews: { ios: [], android: [] } };
  }
}

async function main() {
  const oldData = readOldData();

  let iosNew = [];
  let androidNew = [];

  try {
    iosNew = await fetchIosReviews();
    console.log(`iOS fetched total: ${iosNew.length}`);
  } catch (error) {
    console.error("iOS 抓取失敗：", error.message);
  }

  try {
    androidNew = await fetchAndroidReviews();
    console.log(`Android fetched total: ${androidNew.length}`);
  } catch (error) {
    console.error("Android 抓取失敗：", error.message);
  }

  const reviews = {
    ios: mergeReviews(oldData.reviews.ios, iosNew, "ios"),
    android: mergeReviews(oldData.reviews.android, androidNew, "android")
  };

  const data = {
    updatedAt: new Date().toISOString(),
    reviews
  };

  fs.writeFileSync("data.json", JSON.stringify(data, null, 2), "utf8");

  console.log("data.json updated");
  console.log(`iOS stored: ${reviews.ios.length}`);
  console.log(`Android stored: ${reviews.android.length}`);
}

main().catch(error => {
  console.error(error);
  process.exit(1);
});
