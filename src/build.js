import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import matter from 'gray-matter';

import site from '../site.config.js';
import { renderMarkdown } from './lib/markdown.js';
import { escapeHtml, render, slugify } from './lib/template.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const POSTS_DIR = path.join(ROOT, 'posts');
const APPS_DIR = path.join(ROOT, 'apps');
const DIST_DIR = path.join(ROOT, 'dist');
const TEMPLATE_DIR = path.join(ROOT, 'src', 'templates');
const ASSETS_DIR = path.join(ROOT, 'src', 'assets');

// Plan/Review 산출물은 앱 폴더 안에 있지만 배포물이 아니다 — dist 로 복사하지 않는다.
const APP_META_FILES = new Set(['spec.md', 'review.md']);

// 배포 위치가 정해지지 않았으므로 모든 경로는 상대 경로다.
// 페이지 깊이에 따라 이 접두사를 앞에 붙인다. 루트는 '', 한 단계 아래는 '../'.
const ROOT_BASE = '';
const NESTED_BASE = '../';

async function loadTemplates() {
  const names = ['base', 'index', 'post', 'tag', 'tags'];
  const entries = await Promise.all(
    names.map(async (name) => [
      name,
      await fs.readFile(path.join(TEMPLATE_DIR, `${name}.html`), 'utf8'),
    ]),
  );
  return Object.fromEntries(entries);
}

// gray-matter 는 `date: 2026-01-15` 를 Date 객체로 준다.
// 로컬 시간대 때문에 하루가 밀리지 않도록 UTC 기준으로 읽는다.
function toIsoDate(value, file) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) {
    return value.toISOString().slice(0, 10);
  }
  const text = String(value).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(text)) return text;
  throw new Error(`${file}: date 는 YYYY-MM-DD 형식이어야 합니다 (받은 값: ${value})`);
}

function formatDate(isoDate) {
  const [year, month, day] = isoDate.split('-');
  return `${year}년 ${Number(month)}월 ${Number(day)}일`;
}

function readingMinutes(text) {
  return Math.max(1, Math.round(text.length / site.charsPerMinute));
}

function excerptFrom(text, limit = 140) {
  if (text.length <= limit) return text;
  return `${text.slice(0, limit).trimEnd()}…`;
}

async function readPosts() {
  let files;
  try {
    files = await fs.readdir(POSTS_DIR);
  } catch {
    throw new Error(`posts/ 디렉터리를 찾을 수 없습니다: ${POSTS_DIR}`);
  }

  const markdownFiles = files.filter((name) => name.endsWith('.md')).sort();
  const posts = [];
  const drafts = [];

  for (const file of markdownFiles) {
    const raw = await fs.readFile(path.join(POSTS_DIR, file), 'utf8');
    const { data, content } = matter(raw);

    if (data.draft === true) {
      drafts.push(file);
      continue;
    }

    // 조용히 넘어가지 않는다. 필수 항목이 빠지면 빌드를 세운다.
    if (!data.title) throw new Error(`${file}: 프론트매터에 title 이 없습니다.`);
    if (!data.date) throw new Error(`${file}: 프론트매터에 date 가 없습니다.`);

    const isoDate = toIsoDate(data.date, file);
    const { html, text } = renderMarkdown(content);
    const tags = Array.isArray(data.tags) ? data.tags.map(String) : [];

    posts.push({
      slug: file.replace(/\.md$/, ''),
      title: String(data.title),
      isoDate,
      displayDate: formatDate(isoDate),
      description: data.description ? String(data.description) : excerptFrom(text),
      tags,
      readingTime: readingMinutes(text),
      html,
    });
  }

  // 최신 글이 위로. 같은 날짜면 제목순으로 안정적으로 정렬한다.
  posts.sort((a, b) => b.isoDate.localeCompare(a.isoDate) || a.title.localeCompare(b.title));
  return { posts, drafts };
}

