/**
 * Recco.App:
 * - `src/@editor/block-text/EmailMarkdown.tsx` — `marked.parse` + `insane` + `CustomRenderer`
 * - `src/app/main/apps/home/chat/Chat.js` — unescape chain before `<Markdown>`
 *
 * HR API streams are often one glued line (see sampleResponse.txt). We optionally normalize
 * those shapes to Markdown so `marked` emits headings/lists/hr — otherwise CSS has almost nothing to style.
 * Reference root: D:\9.0\Recco.App\src
 */
import insane, { type AllowedTags } from 'insane';
import { marked, Renderer } from 'marked';
import { useMemo } from 'react';
import { normalizeApiTextToMarkdown, shouldNormalizeApiShape } from '../utils/chatMarkdownNormalize';

const ALLOWED_TAGS: AllowedTags[] = [
  'a',
  'article',
  'b',
  'blockquote',
  'br',
  'caption',
  'code',
  'del',
  'details',
  'div',
  'em',
  'h1',
  'h2',
  'h3',
  'h4',
  'h5',
  'h6',
  'hr',
  'i',
  'img',
  'ins',
  'kbd',
  'li',
  'main',
  'ol',
  'p',
  'pre',
  'section',
  'span',
  'strong',
  'sub',
  'summary',
  'sup',
  'table',
  'tbody',
  'td',
  'th',
  'thead',
  'tr',
  'u',
  'ul',
];
const GENERIC_ALLOWED_ATTRIBUTES = ['style', 'title'];

function sanitizer(html: string): string {
  return insane(html, {
    allowedTags: ALLOWED_TAGS,
    allowedAttributes: {
      ...ALLOWED_TAGS.reduce<Record<string, string[]>>((res, tag) => {
        res[tag] = [...GENERIC_ALLOWED_ATTRIBUTES];
        return res;
      }, {}),
      img: ['src', 'srcset', 'alt', 'width', 'height', ...GENERIC_ALLOWED_ATTRIBUTES],
      table: ['width', ...GENERIC_ALLOWED_ATTRIBUTES],
      td: ['align', 'width', ...GENERIC_ALLOWED_ATTRIBUTES],
      th: ['align', 'width', ...GENERIC_ALLOWED_ATTRIBUTES],
      a: ['href', 'target', ...GENERIC_ALLOWED_ATTRIBUTES],
      ol: ['start', ...GENERIC_ALLOWED_ATTRIBUTES],
      ul: ['start', ...GENERIC_ALLOWED_ATTRIBUTES],
    },
  });
}

class CustomRenderer extends Renderer {
  table(header: string, body: string) {
    return `<table width="100%">
<thead>
${header}</thead>
<tbody>
${body}</tbody>
</table>`;
  }

  link(href: string, title: string | null, text: string) {
    if (!title) {
      return `<a href="${href}" target="_blank">${text}</a>`;
    }
    return `<a href="${href}" title="${title}" target="_blank">${text}</a>`;
  }
}

function renderMarkdownString(str: string): string {
  const html = marked.parse(str, {
    async: false,
    breaks: true,
    gfm: true,
    pedantic: false,
    silent: false,
    renderer: new CustomRenderer(),
  });
  if (typeof html !== 'string') {
    throw new Error('marked.parse did not return a string');
  }
  return sanitizer(html);
}

// Recco Chat.js unescape chain; optional API-shape normalization (skip Recco double-asterisk-to-quote so Markdown emphasis survives).
function prepareChatMarkdownInput(raw: string): string {
  let t = raw
    .replace(/\\r\\n/g, '\r\n')
    .replace(/\\t/g, '\t')
    .replace(/\\n/g, '\n')
    .replace(/\\'/g, "'")
    .replace(/\\"/g, '"');
  if (shouldNormalizeApiShape(t)) {
    t = normalizeApiTextToMarkdown(t);
  }
  return t;
}

type ChatMarkdownProps = {
  markdown: string;
  className?: string;
};

export function ChatMarkdown({ markdown, className }: ChatMarkdownProps) {
  const html = useMemo(
    () => renderMarkdownString(prepareChatMarkdownInput(markdown)),
    [markdown]
  );

  return <div className={className} dangerouslySetInnerHTML={{ __html: html }} />;
}
