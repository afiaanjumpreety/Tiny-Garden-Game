import { Container, Graphics } from 'pixi.js';
import { clamp, COLORS, random, type ItemType } from '../game/config';

function makeLeaf(x: number, y: number, rotation: number, scale = 1, color: number = COLORS.leaf): Graphics {
  const direction = rotation < -1 ? -1 : 1;
  const unit = 4 * scale;
  const leaf = new Graphics()
    .rect(direction < 0 ? -unit * 4 : 0, -unit, unit * 4, unit * 2)
    .rect(direction < 0 ? -unit * 3 : unit, -unit * 2, unit * 2, unit * 4)
    .fill(COLORS.leafDark)
    .rect(direction < 0 ? -unit * 3 : 0, -unit, unit * 3, unit * 2)
    .rect(direction < 0 ? -unit * 2 : unit, -unit * 2, unit * 2, unit * 3)
    .fill(color)
    .rect(direction < 0 ? -unit * 2 : unit, -unit, unit * 2, unit)
    .fill({ color: 0xffffff, alpha: 0.16 });
  leaf.position.set(Math.round(x), Math.round(y));
  return leaf;
}

export class Player {
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
    const shadow = new Graphics()
      .rect(-48, -8, 96, 8)
      .rect(-36, -12, 72, 4)
      .fill({ color: 0x806356, alpha: 0.14 });
    this.drawPot();
    this.view.addChild(shadow, this.plant, this.pot, this.face);
    this.drawPlant(0);
    parent.addChild(this.view);
  }

  private drawPot(): void {
    this.pot.clear()
      .rect(-40, -60, 80, 16)
      .rect(-36, -44, 72, 8)
      .rect(-32, -36, 64, 28)
      .rect(-24, -8, 48, 8)
      .fill(COLORS.potDark)
      .rect(-36, -56, 72, 8)
      .fill(COLORS.potLight)
      .rect(-28, -36, 56, 24)
      .rect(-20, -12, 40, 8)
      .fill(COLORS.pot)
      .rect(-28, -36, 8, 20)
      .rect(-20, -12, 8, 4)
      .fill({ color: COLORS.potLight, alpha: 0.52 })
      .rect(-32, -48, 64, 8)
      .fill(COLORS.soil)
      .rect(-24, -48, 16, 4)
      .fill({ color: 0xffffff, alpha: 0.15 });

    this.face.clear()
      .rect(-16, -28, 5, 5)
      .rect(11, -28, 5, 5)
      .fill(COLORS.ink)
      .rect(-8, -19, 4, 4)
      .rect(-4, -15, 8, 4)
      .rect(4, -19, 4, 4)
      .fill(COLORS.ink)
      .rect(-23, -19, 8, 4)
      .rect(15, -19, 8, 4)
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
      .rect(-3, -54 - height, 7, height)
      .fill(COLORS.leafDark)
      .rect(1, -54 - height, 3, height)
      .fill({ color: COLORS.leafLight, alpha: 0.45 });
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
        .rect(-8, -54 - height - 16, 16, 20)
        .rect(-12, -54 - height - 12, 24, 12)
        .fill(COLORS.potDark)
        .rect(-4, -54 - height - 12, 12, 12)
        .fill(stage === 3 ? COLORS.flower : COLORS.sunLight);
      this.plant.addChild(bud);
    }

    if (stage >= 4) {
      const flower = new Graphics()
        .rect(-8, -28, 16, 12)
        .rect(-8, 16, 16, 12)
        .rect(-28, -8, 12, 16)
        .rect(16, -8, 12, 16)
        .rect(-20, -20, 12, 12)
        .rect(8, -20, 12, 12)
        .rect(-20, 8, 12, 12)
        .rect(8, 8, 12, 12)
        .fill(COLORS.flower)
        .rect(-12, -12, 24, 24)
        .fill(COLORS.sun)
        .rect(-8, -8, 8, 8)
        .fill(COLORS.sunLight);
      flower.position.set(0, -171);
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
    const rawPop = Math.sin((1 - this.bounce) * Math.PI * 2) * this.bounce;
    const pop = Math.round(rawPop * 4) / 4;
    const movementTilt = Math.abs(this.velocity) > 50 ? Math.sign(this.velocity) * 0.035 : 0;
    this.view.position.set(Math.round(this.x), Math.round(this.y - Math.abs(pop) * 8));
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

export class FallingItem {
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
        .rect(-4, -20, 8, 4)
        .rect(-8, -16, 16, 8)
        .rect(-12, -8, 24, 8)
        .rect(-16, 0, 32, 12)
        .rect(-12, 12, 24, 8)
        .rect(-8, 20, 16, 4)
        .fill(0x438baa)
        .rect(-4, -12, 8, 8)
        .rect(-8, -4, 16, 12)
        .rect(-12, 4, 24, 8)
        .rect(-8, 12, 16, 4)
        .fill(COLORS.water)
        .rect(-8, 0, 4, 8)
        .fill(COLORS.waterLight);
      this.view.addChild(drop);
    } else if (this.type === 'sun') {
      const sun = new Graphics()
        .rect(-4, -28, 8, 8).rect(-4, 20, 8, 8)
        .rect(-28, -4, 8, 8).rect(20, -4, 8, 8)
        .rect(-20, -20, 8, 8).rect(12, -20, 8, 8)
        .rect(-20, 12, 8, 8).rect(12, 12, 8, 8)
        .fill(COLORS.sun)
        .rect(-12, -16, 24, 32)
        .rect(-16, -12, 32, 24)
        .fill(0xdca646)
        .rect(-8, -12, 16, 24)
        .rect(-12, -8, 24, 16)
        .fill(COLORS.sun)
        .rect(-8, -8, 8, 8)
        .fill(COLORS.sunLight);
      this.view.addChild(sun);
    } else {
      const bug = new Graphics()
        .rect(-20, -20, 8, 4).rect(12, -20, 8, 4)
        .rect(-24, -8, 12, 4).rect(12, -8, 12, 4)
        .rect(-24, 4, 12, 4).rect(12, 4, 12, 4)
        .rect(-20, 16, 8, 4).rect(12, 16, 8, 4)
        .fill(COLORS.bugDark)
        .rect(-12, -16, 24, 12)
        .rect(-16, -4, 32, 24)
        .rect(-12, 20, 24, 4)
        .fill(COLORS.bugDark)
        .rect(-8, -12, 16, 8)
        .rect(-12, 0, 24, 16)
        .fill(COLORS.bug)
        .rect(-4, 0, 4, 16)
        .fill({ color: COLORS.bugDark, alpha: 0.65 })
        .rect(-7, -11, 4, 4).rect(3, -11, 4, 4)
        .fill(COLORS.cream);
      this.view.addChild(bug);
    }
  }

  update(delta: number): void {
    this.age += delta;
    this.y += this.speed * delta;
    this.x += (this.drift + Math.sin(this.age * 2.2) * 9) * delta;
    this.view.position.set(Math.round(this.x / 2) * 2, Math.round(this.y / 2) * 2);
    this.view.rotation = this.type === 'bug' ? Math.sign(Math.sin(this.age * 6)) * 0.06 : 0;
    const pulse = this.type === 'sun' && Math.sin(this.age * 4) > 0 ? 1.06 : 1;
    this.view.scale.set(pulse);
  }

  destroy(): void {
    this.view.destroy({ children: true });
  }
}

export class Particle {
  readonly view: Graphics;
  private velocityX: number;
  private velocityY: number;
  private life: number;
  private readonly maxLife: number;
  private readonly gravity: number;

  constructor(x: number, y: number, color: number, parent: Container, energetic = false) {
    const size = Math.round(random(1, 2)) * 4;
    this.view = Math.random() > 0.32
      ? new Graphics().rect(-size / 2, -size / 2, size, size).fill({ color, alpha: 0.9 })
      : new Graphics()
        .rect(-size * 1.5, -size / 2, size * 3, size)
        .rect(-size / 2, -size * 1.5, size, size * 3)
        .fill({ color, alpha: 0.9 });
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
