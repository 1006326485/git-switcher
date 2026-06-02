import { memo, useMemo } from "react";

interface MarkdownViewerProps {
  content: string;
}

export const MarkdownViewer = memo(function MarkdownViewer({ content }: MarkdownViewerProps) {
  const blocks = useMemo(() => parseBlocks(content), [content]);

  return (
    <div className="space-y-3 text-sm leading-relaxed">
      {blocks.map((block, i) => (
        <Block key={i} block={block} index={i} />
      ))}
    </div>
  );
});

// ── Block-level parsing ────────────────────────────────────────────────

type BlockType =
  | { type: "heading"; level: number; text: string }
  | { type: "code"; lang: string; code: string }
  | { type: "list"; ordered: boolean; items: string[] }
  | { type: "paragraph"; text: string };

function parseBlocks(md: string): BlockType[] {
  const lines = md.split("\n");
  const blocks: BlockType[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];

    // Empty line — skip
    if (line.trim() === "") {
      i++;
      continue;
    }

    // Code block
    if (line.trim().startsWith("```")) {
      const lang = line.trim().slice(3).trim();
      const codeLines: string[] = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith("```")) {
        codeLines.push(lines[i]);
        i++;
      }
      i++; // skip closing ```
      blocks.push({ type: "code", lang, code: codeLines.join("\n") });
      continue;
    }

    // Heading
    const headingMatch = line.match(/^(#{1,6})\s+(.+)/);
    if (headingMatch) {
      blocks.push({ type: "heading", level: headingMatch[1].length, text: headingMatch[2] });
      i++;
      continue;
    }

    // Ordered list items (lines starting with 1. 2. etc.)
    if (/^\s*\d+\.\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*\d+\.\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*\d+\.\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: true, items });
      continue;
    }

    // Unordered list items (lines starting with - or *)
    if (/^\s*[-*]\s/.test(line)) {
      const items: string[] = [];
      while (i < lines.length && /^\s*[-*]\s/.test(lines[i])) {
        items.push(lines[i].replace(/^\s*[-*]\s+/, ""));
        i++;
      }
      blocks.push({ type: "list", ordered: false, items });
      continue;
    }

    // Paragraph — collect consecutive non-empty, non-special lines
    const paraLines: string[] = [];
    while (
      i < lines.length &&
      lines[i].trim() !== "" &&
      !lines[i].trim().startsWith("```") &&
      !/^#{1,6}\s/.test(lines[i]) &&
      !/^\s*[-*]\s/.test(lines[i]) &&
      !/^\s*\d+\.\s/.test(lines[i])
    ) {
      paraLines.push(lines[i]);
      i++;
    }
    if (paraLines.length > 0) {
      blocks.push({ type: "paragraph", text: paraLines.join(" ") });
    }
  }

  return blocks;
}

// ── Block renderer ──────────────────────────────────────────────────────

function Block({ block, index }: { block: BlockType; index: number }) {
  switch (block.type) {
    case "heading":
      return <Heading level={block.level} text={block.text} blockKey={index} />;
    case "code":
      return <CodeBlock lang={block.lang} code={block.code} />;
    case "list":
      return <ListBlock items={block.items} ordered={block.ordered} blockKey={index} />;
    case "paragraph":
      return <p className="text-gray-700 dark:text-gray-300">{renderInline(block.text, index)}</p>;
  }
}

function Heading({ level, text, blockKey }: { level: number; text: string; blockKey: number }) {
  const cls =
    level <= 2
      ? "text-base font-bold text-gray-900 dark:text-gray-100 border-b border-gray-200 dark:border-gray-700 pb-1 mt-4 first:mt-0"
      : "text-sm font-semibold text-gray-800 dark:text-gray-200 mt-3";
  if (level <= 1) return <h1 className={cls}>{renderInline(text, blockKey)}</h1>;
  if (level === 2) return <h2 className={cls}>{renderInline(text, blockKey)}</h2>;
  if (level === 3) return <h3 className={cls}>{renderInline(text, blockKey)}</h3>;
  if (level === 4) return <h4 className={cls}>{renderInline(text, blockKey)}</h4>;
  if (level === 5) return <h5 className={cls}>{renderInline(text, blockKey)}</h5>;
  return <h6 className={cls}>{renderInline(text, blockKey)}</h6>;
}

function CodeBlock({ lang, code }: { lang: string; code: string }) {
  return (
    <div className="rounded-lg bg-gray-900 dark:bg-black/40 overflow-hidden">
      {lang && (
        <div className="px-3 py-1 text-xs text-gray-400 bg-gray-800 dark:bg-gray-900 border-b border-gray-700">
          {lang}
        </div>
      )}
      <pre className="p-3 overflow-x-auto text-xs leading-relaxed">
        <code className="text-gray-200">{code}</code>
      </pre>
    </div>
  );
}

function ListBlock({ items, ordered, blockKey }: { items: string[]; ordered: boolean; blockKey: number }) {
  const Tag = ordered ? "ol" : "ul";
  return (
    <Tag className={`space-y-1.5 pl-4 ${ordered ? "list-decimal" : "list-none"}`}>
      {items.map((item, i) => (
        <li key={i} className="text-gray-700 dark:text-gray-300 relative pl-2">
          {!ordered && <span className="absolute -left-2 text-gray-400" aria-hidden="true">•</span>}
          {renderInline(item, blockKey)}
        </li>
      ))}
    </Tag>
  );
}

// ── Inline formatting ───────────────────────────────────────────────────

function renderInline(text: string, blockKey?: number): React.ReactNode {
  // Split on inline code, bold, and file references
  const parts: React.ReactNode[] = [];
  let remaining = text;
  let key = blockKey != null ? blockKey * 1000 : 0;

  while (remaining.length > 0) {
    // Inline code `...`
    const codeMatch = remaining.match(/`([^`]+)`/);
    // Bold **...**
    const boldMatch = remaining.match(/\*\*([^*]+)\*\*/);

    // Find earliest match
    let earliest = -1;
    let matchType = "";
    let matchLen = 0;

    if (codeMatch && (earliest === -1 || remaining.indexOf(codeMatch[0]) < earliest)) {
      earliest = remaining.indexOf(codeMatch[0]);
      matchType = "code";
      matchLen = codeMatch[0].length;
    }
    if (boldMatch && (earliest === -1 || remaining.indexOf(boldMatch[0]) < earliest)) {
      earliest = remaining.indexOf(boldMatch[0]);
      matchType = "bold";
      matchLen = boldMatch[0].length;
    }

    if (earliest === -1) {
      parts.push(remaining);
      break;
    }

    // Text before match
    if (earliest > 0) {
      parts.push(remaining.slice(0, earliest));
    }

    if (matchType === "code") {
      parts.push(
        <code
          key={key++}
          className="px-1.5 py-0.5 rounded bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 text-xs font-mono"
        >
          {codeMatch![1]}
        </code>
      );
    } else if (matchType === "bold") {
      parts.push(
        <strong key={key++} className="font-semibold text-gray-900 dark:text-gray-100">
          {boldMatch![1]}
        </strong>
      );
    }

    remaining = remaining.slice(earliest + matchLen);
  }

  return parts;
}
