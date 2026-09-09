// 픽셀 아트 에디터. 상태는 모듈 스코프 변수 몇 개뿐이고, 화면 갱신은
// 바뀐 칸만 건드리는 부분 갱신이다 (전체 재렌더는 "모두 지우기"에서만).

var GRID_SIZE = 16;
var CELL_COUNT = GRID_SIZE * GRID_SIZE;
var EXPORT_SCALE = 16; // 저장 크기 = 16 x 16 x 16 = 256 x 256
var THEME_KEY = 'pixel-art-theme';
var SAVE_MESSAGE_MS = 5000;

// 팔레트 색은 UI 색이 아니라 그림 데이터다. 테마에 따라 값이 달라지면
// 같은 그림이 화면과 저장 결과에서 다르게 보이므로 CSS 토큰이 아니라
// 여기에 상수로 둔다.
var PALETTE = [
  { name: '먹색', value: '#1b1b1b' },
  { name: '진회색', value: '#545454' },
  { name: '회색', value: '#9a9a9a' },
  { name: '흰색', value: '#ffffff' },
  { name: '갈색', value: '#7f4f24' },
  { name: '빨강', value: '#e03131' },
  { name: '주황', value: '#f76707' },
  { name: '노랑', value: '#f2c94c' },
  { name: '연두', value: '#74b816' },
  { name: '초록', value: '#2f9e44' },
  { name: '청록', value: '#0ca678' },
  { name: '하늘', value: '#4dabf7' },
  { name: '파랑', value: '#1c7ed6' },
  { name: '남색', value: '#3b5bdb' },
  { name: '보라', value: '#9c36b5' },
  { name: '분홍', value: '#f06595' }
];

// 값은 '#rrggbb' 또는 null(빈 칸). null 은 '흰색으로 칠한 칸'과 구분되며
// 저장할 때 투명하게 남는다.
var pixels = new Array(CELL_COUNT).fill(null);
var currentColor = PALETTE[0].value; // null 이면 지우개
var isDrawing = false;
var focusedIndex = 0;
var selectedSwatch = 0; // 팔레트 인덱스, 'custom', 또는 null(지우개)
var paletteFocusIndex = 0;
var saveMessageTimer = null;

var cells = [];
var swatchButtons = [];

var gridEl = document.getElementById('grid');
var paletteEl = document.getElementById('palette');
var paletteRadiosEl = document.getElementById('palette-radios');
var eraserEl = document.getElementById('eraser');
var clearAllEl = document.getElementById('clear-all');
var savePngEl = document.getElementById('save-png');
var currentColorTextEl = document.getElementById('current-color-text');
var saveMessageEl = document.getElementById('save-message');
var themeToggleEl = document.getElementById('theme-toggle');
var customInputEl = null;
var customSwatchEl = null;

// ----- 색 이름 -----

function colorName(value) {
  for (var i = 0; i < PALETTE.length; i++) {
    if (PALETTE[i].value === value) return PALETTE[i].name;
  }
  return '사용자 색 ' + value;
}

// ----- 격자 -----

function cellLabel(index) {
  var row = Math.floor(index / GRID_SIZE) + 1;
  var col = (index % GRID_SIZE) + 1;
  var value = pixels[index];
  return row + '행 ' + col + '열, ' + (value === null ? '빈 칸' : colorName(value));
}

function buildGrid() {
  var frag = document.createDocumentFragment();
  for (var r = 0; r < GRID_SIZE; r++) {
    var row = document.createElement('div');
    row.className = 'pixel-row';
    row.setAttribute('role', 'row');
    for (var c = 0; c < GRID_SIZE; c++) {
      var index = r * GRID_SIZE + c;
      var cell = document.createElement('button');
      cell.type = 'button';
      cell.className = 'grid-cell';
      cell.setAttribute('role', 'gridcell');
      cell.dataset.index = String(index);
      cell.tabIndex = index === 0 ? 0 : -1;
      cell.setAttribute('aria-label', cellLabel(index));
      cells.push(cell);
      row.appendChild(cell);
    }
    frag.appendChild(row);
  }
  gridEl.appendChild(frag);
}

function updateCell(index) {
  var cell = cells[index];
  var value = pixels[index];
  if (value === null) {
    cell.style.backgroundColor = '';
    cell.classList.remove('is-filled');
  } else {
    cell.style.backgroundColor = value;
    cell.classList.add('is-filled');
  }
  cell.setAttribute('aria-label', cellLabel(index));
}

function renderAll() {
  for (var i = 0; i < CELL_COUNT; i++) updateCell(i);
}

