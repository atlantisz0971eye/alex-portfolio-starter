"use client";

type IntroOverlayProps = {
  open: boolean;
  onClose: () => void;
  onNavigate: (id: string) => void;
};

export function IntroOverlay({ open, onClose, onNavigate }: IntroOverlayProps) {
  if (!open) return null;
  return (
    <div
      className="intro-backdrop fixed inset-0 z-[400] flex flex-col items-center justify-center text-center space-y-10 p-6"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div className="absolute inset-0 -z-10 backdrop-blur-3xl bg-[radial-gradient(circle_at_30%_30%,rgba(255,255,255,0.15),transparent_60%),radial-gradient(circle_at_70%_70%,rgba(255,255,255,0.10),transparent_60%),linear-gradient(135deg,rgba(255,255,255,0.05)_0%,rgba(0,0,0,0.8)_100%)] animate-glassflow" />
      <h1
        className="text-4xl md:text-6xl font-semibold tracking-wide mb-8 select-none"
        onClick={(e) => e.stopPropagation()}
      >
        Alex Projects
      </h1>
      <div className="flex flex-col gap-6 text-2xl md:text-3xl font-light text-white/85" onClick={(e) => e.stopPropagation()}>
        <a
          href="#tian"
          onClick={(e) => {
            e.preventDefault();
            onClose();
            setTimeout(() => onNavigate("tian"), 50);
          }}
          className="hover:text-white transition-all duration-200"
        >
          ☁ Technology
        </a>
        <a
          href="#ren"
          onClick={(e) => {
            e.preventDefault();
            onClose();
            setTimeout(() => onNavigate("ren"), 50);
          }}
          className="hover:text-white transition-all duration-200"
        >
          👤 Rumination
        </a>
        <a
          href="#di"
          onClick={(e) => {
            e.preventDefault();
            onClose();
            setTimeout(() => onNavigate("di"), 50);
          }}
          className="hover:text-white transition-all duration-200"
        >
          🌍 Connection
        </a>
      </div>
    </div>
  );
}
