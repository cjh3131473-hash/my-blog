// 로컬 확인용 정적 서버. node:http 만 쓴다 — 의존성도, 네트워크 접속도 필요 없다.
//   node src/serve.js            dist/ 를 서빙
//   node src/serve.js --watch    posts/·src/ 변경 시 자동 재빌드

import http from 'node:http';
import fs from 'node:fs/promises';
import { watch } from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DIST_DIR = path.join(ROOT, 'dist');
const BUILD_SCRIPT = path.join(ROOT, 'src', 'build.js');

const PORT = Number(process.env.PORT) || 3000;
const WATCH = process.argv.includes('--watch');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.avif': 'image/avif',
  '.ico': 'image/x-icon',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
  '.xml': 'application/xml; charset=utf-8',
};

function runBuild() {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [BUILD_SCRIPT], { stdio: 'inherit' });
    child.on('close', resolve);
  });
}

// 요청 경로를 dist/ 안의 실제 파일로 해석한다.
// 확장자가 없으면 .html 을 붙여 보고, 디렉터리면 index.html 을 찾는다.
async function resolveFile(urlPath) {
  const decoded = decodeURIComponent(urlPath.split('?')[0]);
  const target = path.join(DIST_DIR, decoded);

  // 경로 탈출 방지: dist/ 밖으로 나가는 요청은 거부한다.
  const resolved = path.resolve(target);
  if (resolved !== DIST_DIR && !resolved.startsWith(DIST_DIR + path.sep)) return null;

  const candidates = [resolved];
  if (!path.extname(resolved)) {
    candidates.push(`${resolved}.html`, path.join(resolved, 'index.html'));
  }

  for (const candidate of candidates) {
    try {
      const stat = await fs.stat(candidate);
      if (stat.isFile()) return candidate;
      if (stat.isDirectory()) {
        const indexFile = path.join(candidate, 'index.html');
        const indexStat = await fs.stat(indexFile).catch(() => null);
        if (indexStat?.isFile()) return indexFile;
      }
    } catch {
      // 다음 후보로 넘어간다
    }
  }
  return null;
}

const server = http.createServer(async (req, res) => {
  const file = await resolveFile(req.url ?? '/');

  if (!file) {
    res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
    res.end('<h1>404</h1><p>찾을 수 없습니다.</p>');
    console.log(`404  ${req.url}`);
    return;
  }

  const body = await fs.readFile(file);
  res.writeHead(200, {
    'Content-Type': MIME_TYPES[path.extname(file)] ?? 'application/octet-stream',
    // 개발용이므로 캐시하지 않는다. 새로고침이 항상 최신을 보여줘야 한다.
    'Cache-Control': 'no-store',
  });
  res.end(body);
});

if (WATCH) await runBuild();

server.listen(PORT, () => {
  console.log(`\n  http://localhost:${PORT} 에서 서빙 중`);
  if (WATCH) console.log('  posts/ 와 src/ 를 감시합니다. 저장하면 다시 빌드합니다.');
  console.log('  중지하려면 Ctrl+C\n');
});

if (WATCH) {
  let pending = null;
  let building = false;

  const scheduleBuild = () => {
    // 에디터 한 번 저장에 이벤트가 여러 번 온다. 잠깐 모아서 한 번만 빌드한다.
    clearTimeout(pending);
    pending = setTimeout(async () => {
      if (building) return;
      building = true;
      await runBuild();
      building = false;
    }, 120);
  };

  for (const dir of ['posts', 'src', 'apps']) {
    watch(path.join(ROOT, dir), { recursive: true }, (_event, filename) => {
      // dist/ 로 복사된 결과물이 다시 빌드를 부르지 않도록 원본만 본다.
      if (filename) scheduleBuild();
    });
  }
}