// 같은 색을 다시 칠해도 토글하지 않고 덮어쓴다. 드래그 중 토글은 지나간
// 칸이 켜졌다 꺼졌다 하며 결과를 예측할 수 없게 만든다.
function paint(index, value) {
  if (pixels[index] === value) return;
  pixels[index] = value;
  updateCell(index);
}

function indexFromElement(el) {
  if (!el || !el.dataset || el.dataset.index === undefined) return -1;
  var index = parseInt(el.dataset.index, 10);
  return isNaN(index) ? -1 : index;
}

// 터치에서는 pointerdown 대상에 암시적 포인터 캡처가 걸려 event.target 이
// 처음 누른 칸에 고정된다. 좌표로 직접 찾으면 마우스와 터치가 같은 경로를 탄다.
function paintAtPoint(clientX, clientY) {
  var index = indexFromElement(document.elementFromPoint(clientX, clientY));
  if (index < 0) return;
  paint(index, currentColor);
}

function setFocusedIndex(index, moveFocus) {
  cells[focusedIndex].tabIndex = -1;
  focusedIndex = index;
  cells[focusedIndex].tabIndex = 0;
  if (moveFocus) cells[focusedIndex].focus();
}

function clearAll() {
  if (!window.confirm('격자를 모두 지울까요? 되돌릴 수 없습니다.')) return;
  for (var i = 0; i < CELL_COUNT; i++) pixels[i] = null;
  renderAll();
}

// ----- 격자 입력: 포인터 -----

gridEl.addEventListener('pointerdown', function (event) {
  var index = indexFromElement(event.target);
  if (index < 0) return;
  event.preventDefault(); // 텍스트 선택과 드래그 고스트 차단
  isDrawing = true;
  paint(index, currentColor);
  // preventDefault 로 브라우저 기본 포커스가 막혔으므로, 여기서 focus() 를
  // 부르면 마우스로 눌러도 포커스 링이 그려진다(브라우저는 키보드 조작으로
  // 본다). 그래서 이미 격자 안에 포커스가 있을 때만 포커스를 옮기고,
  // 그 외에는 로빙 tabindex 만 눌린 칸으로 맞춘다.
  setFocusedIndex(index, gridEl.contains(document.activeElement));
});

gridEl.addEventListener('pointermove', function (event) {
  if (!isDrawing) return;
  paintAtPoint(event.clientX, event.clientY);
});

// 격자 밖에서 손을 떼도 그리기 상태가 남지 않게 window 에 건다.
window.addEventListener('pointerup', function () {
  isDrawing = false;
});

window.addEventListener('pointercancel', function () {
  isDrawing = false;
});

// 스크린리더의 활성화(더블탭 등)는 포인터 이벤트 없이 합성 click 만 보낸다.
// detail === 0 이 그 경우이며, 포인터로 누른 click 은 pointerdown 에서 이미
// 처리했으므로 여기서 무시한다.
gridEl.addEventListener('click', function (event) {
  if (event.detail !== 0) return;
  var index = indexFromElement(event.target);
  if (index < 0) return;
  paint(index, currentColor);
});

// ----- 격자 입력: 키보드 -----

function moveFocusBy(rowDelta, colDelta, paintOnMove) {
  var row = Math.floor(focusedIndex / GRID_SIZE) + rowDelta;
  var col = (focusedIndex % GRID_SIZE) + colDelta;
  if (row < 0 || row >= GRID_SIZE || col < 0 || col >= GRID_SIZE) return; // 경계에서 멈춘다
  var index = row * GRID_SIZE + col;
  if (paintOnMove) paint(index, currentColor);
  setFocusedIndex(index, true);
}

gridEl.addEventListener('keydown', function (event) {
  var index = indexFromElement(event.target);
  if (index < 0) return;

  var key = event.key;
  if (key === 'ArrowUp' || key === 'ArrowDown' || key === 'ArrowLeft' || key === 'ArrowRight') {
    event.preventDefault(); // 방향키로 페이지가 스크롤되지 않게
    var rowDelta = key === 'ArrowUp' ? -1 : key === 'ArrowDown' ? 1 : 0;
    var colDelta = key === 'ArrowLeft' ? -1 : key === 'ArrowRight' ? 1 : 0;
    moveFocusBy(rowDelta, colDelta, event.shiftKey);
    return;
  }

  if (key === 'Enter' || key === ' ' || key === 'Spacebar') {
    // keydown 에서 처리하고 기본 동작을 막아 click 이 뒤따라 발생하지 않게 한다.
    event.preventDefault();
    paint(index, currentColor);
    return;
  }

  if (key === 'Backspace' || key === 'Delete') {
    event.preventDefault(); // Backspace 로 페이지가 뒤로 가지 않게
    paint(index, null);
    return;
  }

  if (key === 'Home' || key === 'End') {
    event.preventDefault();
    var row = Math.floor(index / GRID_SIZE);
    var target;
    if (key === 'Home') {
      target = event.ctrlKey ? 0 : row * GRID_SIZE;
    } else {
      target = event.ctrlKey ? CELL_COUNT - 1 : row * GRID_SIZE + GRID_SIZE - 1;
    }
    setFocusedIndex(target, true);
  }
});

