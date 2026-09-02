// 아주 작은 템플릿 치환기.
// {{key}}   → HTML 이스케이프 후 삽입 (기본값)
// {{{key}}} → 이미 HTML인 값을 그대로 삽입
// 키가 없으면 조용히 빈 문자열을 넣지 않고 에러를 던진다. 템플릿 오타를 빌드에서 잡기 위함.

const HTML_ESCAPES = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
};

export function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (char) => HTML_ESCAPES[char]);
}

export function render(template, data, templateName = 'template') {
  const missing = (key) => {
    throw new Error(`${templateName}: {{${key}}} 에 대응하는 값이 없습니다.`);
  };

  return template
    .replace(/\{\{\{\s*([\w.]+)\s*\}\}\}/g, (_, key) =>
      key in data ? String(data[key] ?? '') : missing(key),
    )
    .replace(/\{\{\s*([\w.]+)\s*\}\}/g, (_, key) =>
      key in data ? escapeHtml(data[key]) : missing(key),
    );
}

// 마크다운에서 나온 HTML에서 태그를 걷어내 순수 텍스트만 남긴다.
// 요약문과 읽는 시간 계산에 쓴다.
export function stripTags(html) {
  return html
    .replace(/<[^>]*>/g, '')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
}

// 한글을 살리는 slug. 공백은 하이픈으로, 문자/숫자가 아닌 것은 버린다.
export function slugify(text) {
  const slug = String(text)
    .trim()
    .toLowerCase()
    .replace(/[^\p{L}\p{N}\s-]/gu, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '');
  return slug || 'section';
}
