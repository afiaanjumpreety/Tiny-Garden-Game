import {
  Application,
  Container,
  Graphics,
} from 'pixi.js';
import './style.css';

type GamePhase = 'menu' | 'playing' | 'paused' | 'gameover' | 'won';
type ItemType = 'water' | 'sun' | 'bug';

interface GrowthStage {
  name: string;
  threshold: number;
}

interface StoredSettings {
  sound: boolean;
  bestScore: number;
}

const GROWTH_STAGES: GrowthStage[] = [
  { name: 'Little Seed', threshold: 0 },
  { name: 'Curious Sprout', threshold: 50 },
  { name: 'Leafy Friend', threshold: 130 },
  { name: 'Budding Beauty', threshold: 240 },
  { name: 'Full Bloom!', threshold: 400 },
];

const COLORS = {
  ink: 0x315447,
  leaf: 0x65a968,
  leafLight: 0x86c777,
  leafDark: 0x3f7e58,
  pot: 0xdf9470,
  potDark: 0xb96f5d,
  potLight: 0xf1af83,
  soil: 0x725747,
  water: 0x66b8dc,
  waterLight: 0xc9f2f4,
  sun: 0xf4c759,
  sunLight: 0xffef9a,
  bug: 0xc96f71,
  bugDark: 0x6e4a53,
  flower: 0xed9f87,
  flowerLight: 0xffd7ae,
  cream: 0xfffae9,
};

const GAME_STORAGE_KEY = 'tiny-garden-settings-v1';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function lerp(start: number, end: number, amount: number): number {
  return start + (end - start) * amount;
}

function random(min: number, max: number): number {
  return min + Math.random() * (max - min);
}

function loadSettings(): StoredSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(GAME_STORAGE_KEY) ?? '{}') as Partial<StoredSettings>;
    return {
      sound: stored.sound ?? true,
      bestScore: Math.max(0, stored.bestScore ?? 0),
    };
  } catch {
    return { sound: true, bestScore: 0 };
  }
}