function appItemsHtml(apps, base) {
  return apps
    .map(
      (app) => `  <li class="app-item">
    <article>
      <h2><a href="${base}apps/${escapeHtml(app.slug)}/index.html">${escapeHtml(app.title)}</a></h2>
      <p class="app-excerpt">${escapeHtml(app.description)}</p>
      <div class="app-preview">
        <iframe src="${base}apps/${escapeHtml(app.slug)}/index.html" title="${escapeHtml(app.title)} 미리보기" loading="lazy"></iframe>
      </div>
    </article>
  </li>`,
    )
    .join('\n');
}

function appSectionHtml(apps, base) {
  if (apps.length === 0) return '';
  return `<section class="app-section" aria-labelledby="apps-heading">
  <h2 id="apps-heading" class="section-heading">미니 웹앱</h2>
  <ul class="app-list">
${appItemsHtml(apps, base)}
  </ul>
</section>`;
}

// apps/{slug}/index.html 이 없으면 site.config.js 오타를 빌드에서 잡는다.
async function copyApps(apps) {
  for (const app of apps) {
    const srcDir = path.join(APPS_DIR, app.slug);
    try {
      await fs.access(path.join(srcDir, 'index.html'));
    } catch {
      throw new Error(
        `site.config.js: apps 항목 "${app.slug}" 에 해당하는 apps/${app.slug}/index.html 을 찾을 수 없습니다.`,
      );
    }
    await fs.cp(srcDir, path.join(DIST_DIR, 'apps', app.slug), {
      recursive: true,
      filter: (source) => !APP_META_FILES.has(path.basename(source)),
    });
  }
}

function tagListHtml(tags, base) {
  if (tags.length === 0) return '';
  const items = tags
    .map(
      (tag) =>
        `<li><a class="tag" href="${base}tags/${escapeHtml(slugify(tag))}.html">${escapeHtml(tag)}</a></li>`,
    )
    .join('');
  return `<ul class="tag-list">${items}</ul>`;
}

function postItemsHtml(posts, base) {
  return posts
    .map(
      (post) => `  <li class="post-item">
    <article>
      <h2><a href="${base}posts/${escapeHtml(post.slug)}.html">${escapeHtml(post.title)}</a></h2>
      <p class="post-meta">
        <time datetime="${post.isoDate}">${post.displayDate}</time>
        <span aria-hidden="true">·</span>
        <span>약 ${post.readingTime}분</span>
      </p>
      <p class="post-excerpt">${escapeHtml(post.description)}</p>
      ${tagListHtml(post.tags, base)}
    </article>
  </li>`,
    )
    .join('\n');
}

// 배포 주소를 모르면 canonical / og:url 을 만들 수 없다. 그럴 땐 생략한다.
function headExtraFor(pathname, isArticle = false, isoDate = '') {
  const lines = [];
  if (site.url) {
    const url = `${site.url.replace(/\/$/, '')}/${pathname}`;
    lines.push(`<link rel="canonical" href="${escapeHtml(url)}">`);
    lines.push(`<meta property="og:url" content="${escapeHtml(url)}">`);
  }
  if (isArticle && isoDate) {
    lines.push(`<meta property="article:published_time" content="${isoDate}">`);
  }
  return lines.join('\n');
}

function wrapInBase(templates, { pageTitle, description, base, content, headExtra, ogType }) {
  return render(
    templates.base,
    {
      pageTitle,
      description,
      base,
      content,
      headExtra,
      ogType,
      siteName: site.title,
      author: site.author,
      year: new Date().getFullYear(),
    },
    'base.html',
  );
}

async function writePage(relativePath, html) {
  const target = path.join(DIST_DIR, relativePath);
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, html, 'utf8');
}

