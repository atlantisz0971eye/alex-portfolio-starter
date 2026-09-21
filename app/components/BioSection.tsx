"use client";

import { useEffect, useRef, useState } from "react";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import type { Language } from "../types/project";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

type AboutTab = "statement" | "education" | "timeline" | "contact";
type BioSectionProps = { lang: Language };

const INTERNSHIPS = {
  en: [
    "Graphic Designer — Bund Dinosaur Exhibition (Shanghai)",
    "Data Collector — Mr.Panda inbound AI localization guide (Huawei AI Joint Lab × Zhongying Niannian, Beijing)",
  ],
  zh: [
    "上海外滩恐龙展 平面设计师",
    "北京中影年年责任有限公司 · 华为AI联合实验室 · Mr.Panda 外国人来华AI平台智能本土化导引平台 数据收集师",
  ],
} satisfies Record<Language, string[]>;

const EDUCATION = {
  en: [
    {
      degree: "MFA Digital Media Arts",
      school: "Xi’an Jiaotong-Liverpool University",
      href: "https://www.liverpool.ac.uk/xjtlu/",
    },
    { degree: "MA Information Experience Design", school: "Royal College of Art" },
  ],
  zh: [
    {
      degree: "数字媒体艺术 MFA",
      school: "西交利物浦大学",
      href: "https://www.liverpool.ac.uk/xjtlu/",
    },
    { degree: "信息体验设计 MA", school: "英国皇家艺术学院" },
  ],
} satisfies Record<Language, { degree: string; school: string; href?: string }[]>;

