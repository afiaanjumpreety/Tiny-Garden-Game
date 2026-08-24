import { Container, Graphics } from 'pixi.js';
import { clamp, lerp, random } from '../game/config';

interface Cloud {
  view: Container;
  speed: number;
}

function createCloud(scale: number): Container {
  const cloud = new Container();
  const body = new Graphics()
    .rect(-48, -4, 96, 24)
    .rect(-36, -16, 72, 36)
    .rect(-20, -28, 40, 48)
    .rect(28, 4, 32, 16)
    .rect(-60, 4, 24, 16)
    .fill({ color: 0xffffff, alpha: 0.78 });
  const shade = new Graphics()
    .rect(-48, 12, 96, 8)
    .rect(-36, 8, 20, 8)
    .fill({ color: 0x8fb4b4, alpha: 0.18 });
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

export class GardenBackground {
  readonly view = new Container();
  private readonly backdropLayer = new Container();
  private readonly starLayer = new Container();
  private readonly atmosphereLayer = new Container();
  private readonly hills = new Graphics();
  private readonly skyDither = new Graphics();
  private readonly meadowDetails = new Graphics();
  private readonly stars: Graphics[] = [];
  private readonly clouds: Cloud[] = [];

  constructor(private readonly host: HTMLElement) {
    this.backdropLayer.addChild(this.skyDither, this.hills, this.meadowDetails);
    this.view.addChild(this.backdropLayer, this.starLayer, this.atmosphereLayer);

    for (let index = 0; index < 28; index += 1) {
      const size = index % 4 === 0 ? 8 : 4;
      const star = new Graphics()
        .rect(-size * 1.5, -size / 2, size * 3, size)
        .rect(-size / 2, -size * 1.5, size, size * 3)
        .fill({ color: 0xfff6c5, alpha: 0 });
      this.starLayer.addChild(star);
      this.stars.push(star);
    }

    for (let index = 0; index < 6; index += 1) {
      const cloud = createCloud(random(0.55, 1.15));
      this.atmosphereLayer.addChild(cloud);
      this.clouds.push({ view: cloud, speed: random(7, 16) });
    }
  }

  layout(width: number, height: number, groundY: number): void {
    this.skyDither.clear();
    for (let y = 24; y < height * 0.58; y += 20) {
      for (let x = (Math.floor(y / 20) % 2) * 10; x < width; x += 40) {
        this.skyDither.rect(x, y, 4, 4);
      }
    }
    this.skyDither.fill({ color: 0xffffff, alpha: 0.1 });

    this.hills.clear().moveTo(0, height * 0.64);
    for (let x = 0; x <= width + 32; x += 32) {
      const y = Math.round((height * 0.6 + Math.sin(x / 115) * 42) / 12) * 12;
      this.hills.lineTo(x, y).lineTo(x + 32, y);
    }
    this.hills.lineTo(width + 32, height).lineTo(0, height).fill(0xa3cb83).moveTo(0, height * 0.74);
    for (let x = 0; x <= width + 24; x += 24) {
      const y = Math.round((height * 0.7 + Math.sin(x / 82 + 1.3) * 27) / 8) * 8;
      this.hills.lineTo(x, y).lineTo(x + 24, y);
    }
    this.hills.lineTo(width + 24, height).lineTo(0, height).fill(0x7fb56f);

    this.meadowDetails.clear();
    for (let index = 0; index < Math.ceil(width / 38); index += 1) {
      const x = index * 39 + (index % 3) * 8;
      const y = groundY + 20 + (index % 4) * 6;
      this.meadowDetails.rect(x - 2, y - 16, 4, 16)
        .rect(x - 8, y - 12, 8, 4)
        .rect(x + 2, y - 8, 8, 4);
    }
    this.meadowDetails.fill({ color: 0x4f8f5c, alpha: 0.55 });

    this.clouds.forEach((cloud, index) => {
      if (cloud.view.x === 0) cloud.view.position.set((index / this.clouds.length) * width + random(-60, 80), 90 + (index % 3) * 75);
    });
    this.stars.forEach((star, index) => {
      star.position.set(((index * 97) % 1000) / 1000 * width, 30 + ((index * 61) % Math.max(90, height * 0.48)));
    });
  }

  update(delta: number, score: number, maxScore: number, elapsed: number, isMenu: boolean, width: number, height: number): void {
    const progress = isMenu ? 0.12 : clamp(score / maxScore, 0, 1);
    const steppedProgress = Math.round(progress * 16) / 16;
    const sunsetAmount = clamp((steppedProgress - 0.28) / 0.42, 0, 1);
    const nightAmount = clamp((steppedProgress - 0.7) / 0.3, 0, 1);
    const skyTop = nightAmount > 0
      ? mixHex(0xf0aa91, 0x263c68, nightAmount)
      : mixHex(0x99d7ed, 0xf0aa91, sunsetAmount);
    const skyBottom = nightAmount > 0
      ? mixHex(0xf4d39a, 0x6b6891, nightAmount)
      : mixHex(0xe1f0cd, 0xf4d39a, sunsetAmount);
    this.host.style.background = `linear-gradient(180deg, ${skyTop} 0%, ${skyBottom} 62%, #83b66f 100%)`;

    this.stars.forEach((star, index) => {
      star.alpha = nightAmount * (0.5 + Math.sin(elapsed * 2.2 + index) * 0.24);
    });
    this.clouds.forEach((cloud) => {
      cloud.view.x += cloud.speed * delta;
      cloud.view.alpha = 1 - nightAmount * 0.42;
      if (cloud.view.x - cloud.view.width / 2 > width + 40) {
        cloud.view.x = -cloud.view.width - random(20, 120);
        cloud.view.y = random(75, Math.max(130, height * 0.4));
      }
    });
  }
}
