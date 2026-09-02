---
title: 다크 모드를 CSS 변수 하나로 끝내기
date: 2026-07-28
tags: [css, 웹, 다크모드]
description: 다크 모드용 규칙을 따로 쓰지 않고, 토큰 값만 바꿔서 처리한 방법.
---

다크 모드를 붙일 때 가장 흔한 실수는 **규칙을 두 벌 쓰는 것**이다.
색이 필요할 때마다 다크용 셀렉터를 하나씩 늘리다 보면 어느 순간
한쪽만 고치고 다른 쪽을 빠뜨리게 된다.

## 색은 한 곳에서만 정의한다

먼저 쓰는 색에 이름을 붙인다. 값이 아니라 **역할**로 부르는 게 핵심이다.
`--gray-100` 이 아니라 `--bg-subtle` 이어야 다크 모드에서 말이 된다.

```css
:root {
  --bg: #fdfdfc;
  --text: #1a1a18;
  --text-muted: #6b6b66;
  --border: #e4e4e0;
  --accent: #2f6f4e;
}
```

그리고 규칙에서는 이 이름만 쓴다. `#fff` 를 직접 적는 순간 다크 모드에서 새는 구멍이 된다.

```css
.card {
  background: var(--bg);
  color: var(--text);
  border: 1px solid var(--border);
}
```

## 다크 모드는 값만 갈아 끼운다

`.card` 는 손대지 않는다. 토큰만 다시 정의하면 끝이다.

```css
:root[data-theme='dark'] {
  --bg: #161614;
  --text: #e8e8e3;
  --text-muted: #a1a19a;
  --border: #32322d;
  --accent: #6bbd8e;
}
```

### 상태가 셋이라는 점을 잊지 말 것

라이트와 다크만 있는 게 아니다. **시스템 설정을 따르는 기본 상태**가 있다.
이걸 빼먹으면 "OS를 다크로 바꿨는데 사이트만 밝다"는 상황이 나온다.

```css
@media (prefers-color-scheme: dark) {
  /* 라이트를 명시적으로 고른 사람은 제외해야 한다 */
  :root:not([data-theme='light']) {
    --bg: #161614;
    --text: #e8e8e3;
  }
}
```

`:not([data-theme='light'])` 가 없으면, OS가 다크인 사용자가 라이트를 골라도
미디어 쿼리가 이겨 버린다.

## 깜빡임 없애기

여기까지 하면 동작은 한다. 그런데 다크 모드로 새로고침하면
흰 화면이 한 번 번쩍인다. 스타일시트가 적용되기 전에 브라우저가
기본 배경을 먼저 그리기 때문이다.

해결책은 하나다. **저장된 설정을 읽는 코드를 `<link>` 보다 먼저, 인라인으로** 넣는다.

```html
<head>
  <script>
    try {
      var t = localStorage.getItem('theme');
      if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t;
    } catch (e) {}
  </script>
  <link rel="stylesheet" href="style.css" />
</head>
```

이 스크립트만은 외부 파일로 빼면 안 된다. 파일을 받아오는 사이에 이미 화면이 그려진다.
`try/catch` 로 감싼 이유는 사생활 보호 모드에서 `localStorage` 접근이
예외를 던지는 브라우저가 있어서다. 테마 때문에 페이지 전체가 멈추면 곤란하다.

## 토글은 JS가, 아이콘은 CSS가

버튼을 누르면 상태를 순환시킨다. 시스템 → 라이트 → 다크 → 시스템.

```js
var CYCLE = ['system', 'light', 'dark'];

function apply(mode) {
  if (mode === 'system') {
    delete document.documentElement.dataset.theme;
    localStorage.removeItem('theme');
  } else {
    document.documentElement.dataset.theme = mode;
    localStorage.setItem('theme', mode);
  }
}
```

어떤 아이콘을 보여줄지는 JS가 관여하지 않는다. CSS가 현재 상태를 보고 정하면 된다.

```css
.icon { display: none; }

:root:not([data-theme]) .icon-system,
:root[data-theme='light'] .icon-sun,
:root[data-theme='dark'] .icon-moon {
  display: block;
}
```

## 확인할 것

다 만들었으면 이것만은 직접 해 보자.

1. 다크로 두고 하드 리로드 — 흰 화면이 번쩍이지 않는가
2. 라이트를 고른 뒤 OS를 다크로 변경 — 사이트는 라이트를 유지하는가
3. 코드 블록의 색이 **양쪽 테마 모두에서** 읽히는가

3번이 특히 자주 무너진다. 라이트 테마용으로 고른 문법 색을
어두운 배경에 그대로 올리면 대비가 4.5:1 아래로 내려가는 경우가 많다.
문법 색도 토큰으로 빼 두면 이 문제도 같은 방식으로 해결된다.

```bash
# 확인은 결국 눈으로 한다
npm run dev
```
