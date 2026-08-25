'use strict';

const COLS = 10;
const ROWS = 20;
const BLOCK = 30;

const COLORS = [
  null,
  '#4dd0e1', // I - cyan
  '#ffd54f', // O - yellow
  '#ba68c8', // T - purple
  '#81c784', // S - green
  '#e57373', // Z - red
  '#90caf9', // J - azul pálido
  '#ffb74d', // L - orange
  '#5c5c6e', // basura / obstáculos del Modo Desafío
];

const PIECES = [
  null,
  [[0,0,0,0],[1,1,1,1],[0,0,0,0],[0,0,0,0]], // I
  [[2,2],[2,2]],                               // O
  [[0,3,0],[3,3,3],[0,0,0]],                  // T
  [[0,4,4],[4,4,0],[0,0,0]],                  // S
  [[5,5,0],[0,5,5],[0,0,0]],                  // Z
  [[6,0,0],[6,6,6],[0,0,0]],                  // J
  [[0,0,7],[7,7,7],[0,0,0]],                  // L
];

const LINE_SCORES = [0, 100, 300, 500, 800];

const CHALLENGE_LEVELS = [
  null, // índice 1 = nivel 1
  { targetLines: 40, timeLimitMs: 120000, garbageIntervalMs: null, obstacleRows: 0, lockDelayMs: 0, reversalSpeedThreshold: null, label: 'Nivel 1: 40 líneas en 2:00' },
  { targetLines: 50, timeLimitMs: 150000, garbageIntervalMs: 10000, obstacleRows: 0, lockDelayMs: 0, reversalSpeedThreshold: null, label: 'Nivel 2: 50 líneas en 2:30 + basura' },
  { targetLines: 60, timeLimitMs: 150000, garbageIntervalMs: 9000, obstacleRows: 4, lockDelayMs: 0, reversalSpeedThreshold: null, label: 'Nivel 3: 60 líneas en 2:30 + obstáculos' },
  { targetLines: 70, timeLimitMs: 160000, garbageIntervalMs: 8000, obstacleRows: 5, lockDelayMs: 500, reversalSpeedThreshold: null, label: 'Nivel 4: 70 líneas en 2:40 + piezas invisibles' },
  { targetLines: 80, timeLimitMs: 180000, garbageIntervalMs: 7000, obstacleRows: 6, lockDelayMs: 500, reversalSpeedThreshold: 4, label: 'Nivel 5: 80 líneas en 3:00 + rotación inversa' },
];
const OBSTACLE_COLOR = 8;

const canvas = document.getElementById('board');
const ctx = canvas.getContext('2d');
const nextCanvas = document.getElementById('next-canvas');
const nextCtx = nextCanvas.getContext('2d');
const scoreEl = document.getElementById('score');
const linesEl = document.getElementById('lines');
const levelEl = document.getElementById('level');
const overlay = document.getElementById('overlay');
const overlayTitle = document.getElementById('overlay-title');
const overlayScore = document.getElementById('overlay-score');
const restartBtn = document.getElementById('restart-btn');
const overlaySecondaryBtn = document.getElementById('overlay-secondary-btn');
const themeSwitch = document.getElementById('theme-switch');
const modeSelect = document.getElementById('mode-select');
const modeClassicBtn = document.getElementById('mode-classic-btn');
const modeChallengeBtn = document.getElementById('mode-challenge-btn');
const challengeHud = document.getElementById('challenge-hud');
const challengeLevelValue = document.getElementById('challenge-level-value');
const challengeObjectiveLabel = document.getElementById('challenge-objective-label');
const challengeProgressFill = document.getElementById('challenge-progress-fill');
const challengeTimerEl = document.getElementById('challenge-timer');
const pauseMenu = document.getElementById('pause-menu');
const pauseMain = document.getElementById('pause-main');
const pauseControlsPanel = document.getElementById('pause-controls');
const resumeBtn = document.getElementById('resume-btn');
const pauseRestartBtn = document.getElementById('pause-restart-btn');
const pauseControlsBtn = document.getElementById('pause-controls-btn');
const pauseControlsBackBtn = document.getElementById('pause-controls-back-btn');
const startLevelSelect = document.getElementById('start-level-select');

