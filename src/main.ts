import { Application, Container } from 'pixi.js';
import { GardenBackground } from './components/background';
import { FallingItem, Particle, Player } from './components/characters';
import { Leaderboard } from './components/leaderboard';
import { clamp, COLORS, GROWTH_STAGES, lerp, random, type ItemType } from './game/config';
import './style.css';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover' | 'won';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
}

class TinySynth {
  private context?: AudioContext;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  unlock(): void {
    if (!this.enabled) return;
    try {
      this.context ??= new AudioContext();
      if (this.context.state === 'suspended') void this.context.resume();
    } catch {
      // Sound is optional; unsupported audio must never prevent the game from starting.
      this.enabled = false;
    }
  }

  private note(frequency: number, duration: number, type: OscillatorType, volume = 0.035, delay = 0): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;

    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(frequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(frequency * 1.035, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + 0.018);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  private sweep(
    startFrequency: number,
    endFrequency: number,
    duration: number,
    type: OscillatorType,
    volume: number,
    delay = 0,
  ): void {
    if (!this.enabled) return;
    this.unlock();
    if (!this.context) return;

    const start = this.context.currentTime + delay;
    const oscillator = this.context.createOscillator();
    const gain = this.context.createGain();
    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFrequency, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFrequency, start + duration);
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + Math.min(0.012, duration / 4));
    gain.gain.exponentialRampToValueAtTime(0.0001, start + duration);
    oscillator.connect(gain);
    gain.connect(this.context.destination);
    oscillator.start(start);
    oscillator.stop(start + duration + 0.02);
  }

  collect(type: 'water' | 'sun'): void {
    if (type === 'water') {
      this.waterBubble();
    } else {
      this.sunSparkle();
    }
  }

  private waterBubble(): void {
    // A falling plop followed by a tiny upward bubble pop.
    this.sweep(1080, 360, 0.17, 'sine', 0.052);
    this.note(1450, 0.045, 'triangle', 0.012, 0.018);
    this.sweep(230, 520, 0.11, 'sine', 0.032, 0.105);
  }

  private sunSparkle(): void {
    // A quick happy major arpeggio with a bright final twinkle.
    [659, 831, 988, 1319].forEach((frequency, index) => {
      this.note(frequency, 0.12 + index * 0.015, 'triangle', 0.024, index * 0.045);
    });
    this.note(1976, 0.18, 'sine', 0.014, 0.15);
  }

  hurt(): void {
    // A comic buzzy wobble ending in a soft bonk.
    this.sweep(240, 82, 0.2, 'sawtooth', 0.025);
    this.sweep(135, 58, 0.26, 'square', 0.013, 0.025);
    this.sweep(72, 145, 0.1, 'triangle', 0.026, 0.16);
  }

  wilt(): void {
    // A gentle downward cue for missed garden resources—not a bug sound.
    this.sweep(440, 300, 0.18, 'triangle', 0.018);
    this.sweep(330, 220, 0.2, 'sine', 0.014, 0.07);
  }

  grow(): void {
    [523, 659, 784, 1047].forEach((frequency, index) => {
      this.note(frequency, 0.24, 'triangle', 0.022, index * 0.07);
    });
  }

  win(): void {
    [523, 659, 784, 1047, 1319].forEach((frequency, index) => {
      this.note(frequency, 0.4, 'sine', 0.024, index * 0.09);
    });
  }
}

