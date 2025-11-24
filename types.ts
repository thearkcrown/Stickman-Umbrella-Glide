export enum GameState {
  START = 'START',
  PLAYING = 'PLAYING',
  GAME_OVER = 'GAME_OVER'
}

export interface Point {
  x: number;
  y: number;
}

export interface Obstacle {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'BIRD' | 'CLOUD' | 'BUILDING' | 'BALLOON';
  speedX: number;
}

export interface Particle {
  id: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  color: string;
  type?: 'DEBRIS' | 'SHOCKWAVE' | 'WIND' | 'SPEED_LINE' | 'GUST' | 'RAIN';
  size: number;
}

export interface BackgroundElement {
  id: string;
  x: number;
  y: number;
  size: number;
  speedFactor: number;
  type: 'STAR' | 'CLOUD_BG';
  opacity: number;
  driftX: number;
}

export interface WindZone {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  vx: number; // Horizontal force
  vy: number; // Vertical force
}

export interface PowerUp {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  type: 'SLOW_MOTION' | 'SHIELD' | 'WIND_BREAKER' | 'SUPER_GLIDE';
  collected: boolean;
}

export interface ActivePowerUp {
  type: PowerUp['type'];
  timeLeft: number;
  duration: number;
}

export interface Coin {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
  collected: boolean;
  spin: number; // Animation rotation
}

export interface CosmeticItem {
  id: string;
  name: string;
  type: 'umbrella_color' | 'hat' | 'accessory' | 'trail';
  cost: number;
  unlocked: boolean;
  value?: string; // Color code or identifier
}

export interface PlayerCosmetics {
  umbrellaColor: string;
  hat: string | null;
  accessory: string | null;
  trail: string | null;
}

export interface LeaderboardEntry {
  id?: string;
  userId?: string;
  name: string;
  score: number;
  date?: any;
}

export type GameMode = 'ENDLESS' | 'STORM' | 'CHALLENGE';

export interface ChallengeLevel {
  id: number;
  name: string;
  description: string;
  objectives: ChallengObjective[];
  theme: 'GENTLE' | 'NIGHT' | 'THUNDER' | 'TORNADO' | 'SPACE';
  duration?: number; // Time limit in seconds (optional)
  targetDepth?: number; // Target depth to reach
  coinGoal?: number; // Number of coins to collect
}

export interface ChallengObjective {
  type: 'SURVIVE_TIME' | 'REACH_DEPTH' | 'COLLECT_COINS' | 'NO_DAMAGE' | 'AVOID_OBSTACLES';
  description: string;
  target: number;
  current: number;
  completed: boolean;
}

export interface LevelProgress {
  objectives: ChallengObjective[];
  startTime: number;
  timeElapsed: number;
}