function saveSettings(settings: StoredSettings): void {
  try {
    localStorage.setItem(GAME_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // The game remains fully playable when storage is unavailable.
  }
}

class TinySynth {
  private context?: AudioContext;
  enabled: boolean;

  constructor(enabled: boolean) {
    this.enabled = enabled;
  }

  unlock(): void {
    if (!this.enabled) return;
    this.context ??= new AudioContext();
    if (this.context.state === 'suspended') void this.context.resume();
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

  collect(type: 'water' | 'sun'): void {
    if (type === 'water') {
      this.note(520, 0.12, 'sine', 0.028);
      this.note(690, 0.1, 'sine', 0.021, 0.055);
    } else {
      this.note(740, 0.11, 'triangle', 0.026);
      this.note(990, 0.16, 'triangle', 0.021, 0.065);
    }
  }

  hurt(): void {
    this.note(150, 0.18, 'sawtooth', 0.018);
    this.note(105, 0.22, 'square', 0.012, 0.05);
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

function makeLeaf(x: number, y: number, rotation: number, scale = 1, color = COLORS.leaf): Graphics {
  const leaf = new Graphics()
    .ellipse(0, 0, 17 * scale, 8 * scale)
    .fill(color)
    .moveTo(-13 * scale, 0)
    .lineTo(12 * scale, 0)
    .stroke({ color: COLORS.leafDark, width: 1.4, alpha: 0.38 });
  leaf.position.set(x, y);
  leaf.rotation = rotation;
  return leaf;
}

class Player {
  readonly view = new Container();
  private readonly plant = new Container();
  private readonly pot = new Graphics();
  private readonly face = new Graphics();
  private stage = 0;
  private bounce = 0;
  private hurtTime = 0;
  x = 0;
  y = 0;
  targetX = 0;
  velocity = 0;

  constructor(parent: Container) {
    const shadow = new Graphics().ellipse(0, -1, 49, 10).fill({ color: 0x315447, alpha: 0.14 });
    this.drawPot();
    this.view.addChild(shadow, this.plant, this.pot, this.face);
    this.drawPlant(0);
    parent.addChild(this.view);
  }

  private drawPot(): void {
    this.pot.clear()
      .roundRect(-39, -58, 78, 18, 7)
      .fill(COLORS.potLight)
      .roundRect(-34, -49, 68, 49, 8)
      .fill(COLORS.pot)
      .moveTo(-34, -38)
      .lineTo(-27, -4)
      .quadraticCurveTo(0, 5, 27, -4)
      .lineTo(34, -38)
      .fill({ color: COLORS.potDark, alpha: 0.18 })
      .ellipse(0, -51, 31, 7)
      .fill(COLORS.soil)
      .ellipse(-10, -53, 9, 2.5)
      .fill({ color: 0xffffff, alpha: 0.13 });

    this.face.clear()
      .circle(-12, -25, 2.5)
      .circle(12, -25, 2.5)
      .fill(COLORS.ink)
      .arc(0, -22, 8, 0.2, Math.PI - 0.2)
      .stroke({ color: COLORS.ink, width: 2 })
      .ellipse(-19, -17, 5, 2.5)
      .ellipse(19, -17, 5, 2.5)
      .fill({ color: COLORS.flower, alpha: 0.45 });
  }

  setStage(stage: number): void {
    if (stage === this.stage) return;
    this.stage = stage;
    this.drawPlant(stage);
    this.bounce = 1;
  }

  reset(stage = 0): void {
    this.stage = -1;
    this.setStage(stage);
    this.bounce = 0;
    this.hurtTime = 0;
    this.velocity = 0;
    this.view.alpha = 1;
  }

  celebrate(): void {
    this.bounce = 1;
  }

  hurt(): void {
    this.hurtTime = 0.7;
  }

  private drawPlant(stage: number): void {
    this.plant.removeChildren().forEach((child) => child.destroy());
    const height = [24, 48, 72, 91, 112][stage] ?? 24;
    const stem = new Graphics()
      .moveTo(0, -54)
      .bezierCurveTo(-2, -73, 3, -90, 0, -54 - height)
      .stroke({ color: COLORS.leafDark, width: stage < 2 ? 4 : 5, cap: 'round' });
    this.plant.addChild(stem);

    if (stage === 0) {
      this.plant.addChild(makeLeaf(-7, -73, -2.7, 0.72), makeLeaf(8, -78, -0.35, 0.72, COLORS.leafLight));
      return;
    }

    const leaves = [
      [-13, -77, -2.75, 0.82], [14, -89, -0.38, 0.84],
      [-17, -103, -2.72, 0.95], [17, -119, -0.36, 1],
      [-19, -139, -2.77, 1.06], [16, -153, -0.3, 0.92],
    ];
    leaves.slice(0, stage * 2).forEach(([x, y, rotation, scale], index) => {
      this.plant.addChild(makeLeaf(x, y, rotation, scale, index % 2 ? COLORS.leafLight : COLORS.leaf));
    });

    if (stage >= 3) {
      const bud = new Graphics()
        .ellipse(0, -54 - height - 3, stage === 3 ? 10 : 13, stage === 3 ? 15 : 12)
        .fill(stage === 3 ? COLORS.flower : COLORS.sunLight);
      this.plant.addChild(bud);
    }

    if (stage >= 4) {
      const flower = new Container();
      flower.position.set(0, -171);
      for (let index = 0; index < 8; index += 1) {
        const angle = (Math.PI * 2 * index) / 8;
        const petal = new Graphics().ellipse(0, -15, 9, 16).fill(index % 2 ? COLORS.flowerLight : COLORS.flower);
        petal.rotation = angle;
        flower.addChild(petal);
      }
      flower.addChild(new Graphics().circle(0, 0, 12).fill(COLORS.sun).circle(-3, -3, 3).fill({ color: 0xffffff, alpha: 0.32 }));
      this.plant.addChild(flower);
    }
  }

  update(delta: number, direction: number, minX: number, maxX: number): void {
    const acceleration = 1450;
    const maxSpeed = 520;
    if (direction !== 0) {
      this.velocity += direction * acceleration * delta;
      this.targetX = this.x;
    } else if (Math.abs(this.targetX - this.x) > 3) {
      this.velocity += Math.sign(this.targetX - this.x) * acceleration * 0.85 * delta;
    } else {
      this.velocity *= Math.pow(0.0008, delta);
    }
    this.velocity = clamp(this.velocity, -maxSpeed, maxSpeed);
    this.x = clamp(this.x + this.velocity * delta, minX, maxX);
    if ((this.x === minX && this.velocity < 0) || (this.x === maxX && this.velocity > 0)) this.velocity = 0;

    this.bounce = Math.max(0, this.bounce - delta * 2.7);
    const pop = Math.sin((1 - this.bounce) * Math.PI * 2) * this.bounce;
    const movementTilt = clamp(this.velocity / 2200, -0.09, 0.09);
    this.view.position.set(this.x, this.y - Math.abs(pop) * 8);
    this.view.scale.set(1 + pop * 0.05, 1 - pop * 0.05);
    this.view.rotation = movementTilt;

    if (this.hurtTime > 0) {
      this.hurtTime -= delta;
      this.view.alpha = Math.floor(this.hurtTime * 18) % 2 ? 0.38 : 1;
    } else {
      this.view.alpha = 1;
    }
  }

  catches(item: FallingItem): boolean {
    return Math.abs(item.x - this.x) < 48 + item.radius * 0.35
      && item.y + item.radius > this.y - 72
      && item.y - item.radius < this.y - 4;
  }
}

class FallingItem {
  readonly view = new Container();
  readonly type: ItemType;
  readonly radius: number;
  x: number;
  y: number;
  speed: number;
  private age = Math.random() * 10;
  private readonly drift: number;

  constructor(type: ItemType, x: number, speed: number, parent: Container) {
    this.type = type;
    this.x = x;
    this.y = -40;
    this.speed = speed;
    this.radius = type === 'sun' ? 18 : type === 'bug' ? 17 : 15;
    this.drift = random(-16, 16);
    this.draw();
    this.view.position.set(this.x, this.y);
    parent.addChild(this.view);
  }

  private draw(): void {
    if (this.type === 'water') {
      const drop = new Graphics()
        .moveTo(0, -20)
        .bezierCurveTo(-4, -11, -15, 1, -15, 9)
        .bezierCurveTo(-15, 20, 15, 20, 15, 9)
        .bezierCurveTo(15, 1, 4, -11, 0, -20)
        .fill(COLORS.water)
        .ellipse(-5, 5, 3.2, 6)
        .fill({ color: COLORS.waterLight, alpha: 0.85 });
      this.view.addChild(drop);
    } else if (this.type === 'sun') {
      const rays = new Graphics();
      for (let index = 0; index < 8; index += 1) {
        const angle = (index / 8) * Math.PI * 2;
        rays.moveTo(Math.cos(angle) * 22, Math.sin(angle) * 22)
          .lineTo(Math.cos(angle) * 28, Math.sin(angle) * 28);
      }
      rays.stroke({ color: COLORS.sun, width: 3.5, cap: 'round' });
      const center = new Graphics()
        .circle(0, 0, 17)
        .fill(COLORS.sun)
        .circle(-5, -5, 4)
        .fill({ color: COLORS.sunLight, alpha: 0.8 });
      this.view.addChild(rays, center);
    } else {
      const bug = new Graphics();
      for (const side of [-1, 1]) {
        for (let index = 0; index < 3; index += 1) {
          const y = -4 + index * 7;
          bug.moveTo(side * 10, y).lineTo(side * 19, y + (index - 1) * 5);
        }
        bug.moveTo(side * 5, -14).quadraticCurveTo(side * 13, -25, side * 18, -20);
      }
      bug.stroke({ color: COLORS.bugDark, width: 2, cap: 'round' })
        .ellipse(0, 3, 13, 17)
        .fill(COLORS.bug)
        .circle(0, -12, 9)
        .fill(COLORS.bugDark)
        .circle(-3, -14, 1.5)
        .circle(3, -14, 1.5)
        .fill(COLORS.cream)
        .moveTo(0, -4)
        .lineTo(0, 18)
        .stroke({ color: COLORS.bugDark, width: 2, alpha: 0.45 });
      this.view.addChild(bug);
    }
  }

  update(delta: number): void {
    this.age += delta;
    this.y += this.speed * delta;
    this.x += (this.drift + Math.sin(this.age * 2.2) * 9) * delta;
    this.view.position.set(this.x, this.y);
    this.view.rotation = Math.sin(this.age * 3) * (this.type === 'bug' ? 0.2 : 0.08);
    const pulse = this.type === 'sun' ? 1 + Math.sin(this.age * 4) * 0.06 : 1;
    this.view.scale.set(pulse);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

class Particle {
  readonly view: Graphics;
  private velocityX: number;
  private velocityY: number;
  private life: number;
  private readonly maxLife: number;
  private readonly gravity: number;

  constructor(x: number, y: number, color: number, parent: Container, energetic = false) {
    const size = random(2.5, 6);
    this.view = Math.random() > 0.32
      ? new Graphics().circle(0, 0, size).fill({ color, alpha: 0.9 })
      : new Graphics().star(0, 0, 4, size * 1.5, 1).fill({ color, alpha: 0.9 });
    this.view.position.set(x, y);
    this.velocityX = random(-90, 90) * (energetic ? 1.7 : 1);
    this.velocityY = random(energetic ? -190 : -125, -35);
    this.life = random(0.45, 0.9);
    this.maxLife = this.life;
    this.gravity = random(90, 210);
    parent.addChild(this.view);
  }

  update(delta: number): boolean {
    this.life -= delta;
    this.velocityY += this.gravity * delta;
    this.view.x += this.velocityX * delta;
    this.view.y += this.velocityY * delta;
    this.view.rotation += delta * 3;
    this.view.alpha = clamp(this.life / this.maxLife, 0, 1);
    this.view.scale.set(0.55 + this.view.alpha * 0.45);
    return this.life > 0;
  }

  destroy(): void {
    this.view.destroy();
  }
}

interface Cloud {
  view: Container;
  speed: number;
}

function createCloud(scale: number): Container {
  const cloud = new Container();
  const body = new Graphics()
    .ellipse(0, 4, 49, 18)
    .circle(-28, -2, 19)
    .circle(4, -12, 26)
    .circle(31, 0, 19)
    .fill({ color: 0xffffff, alpha: 0.78 });
  const shade = new Graphics().ellipse(2, 12, 43, 8).fill({ color: 0xa7c8c5, alpha: 0.12 });
  cloud.addChild(body, shade);
  cloud.scale.set(scale);
  return cloud;
}

function hexToRgb(hex: number): [number, number, number] {
  return [(hex >> 16) & 255, (hex >> 8) & 255, hex & 255];
}

function mixHex(first: number, second: number, amount: number): string {
  const a = hexToRgb(first);
  const b = hexToRgb(second);
  const values = a.map((value, index) => Math.round(lerp(value, b[index], amount)));
  return `rgb(${values[0]}, ${values[1]}, ${values[2]})`;
}

const host = element<HTMLDivElement>('#game');
const scoreElement = element<HTMLSpanElement>('#score');
const livesElement = element<HTMLElement>('#lives');
const stageNameElement = element<HTMLSpanElement>('#stage-name');
const growthCountElement = element<HTMLSpanElement>('#growth-count');
const growthBarElement = element<HTMLSpanElement>('#growth-bar');
const bestScoreElement = element<HTMLSpanElement>('#best-score');
const toastElement = element<HTMLDivElement>('#toast');
const startScreen = element<HTMLElement>('#start-screen');
const pauseScreen = element<HTMLElement>('#pause-screen');
const endScreen = element<HTMLElement>('#end-screen');
const pauseButton = element<HTMLButtonElement>('#pause-button');
const soundButton = element<HTMLButtonElement>('#sound-button');
const finalScoreElement = element<HTMLElement>('#final-score');
const finalBestElement = element<HTMLElement>('#final-best');
const endTitleElement = element<HTMLElement>('#end-title');
const endEyebrowElement = element<HTMLElement>('#end-eyebrow');
const endCopyElement = element<HTMLElement>('#end-copy');
const endIconElement = element<HTMLElement>('#end-icon');

const settings = loadSettings();
const synth = new TinySynth(settings.sound);
bestScoreElement.textContent = String(settings.bestScore);

const app = new Application();
await app.init({
  resizeTo: host,
  backgroundAlpha: 0,
  antialias: true,
  autoDensity: true,
  resolution: Math.min(window.devicePixelRatio || 1, 2),
  preference: 'webgl',
});
host.prepend(app.canvas);
app.canvas.setAttribute('aria-hidden', 'true');

const backdropLayer = new Container();
const starLayer = new Container();
const atmosphereLayer = new Container();
const itemLayer = new Container();
const playerLayer = new Container();
const particleLayer = new Container();
const gameLayer = new Container();
gameLayer.addChild(itemLayer, playerLayer, particleLayer);
app.stage.addChild(backdropLayer, starLayer, atmosphereLayer, gameLayer);

const hills = new Graphics();
const meadowDetails = new Graphics();
backdropLayer.addChild(hills, meadowDetails);

const stars: Graphics[] = [];
for (let index = 0; index < 28; index += 1) {
  const star = new Graphics().star(0, 0, 4, random(1.5, 3.2), 0.7).fill({ color: 0xfff6c5, alpha: 0 });
  starLayer.addChild(star);
  stars.push(star);
}

const clouds: Cloud[] = [];
for (let index = 0; index < 6; index += 1) {
  const cloud = createCloud(random(0.55, 1.15));
  atmosphereLayer.addChild(cloud);
  clouds.push({ view: cloud, speed: random(7, 16) });
}

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

function layoutScene(): void {
  const { width, height } = app.screen;
  const groundY = height - (width < 720 ? 74 : 65);
  player.y = groundY;
  if (phase === 'menu') {
    player.x = width * 0.76;
    player.targetX = player.x;
  } else {
    player.x = clamp(player.x, 52, width - 52);
    player.targetX = clamp(player.targetX, 52, width - 52);
  }

  hills.clear()
    .moveTo(0, height * 0.63)
    .bezierCurveTo(width * 0.18, height * 0.49, width * 0.36, height * 0.71, width * 0.55, height * 0.57)
    .bezierCurveTo(width * 0.73, height * 0.45, width * 0.89, height * 0.67, width, height * 0.54)
    .lineTo(width, height)
    .lineTo(0, height)
    .fill(0xa3cb83)
    .moveTo(0, height * 0.72)
    .bezierCurveTo(width * 0.24, height * 0.61, width * 0.33, height * 0.8, width * 0.59, height * 0.69)
    .bezierCurveTo(width * 0.77, height * 0.61, width * 0.9, height * 0.76, width, height * 0.67)
    .lineTo(width, height)
    .lineTo(0, height)
    .fill(0x7fb56f);

  meadowDetails.clear();
  for (let index = 0; index < Math.ceil(width / 38); index += 1) {
    const x = index * 39 + (index % 3) * 8;
    const y = groundY + 20 + (index % 4) * 6;
    meadowDetails.moveTo(x, y).quadraticCurveTo(x - 5, y - 14, x - 8, y - 19)
      .moveTo(x, y).quadraticCurveTo(x + 5, y - 11, x + 9, y - 16);
  }
  meadowDetails.stroke({ color: 0x4f8f5c, width: 2, alpha: 0.5, cap: 'round' });

  clouds.forEach((cloud, index) => {
    if (cloud.view.x === 0) cloud.view.position.set((index / clouds.length) * width + random(-60, 80), 90 + (index % 3) * 75);
  });
  stars.forEach((star, index) => {
    star.position.set(((index * 97) % 1000) / 1000 * width, 30 + ((index * 61) % Math.max(90, height * 0.48)));
  });
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

function updateHud(): void {
  scoreElement.textContent = String(score);
  livesElement.textContent = `${'♥ '.repeat(health)}${'♡ '.repeat(3 - health)}`.trim();
  livesElement.setAttribute('aria-label', `${health} ${health === 1 ? 'heart' : 'hearts'}`);
  const current = GROWTH_STAGES[growthStage];
  const next = GROWTH_STAGES[growthStage + 1];
  stageNameElement.textContent = current.name;
  if (next) {
    const range = next.threshold - current.threshold;
    const progress = clamp((score - current.threshold) / range, 0, 1);
    growthCountElement.textContent = `${score} / ${next.threshold}`;
    growthBarElement.style.width = `${progress * 100}%`;
  } else {
    growthCountElement.textContent = 'Garden complete';
    growthBarElement.style.width = '100%';
  }
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
  player.reset();
  updateHud();
}

function startGame(): void {
  synth.unlock();
  resetGame();
  phase = 'playing';
  pauseButton.firstElementChild!.textContent = 'Ⅱ';
  pauseButton.setAttribute('aria-label', 'Pause game');
  setScreen(null);
  showToast('Catch some sunshine!');
}

function returnHome(): void {
  clearEntities();
  phase = 'menu';
  score = 0;
  growthStage = 0;
  player.reset(2);
  layoutScene();
  updateHud();
  bestScoreElement.textContent = String(settings.bestScore);
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
  settings.bestScore = Math.max(settings.bestScore, score);
  saveSettings(settings);
  finalScoreElement.textContent = String(score);
  finalBestElement.textContent = String(settings.bestScore);
  bestScoreElement.textContent = String(settings.bestScore);
  if (won) {
    endIconElement.textContent = '🌸';
    endEyebrowElement.textContent = 'Your tiny garden is glowing';
    endTitleElement.textContent = 'You bloomed!';
    endCopyElement.textContent = 'Every little drop helped this garden grow.';
    synth.win();
    burst(player.x, player.y - 130, COLORS.flower, 55, true);
  } else {
    endIconElement.textContent = '🌱';
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

function damage(message: string): void {
  health -= 1;
  player.hurt();
  shakeTime = 0.33;
  synth.hurt();
  burst(player.x, player.y - 50, COLORS.bug, 12);
  showToast(message);
  updateHud();
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

  if (score > settings.bestScore) {
    settings.bestScore = score;
    saveSettings(settings);
  }

  const nextStage = stageForScore(score);
  if (nextStage > growthStage) {
    growthStage = nextStage;
    player.setStage(growthStage);
    synth.grow();
    burst(player.x, player.y - 95, COLORS.leafLight, 32, true);
    showToast(growthStage === GROWTH_STAGES.length - 1 ? 'Your garden is in full bloom!' : `New growth: ${GROWTH_STAGES[growthStage].name}`);
  }
  updateHud();
  if (score >= GROWTH_STAGES.at(-1)!.threshold) finishGame(true);
}

function missResource(): void {
  missedResources += 1;
  if (missedResources >= 3) {
    missedResources = 0;
    damage('Three missed goodies cost a heart');
  } else {
    showToast(`${3 - missedResources} more ${3 - missedResources === 1 ? 'miss' : 'misses'} before a heart wilts`);
  }
}

function inputDirection(): number {
  const left = pressedKeys.has('arrowleft') || pressedKeys.has('a') || leftHeld;
  const right = pressedKeys.has('arrowright') || pressedKeys.has('d') || rightHeld;
  return Number(right) - Number(left);
}

function updateAtmosphere(delta: number): void {
  const progress = phase === 'menu' ? 0.12 : clamp(score / GROWTH_STAGES.at(-1)!.threshold, 0, 1);
  const sunsetAmount = clamp((progress - 0.28) / 0.42, 0, 1);
  const nightAmount = clamp((progress - 0.7) / 0.3, 0, 1);
  const skyTop = nightAmount > 0
    ? mixHex(0xf0aa91, 0x263c68, nightAmount)
    : mixHex(0x99d7ed, 0xf0aa91, sunsetAmount);
  const skyBottom = nightAmount > 0
    ? mixHex(0xf4d39a, 0x6b6891, nightAmount)
    : mixHex(0xe1f0cd, 0xf4d39a, sunsetAmount);
  host.style.background = `linear-gradient(180deg, ${skyTop} 0%, ${skyBottom} 62%, #83b66f 100%)`;
  stars.forEach((star, index) => {
    star.alpha = nightAmount * (0.5 + Math.sin(elapsed * 2.2 + index) * 0.24);
  });
  clouds.forEach((cloud) => {
    cloud.view.x += cloud.speed * delta;
    cloud.view.alpha = 1 - nightAmount * 0.42;
    if (cloud.view.x - cloud.view.width / 2 > app.screen.width + 40) {
      cloud.view.x = -cloud.view.width - random(20, 120);
      cloud.view.y = random(75, Math.max(130, app.screen.height * 0.4));
    }
  });
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
  updateAtmosphere(delta);
  updateParticles(delta);
  if (phase === 'playing') updateGame(delta);
  else if (phase === 'menu') {
    player.targetX = app.screen.width * 0.76 + Math.sin(performance.now() / 1600) * 24;
    player.update(delta, 0, 48, app.screen.width - 48);
  }
  if (toastTimeout > 0) {
    toastTimeout -= delta;
    if (toastTimeout <= 0) toastElement.classList.remove('is-visible');
  }
});

function setSoundEnabled(enabled: boolean): void {
  settings.sound = enabled;
  synth.enabled = enabled;
  saveSettings(settings);
  soundButton.classList.toggle('is-off', !enabled);
  soundButton.firstElementChild!.textContent = enabled ? '♪' : '×';
  soundButton.setAttribute('aria-label', enabled ? 'Turn sound off' : 'Turn sound on');
  if (enabled) synth.unlock();
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
soundButton.addEventListener('click', () => setSoundEnabled(!settings.sound));
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
setSoundEnabled(settings.sound);
player.reset(2);
layoutScene();
updateHud();
setScreen(startScreen);
