import assert from "node:assert/strict";
import test from "node:test";
import { findUrl, lagText, parsePasted, platformOf, postedFromId, sharedText } from "../app/lib/linkParse.ts";

test("finds the link inside a sentence and drops trailing punctuation", () => {
  assert.equal(findUrl("看这个 https://example.com/a/b?c=1。然后"), "https://example.com/a/b?c=1");
  assert.equal(findUrl("(see https://example.com/post)."), "https://example.com/post");
  assert.equal(findUrl("no link here"), null);
  assert.equal(findUrl("javascript:alert(1)"), null);
});

test("names the platform from the host only", () => {
  assert.equal(platformOf("https://x.com/a/status/1"), "x");
  assert.equal(platformOf("https://mobile.twitter.com/a/status/1"), "x");
  assert.equal(platformOf("https://v.douyin.com/abc/"), "douyin");
  assert.equal(platformOf("https://xhslink.com/abc"), "xiaohongshu");
  assert.equal(platformOf("https://youtu.be/abc"), "youtube");
  assert.equal(platformOf("https://notx.com/x.com"), "web");
  assert.equal(platformOf("https://example.com/?u=x.com"), "web");
});

test("reads an X post's time from its id", () => {
  // the id and created_at X's own API documentation uses as its example
  assert.equal(postedFromId("https://x.com/TwitterDev/status/1228393702244134912", "x")?.slice(0, 19), "2020-02-14T19:00:55");
  assert.equal(postedFromId("https://twitter.com/jack/status/20", "x"), null);
  assert.equal(postedFromId("https://x.com/TwitterDev", "x"), null);
});

test("claims no time when a video id decodes to something implausible", () => {
  const now = Date.UTC(2026, 10, 10);
  const id = (BigInt(Date.UTC(2026, 10, 8, 12) / 1000) << 32n) + 12345n;
  assert.equal(postedFromId(`https://www.douyin.com/video/${id}`, "douyin", now), "2026-11-08T12:00:00.000Z");
  assert.equal(postedFromId("https://www.douyin.com/video/1234567890123456", "douyin", now), null);
  assert.equal(postedFromId("https://v.douyin.com/iAbCdEf/", "douyin", now), null);
  const future = (BigInt(Date.UTC(2031, 0, 1) / 1000) << 32n) + 1n;
  assert.equal(postedFromId(`https://www.tiktok.com/@a/video/${future}`, "tiktok", now), null);
});

test("keeps the title an app wrapped around the link", () => {
  const douyin = "7.94 复制打开抖音，看看【小明的作品】用新模型一晚上做完了动画短片 # AI动画 https://v.douyin.com/iAbCdEf/ fKJ:/ 03/15";
  const parsed = parsePasted(douyin);
  assert.equal(parsed.url, "https://v.douyin.com/iAbCdEf/");
  assert.equal(parsed.platform, "douyin");
  assert.equal(parsed.shared.author, "小明");
  assert.match(parsed.shared.title, /用新模型一晚上做完了动画短片/);
  assert.doesNotMatch(parsed.shared.title, /复制|抖音|https/);
  assert.deepEqual(sharedText("https://example.com/a", "https://example.com/a"), {});
});

test("says how long after posting it was seen", () => {
  assert.equal(lagText("2026-11-08T12:00:00Z", "2026-11-08T12:20:00Z"), "发出 20 分钟后看到");
  assert.equal(lagText("2026-11-08T12:00:00Z", "2026-11-08T17:00:00Z"), "发出 5 小时后看到");
  assert.equal(lagText("2026-11-08T12:00:00Z", "2026-11-11T12:00:00Z"), "发出 3 天后看到");
  assert.equal(lagText("2026-11-08T12:00:00Z", "2026-11-07T12:00:00Z"), "");
});
