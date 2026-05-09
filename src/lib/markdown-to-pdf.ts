import { marked, type Token, type Tokens } from "marked";
import type { Content, ContentText, TDocumentDefinitions } from "pdfmake/interfaces";

const COLORS = {
  title: "#1a1a2e",
  subtitle: "#555770",
  heading: "#1a1a2e",
  body: "#2d2d3a",
  muted: "#71717a",
  accent: "#6366f1",
  tableBorder: "#e2e2e8",
  tableHeaderBg: "#f4f4f8",
  tableStripe: "#fafafc",
  hrColor: "#e2e2e8",
};

type InlineContent = string | ContentText;

function renderInlineTokens(tokens: Token[] | undefined): InlineContent[] {
  if (!tokens) return [];
  const result: InlineContent[] = [];

  for (const t of tokens) {
    switch (t.type) {
      case "text": {
        const tok = t as Tokens.Text;
        if (tok.tokens && tok.tokens.length > 0) {
          result.push(...renderInlineTokens(tok.tokens));
        } else {
          result.push(tok.text);
        }
        break;
      }
      case "strong": {
        const tok = t as Tokens.Strong;
        const inner = renderInlineTokens(tok.tokens);
        for (const item of inner) {
          if (typeof item === "string") {
            result.push({ text: item, bold: true });
          } else {
            result.push({ ...item, bold: true });
          }
        }
        break;
      }
      case "em": {
        const tok = t as Tokens.Em;
        const inner = renderInlineTokens(tok.tokens);
        for (const item of inner) {
          if (typeof item === "string") {
            result.push({ text: item, italics: true });
          } else {
            result.push({ ...item, italics: true });
          }
        }
        break;
      }
      case "codespan": {
        const tok = t as Tokens.Codespan;
        result.push({
          text: tok.text,
          font: "Courier",
          fontSize: 9,
          background: "#f0f0f4",
        } as ContentText);
        break;
      }
      case "link": {
        const tok = t as Tokens.Link;
        const inner = renderInlineTokens(tok.tokens);
        for (const item of inner) {
          if (typeof item === "string") {
            result.push({
              text: item,
              link: tok.href,
              color: COLORS.accent,
              decoration: "underline" as unknown as undefined,
            } as ContentText);
          } else {
            result.push({
              ...item,
              link: tok.href,
              color: COLORS.accent,
              decoration: "underline" as unknown as undefined,
            } as ContentText);
          }
        }
        break;
      }
      case "br":
        result.push("\n");
        break;
      default:
        if ("text" in t && typeof (t as { text: string }).text === "string") {
          result.push((t as { text: string }).text);
        }
        break;
    }
  }

  return result;
}

