// 2048 게임 로직. 상태 관리 라이브러리 없이 모듈 스코프 변수로 상태를 두고,
// 매 턴마다 render()가 board를 DOM에 그대로 반영한다 (diffing 없음).

var BOARD_SIZE = 4;
var BEST_SCORE_KEY = '2048-best-score';
var THEME_KEY = '2048-theme';
var SWIPE_THRESHOLD = 24;

var board = [];
var score = 0;
var best = 0;
var gameOver = false;
var won = false;
var keepPlayingAfterWin = false;

var boardEl = document.getElementById('board');
var scoreEl = document.getElementById('score');
var bestEl = document.getElementById('best');
var overlayEl = document.getElementById('overlay');
var overlayMessageEl = document.getElementById('overlay-message');
var overlayButtonsEl = document.getElementById('overlay-buttons');
var restartButtonEl = document.getElementById('restart');
var themeToggleEl = document.getElementById('theme-toggle');

// ----- 보드 유틸 -----

function createEmptyBoard() {
  var b = [];
  for (var r = 0; r < BOARD_SIZE; r++) {
    b.push([0, 0, 0, 0]);
  }
  return b;
}

function cloneBoard(b) {
  return b.map(function (row) { return row.slice(); });
}

function boardsEqual(a, b) {
  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      if (a[r][c] !== b[r][c]) return false;
    }
  }
  return true;
}

// 90도 회전이 아니라 "왼쪽으로 밀기"만 구현하고, 다른 방향은 전치/반전으로
// 왼쪽 밀기에 합성한다. 4방향 각각의 로직을 따로 만들지 않기 위함.
function transpose(b) {
  var result = [];
  for (var c = 0; c < BOARD_SIZE; c++) {
    var row = [];
    for (var r = 0; r < BOARD_SIZE; r++) row.push(b[r][c]);
    result.push(row);
  }
  return result;
}

function reverseRows(b) {
  return b.map(function (row) { return row.slice().reverse(); });
}

// 한 줄을 왼쪽으로 밀고 병합한다. 병합된 결과 타일은 같은 턴에 다시
// 병합 대상이 되지 않는다 (예: 2 2 2 2 -> 4 4, 결코 8 이 되지 않음).
function slideRowLeft(row) {
  var filtered = row.filter(function (v) { return v !== 0; });
  var result = [];
  var mergedIndices = [];
  var scoreGain = 0;
  var i = 0;
  while (i < filtered.length) {
    if (i + 1 < filtered.length && filtered[i] === filtered[i + 1]) {
      var value = filtered[i] * 2;
      result.push(value);
      mergedIndices.push(result.length - 1);
      scoreGain += value;
      i += 2;
    } else {
      result.push(filtered[i]);
      i += 1;
    }
  }
  while (result.length < BOARD_SIZE) result.push(0);
  return { row: result, scoreGain: scoreGain, mergedIndices: mergedIndices };
}

function hasEmptyCell(b) {
  return b.some(function (row) { return row.some(function (v) { return v === 0; }); });
}

function hasAdjacentMatch(b) {
  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      var v = b[r][c];
      if (c + 1 < BOARD_SIZE && b[r][c + 1] === v) return true;
      if (r + 1 < BOARD_SIZE && b[r + 1][c] === v) return true;
    }
  }
  return false;
}

function isGameOver(b) {
  return !hasEmptyCell(b) && !hasAdjacentMatch(b);
}

// ----- 최고 점수 저장 -----

function loadBest() {
  try {
    var raw = localStorage.getItem(BEST_SCORE_KEY);
    var parsed = raw === null ? 0 : parseInt(raw, 10);
    return isNaN(parsed) ? 0 : parsed;
  } catch (e) {
    return 0;
  }
}

function saveBest() {
  try {
    localStorage.setItem(BEST_SCORE_KEY, String(best));
  } catch (e) {
    // 프라이빗 모드 등으로 localStorage를 쓸 수 없으면 최고 점수는
    // 이번 세션에서만 유지된다.
  }
}

