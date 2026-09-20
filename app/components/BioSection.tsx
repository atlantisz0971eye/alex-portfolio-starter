"use client";

import { useEffect, useRef, useState } from "react";
import { cancelTiltAnimation, resetTilt, type TiltElement, updateTilt } from "../lib/tilt";
import type { Language } from "../types/project";
import { isTouchDevice, prefersReducedMotion } from "../utils/environment";

type AboutTab = "statement" | "timeline" | "contact";

type BioSectionProps = {
  lang: Language;
};

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

export function BioSection({ lang }: BioSectionProps) {
  const [activeTab, setActiveTab] = useState<AboutTab | null>(null);
  const [portraitActive, setPortraitActive] = useState(false);
  const portraitRef = useRef<TiltElement | null>(null);

  useEffect(() => () => cancelTiltAnimation(portraitRef.current), []);

  const toggleTab = (tab: AboutTab) => setActiveTab((current) => (current === tab ? null : tab));

  return (
    <section id="bio" className="relative border-t border-white/10 bg-transparent">
      <div className="bio-shell w-full max-w-screen-xl mx-auto min-h-[100svh] px-4 py-24 md:px-8 md:py-24 flex items-center justify-center">
        <div className="mx-auto w-full max-w-[960px] text-center">
          <div
            ref={portraitRef}
            className="bio-card card relative overflow-hidden rounded-2xl p-3 md:p-8 bg-white/5 border border-white/10 tilt-card project-tilt"
            onMouseDown={(event) => event.currentTarget.style.setProperty("--scale", "1.03")}
            onMouseUp={(event) => event.currentTarget.style.setProperty("--scale", "1.015")}
            onMouseLeave={(event) => {
              resetTilt(event.currentTarget as TiltElement);
              setPortraitActive(false);
            }}
            onMouseEnter={() => {
              if (!isTouchDevice) setPortraitActive(true);
            }}
            onMouseMove={(event) => {
              if (!isTouchDevice && !prefersReducedMotion) {
                updateTilt(event.currentTarget as TiltElement, event.clientX, event.clientY);
              }
            }}
            onClick={() => {
              if (isTouchDevice) setPortraitActive((current) => !current);
            }}
          >
            <div data-glare className="tilt-glare absolute inset-0" aria-hidden />
            <div
              className={`absolute inset-0 -z-10 bg-center bg-cover transition-all duration-300 ${portraitActive ? "blur-0" : "blur-md"}`}
              style={{ backgroundImage: "url(/portrait.jpg)", backgroundPosition: "50% 30%" }}
              aria-hidden
            />
            <div className="absolute inset-0 -z-10 bg-black/25" aria-hidden />

            <div className="bio-card__content relative z-10 p-4 md:p-8">
              <div className="space-y-4 text-center">
                <h2 className="text-3xl md:text-4xl font-semibold leading-tight">
                  {lang === "en" ? "Bio — Alex" : "简介 — Alex"}
                </h2>
                <div className="text-lg md:text-xl font-medium text-white/90 mt-1 mb-1">
                  {lang === "en" ? "Composer, Photographer, Digital Artist" : "编曲人，摄影师，数字艺术家"}
                </div>
                {lang === "zh" && (
                  <p className="text-white/90 leading-relaxed">
                    我的创作围绕 科技 / 反刍 / 连接 展开：技术统治与感知、反刍思维与自我坠落，以及滋养其发生的文化土壤。
                  </p>
                )}
              </div>

              <div className="mt-6 md:mt-8 flex flex-wrap justify-center gap-3">
                <BioButton onClick={() => toggleTab("statement")}>
                  {lang === "en" ? "Artist Statement" : "艺术家陈述"}
                </BioButton>
                <BioButton onClick={() => toggleTab("timeline")}>
                  {lang === "en" ? "Internships" : "实习经历"}
                </BioButton>
                <BioButton onClick={() => toggleTab("contact")}>
                  {lang === "en" ? "Contact" : "联系"}
                </BioButton>
              </div>

              {activeTab && (
                <div className="mt-5">
                  {activeTab === "statement" && (
                    <div className="card bg-white/7">
                      <h3 className="text-xl font-semibold mb-3">{lang === "en" ? "Artist Statement" : "艺术家陈述"}</h3>
                      <p className="text-white/90 leading-relaxed">
                        {lang === "en"
                          ? "Between fitting reality and electromagnetic decay, I look at how technological ontology rewrites body and perception; in Dys/Utopia, the viewer is pulled into a chain reaction between multiplicity of thoughts and nihilistic retreat; “Connection” is the premise and trigger of them all."
                          : "在拟合现实与电磁腐烂之间，我关注技术存在论如何改写身体与感知；在 Dys/Utopia 的观看机制里，观者被卷入多线思绪与虚无退隐的链式反应；而“连接”作为成长文化土壤，是一切发生的前提与引线。"}
                      </p>
                    </div>
                  )}

                  {activeTab === "timeline" && (
                    <div className="card">
                      <h3 className="text-xl font-semibold mb-4">{lang === "en" ? "Internships" : "实习经历"}</h3>
                      <ul className="space-y-4">
                        {INTERNSHIPS[lang].map((title) => (
                          <li key={title} className="flex items-start gap-4">
                            <div className="card flex-1">
                              <div className="flex items-center justify-between gap-4">
                                <p className="font-medium text-left">{title}</p>
                                <span className="badge">{lang === "en" ? "Internship" : "实习"}</span>
                              </div>
                            </div>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}

                  {activeTab === "contact" && (
                    <div className="card">
                      <h3 className="text-xl font-semibold mb-3">{lang === "en" ? "Contact" : "联系"}</h3>
                      <ul className="space-y-2 text-white/90">
                        <ContactLink label={lang === "en" ? "Email:" : "邮箱："} href="mailto:Atlantisz0971@gmail.com">
                          Atlantisz0971@gmail.com
                        </ContactLink>
                        <ContactLink label="Instagram:" href="https://www.instagram.com/alex_zhao0971">
                          instagram.com/alex_zhao0971
                        </ContactLink>
                        <ContactLink label="YouTube:" href="https://www.youtube.com/@AlexZhao-t7k/videos">
                          youtube.com/@AlexZhao-t7k
                        </ContactLink>
                      </ul>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}

function BioButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="btn-ghost"
      onMouseDown={(event) => event.stopPropagation()}
      onClick={(event) => {
        event.stopPropagation();
        onClick();
      }}
    >
      {children}
    </button>
  );
}

function ContactLink({ label, href, children }: { label: string; href: string; children: React.ReactNode }) {
  const external = href.startsWith("http");
  return (
    <li>
      <span className="opacity-80 mr-2">{label}</span>
      <a
        href={href}
        target={external ? "_blank" : undefined}
        rel={external ? "noreferrer" : undefined}
        className="underline hover:opacity-80"
      >
        {children}
      </a>
    </li>
  );
}