// 클릭이나 Tab 으로 다른 칸에 포커스가 가면 로빙 tabindex 를 맞춘다.
gridEl.addEventListener('focusin', function (event) {
  var index = indexFromElement(event.target);
  if (index < 0 || index === focusedIndex) return;
  setFocusedIndex(index, false);
});

// ----- 팔레트 -----

function buildPalette() {
  var radioFrag = document.createDocumentFragment();
  for (var i = 0; i < PALETTE.length; i++) {
    var swatch = document.createElement('button');
    swatch.type = 'button';
    swatch.className = 'palette-swatch';
    swatch.setAttribute('role', 'radio');
    swatch.setAttribute('aria-checked', 'false');
    swatch.setAttribute('aria-label', PALETTE[i].name);
    swatch.dataset.swatch = String(i);
    swatch.tabIndex = -1;
    swatch.style.backgroundColor = PALETTE[i].value;
    swatchButtons.push(swatch);
    radioFrag.appendChild(swatch);
  }
  paletteRadiosEl.appendChild(radioFrag);

  // 커스텀 색상은 팔레트 끝 한 칸. 브라우저 내장 위젯이라 추가 코드도
  // 외부 의존성도 없고, 모바일에서는 OS 색 선택기가 뜬다.
  // radiogroup 밖(=paletteEl 직속)에 둔다 — radio 가 아닌 자식이 그룹 안에
  // 들어가면 스크린리더가 라디오 그룹을 잘못 읽는다.
  customSwatchEl = document.createElement('span');
  customSwatchEl.className = 'custom-swatch';
  customInputEl = document.createElement('input');
  customInputEl.type = 'color';
  customInputEl.id = 'custom-color';
  customInputEl.value = '#7f4f24';
  customInputEl.setAttribute('aria-label', '사용자 색 선택');
  customSwatchEl.appendChild(customInputEl);
  paletteEl.appendChild(customSwatchEl);

  customInputEl.addEventListener('change', function () {
    selectCustomColor(customInputEl.value);
  });

  // 색을 새로 고르지 않고 칸만 눌러도 마지막 커스텀 색으로 돌아온다.
  customInputEl.addEventListener('click', function () {
    selectCustomColor(customInputEl.value);
  });
}

function updateSelectionUI() {
  for (var i = 0; i < swatchButtons.length; i++) {
    var checked = selectedSwatch === i;
    swatchButtons[i].setAttribute('aria-checked', checked ? 'true' : 'false');
    swatchButtons[i].tabIndex = i === paletteFocusIndex ? 0 : -1;
  }
  if (selectedSwatch === 'custom') {
    customSwatchEl.classList.add('is-selected');
  } else {
    customSwatchEl.classList.remove('is-selected');
  }
  eraserEl.setAttribute('aria-pressed', currentColor === null ? 'true' : 'false');
  currentColorTextEl.textContent =
    currentColor === null ? '선택: 지우개' : '선택: ' + colorName(currentColor);
}

function selectPaletteColor(i) {
  currentColor = PALETTE[i].value;
  selectedSwatch = i;
  paletteFocusIndex = i;
  updateSelectionUI();
}

function selectCustomColor(value) {
  currentColor = value;
  selectedSwatch = 'custom';
  updateSelectionUI();
}

function selectEraser() {
  currentColor = null;
  selectedSwatch = null;
  updateSelectionUI();
}

paletteEl.addEventListener('click', function (event) {
  var target = event.target;
  if (!target.dataset || target.dataset.swatch === undefined) return;
  selectPaletteColor(parseInt(target.dataset.swatch, 10));
});