async function initializeGame(): Promise<void> {
  const host = element<HTMLDivElement>('#game');
  const toastElement = element<HTMLDivElement>('#toast');
  const startScreen = element<HTMLElement>('#start-screen');
  const pauseScreen = element<HTMLElement>('#pause-screen');
  const endScreen = element<HTMLElement>('#end-screen');
  const pauseButton = element<HTMLButtonElement>('#pause-button');
  const soundButton = element<HTMLButtonElement>('#sound-button');
  const endTitleElement = element<HTMLElement>('#end-title');
  const endEyebrowElement = element<HTMLElement>('#end-eyebrow');
  const endCopyElement = element<HTMLElement>('#end-copy');
  const endIconElement = element<HTMLElement>('#end-icon');

  const leaderboard = new Leaderboard();
  const synth = new TinySynth(leaderboard.soundEnabled);

  const app = new Application();
  await app.init({
    resizeTo: host,
    backgroundAlpha: 0,
    antialias: false,
    autoDensity: true,
    resolution: 1,
    preference: ['webgl', 'canvas'],
  });
  host.prepend(app.canvas);
  app.canvas.setAttribute('aria-hidden', 'true');

  const background = new GardenBackground(host);
  const itemLayer = new Container();
  const playerLayer = new Container();
  const particleLayer = new Container();
  const gameLayer = new Container();
  gameLayer.addChild(itemLayer, playerLayer, particleLayer);
  app.stage.addChild(background.view, gameLayer);

  const player = new Player(playerLayer);
  const items: FallingItem[] = [];
  const particles: Particle[] = [];
  const pressedKeys = new Set<string>();

  let phase: GamePhase = 'menu';
  let score = 0;
  let health = 3;
  let missedResources = 0;
  let growthStage = 0;
  let elapsed = 0;
  let spawnElapsed = 0;
  let toastTimeout = 0;
  let shakeTime = 0;
  let dragActive = false;
  let leftHeld = false;
  let rightHeld = false;

  function menuPlayerX(width: number): number {
    return Math.min(width - 52, Math.max(width * 0.76, width - 92));
  }

  function layoutScene(): void {
    const { width, height } = app.screen;
    const groundY = height - (width < 720 ? 74 : 65);
    player.y = groundY;
    player.view.visible = phase !== 'menu' || width > 720;
    if (phase === 'menu') {
      player.x = menuPlayerX(width);
      player.targetX = player.x;
    } else {
      player.x = clamp(player.x, 52, width - 52);
      player.targetX = clamp(player.targetX, 52, width - 52);
    }

    background.layout(width, height, groundY);
  }

  function showToast(message: string): void {
    toastElement.textContent = message;
    toastElement.classList.add('is-visible');
    toastTimeout = 1.65;
  }

  function setScreen(screen: HTMLElement | null): void {
    [startScreen, pauseScreen, endScreen].forEach((item) => item.classList.toggle('is-visible', item === screen));
    host.classList.toggle('is-menu', screen === startScreen);
  }

  function stageForScore(value: number): number {
    let stage = 0;
    for (let index = 0; index < GROWTH_STAGES.length; index += 1) {
      if (value >= GROWTH_STAGES[index].threshold) stage = index;
    }
    return stage;
  }

  function clearEntities(): void {
    items.splice(0).forEach((item) => item.destroy());
    particles.splice(0).forEach((particle) => particle.destroy());
  }

  function resetGame(): void {
    clearEntities();
    score = 0;
    health = 3;
    missedResources = 0;
    growthStage = 0;
    elapsed = 0;
    spawnElapsed = 0;
    shakeTime = 0;
    player.x = app.screen.width / 2;
    player.targetX = player.x;
    player.y = app.screen.height - (app.screen.width < 720 ? 74 : 65);
    player.view.visible = true;
    player.reset();
    leaderboard.update(score, health, growthStage);
  }

  function startGame(): void {
    resetGame();
    phase = 'playing';
    pauseButton.firstElementChild!.textContent = 'Ⅱ';
    pauseButton.setAttribute('aria-label', 'Pause game');
    setScreen(null);
    showToast('Catch rain + sunshine!');
    // Gameplay starts first so an unavailable audio API can never block entry.
    synth.unlock();
  }

  function returnHome(): void {
    clearEntities();
    phase = 'menu';
    score = 0;
    growthStage = 0;
    player.reset(2);
    layoutScene();
    leaderboard.update(score, health, growthStage);
    setScreen(startScreen);
  }

  function togglePause(forcePause?: boolean): void {
    if (phase !== 'playing' && phase !== 'paused') return;
    const shouldPause = forcePause ?? phase === 'playing';
    phase = shouldPause ? 'paused' : 'playing';
    pauseButton.firstElementChild!.textContent = shouldPause ? '▶' : 'Ⅱ';
    pauseButton.setAttribute('aria-label', shouldPause ? 'Resume game' : 'Pause game');
    setScreen(shouldPause ? pauseScreen : null);
  }

  function finishGame(won: boolean): void {
    phase = won ? 'won' : 'gameover';
    leaderboard.showFinalScore(score);
    if (won) {
      endIconElement.textContent = '✿';
      endEyebrowElement.textContent = 'Your tiny garden is glowing';
      endTitleElement.textContent = 'You bloomed!';
      endCopyElement.textContent = 'Every little drop helped this garden grow.';
      synth.win();
      burst(player.x, player.y - 130, COLORS.flower, 55, true);
    } else {
      endIconElement.textContent = '+';
      endEyebrowElement.textContent = 'The garden is resting';
      endTitleElement.textContent = score >= 240 ? 'So close!' : 'Almost there!';
      endCopyElement.textContent = 'Give your little seed another sunny day.';
    }
    window.setTimeout(() => setScreen(endScreen), won ? 900 : 450);
  }

  function burst(x: number, y: number, color: number, count = 12, energetic = false): void {
    for (let index = 0; index < count; index += 1) particles.push(new Particle(x, y, color, particleLayer, energetic));
  }

  function spawnItem(): void {
    const difficulty = clamp(elapsed / 85, 0, 1);
    const roll = Math.random();
    const bugChance = 0.14 + difficulty * 0.13;
    const type: ItemType = roll < bugChance ? 'bug' : roll < 0.59 ? 'water' : 'sun';
    const margin = 42;
    const speed = random(125, 175) + difficulty * random(85, 145) + (type === 'bug' ? 18 : 0);
    items.push(new FallingItem(type, random(margin, Math.max(margin + 1, app.screen.width - margin)), speed, itemLayer));
  }

  function damage(message: string, source: 'bug' | 'missed' = 'bug'): void {
    health -= 1;
    if (source === 'bug') {
      player.hurt();
      shakeTime = 0.33;
      synth.hurt();
      burst(player.x, player.y - 50, COLORS.bug, 12);
    } else {
      synth.wilt();
      burst(player.x, player.y - 65, COLORS.leafLight, 8);
    }
    showToast(message);
    leaderboard.update(score, health, growthStage, source);
    if (health <= 0) finishGame(false);
  }

  function collect(item: FallingItem): void {
    if (item.type === 'bug') {
      damage('Oh no — a hungry bug!');
      return;
    }

    const points = item.type === 'water' ? 10 : 15;
    score += points;
    synth.collect(item.type);
    player.celebrate();
    burst(item.x, item.y, item.type === 'water' ? COLORS.waterLight : COLORS.sunLight, item.type === 'sun' ? 18 : 12);
    showToast(`${item.type === 'water' ? 'Fresh rain' : 'Warm sunshine'}  +${points}`);

    leaderboard.recordScore(score);

    const nextStage = stageForScore(score);
    if (nextStage > growthStage) {
      growthStage = nextStage;
      player.setStage(growthStage);
      synth.grow();
      burst(player.x, player.y - 95, COLORS.leafLight, 32, true);
      showToast(growthStage === GROWTH_STAGES.length - 1 ? 'Your garden is in full bloom!' : `New growth: ${GROWTH_STAGES[growthStage].name}`);
    }
    leaderboard.update(score, health, growthStage);
    if (score >= GROWTH_STAGES.at(-1)!.threshold) finishGame(true);
  }

  function missResource(): void {
    missedResources += 1;
    if (missedResources >= 3) {
      missedResources = 0;
      damage('The garden wilted after 3 misses', 'missed');
    } else {
      showToast(`${3 - missedResources} more ${3 - missedResources === 1 ? 'miss' : 'misses'} before a health leaf wilts`);
    }
  }

  function inputDirection(): number {
    const left = pressedKeys.has('arrowleft') || pressedKeys.has('a') || leftHeld;
    const right = pressedKeys.has('arrowright') || pressedKeys.has('d') || rightHeld;
    return Number(right) - Number(left);
  }

  function updateGame(delta: number): void {
    elapsed += delta;
    spawnElapsed += delta;
    const spawnInterval = lerp(0.9, 0.39, clamp(elapsed / 90, 0, 1));
    if (spawnElapsed >= spawnInterval) {
      spawnElapsed -= spawnInterval;
      spawnItem();
    }

    player.update(delta, inputDirection(), 48, app.screen.width - 48);
    for (let index = items.length - 1; index >= 0; index -= 1) {
      const item = items[index];
      item.update(delta);
      if (player.catches(item)) {
        items.splice(index, 1);
        collect(item);
        item.destroy();
        if (phase !== 'playing') break;
      } else if (item.y - item.radius > app.screen.height + 8) {
        items.splice(index, 1);
        if (item.type !== 'bug') missResource();
        item.destroy();
        if (phase !== 'playing') break;
      }
    }

    if (shakeTime > 0) {
      shakeTime -= delta;
      gameLayer.position.set(random(-6, 6), random(-3, 3));
    } else {
      gameLayer.position.set(0, 0);
    }
  }

  function updateParticles(delta: number): void {
    for (let index = particles.length - 1; index >= 0; index -= 1) {
      if (!particles[index].update(delta)) {
        particles[index].destroy();
        particles.splice(index, 1);
      }
    }
  }

  app.ticker.add((ticker) => {
    const delta = Math.min(ticker.deltaMS / 1000, 0.05);
    background.update(
      delta,
      score,
      GROWTH_STAGES.at(-1)!.threshold,
      elapsed,
      phase === 'menu',
      app.screen.width,
      app.screen.height,
    );
    updateParticles(delta);
    if (phase === 'playing') updateGame(delta);
    else if (phase === 'menu') {
      player.targetX = menuPlayerX(app.screen.width) + Math.sin(performance.now() / 1600) * 12;
      player.update(delta, 0, 48, app.screen.width - 48);
    }
    if (toastTimeout > 0) {
      toastTimeout -= delta;
      if (toastTimeout <= 0) toastElement.classList.remove('is-visible');
    }
  });

  function setSoundEnabled(enabled: boolean, unlockAudio = true): void {
    leaderboard.setSoundEnabled(enabled);
    synth.enabled = enabled;
    soundButton.classList.toggle('is-off', !enabled);
    soundButton.firstElementChild!.textContent = enabled ? '♪' : '×';
    soundButton.setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on');
    if (enabled && unlockAudio) synth.unlock();
  }

  function bindHoldButton(button: HTMLButtonElement, side: 'left' | 'right'): void {
    const set = (value: boolean): void => {
      if (side === 'left') leftHeld = value;
      else rightHeld = value;
    };
    button.addEventListener('pointerdown', (event) => {
      event.preventDefault();
      button.setPointerCapture(event.pointerId);
      set(true);
    });
    ['pointerup', 'pointercancel', 'lostpointercapture'].forEach((eventName) => {
      button.addEventListener(eventName, () => set(false));
    });
  }

  element<HTMLButtonElement>('#start-button').addEventListener('click', startGame);
  element<HTMLButtonElement>('#restart-button').addEventListener('click', startGame);
  element<HTMLButtonElement>('#resume-button').addEventListener('click', () => togglePause(false));
  element<HTMLButtonElement>('#quit-button').addEventListener('click', returnHome);
  element<HTMLButtonElement>('#home-button').addEventListener('click', returnHome);
  pauseButton.addEventListener('click', () => togglePause());
  soundButton.addEventListener('click', () => setSoundEnabled(!leaderboard.soundEnabled));
  bindHoldButton(element<HTMLButtonElement>('#move-left'), 'left');
  bindHoldButton(element<HTMLButtonElement>('#move-right'), 'right');

  window.addEventListener('keydown', (event) => {
    const key = event.key.toLowerCase();
    if (['arrowleft', 'arrowright', 'a', 'd', 'p', 'escape'].includes(key)) event.preventDefault();
    if ((key === 'p' || key === 'escape') && !event.repeat) togglePause();
    pressedKeys.add(key);
  });
  window.addEventListener('keyup', (event) => pressedKeys.delete(event.key.toLowerCase()));
  window.addEventListener('blur', () => {
    pressedKeys.clear();
    leftHeld = false;
    rightHeld = false;
    if (phase === 'playing') togglePause(true);
  });
  document.addEventListener('visibilitychange', () => {
    if (document.hidden && phase === 'playing') togglePause(true);
  });

  app.canvas.addEventListener('pointerdown', (event) => {
    if (phase !== 'playing') return;
    dragActive = true;
    app.canvas.setPointerCapture(event.pointerId);
  });
  app.canvas.addEventListener('pointermove', (event) => {
    if (!dragActive || phase !== 'playing') return;
    const bounds = app.canvas.getBoundingClientRect();
    player.targetX = clamp(((event.clientX - bounds.left) / bounds.width) * app.screen.width, 48, app.screen.width - 48);
  });
  app.canvas.addEventListener('pointerup', () => { dragActive = false; });
  app.canvas.addEventListener('pointercancel', () => { dragActive = false; });

  window.addEventListener('resize', layoutScene);
  setSoundEnabled(leaderboard.soundEnabled, false);
  player.reset(2);
  layoutScene();
  leaderboard.update(score, health, growthStage);
  setScreen(startScreen);
}

void initializeGame().catch((error: unknown) => {
  console.error('Tiny Garden could not start:', error);
  const startButton = element<HTMLButtonElement>('#start-button');
  startButton.disabled = true;
  startButton.textContent = 'Please refresh the garden';
});