const THEME_KEY = 'tetris-theme';
const START_LEVEL_KEY = 'tetris-start-level';
const MAX_START_LEVEL = 15;
const THEME_COLORS = {
  dark: { grid: '#22222e', highlight: 'rgba(255,255,255,0.12)' },
  light: { grid: '#d5d8ea', highlight: 'rgba(255,255,255,0.55)' },
};

let board, current, next, score, lines, level, paused, gameOver, lastTime, dropAccum, dropInterval, animId;

let startLevel;                // nivel con el que empieza cada nueva partida

let gameMode;                  // 'classic' | 'challenge'
let challengeLevel;            // 1-5
let challengeElapsed;          // ms transcurridos en el nivel de desafío actual
let challengeLinesAtLevelStart; // snapshot de `lines` al iniciar el nivel de desafío actual
let garbageAccum;              // ms acumulados para la cadencia de basura
let lockDelayTimer;            // ms acumulados en la ventana de gracia de bloqueo
let isLockDelayActive;         // true = pieza aterrizada, en gracia, invisible
let challengeResult;           // 'failed' | 'complete' | null

function createBoard() {
  return Array.from({ length: ROWS }, () => new Array(COLS).fill(0));
}

function seedObstacles() {
  const cfg = CHALLENGE_LEVELS[challengeLevel];
  for (let i = 0; i < cfg.obstacleRows; i++) {
    const r = ROWS - 1 - i;
    const gapCol = Math.floor(Math.random() * COLS);
    for (let c = 0; c < COLS; c++) {
      board[r][c] = c === gapCol ? 0 : OBSTACLE_COLOR;
    }
  }
}

function spawnGarbageRow() {
  const gapCol = Math.floor(Math.random() * COLS);
  const garbageRow = new Array(COLS).fill(OBSTACLE_COLOR);
  garbageRow[gapCol] = 0;

  board.shift();
  board.push(garbageRow);
  current.y -= 1;

  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
}

function randomPiece() {
  const type = Math.floor(Math.random() * 7) + 1;
  const shape = PIECES[type].map(row => [...row]);
  return { type, shape, x: Math.floor(COLS / 2) - Math.floor(shape[0].length / 2), y: 0 };
}

function collide(shape, ox, oy) {
  for (let r = 0; r < shape.length; r++) {
    for (let c = 0; c < shape[r].length; c++) {
      if (!shape[r][c]) continue;
      const nx = ox + c;
      const ny = oy + r;
      if (nx < 0 || nx >= COLS || ny >= ROWS) return true;
      if (ny >= 0 && board[ny][nx]) return true;
    }
  }
  return false;
}

function rotateCW(shape) {
  const rows = shape.length, cols = shape[0].length;
  const result = Array.from({ length: cols }, () => new Array(rows).fill(0));
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++)
      result[c][rows - 1 - r] = shape[r][c];
  return result;
}

function tryRotate() {
  const reversed =
    gameMode === 'challenge' &&
    challengeLevel === 5 &&
    level >= CHALLENGE_LEVELS[5].reversalSpeedThreshold;

  let rotated = current.shape;
  const times = reversed ? 3 : 1; // CCW = 3x CW
  for (let i = 0; i < times; i++) rotated = rotateCW(rotated);

  const kicks = [0, -1, 1, -2, 2];
  for (const kick of kicks) {
    if (!collide(rotated, current.x + kick, current.y)) {
      current.shape = rotated;
      current.x += kick;
      return;
    }
  }
}

function merge() {
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        board[current.y + r][current.x + c] = current.shape[r][c];
}

function clearLines() {
  let cleared = 0;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r].every(v => v !== 0)) {
      board.splice(r, 1);
      board.unshift(new Array(COLS).fill(0));
      cleared++;
      r++;
    }
  }
  if (cleared) {
    lines += cleared;
    score += (LINE_SCORES[cleared] || 0) * level;
    level = Math.floor(lines / 10) + 1;
    dropInterval = Math.max(100, 1000 - (level - 1) * 90);
    updateHUD();
  }
}

function ghostY() {
  let gy = current.y;
  while (!collide(current.shape, current.x, gy + 1)) gy++;
  return gy;
}

function hardDrop() {
  const gy = ghostY();
  score += (gy - current.y) * 2;
  current.y = gy;
  lockPiece();
}

