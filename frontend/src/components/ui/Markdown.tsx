import type { ReactNode } from "react";

/**
 * Minimal, safe Markdown for counselor replies: paragraphs, headings,
 * bullet and numbered lists, **bold**, *italic*. Raw HTML is never
 * rendered; text is passed to React as strings.
 */

function inline(text: string, keyPrefix: string): ReactNode[] {
  const parts: ReactNode[] = [];
  const pattern = /(\*\*[^*]+\*\*|\*[^*\s][^*]*\*)/g;
  let last = 0;
  let index = 0;

  for (const match of text.matchAll(pattern)) {
    const start = match.index ?? 0;

    if (start > last) {
      parts.push(text.slice(last, start));
    }

    const token = match[0];

    if (token.startsWith("**")) {
      parts.push(
        <strong key={`${keyPrefix}-b${index}`} className="font-semibold text-ink">
          {token.slice(2, -2)}
        </strong>
      );
    } else {
      parts.push(<em key={`${keyPrefix}-i${index}`}>{token.slice(1, -1)}</em>);
    }

    last = start + token.length;
    index += 1;
  }

  if (last < text.length) {
    parts.push(text.slice(last));
  }

  return parts;
}

type Block =
  | { kind: "p"; text: string }
  | { kind: "h"; text: string }
  | { kind: "ul"; items: string[] }
  | { kind: "ol"; items: string[] };

function parse(source: string): Block[] {
  const blocks: Block[] = [];
  const lines = source.replace(/\r\n/g, "\n").split("\n");
  let paragraph: string[] = [];

  const flush = () => {
    if (paragraph.length) {
      blocks.push({ kind: "p", text: paragraph.join(" ") });
      paragraph = [];
    }
  };

  for (const raw of lines) {
    const line = raw.trim();

    if (!line) {
      flush();
      continue;
    }

    const heading = line.match(/^#{1,4}\s+(.*)$/);
    const bullet = line.match(/^[-*•]\s+(.*)$/);
    const numbered = line.match(/^\d{1,2}[.)]\s+(.*)$/);

    if (heading) {
      flush();
      blocks.push({ kind: "h", text: heading[1] });
    } else if (bullet || numbered) {
      flush();
      const kind = bullet ? "ul" : "ol";
      const text = (bullet ?? numbered)![1];
      const previous = blocks[blocks.length - 1];

      if (previous && previous.kind === kind) {
        previous.items.push(text);
      } else {
        blocks.push({ kind, items: [text] });
      }
    } else {
      paragraph.push(line);
    }
  }

  flush();

  return blocks;
}

export function Markdown({ text, className = "" }: { text: string; className?: string }) {
  const blocks = parse(text);

  return (
    <div className={`prose-chat ${className}`}>
      {blocks.map((block, index) => {
        const key = `blk-${index}`;

        if (block.kind === "h") {
          return (
            <p key={key} className="mt-3 font-semibold text-ink first:mt-0">
              {inline(block.text, key)}
            </p>
          );
        }

        if (block.kind === "ul" || block.kind === "ol") {
          const List = block.kind === "ul" ? "ul" : "ol";

          return (
            <List
              key={key}
              className={`space-y-1.5 pl-5 ${block.kind === "ul" ? "list-disc marker:text-primary/60" : "list-decimal marker:font-semibold marker:text-primary"}`}
            >
              {block.items.map((item, itemIndex) => (
                <li key={`${key}-${itemIndex}`} className="pl-1">
                  {inline(item, `${key}-${itemIndex}`)}
                </li>
              ))}
            </List>
          );
        }

        return <p key={key}>{inline(block.text, key)}</p>;
      })}
    </div>
  );
}

