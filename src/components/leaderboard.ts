import { GROWTH_STAGES } from '../game/config';

interface StoredSettings {
  sound: boolean;
  bestScore: number;
}

const STORAGE_KEY = 'tiny-garden-settings-v1';

function element<T extends HTMLElement>(selector: string): T {
  const node = document.querySelector<T>(selector);
  if (!node) throw new Error(`Missing required element: ${selector}`);
  return node;
}

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, value));
}

function loadSettings(): StoredSettings {
  try {
    const stored = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '{}') as Partial<StoredSettings>;
    return {
      sound: stored.sound ?? true,
      bestScore: Math.max(0, stored.bestScore ?? 0),
    };
  } catch {
    return { sound: true, bestScore: 0 };
  }
}

export class Leaderboard {
  private readonly scoreElement = element<HTMLSpanElement>('#score');
  private readonly livesElement = element<HTMLElement>('#lives');
  private readonly stageNameElement = element<HTMLSpanElement>('#stage-name');
  private readonly growthCountElement = element<HTMLSpanElement>('#growth-count');
  private readonly growthBarElement = element<HTMLSpanElement>('#growth-bar');
  private readonly bestScoreElement = element<HTMLSpanElement>('#best-score');
  private readonly finalScoreElement = element<HTMLElement>('#final-score');
  private readonly finalBestElement = element<HTMLElement>('#final-best');
  private readonly settings = loadSettings();
  private previousHealth = 3;

  constructor() {
    this.refreshBestScore();
  }

  get bestScore(): number {
    return this.settings.bestScore;
  }

  get soundEnabled(): boolean {
    return this.settings.sound;
  }

  setSoundEnabled(enabled: boolean): void {
    this.settings.sound = enabled;
    this.save();
  }

  recordScore(score: number): boolean {
    if (score <= this.settings.bestScore) return false;
    this.settings.bestScore = score;
    this.refreshBestScore();
    this.save();
    return true;
  }

  update(score: number, health: number, growthStage: number, lossCause?: 'bug' | 'missed'): void {
    this.scoreElement.textContent = String(score);
    this.renderHealth(health, lossCause);

    const current = GROWTH_STAGES[growthStage];
    const next = GROWTH_STAGES[growthStage + 1];
    this.stageNameElement.textContent = current.name;
    if (next) {
      const range = next.threshold - current.threshold;
      const progress = clamp((score - current.threshold) / range, 0, 1);
      this.growthCountElement.textContent = `${score} / ${next.threshold}`;
      this.growthBarElement.style.width = `${progress * 100}%`;
    } else {
      this.growthCountElement.textContent = 'Garden complete';
      this.growthBarElement.style.width = '100%';
    }
  }

  showFinalScore(score: number): void {
    this.recordScore(score);
    this.finalScoreElement.textContent = String(score);
    this.finalBestElement.textContent = String(this.settings.bestScore);
  }

  private refreshBestScore(): void {
    this.bestScoreElement.textContent = String(this.settings.bestScore);
  }

  private renderHealth(health: number, lossCause?: 'bug' | 'missed'): void {
    const safeHealth = clamp(health, 0, 3);
    const lostIndex = lossCause && safeHealth < this.previousHealth ? safeHealth : -1;
    const leaves = Array.from({ length: 3 }, (_, index) => {
      const leaf = document.createElement('span');
      leaf.className = `life-leaf ${index < safeHealth ? 'is-full' : 'is-empty'}`;
      if (index === lostIndex) leaf.classList.add(lossCause === 'bug' ? 'is-nibbled' : 'is-wilted');
      leaf.setAttribute('aria-hidden', 'true');
      return leaf;
    });
    this.livesElement.replaceChildren(...leaves);
    this.livesElement.setAttribute('aria-label', `${safeHealth} of 3 healthy leaves`);
    this.previousHealth = safeHealth;
  }

  private save(): void {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.settings));
    } catch {
      // The game remains fully playable when storage is unavailable.
    }
  }
}