function renderBlockTokens(tokens: Token[]): Content[] {
  const content: Content[] = [];

  for (const token of tokens) {
    switch (token.type) {
      case "heading": {
        const tok = token as Tokens.Heading;
        const sizeMap: Record<number, number> = { 1: 18, 2: 15, 3: 13 };
        content.push({
          text: renderInlineTokens(tok.tokens),
          fontSize: sizeMap[tok.depth] ?? 12,
          bold: true,
          color: COLORS.heading,
          margin: [0, tok.depth === 1 ? 16 : 12, 0, 4],
        } as Content);
        break;
      }

      case "paragraph": {
        const tok = token as Tokens.Paragraph;
        content.push({
          text: renderInlineTokens(tok.tokens),
          fontSize: 10.5,
          color: COLORS.body,
          lineHeight: 1.5,
          margin: [0, 0, 0, 8],
        } as Content);
        break;
      }

      case "table": {
        const tok = token as Tokens.Table;
        const colCount = tok.header.length;

        const headerRow = tok.header.map((cell) => ({
          text: renderInlineTokens(cell.tokens),
          bold: true,
          fontSize: 9.5,
          color: COLORS.heading,
          fillColor: COLORS.tableHeaderBg,
          margin: [6, 6, 6, 6],
        }));

        const bodyRows = tok.rows.map((row, rowIdx) =>
          row.map((cell) => ({
            text: renderInlineTokens(cell.tokens),
            fontSize: 9.5,
            color: COLORS.body,
            fillColor: rowIdx % 2 === 1 ? COLORS.tableStripe : undefined,
            margin: [6, 4, 6, 4],
          }))
        );

        content.push({
          table: {
            headerRows: 1,
            widths: Array(colCount).fill("*"),
            body: [headerRow, ...bodyRows],
          },
          layout: {
            hLineWidth: () => 0.5,
            vLineWidth: () => 0.5,
            hLineColor: () => COLORS.tableBorder,
            vLineColor: () => COLORS.tableBorder,
            paddingLeft: () => 0,
            paddingRight: () => 0,
            paddingTop: () => 0,
            paddingBottom: () => 0,
          },
          margin: [0, 4, 0, 12],
        } as unknown as Content);
        break;
      }

      case "list": {
        const tok = token as Tokens.List;
        const items = tok.items.map((item) => {
          const inner = item.tokens ? renderBlockTokens(item.tokens) : [];
          if (inner.length === 1) {
            const first = inner[0];
            if (typeof first === "object" && "text" in first) {
              return { text: (first as ContentText).text, fontSize: 10.5, color: COLORS.body, lineHeight: 1.4 };
            }
          }
          if (inner.length === 0) {
            return { text: item.text, fontSize: 10.5, color: COLORS.body, lineHeight: 1.4 };
          }
          return { stack: inner, fontSize: 10.5, color: COLORS.body } as Content;
        });

        content.push({
          [tok.ordered ? "ol" : "ul"]: items,
          margin: [0, 0, 0, 8],
        } as unknown as Content);
        break;
      }

      case "hr": {
        content.push({
          canvas: [
            {
              type: "line",
              x1: 0,
              y1: 0,
              x2: 515,
              y2: 0,
              lineWidth: 0.5,
              lineColor: COLORS.hrColor,
            },
          ],
          margin: [0, 8, 0, 8],
        } as Content);
        break;
      }

      case "code": {
        const tok = token as Tokens.Code;
        content.push({
          text: tok.text,
          font: "Courier",
          fontSize: 9,
          color: COLORS.body,
          background: "#f4f4f8",
          margin: [8, 6, 8, 10],
          preserveLeadingSpaces: true,
        } as Content);
        break;
      }

      case "blockquote": {
        const tok = token as Tokens.Blockquote;
        const inner = renderBlockTokens(tok.tokens);
        content.push({
          stack: inner,
          margin: [12, 4, 0, 8],
          border: [true, false, false, false],
          borderColor: [COLORS.accent, "", "", ""],
          color: COLORS.muted,
          italics: true,
        } as Content);
        break;
      }

      case "space":
        break;

      default: {
        if ("text" in token && typeof (token as { text: string }).text === "string") {
          content.push({
            text: (token as { text: string }).text,
            fontSize: 10.5,
            color: COLORS.body,
            margin: [0, 0, 0, 6],
          } as Content);
        }
        break;
      }
    }
  }

  return content;
}

export function markdownToDocDefinition(
  title: string,
  markdownContent: string,
  subtitle?: string
): TDocumentDefinitions {
  const tokens = marked.lexer(markdownContent);
  const body = renderBlockTokens(tokens);

  const headerContent: Content[] = [
    {
      text: title,
      fontSize: 22,
      bold: true,
      color: COLORS.title,
      margin: [0, 0, 0, subtitle ? 4 : 12],
    },
  ];

  if (subtitle) {
    headerContent.push({
      text: subtitle,
      fontSize: 11,
      color: COLORS.subtitle,
      margin: [0, 0, 0, 12],
    });
  }

  headerContent.push({
    canvas: [
      {
        type: "line",
        x1: 0,
        y1: 0,
        x2: 515,
        y2: 0,
        lineWidth: 1,
        lineColor: COLORS.accent,
      },
    ],
    margin: [0, 0, 0, 16],
  } as Content);

  return {
    content: [...headerContent, ...body],
    defaultStyle: {
      font: "Roboto",
      fontSize: 10.5,
      lineHeight: 1.4,
    },
    pageMargins: [40, 40, 40, 50],
    footer: (currentPage: number, pageCount: number) => ({
      columns: [
        {
          text: new Date().toLocaleDateString("en-US", {
            year: "numeric",
            month: "long",
            day: "numeric",
          }),
          fontSize: 8,
          color: COLORS.muted,
          margin: [40, 0, 0, 0],
        },
        {
          text: `${currentPage} / ${pageCount}`,
          fontSize: 8,
          color: COLORS.muted,
          alignment: "right" as const,
          margin: [0, 0, 40, 0],
        },
      ],
    }),
  };
}
