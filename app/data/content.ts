import type { Project, Theme } from "../types/project";

// Helper to attach brief text path based on normalized title
const withBrief = (title: string) => `/brief/${title.replace(/[\\/-]/g, "_").replace(/\s+/g, "_")}.txt`;

type ProjectWithBrief = Project & { briefTxt?: string };
type ThemeWithBrief = Omit<Theme, "projects"> & { projects: ProjectWithBrief[] };

export const CONTENT: Record<"en"|"zh", { themes: ThemeWithBrief[] }> = {
  en: {
    themes: [
      {
        id: "tian",
        title: "Technology",
        color: "from-slate-900 via-slate-800 to-slate-700",
        intro:
          "The influence of technological domination and ontology on contemporary youth cognition; the oppression and nihilistic tone brought by information overload and control.",
        projects: [
          {
            slug: "fitting-reality",
            title: "Fitting Reality",
            status: "in-progress",
            summary:
              "Using distortion, noise, and data ghosts to present how technology 'fits' reality and human perception. — [Add: project intro, media, video links]",
            tags: ["Tech Domination", "Ontology", "Perceptual Distortion"],
            bg: { src: "/bg-fitting-reality.jpg", position: "center" },
            media: { images: [], videos: [], audios: [] },
            mediaItems: [
              { type: "image", role: "hero", src: "/fitting-reality/hero/hero_01.jpg", title: "Installation view" },
              { type: "image", role: "hero", src: "/fitting-reality/hero/hero_02.jpg", title: "Installation detail" },
              { type: "video", role: "experience", src: "/fitting-reality/experience/experience_01.mp4", title: "Demo loop" },
              { type: "video", role: "experience", src: "/fitting-reality/experience/experience_02.mp4", title: "Demo loop 02" },
              { type: "image", role: "experience", src: "/fitting-reality/experience/experience_03.jpg", title: "Experience still" },
              { type: "image", role: "doc", src: "/fitting-reality/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/fitting-reality/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/fitting-reality/system/system_diagram_01.png", title: "System diagram" },
              { type: "image", role: "system", src: "/fitting-reality/system/system_diagram_02.png", title: "System diagram 02" },
              { type: "image", role: "concept", src: "/fitting-reality/concept/concept_sketch_01.png", title: "Concept sketch 01" },
              { type: "image", role: "concept", src: "/fitting-reality/concept/concept_sketch_02.png", title: "Concept sketch 02" },
              { type: "image", role: "process", src: "/fitting-reality/process/process_setup_01.jpg", title: "Process still" },
              { type: "image", role: "process", src: "/fitting-reality/process/process_setup_02.jpg", title: "Process still 02" },
            ],
            updates: [
              { date: "2025-09-20", text: "Sketched new installation layout; tested camera-based distortion pipeline." },
              { date: "2025-08-12", text: "Prototype shader for data ghost finalized." }
            ],
            briefTxt: withBrief("Fitting Reality"),
          },
          {
            slug: "electromagnetic-decay",
            title: "Electromagnetic Decay",
            status: "in-progress",
            summary:
              "Aesthetic translation of the electromagnetic spectrum: from interference, attenuation to the sonic-visual narrative of control desire. — [Add: project intro, installation images, demo video]",
            tags: ["Electromagnetic", "Control/Interference", "Nihilism"],
            bg: { src: "/bg-electromagnetic-decay.jpg", position: "center", fit: "cover" },
            media: {
              videos: ["/Decay.mp4"],
              audios: [
                "/testdemoV1_20250928_161549_demo_clean.wav",
                "/testdemoV1_20250928_161549_demo_fm.wav",
                "/testdemoV1_20250928_161549_demo_fx.wav",
                "/testdemoV1_20250928_161549_demo_fxfm.wav",
                "/testdemoV2_20250928_163730_demo_clean.wav",
                "/testdemoV2_20250928_163730_demo_fm.wav",
                "/testdemoV2_20250928_163730_demo_fx.wav",
                "/testdemoV2_20250928_163730_demo_fxfm.wav"
              ],
              images: ["/em-decay-1.jpg", "/em-decay-2.jpg"],
            },
            mediaGroups: {
              videos: [{ label: "Demo Video", items: ["/Decay.mp4"] }],
              audios: [
                { label: "Demo V1", items: [
                  "/testdemoV1_20250928_161549_demo_clean.wav",
                  "/testdemoV1_20250928_161549_demo_fm.wav",
                  "/testdemoV1_20250928_161549_demo_fx.wav",
                  "/testdemoV1_20250928_161549_demo_fxfm.wav"
                ]},
                { label: "Demo V2", items: [
                  "/testdemoV2_20250928_163730_demo_clean.wav",
                  "/testdemoV2_20250928_163730_demo_fm.wav",
                  "/testdemoV2_20250928_163730_demo_fx.wav",
                  "/testdemoV2_20250928_163730_demo_fxfm.wav"
                ]}
              ],
              images: [{ label: "Installation", items: ["/em-decay-1.jpg", "/em-decay-2.jpg"] }]
            },
            updates: [
              { date: "v0.1", text: "Prototype — Used sounddevice to capture mic input; Integrated rtlsdr for SDR sampling + FM demodulation; Command-line only, low interactivity" },
              { date: "v0.3", text: "FX First Edition — Added Low-pass + Tremolo + Pink Noise FX chain; Supported 3 modes: CLEAN / FX / FX+FM; Hotkeys: 1/2/3 switch modes; q quit" },
              { date: "v0.5", text: "Multitrack Recording — Added recording: r start/stop; Auto-save clean/fx/fxfm 3-track WAV; File names with timestamp + tag" },
              { date: "v0.7", text: "Adjustable Decay Feel — Extended hotkeys: control mix, FM overlay, noise level, LPF min/max, tremolo rate/depth; Added SDR freq/gain control; Added RSSI mapping window for dynamics" },
              { date: "v1.0", text: "Stable Release — Full hotkey system + status print; Fixed stdin freeze, auto restore terminal; Better error handling, graceful exit" },
              { date: "v1.2", text: "Application — Added run.sh: auto-detect devices; Added launch.sh + install.sh: desktop launcher; Unified save path ~/captures" },
              { date: "v1.3", text: "Optimization — Auto-save pending data on stop/exit; Simplified logs, cleaner error handling; Auto fallback for PortAudio format errors" },
            ],
            updatesTxt: "/updates/electromagnetic-decay.txt",
            briefTxt: withBrief("Electromagnetic Decay"),
            mediaItems: [
              { type: "image", role: "hero", src: "/electromagnetic-decay/hero/hero_01.jpg", title: "Spectral view" },
              { type: "image", role: "hero", src: "/electromagnetic-decay/hero/hero_02.jpg", title: "Spectral view 02" },
              { type: "video", role: "experience", src: "/electromagnetic-decay/experience/experience_01.mp4", title: "Experience loop" },
              { type: "video", role: "experience", src: "/electromagnetic-decay/experience/experience_02.mp4", title: "Experience loop 02" },
              { type: "image", role: "experience", src: "/electromagnetic-decay/experience/experience_03.jpg", title: "Experience still" },
              { type: "audio", role: "doc", src: "/electromagnetic-decay/docs/doc_01.wav", title: "Documentation audio" },
              { type: "image", role: "doc", src: "/electromagnetic-decay/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/electromagnetic-decay/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/electromagnetic-decay/system/system_diagram_01.png", title: "Signal flow" },
              { type: "image", role: "system", src: "/electromagnetic-decay/system/system_diagram_02.png", title: "Signal flow 02" },
              { type: "image", role: "concept", src: "/electromagnetic-decay/concept/concept_sketch_01.jpg", title: "Concept sketch" },
              { type: "image", role: "concept", src: "/electromagnetic-decay/concept/concept_sketch_02.jpg", title: "Concept sketch 02" },
              { type: "image", role: "process", src: "/electromagnetic-decay/process/process_setup_01.jpg", title: "Process still" },
              { type: "image", role: "process", src: "/electromagnetic-decay/process/process_setup_02.jpg", title: "Process still 02" },
            ],
          },
        ],
        reading: [
          "Heidegger – The Question Concerning Technology",
          "Ellul – The Technological Society",
          "Simondon – On the Mode of Existence of Technical Objects",
        ],
      },
      {
        id: "ren",
        title: "Rumination",
        color: "from-zinc-900 via-neutral-800 to-stone-700",
        intro:
          "The dilemma of highly sensitive individuals in ruminative thinking; the tension between multi-threaded thoughts and self-collapse.",
        projects: [
          {
            slug: "dys-utopia",
            title: "Dys/Utopia",
            status: "completed",
            summary:
              "Visualizing 'a thousand thoughts' and 'nihilistic invisibility' with particles/melting/mirrored heads. — [Add: tech stack, interaction logic, video]",
            tags: ["Ruminative Thinking", "Perception", "Generative Visuals"],
            bg: { src: "/bg-dys-utopia.jpg", position: "50% 40%", fit: "cover" },
            media: { videos: ["/dys-utopia.mp4"] },
            mediaGroups: {
              videos: [ { label: "Final", items: ["/dys-utopia.mp4"] } ]
            },
            // keep only PDF to avoid 404 from missing TXT/MD
            docPdf: "/Dys_Utopia_Report.pdf",
            updates: [
              { date: "2025-05-03", text: "Exhibition screening; received audience feedback on interaction pacing." },
              { date: "2025-04-02", text: "Project completed and archived." }
            ],
            briefTxt: withBrief("Dys/Utopia"),
            mediaItems: [
              { type: "image", role: "hero", src: "/dys-utopia/hero/hero_01.jpg", title: "Installation view" },
              { type: "image", role: "hero", src: "/dys-utopia/hero/hero_02.jpg", title: "Installation detail" },
              { type: "video", role: "experience", src: "/dys-utopia/experience/experience_01.mp4", title: "Experience loop" },
              { type: "image", role: "experience", src: "/dys-utopia/experience/experience_02.jpg", title: "Experience still" },
              { type: "image", role: "doc", src: "/dys-utopia/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/dys-utopia/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/dys-utopia/system/system_diagram_01.png", title: "System diagram" },
              { type: "image", role: "system", src: "/dys-utopia/system/system_diagram_02.png", title: "System diagram 02" },
              { type: "image", role: "concept", src: "/dys-utopia/concept/concept_sketch_01.jpg", title: "Concept sketch" },
              { type: "image", role: "concept", src: "/dys-utopia/concept/concept_sketch_02.jpg", title: "Concept sketch 02" },
              { type: "image", role: "process", src: "/dys-utopia/process/process_setup_01.jpg", title: "Process still" },
              { type: "image", role: "process", src: "/dys-utopia/process/process_setup_02.jpg", title: "Process still 02" },
            ],
          },
        ],
        reading: [
          "Sartre – Being and Nothingness (selected)",
          "Kernis – Self-Esteem Stability Model (linking self-evaluation and instability)",
        ],
      },
      {
        id: "di",
        title: "Connection",
        color: "from-amber-900 via-amber-800 to-amber-700",
        intro:
          "Explores how subjective experience enters the system as data and, through feedback loops, is transformed into new visual and emotional patterns.",
        projects: [
          {
            slug: "bloom-system",
            title: "Bloom System",
            status: "planning",
            summary:
              "Organizing the 'geography–memory–identity' triangle through images, sounds, and textual narratives; exploring contemporary re-narratives of ethnic/regional cultures. — [Add: field materials and plans]",
            tags: ["Body Data", "Noise System", "Image Distortion"],
            bg: { src: "/bg-roots.jpg", position: "center" },
            media: { images: [], videos: [], audios: [] },
            docTxt: "/docs/roots-and-lands.md",
            overviewTxt: "/docs/roots-and-lands-overview.txt",
            updates: [
              { date: "2025-09-01", text: "Collected field photos and ambient recordings in hometown area." }
            ],
            briefTxt: withBrief("Bloom System"),
            mediaItems: [
              { type: "image", role: "hero", src: "/bloom-system/hero/hero_01.jpg", title: "Field still" },
              { type: "image", role: "hero", src: "/bloom-system/hero/hero_02.jpg", title: "Field still 02" },
              { type: "video", role: "experience", src: "/bloom-system/experience/experience_01.mp4", title: "Experience loop" },
              { type: "image", role: "experience", src: "/bloom-system/experience/experience_02.jpg", title: "Experience still" },
              { type: "image", role: "doc", src: "/bloom-system/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/bloom-system/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/bloom-system/system/system_diagram_01.png", title: "System diagram" },
              { type: "image", role: "system", src: "/bloom-system/system/system_diagram_02.png", title: "System diagram 02" },
              { type: "image", role: "concept", src: "/bloom-system/concept/concept_sketch_01.jpg", title: "Concept sketch" },
              { type: "image", role: "concept", src: "/bloom-system/concept/concept_sketch_02.jpg", title: "Concept sketch 02" },
              { type: "image", role: "process", src: "/bloom-system/process/process_setup_01.jpg", title: "Process still" },
              { type: "image", role: "process", src: "/bloom-system/process/process_setup_02.jpg", title: "Process still 02" },
            ],
          },
        ],
        reading: [
          "Yi-Fu Tuan – Space and Place",
          "Pauline Boss – Ambiguous Loss (linked to cultural dimensions of 'dispersal/absence')",
        ],
      },
    ],
  },
  zh: {
    themes: [
      {
        id: "tian",
        title: "科技",
        color: "from-slate-900 via-slate-800 to-slate-700",
        intro:
          "技术统治与技术存在论对当代年轻人认知的影响；信息过载与控制带来的压迫感与虚无主义基调。",
        projects: [
          {
            slug: "fitting-reality",
            title: "拟合现实",
            status: "in-progress",
            summary:
              "以失真、噪点与数据残影呈现技术如何‘拟合’现实与人的感知。——【补充：项目简介、媒体、视频链接】",
            tags: ["技术统治", "存在论", "感知失真"],
            bg: { src: "/bg-fitting-reality.jpg", position: "center" },
            media: { images: [], videos: [], audios: [] },
            updates: [
              { date: "2025-09-20", text: "绘制装置新布局草图；测试基于摄像头的失真管线。" },
              { date: "2025-08-12", text: "完成数据残影着色器原型。" }
            ],
            briefTxt: withBrief("Fitting Reality"),
            mediaItems: [
              { type: "image", role: "hero", src: "/fitting-reality/hero/hero_01.jpg", title: "装置视角" },
              { type: "image", role: "hero", src: "/fitting-reality/hero/hero_02.jpg", title: "装置细节" },
              { type: "video", role: "experience", src: "/fitting-reality/experience/experience_01.mp4", title: "体验片段" },
              { type: "video", role: "experience", src: "/fitting-reality/experience/experience_02.mp4", title: "体验片段 02" },
              { type: "image", role: "experience", src: "/fitting-reality/experience/experience_03.jpg", title: "体验静帧" },
              { type: "image", role: "doc", src: "/fitting-reality/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/fitting-reality/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/fitting-reality/system/system_diagram_01.png", title: "系统示意" },
              { type: "image", role: "system", src: "/fitting-reality/system/system_diagram_02.png", title: "系统示意 02" },
              { type: "image", role: "concept", src: "/fitting-reality/concept/concept_sketch_01.png", title: "概念草图" },
              { type: "image", role: "concept", src: "/fitting-reality/concept/concept_sketch_02.png", title: "概念草图 02" },
              { type: "image", role: "process", src: "/fitting-reality/process/process_setup_01.jpg", title: "过程照片" },
              { type: "image", role: "process", src: "/fitting-reality/process/process_setup_02.jpg", title: "过程照片 02" },
            ],
          },
          {
            slug: "electromagnetic-decay",
            title: "电磁腐烂",
            status: "in-progress",
            summary:
              "电磁频谱的美学转译：从干扰、衰减到控制欲望的声像叙事。——【补充：项目简介、装置图、演示视频】",
            tags: ["电磁", "控制/干扰", "虚无主义"],
            bg: { src: "/bg-electromagnetic-decay.jpg", position: "center", fit: "cover" },
            media: {
              videos: ["/Decay.mp4"],
              audios: [
                "/testdemoV1_20250928_161549_demo_clean.wav",
                "/testdemoV1_20250928_161549_demo_fm.wav",
                "/testdemoV1_20250928_161549_demo_fx.wav",
                "/testdemoV1_20250928_161549_demo_fxfm.wav",
                "/testdemoV2_20250928_163730_demo_clean.wav",
                "/testdemoV2_20250928_163730_demo_fm.wav",
                "/testdemoV2_20250928_163730_demo_fx.wav",
                "/testdemoV2_20250928_163730_demo_fxfm.wav"
              ],
              images: [
                "/em-decay-1.jpg",
                "/em-decay-2.jpg"
              ],
            },
            mediaGroups: {
              videos: [ { label: "演示 Demos", items: ["/Decay.mp4"] } ],
              audios: [
                { label: "演示 Demo V1", items: [
                  "/testdemoV1_20250928_161549_demo_clean.wav",
                  "/testdemoV1_20250928_161549_demo_fm.wav",
                  "/testdemoV1_20250928_161549_demo_fx.wav",
                  "/testdemoV1_20250928_161549_demo_fxfm.wav"
                ]},
                { label: "演示 Demo V2", items: [
                  "/testdemoV2_20250928_163730_demo_clean.wav",
                  "/testdemoV2_20250928_163730_demo_fm.wav",
                  "/testdemoV2_20250928_163730_demo_fx.wav",
                  "/testdemoV2_20250928_163730_demo_fxfm.wav"
                ]}
              ],
              images: [ { label: "装置 Installation", items: ["/em-decay-1.jpg", "/em-decay-2.jpg"] } ]
            },
            updates: [
              { date: "v0.1", text: "原型阶段 — 使用 sounddevice 捕获麦克风并回放；初步集成 rtlsdr，实现 SDR 采样与 FM 解调；仅命令行运行，交互性低" },
              { date: "v0.3", text: "FX 初版 — 加入低通滤波 + 颤音 + 粉红噪声效果链；支持三种模式：CLEAN / FX / FX+FM；热键：1/2/3 切换模式；q 退出" },
              { date: "v0.5", text: "多轨录音 — 新增录音功能：r 开始/停止；自动保存 clean/fx/fxfm 三轨 WAV 文件；文件命名加入时间戳 + tag" },
              { date: "v0.7", text: "可调腐烂感 — 热键扩展：调节混合度、FM 覆盖、噪声量、低通上下限、颤音速率/深度；支持调节 SDR 频率/增益；引入 RSSI 映射窗口，增强动态感" },
              { date: "v1.0", text: "稳定版 — 完整热键系统 + 状态打印；修复 stdin 卡死问题，退出自动恢复终端；增强错误处理，设备不可用时优雅退出" },
              { date: "v1.2", text: "应用化 — 新增 run.sh：自动识别声卡、SDR；新增 launch.sh + install.sh：支持桌面双击启动；统一录音目录 ~/captures" },
              { date: "v1.3", text: "优化 — 录音结束/退出时自动保存残余数据；精简运行日志，优化错误输出；PortAudio 格式错误自动 fallback" },
            ],
            updatesTxt: "/updates/electromagnetic-decay.txt",
            briefTxt: withBrief("Electromagnetic Decay"),
            mediaItems: [
              { type: "image", role: "hero", src: "/electromagnetic-decay/hero/hero_01.jpg", title: "频谱视角" },
              { type: "image", role: "hero", src: "/electromagnetic-decay/hero/hero_02.jpg", title: "频谱视角 02" },
              { type: "video", role: "experience", src: "/electromagnetic-decay/experience/experience_01.mp4", title: "体验片段" },
              { type: "video", role: "experience", src: "/electromagnetic-decay/experience/experience_02.mp4", title: "体验片段 02" },
              { type: "image", role: "experience", src: "/electromagnetic-decay/experience/experience_03.jpg", title: "体验静帧" },
              { type: "audio", role: "doc", src: "/electromagnetic-decay/docs/doc_01.wav", title: "文档音频" },
              { type: "image", role: "doc", src: "/electromagnetic-decay/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/electromagnetic-decay/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/electromagnetic-decay/system/system_diagram_01.png", title: "系统示意" },
              { type: "image", role: "system", src: "/electromagnetic-decay/system/system_diagram_02.png", title: "系统示意 02" },
              { type: "image", role: "concept", src: "/electromagnetic-decay/concept/concept_sketch_01.jpg", title: "概念草图" },
              { type: "image", role: "concept", src: "/electromagnetic-decay/concept/concept_sketch_02.jpg", title: "概念草图 02" },
              { type: "image", role: "process", src: "/electromagnetic-decay/process/process_setup_01.jpg", title: "过程照片" },
              { type: "image", role: "process", src: "/electromagnetic-decay/process/process_setup_02.jpg", title: "过程照片 02" },
            ],
          },
        ],
        reading: [
          "Heidegger – The Question Concerning Technology",
          "Ellul – The Technological Society",
          "Simondon – On the Mode of Existence of Technical Objects",
        ],
      },
      {
        id: "ren",
        title: "反刍",
        color: "from-zinc-900 via-neutral-800 to-stone-700",
        intro:
          "作为高敏感个体在反刍思维中的困境；多线思绪与自我坠落之间的张力。",
        projects: [
          {
            slug: "dys-utopia",
            title: "Dys/Utopia",
            status: "completed",
            summary:
              "以粒子/融化/镜像人头的机制，视觉化‘思绪万千’与‘虚无遁形’。——【补充：技术栈、交互逻辑、视频】",
            tags: ["反刍思维", "感知", "生成视觉"],
            bg: { src: "/bg-dys-utopia.jpg", position: "50% 40%", fit: "cover" },
            media: { videos: ["/dys-utopia.mp4"] },
            mediaGroups: {
              videos: [ { label: "最终稿 Final", items: ["/dys-utopia.mp4"] } ]
            },
            // 仅保留 PDF，避免缺失 TXT/MD 产生 404
            docPdf: "/Dys_Utopia_Report.pdf",
            updates: [
              { date: "2025-05-03", text: "展映并收集观众对交互节奏的反馈。" },
              { date: "2025-04-02", text: "项目完结并归档。" }
            ],
            briefTxt: withBrief("Dys/Utopia"),
            mediaItems: [
              { type: "image", role: "hero", src: "/dys-utopia/hero/hero_01.jpg", title: "装置视角" },
              { type: "image", role: "hero", src: "/dys-utopia/hero/hero_02.jpg", title: "装置细节" },
              { type: "video", role: "experience", src: "/dys-utopia/experience/experience_01.mp4", title: "体验片段" },
              { type: "image", role: "experience", src: "/dys-utopia/experience/experience_02.jpg", title: "体验静帧" },
              { type: "image", role: "doc", src: "/dys-utopia/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/dys-utopia/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/dys-utopia/system/system_diagram_01.png", title: "系统示意" },
              { type: "image", role: "system", src: "/dys-utopia/system/system_diagram_02.png", title: "系统示意 02" },
              { type: "image", role: "concept", src: "/dys-utopia/concept/concept_sketch_01.jpg", title: "概念草图" },
              { type: "image", role: "concept", src: "/dys-utopia/concept/concept_sketch_02.jpg", title: "概念草图 02" },
              { type: "image", role: "process", src: "/dys-utopia/process/process_setup_01.jpg", title: "过程照片" },
              { type: "image", role: "process", src: "/dys-utopia/process/process_setup_02.jpg", title: "过程照片 02" },
            ],
          },
        ],
        reading: [
          "Sartre – Being and Nothingness (选读)",
          "Kernis – Self-Esteem Stability Model (关联自我评价与不稳定性)",
        ],
      },
      {
        id: "di",
        title: "连接",
        color: "from-amber-900 via-amber-800 to-amber-700",
        intro:
          "探讨主观体验如何以数据的形式进入系统，并在反馈循环中转化为新的视觉与情绪模式。",
        projects: [
          {
            slug: "bloom-system",
            title: "Bloom System",
            status: "planning",
            summary:
              "以影像、声音与文字叙事组织‘地理—记忆—身份’三角；探索民族/地域文化的当代再叙事。——【补充：田野素材与计划】",
            tags: ["身体数据", "噪声系统", "图像扰动"],
            bg: { src: "/bg-roots.jpg", position: "center" },
            media: { images: [], videos: [], audios: [] },
            docTxt: "/docs/roots-and-lands.md",
            overviewTxt: "/docs/roots-and-lands-overview.txt",
            updates: [
              { date: "2025-09-01", text: "采集家乡田野照片与环境声。" }
            ],
            briefTxt: withBrief("Bloom System"),
            mediaItems: [
              { type: "image", role: "hero", src: "/bloom-system/hero/hero_01.jpg", title: "田野照片" },
              { type: "image", role: "hero", src: "/bloom-system/hero/hero_02.jpg", title: "田野照片 02" },
              { type: "video", role: "experience", src: "/bloom-system/experience/experience_01.mp4", title: "体验片段" },
              { type: "image", role: "experience", src: "/bloom-system/experience/experience_02.jpg", title: "体验静帧" },
              { type: "image", role: "doc", src: "/bloom-system/docs/doc_01.jpg" },
              { type: "image", role: "doc", src: "/bloom-system/docs/doc_02.jpg" },
              { type: "image", role: "system", src: "/bloom-system/system/system_diagram_01.png", title: "系统示意" },
              { type: "image", role: "system", src: "/bloom-system/system/system_diagram_02.png", title: "系统示意 02" },
              { type: "image", role: "concept", src: "/bloom-system/concept/concept_sketch_01.jpg", title: "概念草图" },
              { type: "image", role: "concept", src: "/bloom-system/concept/concept_sketch_02.jpg", title: "概念草图 02" },
              { type: "image", role: "process", src: "/bloom-system/process/process_setup_01.jpg", title: "过程照片" },
              { type: "image", role: "process", src: "/bloom-system/process/process_setup_02.jpg", title: "过程照片 02" },
            ],
          },
        ],
        reading: [
          "Yi-Fu Tuan – Space and Place",
          "Pauline Boss – Ambiguous Loss (与‘离散/缺席’的文化维度相连)",
        ],
      },
    ],
  },
};
