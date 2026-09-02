// 다크 모드 토글.
// 상태는 3가지 — 'light' / 'dark' / 시스템 설정 따름(data-theme 속성 없음).
//
// 시스템 설정을 따르는 경우는 CSS의 prefers-color-scheme 미디어 쿼리가 알아서 처리하므로
// 여기서 matchMedia 를 구독할 필요가 없다. JS는 "무엇을 따를지"만 정한다.
//
// 이 스크립트가 실패해도 글은 그대로 읽힌다. 버튼은 JS가 살아 있을 때만 드러낸다.

(function () {
  var STORAGE_KEY = 'theme';
  var CYCLE = ['system', 'light', 'dark'];
  var LABELS = {
    system: '시스템 설정',
    light: '라이트 모드',
    dark: '다크 모드',
  };

  var button = document.getElementById('theme-toggle');
  if (!button) return;

  function readStored() {
    try {
      var value = localStorage.getItem(STORAGE_KEY);
      return value === 'light' || value === 'dark' ? value : 'system';
    } catch (e) {
      return 'system';
    }
  }

  function apply(mode) {
    if (mode === 'system') {
      delete document.documentElement.dataset.theme;
      try {
        localStorage.removeItem(STORAGE_KEY);
      } catch (e) {}
    } else {
      document.documentElement.dataset.theme = mode;
      try {
        localStorage.setItem(STORAGE_KEY, mode);
      } catch (e) {}
    }

    var next = CYCLE[(CYCLE.indexOf(mode) + 1) % CYCLE.length];
    var label = '테마: ' + LABELS[mode] + ' — 누르면 ' + LABELS[next];
    button.setAttribute('aria-label', label);
    button.setAttribute('title', label);
  }

  button.addEventListener('click', function () {
    var current = readStored();
    apply(CYCLE[(CYCLE.indexOf(current) + 1) % CYCLE.length]);
  });

  apply(readStored());
  button.hidden = false;
})();