async function build() {
  const started = Date.now();
  const templates = await loadTemplates();
  const { posts, drafts } = await readPosts();

  await fs.rm(DIST_DIR, { recursive: true, force: true });
  await fs.mkdir(DIST_DIR, { recursive: true });

  const apps = site.apps ?? [];
  await copyApps(apps);

  // 목록 페이지
  await writePage(
    'index.html',
    wrapInBase(templates, {
      pageTitle: site.title,
      description: site.description,
      base: ROOT_BASE,
      ogType: 'website',
      headExtra: headExtraFor('index.html'),
      content: render(
        templates.index,
        {
          siteName: site.title,
          siteDescription: site.description,
          appSection: appSectionHtml(apps, ROOT_BASE),
          postItems: postItemsHtml(posts, ROOT_BASE),
        },
        'index.html',
      ),
    }),
  );

  // 글 페이지
  for (const [index, post] of posts.entries()) {
    const newer = posts[index - 1];
    const older = posts[index + 1];
    const navLinks = [
      older
        ? `<a class="nav-prev" href="${escapeHtml(older.slug)}.html"><span>이전 글</span>${escapeHtml(older.title)}</a>`
        : '',
      newer
        ? `<a class="nav-next" href="${escapeHtml(newer.slug)}.html"><span>다음 글</span>${escapeHtml(newer.title)}</a>`
        : '',
    ]
      .filter(Boolean)
      .join('\n');

    await writePage(
      `posts/${post.slug}.html`,
      wrapInBase(templates, {
        pageTitle: `${post.title} · ${site.title}`,
        description: post.description,
        base: NESTED_BASE,
        ogType: 'article',
        headExtra: headExtraFor(`posts/${post.slug}.html`, true, post.isoDate),
        content: render(
          templates.post,
          {
            title: post.title,
            isoDate: post.isoDate,
            displayDate: post.displayDate,
            readingTime: post.readingTime,
            tagList: tagListHtml(post.tags, NESTED_BASE),
            content: post.html,
            navLinks,
          },
          'post.html',
        ),
      }),
    );
  }

  // 태그별 묶기
  const byTag = new Map();
  for (const post of posts) {
    for (const tag of post.tags) {
      const slug = slugify(tag);
      if (!byTag.has(slug)) byTag.set(slug, { label: tag, posts: [] });
      byTag.get(slug).posts.push(post);
    }
  }

  for (const [slug, { label, posts: tagged }] of byTag) {
    await writePage(
      `tags/${slug}.html`,
      wrapInBase(templates, {
        pageTitle: `${label} · ${site.title}`,
        description: `${label} 태그가 붙은 글 ${tagged.length}개`,
        base: NESTED_BASE,
        ogType: 'website',
        headExtra: headExtraFor(`tags/${slug}.html`),
        content: render(
          templates.tag,
          {
            heading: `#${label}`,
            subtitle: `글 ${tagged.length}개`,
            postItems: postItemsHtml(tagged, NESTED_BASE),
          },
          'tag.html',
        ),
      }),
    );
  }

  const tagItems = [...byTag.entries()]
    .sort((a, b) => b[1].posts.length - a[1].posts.length || a[1].label.localeCompare(b[1].label))
    .map(
      ([slug, { label, posts: tagged }]) =>
        `  <li><a class="tag" href="${escapeHtml(slug)}.html">${escapeHtml(label)}<span class="tag-count">${tagged.length}</span></a></li>`,
    )
    .join('\n');

  await writePage(
    'tags/index.html',
    wrapInBase(templates, {
      pageTitle: `태그 · ${site.title}`,
      description: `${site.title}의 모든 태그`,
      base: NESTED_BASE,
      ogType: 'website',
      headExtra: headExtraFor('tags/index.html'),
      content: render(
        templates.tags,
        { tagItems: tagItems || '  <li>아직 태그가 없습니다.</li>' },
        'tags.html',
      ),
    }),
  );

  await fs.cp(ASSETS_DIR, path.join(DIST_DIR, 'assets'), { recursive: true });

  const elapsed = Date.now() - started;
  console.log(
    `빌드 완료 — 글 ${posts.length}개, 앱 ${apps.length}개, 태그 ${byTag.size}개, draft ${drafts.length}개 건너뜀 (${elapsed}ms)`,
  );
  if (drafts.length > 0) console.log(`  건너뛴 draft: ${drafts.join(', ')}`);
}

build().catch((error) => {
  console.error(`\n빌드 실패: ${error.message}\n`);
  process.exitCode = 1;
});