function softDrop() {
  if (!collide(current.shape, current.x, current.y + 1)) {
    current.y++;
    score += 1;
    updateHUD();
  } else {
    lockPiece();
  }
}

function lockPiece() {
  merge();
  clearLines();
  spawn();
}

function spawn() {
  current = next;
  next = randomPiece();
  if (collide(current.shape, current.x, current.y)) {
    endGame();
  }
  drawNext();
}

function updateHUD() {
  scoreEl.textContent = score.toLocaleString();
  linesEl.textContent = lines;
  levelEl.textContent = level;
}

function getTheme() {
  return document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark';
}

function drawBlock(context, x, y, colorIndex, size, alpha) {
  if (!colorIndex) return;
  const color = COLORS[colorIndex];
  context.globalAlpha = alpha ?? 1;
  context.fillStyle = color;
  context.fillRect(x * size + 1, y * size + 1, size - 2, size - 2);
  // highlight
  context.fillStyle = THEME_COLORS[getTheme()].highlight;
  context.fillRect(x * size + 1, y * size + 1, size - 2, 4);
  context.globalAlpha = 1;
}

function drawGrid() {
  ctx.strokeStyle = THEME_COLORS[getTheme()].grid;
  ctx.lineWidth = 0.5;
  for (let c = 1; c < COLS; c++) {
    ctx.beginPath();
    ctx.moveTo(c * BLOCK, 0);
    ctx.lineTo(c * BLOCK, ROWS * BLOCK);
    ctx.stroke();
  }
  for (let r = 1; r < ROWS; r++) {
    ctx.beginPath();
    ctx.moveTo(0, r * BLOCK);
    ctx.lineTo(COLS * BLOCK, r * BLOCK);
    ctx.stroke();
  }
}

function draw() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawGrid();

  // board
  for (let r = 0; r < ROWS; r++)
    for (let c = 0; c < COLS; c++)
      drawBlock(ctx, c, r, board[r][c], BLOCK);

  // ghost
  const gy = ghostY();
  for (let r = 0; r < current.shape.length; r++)
    for (let c = 0; c < current.shape[r].length; c++)
      if (current.shape[r][c])
        drawBlock(ctx, current.x + c, gy + r, current.shape[r][c], BLOCK, 0.2);

  // current piece
  if (!isLockDelayActive) {
    for (let r = 0; r < current.shape.length; r++)
      for (let c = 0; c < current.shape[r].length; c++)
        drawBlock(ctx, current.x + c, current.y + r, current.shape[r][c], BLOCK);
  }
}

function drawNext() {
  const NB = 30;
  nextCtx.clearRect(0, 0, nextCanvas.width, nextCanvas.height);
  const shape = next.shape;
  const offX = Math.floor((4 - shape[0].length) / 2);
  const offY = Math.floor((4 - shape.length) / 2);
  for (let r = 0; r < shape.length; r++)
    for (let c = 0; c < shape[r].length; c++)
      drawBlock(nextCtx, offX + c, offY + r, shape[r][c], NB);
}

function endGame() {
  gameOver = true;
  cancelAnimationFrame(animId);
  if (gameMode === 'challenge') {
    challengeResult = 'failed';
    showChallengeResult();
  } else {
    overlayTitle.textContent = 'GAME OVER';
    overlayScore.textContent = `Puntuación: ${score.toLocaleString()}`;
    overlay.classList.remove('hidden');
  }
}

function showChallengeResult() {
  overlaySecondaryBtn.classList.add('hidden');
  if (challengeResult === 'failed') {
    overlayTitle.textContent = 'DESAFÍO FALLIDO';
    overlayScore.textContent = `Nivel ${challengeLevel} · Puntuación: ${score.toLocaleString()}`;
  } else if (challengeResult === 'complete') {
    overlayTitle.textContent = '¡DESAFÍO COMPLETADO!';
    overlayScore.textContent = `Puntuación final: ${score.toLocaleString()}`;
  }
  restartBtn.textContent = 'Volver al menú';
  overlay.classList.remove('hidden');
}

function showLevelPassed() {
  overlayTitle.textContent = 'NIVEL SUPERADO';
  overlayScore.textContent = `${CHALLENGE_LEVELS[challengeLevel].label} · Puntuación: ${score.toLocaleString()}`;
  restartBtn.textContent = 'Volver al menú';
  overlaySecondaryBtn.textContent = 'Continuar';
  overlaySecondaryBtn.classList.remove('hidden');
  overlay.classList.remove('hidden');
}

