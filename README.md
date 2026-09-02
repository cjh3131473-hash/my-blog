# 기록

마크다운 파일을 읽어 정적 블로그로 변환하는 빌드 파이프라인.

**→ https://cjh3131473-hash.github.io/my-blog/**

## 특징

- **프레임워크 없음** — 브라우저로 나가는 코드는 순수 HTML/CSS/JS
- **외부 요청 0건** — 각 페이지가 받는 파일은 HTML·CSS·JS 3개뿐. 웹폰트 CDN도 분석 스크립트도 없다
- **빌드 타임 변환** — 마크다운 파싱과 코드 하이라이팅을 모두 빌드 시점에 끝낸다
- **다크 모드** — CSS 변수 재정의만으로 구현. 라이트 / 다크 / 시스템 설정 따름 3가지 상태
- **상대 경로** — 서브경로든 루트 도메인이든 설정 없이 올라간다

## 쓰는 법

```bash
npm install
npm run dev     # 빌드 + 감시 + 로컬 서버 (http://localhost:3000)
npm run build   # 빌드만
```

글은 `posts/` 에 마크다운으로 추가한다. 프론트매터의 `title` 과 `date` 는 필수다.

```markdown
---
title: 글 제목
date: 2026-01-15
tags: [css, 회고]
description: 목록과 og:description 에 쓰이는 한 줄 요약
draft: false
---
```

`main` 에 push 하면 GitHub Actions 가 빌드해서 Pages 로 배포한다.

## 구조

```
site.config.js   블로그 제목·저자·배포 주소
posts/           원본 마크다운
src/
  build.js       posts/ → dist/
  serve.js       로컬 정적 서버 (의존성 0)
  lib/           마크다운 변환, 템플릿 치환
  templates/     문서 뼈대와 페이지별 템플릿
  assets/        style.css, theme.js
dist/            빌드 산출물 (커밋하지 않는다)
```

자세한 설계 규칙은 [CLAUDE.md](CLAUDE.md) 에 있다.

## 의존성

빌드 타임에만 쓴다. 브라우저로는 아무것도 전송하지 않는다.

| 패키지 | 용도 |
|---|---|
| `marked` | 마크다운 → HTML |
| `highlight.js` | 코드 하이라이팅 |
| `gray-matter` | YAML 프론트매터 파싱 |