// ----- 타일 생성 -----

function spawnTile() {
  var empties = [];
  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      if (board[r][c] === 0) empties.push({ r: r, c: c });
    }
  }
  if (empties.length === 0) return null;
  var pick = empties[Math.floor(Math.random() * empties.length)];
  board[pick.r][pick.c] = Math.random() < 0.9 ? 2 : 4;
  return pick;
}

// ----- 이동 -----

function move(direction) {
  if (gameOver) return;

  var working = cloneBoard(board);
  if (direction === 'up' || direction === 'down') working = transpose(working);
  if (direction === 'right' || direction === 'down') working = reverseRows(working);

  var movedBoard = [];
  var mergedMarker = [];
  var scoreGain = 0;
  for (var r = 0; r < BOARD_SIZE; r++) {
    var slid = slideRowLeft(working[r]);
    movedBoard.push(slid.row);
    scoreGain += slid.scoreGain;
    var marker = [false, false, false, false];
    slid.mergedIndices.forEach(function (ci) { marker[ci] = true; });
    mergedMarker.push(marker);
  }

  // 병합 위치 마커도 board와 동일한 회전/반전을 거꾸로 적용해 원래
  // 좌표계로 되돌린다 (숫자 보드와 같은 변환 함수를 그대로 재사용).
  var resultBoard = movedBoard;
  var resultMarker = mergedMarker;
  if (direction === 'right' || direction === 'down') {
    resultBoard = reverseRows(resultBoard);
    resultMarker = reverseRows(resultMarker);
  }
  if (direction === 'up' || direction === 'down') {
    resultBoard = transpose(resultBoard);
    resultMarker = transpose(resultMarker);
  }

  if (boardsEqual(board, resultBoard)) return; // 변화 없는 이동은 턴을 소모하지 않는다

  board = resultBoard;
  score += scoreGain;
  if (score > best) {
    best = score;
    saveBest();
  }

  var newTilePos = spawnTile();

  var wasWon = won;
  if (!won && board.some(function (row) { return row.indexOf(2048) !== -1; })) {
    won = true;
  }

  var isOver = isGameOver(board);
  if (isOver) gameOver = true;

  render({ mergedMarker: resultMarker, newTilePos: newTilePos });

  if (won && !wasWon) {
    showWinOverlay();
  } else if (isOver) {
    showGameOverOverlay();
  }
}

// ----- 오버레이 -----

function hideOverlay() {
  overlayEl.hidden = true;
  overlayButtonsEl.innerHTML = '';
}

function makeOverlayButton(label, onClick) {
  var btn = document.createElement('button');
  btn.type = 'button';
  btn.className = 'overlay-button';
  btn.textContent = label;
  btn.addEventListener('click', onClick);
  return btn;
}

function showWinOverlay() {
  overlayMessageEl.textContent = '2048 타일을 만들었습니다! 축하합니다.';
  overlayButtonsEl.innerHTML = '';
  var continueBtn = makeOverlayButton('계속하기', function () {
    keepPlayingAfterWin = true;
    hideOverlay();
    // 2048 달성과 동시에 더 이상 이동할 수 없는 상태가 됐을 수 있다 —
    // 승리 배너를 닫자마자 게임 오버 상태라면 그 사실을 바로 알려준다.
    if (gameOver) showGameOverOverlay();
  });
  var newGameBtn = makeOverlayButton('새 게임', restartGame);
  overlayButtonsEl.appendChild(continueBtn);
  overlayButtonsEl.appendChild(newGameBtn);
  overlayEl.hidden = false;
  continueBtn.focus();
}

function showGameOverOverlay() {
  overlayMessageEl.textContent = '게임 오버! 더 이상 이동할 수 없습니다.';
  overlayButtonsEl.innerHTML = '';
  var newGameBtn = makeOverlayButton('새 게임', restartGame);
  overlayButtonsEl.appendChild(newGameBtn);
  overlayEl.hidden = false;
  newGameBtn.focus();
}

