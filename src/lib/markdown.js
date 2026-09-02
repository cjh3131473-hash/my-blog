import { Marked, Renderer } from 'marked';
import hljs from 'highlight.js';
import { escapeHtml, slugify, stripTags } from './template.js';

// 마크다운을 HTML로 변환한다.
// 하이라이팅과 헤딩 id 부여를 여기서 모두 끝낸다 — 브라우저에서 하는 일은 없다.
export function renderMarkdown(source) {
  const headings = [];
  const usedSlugs = new Map();

  const uniqueSlug = (text) => {
    const base = slugify(text);
    const count = usedSlugs.get(base) ?? 0;
    usedSlugs.set(base, count + 1);
    return count === 0 ? base : `${base}-${count + 1}`;
  };

  const marked = new Marked({ gfm: true, breaks: false });

  marked.use({
    renderer: {
      code({ text, lang }) {
        const language = String(lang ?? '').trim().split(/\s+/)[0];
        const known = language && hljs.getLanguage(language);
        // hljs.highlight 는 이스케이프된 HTML을 돌려준다.
        const body = known
          ? hljs.highlight(text, { language, ignoreIllegals: true }).value
          : escapeHtml(text);
        const langClass = known ? ` language-${language}` : '';
        const langAttr = known ? ` data-lang="${escapeHtml(language)}"` : '';
        return `<pre class="code-block"${langAttr} tabindex="0"><code class="hljs${langClass}">${body}</code></pre>\n`;
      },

      heading({ tokens, depth }) {
        const html = this.parser.parseInline(tokens);
        const plain = stripTags(html);
        const id = uniqueSlug(plain);
        if (depth >= 2 && depth <= 3) headings.push({ id, depth, text: plain });
        return `<h${depth} id="${id}">${html}</h${depth}>\n`;
      },

      link({ href, title, tokens }) {
        const html = this.parser.parseInline(tokens);
        const attrs = [`href="${escapeHtml(href)}"`];
        if (title) attrs.push(`title="${escapeHtml(title)}"`);
        if (/^https?:\/\//i.test(href)) {
          attrs.push('target="_blank"', 'rel="noopener noreferrer"');
        }
        return `<a ${attrs.join(' ')}>${html}</a>`;
      },

      image({ href, title, text }) {
        const attrs = [
          `src="${escapeHtml(href)}"`,
          `alt="${escapeHtml(text ?? '')}"`,
          'loading="lazy"',
          'decoding="async"',
        ];
        if (title) attrs.push(`title="${escapeHtml(title)}"`);
        return `<img ${attrs.join(' ')}>`;
      },

      // 표는 자체 컨테이너 안에서만 가로 스크롤하게 감싼다.
      // 그래야 좁은 화면에서 페이지 전체가 밀리지 않는다.
      // tabindex 를 주는 이유: 스크롤 영역은 키보드로도 스크롤할 수 있어야 한다.
      table(token) {
        const html = Renderer.prototype.table.call(this, token);
        return `<div class="table-scroll" tabindex="0" role="region" aria-label="표">${html}</div>\n`;
      },
    },
  });

  const html = marked.parse(source);
  return { html, headings, text: stripTags(html) };
}