function updateChallengeHUD() {
  const cfg = CHALLENGE_LEVELS[challengeLevel];
  challengeLevelValue.textContent = `${challengeLevel} / 5`;
  const done = Math.max(0, lines - challengeLinesAtLevelStart);
  challengeObjectiveLabel.textContent = `Líneas: ${done} / ${cfg.targetLines}`;
  challengeProgressFill.style.width = `${Math.min(100, (done / cfg.targetLines) * 100)}%`;
  const remainingMs = Math.max(0, cfg.timeLimitMs - challengeElapsed);
  const s = Math.ceil(remainingMs / 1000);
  challengeTimerEl.textContent = `Tiempo: ${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
}

function showPauseMain() {
  pauseControlsPanel.classList.add('hidden');
  pauseMain.classList.remove('hidden');
}

function showPauseControls() {
  pauseMain.classList.add('hidden');
  pauseControlsPanel.classList.remove('hidden');
}

function openPauseMenu() {
  showPauseMain();
  startLevelSelect.value = String(startLevel);
  pauseMenu.classList.remove('hidden');
}

function closePauseMenu() {
  pauseMenu.classList.add('hidden');
}

function pauseMenuRestart() {
  closePauseMenu();
  if (gameMode === 'challenge') {
    startChallenge();
  } else {
    startClassic();
  }
}

function togglePause() {
  if (gameOver) return;
  if (!overlaySecondaryBtn.classList.contains('hidden')) return; // esperando "Continuar" tras superar un nivel
  paused = !paused;
  if (!paused) {
    closePauseMenu();
    lastTime = performance.now();
    loop(lastTime);
  } else {
    cancelAnimationFrame(animId);
    openPauseMenu();
  }
}

function loop(ts) {
  const dt = ts - lastTime;
  lastTime = ts;
  dropAccum += dt;

  const cfg = gameMode === 'challenge' ? CHALLENGE_LEVELS[challengeLevel] : null;

  if (cfg) {
    challengeElapsed += dt;
    if (cfg.garbageIntervalMs) {
      garbageAccum += dt;
      if (garbageAccum >= cfg.garbageIntervalMs) {
        garbageAccum -= cfg.garbageIntervalMs;
        spawnGarbageRow();
        if (gameOver) { draw(); return; }
      }
    }
  }

  const lockDelayMs = cfg ? cfg.lockDelayMs : 0;

  if (dropAccum >= dropInterval) {
    dropAccum = 0;
    if (!collide(current.shape, current.x, current.y + 1)) {
      current.y++;
      isLockDelayActive = false;
      lockDelayTimer = 0;
    } else if (lockDelayMs > 0) {
      isLockDelayActive = true;
    } else {
      lockPiece();
    }
  }

  if (isLockDelayActive) {
    lockDelayTimer += dt;
    if (!collide(current.shape, current.x, current.y + 1)) {
      isLockDelayActive = false;
      lockDelayTimer = 0;
    } else if (lockDelayTimer >= lockDelayMs) {
      lockDelayTimer = 0;
      isLockDelayActive = false;
      lockPiece();
    }
  }

  if (cfg && !gameOver) {
    const linesThisLevel = lines - challengeLinesAtLevelStart;
    if (linesThisLevel >= cfg.targetLines) {
      draw();
      advanceChallengeLevel();
      return;
    }
    if (challengeElapsed >= cfg.timeLimitMs) {
      draw();
      failChallenge();
      return;
    }
    updateChallengeHUD();
  }

  draw();
  if (gameOver) return;
  animId = requestAnimationFrame(loop);
}

function init() {
  board = createBoard();
  score = 0;
  lines = 0;
  level = startLevel;
  paused = false;
  gameOver = false;
  dropInterval = Math.max(100, 1000 - (level - 1) * 90);
  dropAccum = 0;
  garbageAccum = 0;
  challengeElapsed = 0;
  lockDelayTimer = 0;
  isLockDelayActive = false;
  challengeResult = null;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  overlay.classList.add('hidden');
  overlaySecondaryBtn.classList.add('hidden');
  closePauseMenu();
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function startClassic() {
  gameMode = 'classic';
  modeSelect.classList.add('hidden');
  challengeHud.classList.add('hidden');
  restartBtn.textContent = 'Reiniciar';
  init();
}

function startChallenge() {
  gameMode = 'challenge';
  challengeLevel = 1;
  modeSelect.classList.add('hidden');
  challengeHud.classList.remove('hidden');
  restartBtn.textContent = 'Reiniciar';
  init();
  challengeLinesAtLevelStart = lines;
  seedObstacles();
  updateChallengeHUD();
}

function resetBoardForNextChallengeLevel() {
  board = createBoard();
  seedObstacles();
  paused = false;
  gameOver = false;
  dropAccum = 0;
  garbageAccum = 0;
  challengeElapsed = 0;
  lockDelayTimer = 0;
  isLockDelayActive = false;
  challengeLinesAtLevelStart = lines;
  lastTime = performance.now();
  next = randomPiece();
  spawn();
  updateHUD();
  updateChallengeHUD();
  overlaySecondaryBtn.classList.add('hidden');
  overlay.classList.add('hidden');
  cancelAnimationFrame(animId);
  animId = requestAnimationFrame(loop);
}

function advanceChallengeLevel() {
  cancelAnimationFrame(animId);
  if (challengeLevel === 5) {
    gameOver = true;
    challengeResult = 'complete';
    showChallengeResult();
  } else {
    challengeLevel++;
    paused = true;
    showLevelPassed();
  }
}

function failChallenge() {
  gameOver = true;
  cancelAnimationFrame(animId);
  challengeResult = 'failed';
  showChallengeResult();
}

function returnToModeSelect() {
  cancelAnimationFrame(animId);
  gameMode = undefined;
  gameOver = true;
  paused = false;
  overlay.classList.add('hidden');
  overlaySecondaryBtn.classList.add('hidden');
  closePauseMenu();
  challengeHud.classList.add('hidden');
  restartBtn.textContent = 'Reiniciar';
  modeSelect.classList.remove('hidden');
}

document.addEventListener('keydown', e => {
  if (!gameMode) return;
  if (e.code === 'KeyP' || e.code === 'Escape') { togglePause(); return; }
  if (paused || gameOver) return;
  switch (e.code) {
    case 'ArrowLeft':
      if (!collide(current.shape, current.x - 1, current.y)) current.x--;
      break;
    case 'ArrowRight':
      if (!collide(current.shape, current.x + 1, current.y)) current.x++;
      break;
    case 'ArrowDown':
      softDrop();
      break;
    case 'ArrowUp':
    case 'KeyX':
      tryRotate();
      break;
    case 'Space':
      e.preventDefault();
      hardDrop();
      break;
  }
  updateHUD();
});

restartBtn.addEventListener('click', () => {
  if (gameMode === 'challenge') {
    returnToModeSelect();
  } else {
    init();
  }
});
overlaySecondaryBtn.addEventListener('click', resetBoardForNextChallengeLevel);
modeClassicBtn.addEventListener('click', startClassic);
modeChallengeBtn.addEventListener('click', startChallenge);

resumeBtn.addEventListener('click', () => {
  if (paused) togglePause();
});
pauseRestartBtn.addEventListener('click', pauseMenuRestart);
pauseControlsBtn.addEventListener('click', showPauseControls);
pauseControlsBackBtn.addEventListener('click', showPauseMain);
startLevelSelect.addEventListener('change', () => {
  startLevel = parseInt(startLevelSelect.value, 10);
  localStorage.setItem(START_LEVEL_KEY, String(startLevel));
});

function applyTheme(theme) {
  document.documentElement.setAttribute('data-theme', theme);
  themeSwitch.checked = theme === 'light';
}

function initTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  applyTheme(saved === 'light' ? 'light' : 'dark');
}

function initStartLevel() {
  const saved = parseInt(localStorage.getItem(START_LEVEL_KEY), 10);
  startLevel = Number.isInteger(saved) && saved >= 1 && saved <= MAX_START_LEVEL ? saved : 1;
  startLevelSelect.value = String(startLevel);
}

themeSwitch.addEventListener('change', () => {
  const theme = themeSwitch.checked ? 'light' : 'dark';
  applyTheme(theme);
  localStorage.setItem(THEME_KEY, theme);
});

initTheme();
initStartLevel();