function isOverlayOpen() {
  return !overlayEl.hidden;
}

// ----- 렌더링 -----

function renderCells() {
  var frag = document.createDocumentFragment();
  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      var cell = document.createElement('div');
      cell.className = 'cell';
      cell.style.gridRow = String(r + 1);
      cell.style.gridColumn = String(c + 1);
      frag.appendChild(cell);
    }
  }
  boardEl.appendChild(frag);
}

function render(animInfo) {
  animInfo = animInfo || {};
  var marker = animInfo.mergedMarker;
  var newPos = animInfo.newTilePos;

  var existingTiles = boardEl.querySelectorAll('.tile');
  for (var i = 0; i < existingTiles.length; i++) existingTiles[i].remove();

  var frag = document.createDocumentFragment();
  for (var r = 0; r < BOARD_SIZE; r++) {
    for (var c = 0; c < BOARD_SIZE; c++) {
      var value = board[r][c];
      if (value === 0) continue;
      var tile = document.createElement('div');
      tile.className = 'tile';
      tile.dataset.value = String(value);
      tile.style.gridRow = String(r + 1);
      tile.style.gridColumn = String(c + 1);
      tile.textContent = String(value);
      if (marker && marker[r][c]) tile.classList.add('tile-merged');
      if (newPos && newPos.r === r && newPos.c === c) tile.classList.add('tile-new');
      frag.appendChild(tile);
    }
  }
  boardEl.appendChild(frag);

  scoreEl.textContent = String(score);
  bestEl.textContent = String(best);
}

// ----- 게임 시작/재시작 -----

function restartGame() {
  board = createEmptyBoard();
  score = 0;
  gameOver = false;
  won = false;
  keepPlayingAfterWin = false;
  hideOverlay();
  spawnTile();
  spawnTile();
  render();
}

function init() {
  best = loadBest();
  renderCells();
  board = createEmptyBoard();
  spawnTile();
  spawnTile();
  render();
}

// ----- 입력: 키보드 -----

var KEY_DIRECTIONS = {
  ArrowUp: 'up',
  ArrowDown: 'down',
  ArrowLeft: 'left',
  ArrowRight: 'right'
};

document.addEventListener('keydown', function (event) {
  var direction = KEY_DIRECTIONS[event.key];
  if (!direction) return;
  event.preventDefault();
  if (isOverlayOpen()) return;
  move(direction);
});

// ----- 입력: 터치 스와이프 -----

var touchStartX = 0;
var touchStartY = 0;

boardEl.addEventListener('touchstart', function (event) {
  var touch = event.changedTouches[0];
  touchStartX = touch.clientX;
  touchStartY = touch.clientY;
}, { passive: true });

boardEl.addEventListener('touchend', function (event) {
  if (isOverlayOpen()) return;
  var touch = event.changedTouches[0];
  var dx = touch.clientX - touchStartX;
  var dy = touch.clientY - touchStartY;
  if (Math.max(Math.abs(dx), Math.abs(dy)) < SWIPE_THRESHOLD) return; // 탭과 구분
  var direction;
  if (Math.abs(dx) > Math.abs(dy)) {
    direction = dx > 0 ? 'right' : 'left';
  } else {
    direction = dy > 0 ? 'down' : 'up';
  }
  move(direction);
}, { passive: true });

// ----- 버튼 -----

restartButtonEl.addEventListener('click', restartGame);

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
  } catch (e) {}
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
themeToggleEl.setAttribute('aria-label', '테마: ' + themeLabel(currentTheme) + ' (클릭하여 전환)');

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
  themeToggleEl.setAttribute('aria-label', '테마: ' + themeLabel(currentTheme) + ' (클릭하여 전환)');
});

init();