export function BioSection({ lang }: BioSectionProps) {
  const [activeTab, setActiveTab] = useState<AboutTab | null>(null);
  const [cardOpen, setCardOpen] = useState(false);
  const [hovered, setHovered] = useState(false);
  const portraitRef = useRef<TiltElement | null>(null);
  const visuallyClear = hovered || cardOpen;

  useEffect(() => () => cancelTiltAnimation(portraitRef.current), []);

  useEffect(() => {
    const openBio = (event: Event) => {
      const detail = (event as CustomEvent<{ tab?: AboutTab }>).detail;
      setCardOpen(true);
      if (detail?.tab) setActiveTab(detail.tab);
      window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "bio" } }));
    };
    window.addEventListener("bio:open", openBio);
    return () => window.removeEventListener("bio:open", openBio);
  }, []);

  useEffect(() => {
    const closeForOtherContent = (event: Event) => {
      const kind = (event as CustomEvent<{ kind?: string }>).detail?.kind;
      if (kind && kind !== "bio") {
        setCardOpen(false);
        setActiveTab(null);
      }
    };
    window.addEventListener("glass:open", closeForOtherContent);
    return () => window.removeEventListener("glass:open", closeForOtherContent);
  }, []);

  const toggleTab = (tab: AboutTab) => {
    setCardOpen(true);
    setActiveTab((current) => (current === tab ? null : tab));
    window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "bio" } }));
  };

  return (
    <section id="bio" className="relative border-t border-white/10 bg-transparent">
      <div className="bio-shell flex min-h-[100svh] w-full max-w-screen-xl items-center justify-center mx-auto px-4 py-24 md:px-8">
        <div className="mx-auto w-full max-w-[960px] text-center">
          <div
            ref={portraitRef}
            className={`bio-card bio-glass-card project-tilt relative overflow-hidden ${cardOpen ? "is-open" : ""}`}
            onMouseDown={(event) => event.currentTarget.style.setProperty("--scale", "1.02")}
            onMouseUp={(event) => event.currentTarget.style.setProperty("--scale", "1.012")}
            onMouseLeave={(event) => {
              resetTilt(event.currentTarget as TiltElement);
              setHovered(false);
            }}
            onMouseEnter={() => {
              if (!isTouchDevice) setHovered(true);
            }}
            onMouseMove={(event) => {
              if (!isTouchDevice && !prefersReducedMotion) {
                updateTilt(event.currentTarget as TiltElement, event.clientX, event.clientY);
              }
            }}
          >
            <div data-glare className="tilt-glare absolute inset-0" aria-hidden />
            <div
              className={`bio-card__portrait ${visuallyClear ? "is-clear" : ""}`}
              style={{ backgroundImage: "url(/portrait.jpg)", backgroundPosition: "50% 30%" }}
              aria-hidden
            />
            <div className="bio-card__shade" aria-hidden />

            <button
              type="button"
              className="bio-card__toggle"
              aria-expanded={cardOpen}
              aria-label={cardOpen ? (lang === "en" ? "Close biography" : "收起简介") : (lang === "en" ? "Open biography" : "打开简介")}
              onClick={() => {
                const next = !cardOpen;
                setCardOpen(next);
                if (next) window.dispatchEvent(new CustomEvent("glass:open", { detail: { kind: "bio" } }));
              }}
            />

            <div className="bio-card__content relative z-10">
              <div className="space-y-3 text-center">
                <p className="gallery-kicker">{lang === "en" ? "Artist profile" : "艺术家档案"}</p>
                <h2 className="text-3xl md:text-4xl font-semibold leading-tight">
                  Alex Zhao
                </h2>
                <div className="text-lg md:text-xl font-medium text-white/90">
                  {lang === "en" ? "Composer, Photographer, Digital Artist" : "编曲人，摄影师，数字艺术家"}
                </div>
              </div>

              <div className={`bio-card__details ${cardOpen ? "is-open" : ""}`} aria-hidden={!cardOpen}>
                <div className="bio-card__details-inner">
                  {lang === "zh" && (
                    <p className="mx-auto mt-5 max-w-2xl text-white/86 leading-relaxed">
                      我的创作围绕科技、反刍与连接展开：技术统治与感知、反刍思维与自我坠落，以及滋养其发生的文化土壤。
                    </p>
                  )}

                  <div className="mt-6 flex flex-wrap justify-center gap-3">
                    <BioButton onClick={() => toggleTab("statement")}>{lang === "en" ? "Artist Statement" : "艺术家陈述"}</BioButton>
                    <BioButton onClick={() => toggleTab("education")}>{lang === "en" ? "Education" : "教育背景"}</BioButton>
                    <BioButton onClick={() => toggleTab("timeline")}>{lang === "en" ? "Internships" : "实习经历"}</BioButton>
                    <BioButton onClick={() => toggleTab("contact")}>{lang === "en" ? "Contact" : "联系"}</BioButton>
                  </div>

                  {activeTab && (
                    <div className="bio-card__panel mt-5">
                      {activeTab === "statement" && (
                        <BioPanel title={lang === "en" ? "Artist Statement" : "艺术家陈述"}>
                          <p className="text-white/90 leading-relaxed">
                            {lang === "en"
                              ? "Between fitting reality and electromagnetic decay, I look at how technological ontology rewrites body and perception; in Dys/Utopia, the viewer is pulled into a chain reaction between multiplicity of thoughts and nihilistic retreat; Connection is the premise and trigger of them all."
                              : "在拟合现实与电磁腐烂之间，我关注技术存在论如何改写身体与感知；在 Dys/Utopia 的观看机制里，观者被卷入多线思绪与虚无退隐的链式反应；而连接作为成长文化土壤，是一切发生的前提与引线。"}
                          </p>
                        </BioPanel>
                      )}

                      {activeTab === "education" && (
                        <BioPanel title={lang === "en" ? "Education" : "教育背景"}>
                          <ul className="space-y-3">
                            {EDUCATION[lang].map((entry) => (
                              <li key={entry.degree} className="bio-line-card">
                                <span className="font-medium">{entry.degree}</span>
                                {entry.href ? (
                                  <a href={entry.href} target="_blank" rel="noreferrer" onClick={(event) => event.stopPropagation()}>
                                    {entry.school}
                                  </a>
                                ) : (
                                  <span>{entry.school}</span>
                                )}
                              </li>
                            ))}
                          </ul>
                        </BioPanel>
                      )}

                      {activeTab === "timeline" && (
                        <BioPanel title={lang === "en" ? "Internships" : "实习经历"}>
                          <ul className="space-y-3">
                            {INTERNSHIPS[lang].map((title) => <li key={title} className="bio-line-card">{title}</li>)}
                          </ul>
                        </BioPanel>
                      )}

                      {activeTab === "contact" && (
                        <BioPanel title={lang === "en" ? "Contact" : "联系"}>
                          <ul className="space-y-2 text-white/90">
                            <ContactLink label={lang === "en" ? "Email:" : "邮箱："} href="mailto:Atlantisz0971@gmail.com">Atlantisz0971@gmail.com</ContactLink>
                            <ContactLink label="Instagram:" href="https://www.instagram.com/alex_zhao0971">instagram.com/alex_zhao0971</ContactLink>
                            <ContactLink label="YouTube:" href="https://www.youtube.com/@AlexZhao-t7k/videos">youtube.com/@AlexZhao-t7k</ContactLink>
                          </ul>
                        </BioPanel>
                      )}
                    </div>
                  )}
                </div>
              </div>

              <div className="bio-card__hint" aria-hidden>
                <span>{cardOpen ? (lang === "en" ? "Close profile" : "收起档案") : (lang === "en" ? "Open profile" : "打开档案")}</span>
                <span>{cardOpen ? "−" : "+"}</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BioButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <button className="btn-ghost bio-card__action" onClick={(event) => { event.stopPropagation(); onClick(); }}>{children}</button>;
}

function BioPanel({ title, children }: { title: string; children: React.ReactNode }) {
  return <div className="bio-panel"><h3 className="mb-3 text-xl font-semibold">{title}</h3>{children}</div>;
}

function ContactLink({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <li>
      <span className="opacity-80 mr-2">{label}</span>
      <a href={href} target={external ? "_blank" : undefined} rel={external ? "noreferrer" : undefined} onClick={(event) => event.stopPropagation()} className="underline hover:opacity-80">
        {children}
      </a>
    </li>
  );
}
