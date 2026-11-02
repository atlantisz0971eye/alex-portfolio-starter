import type { Metadata } from "next";
import { bars, GlyphArt } from "./glyphs";
import "./byte.css";

export const metadata: Metadata = { title: "Byte skin", robots: { index: false, follow: false } };

const INDEX = ["TODAY", "LIBRARY", "MAIL", "CALENDAR", "MINDSTREAMS", "DEVLOG"];

/** A draft of Today with no chrome: type at scale, loose on the page. Static text and CSS; one blinking cursor. */
export default function ByteLab() {
  return (
    <div className="byte">
      <div className="top"><b>ALEX</b><span>MON 02 NOV 2026 17:28</span><span>MAC ONLINE <i>●</i></span><a href="#">assistant ⌘K</a><a href="#">members</a><a href="#">sign out</a></div>
      <GlyphArt cols={96} rows={30} seed={3} />
      <h1 className="mega day">TODAY</h1>
      <div className="body">
        <section className="plan"><h2>plan</h2>
          <p>11:30 的 AcrossRCA 线上 tutorial 已结束；16:00 White City 的 Computing 预约也已结束。</p>
          <p>AcrossRCA 11 月 9 日 12:00–14:30 线下 session，需提前与组员规划分工和材料。</p>
          <p>17:30–18:00 听 Moodle 第 3 集播客《Process and Experimentation》。</p>
          <p>19:00–20:00 为 11/4 Symbiotic Intelligence 汇报整理 3–5 分钟讲稿。</p>
          <p className="dim">AliExpress 广告，忽略。</p>
        </section>
        <section className="sched"><h2>schedule</h2>
          <div><time>11:30</time>AcrossRCA 线上团队 tutorial<small>Zoom</small></div>
          <div><time>16:00</time>Computing 预约：Mike Faulkner<small>White City Technician’s Office GH21</small></div>
        </section>
        <section className="sync"><h2>sync</h2>
          <div><span>ANTS</span>{bars(1, 20)}<em>998</em></div>
          <div className="w"><span>LEAVES</span>{bars(0.46, 20)}<em>1515</em></div>
          <div><span>PORTFOLIO</span>{bars(1, 20)}<em>842</em></div>
          <div className="e"><span>YASMINE</span>{bars(0.2, 20)}<em>ERR</em></div>
        </section>
        <section className="mail"><h2>mail · 9</h2>
          <div><time>17:21</time>Nirit Binyamini Ben Meir<span>AcrossRCA 9th November — in-person session</span></div>
          <div className="read"><time>17:19</time>AliExpress<span>JUST LANDED: new items with high ratings</span></div>
          <div><time>15:10</time>Google<span>Security alert — rclone access to your account</span></div>
        </section>
        <div className="ticker">RCA: Studio crit moved to Thursday // academia.edu: Here’s your download // SHOP: 188135 is your sign-in code</div>
        <div className="prompt">&gt; ask the director</div>
      </div>
      <nav className="index" aria-label="Sections">{INDEX.map((name, n) => <a key={name} href="#" className="mega" aria-current={n === 0 ? "page" : undefined}>{name}{n === 2 && <sup>9</sup>}</a>)}</nav>
    </div>
  );
}