// 라디오 그룹 패턴: 그룹 전체가 탭 정지 1개이고 방향키로 이동하며 즉시 선택된다.
paletteEl.addEventListener('keydown', function (event) {
  var target = event.target;
  if (!target.dataset || target.dataset.swatch === undefined) return;

  var count = swatchButtons.length;
  var index = parseInt(target.dataset.swatch, 10);
  var next = -1;
  var key = event.key;

  if (key === 'ArrowRight' || key === 'ArrowDown') {
    next = (index + 1) % count;
  } else if (key === 'ArrowLeft' || key === 'ArrowUp') {
    next = (index - 1 + count) % count;
  } else if (key === 'Home') {
    next = 0;
  } else if (key === 'End') {
    next = count - 1;
  }

  if (next < 0) return;
  event.preventDefault();
  selectPaletteColor(next);
  swatchButtons[next].focus();
});

// ----- 도구 -----

eraserEl.addEventListener('click', function () {
  if (currentColor === null) return;
  selectEraser();
});

clearAllEl.addEventListener('click', clearAll);

// ----- PNG 저장 -----

function pad2(n) {
  return n < 10 ? '0' + n : String(n);
}

function makeFileName() {
  var d = new Date();
  return 'pixel-art-' +
    d.getFullYear() + pad2(d.getMonth() + 1) + pad2(d.getDate()) + '-' +
    pad2(d.getHours()) + pad2(d.getMinutes()) + pad2(d.getSeconds()) + '.png';
}

function showSaveMessage(text) {
  saveMessageEl.textContent = text;
  if (saveMessageTimer !== null) clearTimeout(saveMessageTimer);
  saveMessageTimer = setTimeout(function () {
    saveMessageEl.textContent = '';
    saveMessageTimer = null;
  }, SAVE_MESSAGE_MS);
}

// 16x16 원본을 그린 뒤 정수배로 확대한다. 확대 단계를 분리해 두면 배율
// 상수 하나만 바꾸면 되고 반올림 오차가 생기지 않는다.
function saveAsPng() {
  var src = document.createElement('canvas');
  src.width = GRID_SIZE;
  src.height = GRID_SIZE;
  var srcCtx = src.getContext('2d');
  for (var i = 0; i < CELL_COUNT; i++) {
    var value = pixels[i];
    if (value === null) continue; // 빈 칸은 그리지 않아 알파 0 으로 남는다
    srcCtx.fillStyle = value;
    srcCtx.fillRect(i % GRID_SIZE, Math.floor(i / GRID_SIZE), 1, 1);
  }

  var out = document.createElement('canvas');
  out.width = GRID_SIZE * EXPORT_SCALE;
  out.height = GRID_SIZE * EXPORT_SCALE;
  var outCtx = out.getContext('2d');
  outCtx.imageSmoothingEnabled = false;
  outCtx.drawImage(src, 0, 0, out.width, out.height);

  var link = document.createElement('a');
  link.href = out.toDataURL('image/png');
  link.download = makeFileName();
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);

  showSaveMessage('PNG로 저장했습니다.');
}

savePngEl.addEventListener('click', saveAsPng);

// ----- 테마 토글 (블로그 theme.js와 같은 3상태 패턴을 앱 안에서 독립적으로 구현) -----

function loadTheme() {
  try {
    return localStorage.getItem(THEME_KEY);
  } catch (e) {
    return null;
  }
}

function saveTheme(theme) {
  try {
    if (theme) {
      localStorage.setItem(THEME_KEY, theme);
    } else {
      localStorage.removeItem(THEME_KEY);
    }
  } catch (e) {
    // 프라이빗 모드 등으로 저장할 수 없으면 이번 세션에서만 유지된다.
  }
}

function applyTheme(theme) {
  if (theme === 'light' || theme === 'dark') {
    document.documentElement.setAttribute('data-theme', theme);
  } else {
    document.documentElement.removeAttribute('data-theme');
  }
}

function themeLabel(theme) {
  if (theme === 'dark') return '다크 모드';
  if (theme === 'light') return '라이트 모드';
  return '시스템 설정 따름';
}

var currentTheme = loadTheme(); // 'light' | 'dark' | null(시스템 따름)

function updateThemeLabel() {
  themeToggleEl.setAttribute('aria-label', '테마: ' + themeLabel(currentTheme) + ' (클릭하여 전환)');
}

themeToggleEl.addEventListener('click', function () {
  if (currentTheme === null) {
    currentTheme = 'dark';
  } else if (currentTheme === 'dark') {
    currentTheme = 'light';
  } else {
    currentTheme = null;
  }
  applyTheme(currentTheme);
  saveTheme(currentTheme);
  updateThemeLabel();
});

// ----- 시작 -----

function init() {
  buildGrid();
  buildPalette();
  selectPaletteColor(0);
  updateThemeLabel();
}

init();
