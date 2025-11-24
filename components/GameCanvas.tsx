import React, { useRef, useEffect, useState, useCallback } from 'react';
import { GameState, Obstacle, Particle, BackgroundElement, WindZone, PowerUp, ActivePowerUp, Coin, PlayerCosmetics, GameMode, LevelProgress } from '../types';
import { CHALLENGE_LEVELS } from '../services/challengeLevels';

interface GameCanvasProps {
  gameState: GameState;
  isPaused: boolean;
  onScoreUpdate: (score: number) => void;
  onGameOver: (score: number, cause: string, snapshot: string) => void;
  onCoinCollect?: (amount: number) => void;
  playerCosmetics: PlayerCosmetics;
  difficultyMode: 'EASY' | 'MEDIUM' | 'HARD';
  isDarkMode: boolean;
  gameMode: GameMode;
  selectedChallengeLevel: number | null;
  levelProgress: LevelProgress | null;
  onLevelProgressUpdate: (progress: LevelProgress | null) => void;
  playCrashSound?: () => void;
  playOpenSound?: () => void;
  playCloseSound?: () => void;
}

const BASE_GRAVITY = 0.5;
const BASE_GLIDE_GRAVITY = 0.15;
const BASE_TERMINAL_VELOCITY = 15;
const BASE_GLIDE_TERMINAL_VELOCITY = 3;
const WORLD_SPEED_MULTIPLIER_MAX = 2.0; // At max difficulty, world is 2x faster

const GameCanvas: React.FC<GameCanvasProps> = ({
  gameState,
  isPaused,
  onScoreUpdate,
  onGameOver,
  onCoinCollect,
  playerCosmetics,
  difficultyMode,
  isDarkMode,
  gameMode,
  selectedChallengeLevel,
  levelProgress,
  onLevelProgressUpdate,
  playCrashSound,
  playOpenSound,
  playCloseSound
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const requestRef = useRef<number>(0);
  const scoreRef = useRef<number>(0);
  const shakeRef = useRef<number>(0); // Screen shake magnitude
  const lightningRef = useRef<number>(0); // Lightning flash intensity (0-1)
  const prevGameStateRef = useRef<GameState>(gameState);
  
  // Game State Refs (for performance in loop)
  const playerRef = useRef({
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    isUmbrellaOpen: false,
    umbrellaAnim: 0, // 0 = closed, 1 = open
    angle: 0,
    targetX: 0,
    // Animation states
    isDancing: false,
    danceTimer: 0,
    isSpinning: false,
    spinRotation: 0,
    umbrellaIsBroken: false,
    brokenTimer: 0,
    // Umbrella bounce effect
    umbrellaBounce: 1.0,
    bounceTimer: 0
  });
  
  const windGustRef = useRef({
    active: false,
    vx: 0,
    vy: 0,
    timeLeft: 0
  });

  const activeWindRef = useRef({ x: 0, y: 0 }); // Tracks current net wind force for UI

  const obstaclesRef = useRef<Obstacle[]>([]);
  const particlesRef = useRef<Particle[]>([]);
  const bgElementsRef = useRef<BackgroundElement[]>([]);
  const windZonesRef = useRef<WindZone[]>([]);
  const powerUpsRef = useRef<PowerUp[]>([]);
  const activePowerUpsRef = useRef<ActivePowerUp[]>([]);
  const coinsRef = useRef<Coin[]>([]);
  const frameCountRef = useRef(0);
  const lastUmbrellaState = useRef(false);

  // Helper to spawn background elements (Parallax)
  const spawnBgElement = (y: number, canvasWidth: number) => {
    const depth = scoreRef.current / 10;
    let type: 'STAR' | 'CLOUD_BG' = 'CLOUD_BG';

    // Dark mode: spawn more stars for starry night effect
    if (isDarkMode) {
      type = 'STAR'; // Always stars in dark mode
    } else {
      // Day mode: Probabilities based on depth
      if (depth > 3000) {
        type = 'STAR';
      } else if (depth > 1000) {
        // Transition zone
        type = Math.random() > 0.5 ? 'STAR' : 'CLOUD_BG';
      }
      // Deep space override
      if (depth > 4000) type = 'STAR';
    }

    const id = Math.random().toString(36).substr(2, 9);
    const x = Math.random() * canvasWidth;
    
    if (type === 'STAR') {
        bgElementsRef.current.push({
            id, x, y,
            size: Math.random() * 2 + 1,
            speedFactor: 0.05 + Math.random() * 0.1, // Very slow parallax for distant stars
            type,
            opacity: Math.random() * 0.7 + 0.3,
            driftX: 0
        });
    } else {
        bgElementsRef.current.push({
            id, x, y,
            size: 20 + Math.random() * 60,
            speedFactor: 0.2 + Math.random() * 0.3, // Slower than foreground, faster than stars
            type,
            opacity: 0.05 + Math.random() * 0.15, // Very subtle background clouds
            driftX: (Math.random() - 0.5) * 0.5
        });
    }
  };

  // Helper to spawn Wind Zones
  const spawnWindZone = (canvasWidth: number, canvasHeight: number, difficulty: number) => {
      const id = Math.random().toString(36).substr(2, 9);
      // Wind zones are large areas
      const width = 200 + Math.random() * 300;
      const height = 300 + Math.random() * 400;
      const x = Math.random() * (canvasWidth - width);
      const y = canvasHeight + 100;

      // Determine type of wind
      const typeRoll = Math.random();
      let vx = 0, vy = 0;
      
      // Scale wind force with difficulty
      const forceMult = 1 + (difficulty * 1.5); // Up to 2.5x stronger at max difficulty

      if (typeRoll < 0.4) {
          // Horizontal Crosswind (Left or Right)
          vx = (Math.random() > 0.5 ? 1 : -1) * (2 + Math.random() * 3) * forceMult;
      } else if (typeRoll < 0.7) {
          // Updraft (Slows fall / Lifts up)
          // Negative VY pushes player up
          vy = - (0.5 + Math.random() * 0.8) * forceMult; 
      } else {
          // Downdraft (Speeds fall)
          // Positive VY pushes player down
          vy = (0.5 + Math.random() * 0.5) * forceMult;
      }

      windZonesRef.current.push({ id, x, y, width, height, vx, vy });
  };

  // Helper to spawn obstacles
  const spawnObstacle = (canvasWidth: number, canvasHeight: number, difficulty: number) => {
    const typeRoll = Math.random();
    let type: Obstacle['type'] = 'CLOUD';
    let width = 100;
    let height = 60;
    let y = canvasHeight + 100;
    let x = Math.random() * (canvasWidth - width);
    let speedX = 0;

    // Difficulty increases speed and likelihood of harder obstacles
    const speedMult = 1 + difficulty;

    if (typeRoll < 0.4) {
      type = 'BIRD';
      width = 40;
      height = 20;
      speedX = (Math.random() - 0.5) * 4 * speedMult; // Moves faster horizontally
    } else if (typeRoll < 0.6) {
      type = 'BALLOON';
      width = 30;
      height = 40;
      speedX = 0;
    } else if (typeRoll < 0.8 && scoreRef.current > 500) {
      type = 'BUILDING';
      width = 150 + Math.random() * 100;
      height = 400; // Tall
      x = Math.random() > 0.5 ? 0 : canvasWidth - width; // Snap to sides
      y = canvasHeight + height;
    }

    obstaclesRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      width,
      height,
      type,
      speedX
    });
  };

  // Helper to spawn power-ups
  const spawnPowerUp = (canvasWidth: number, canvasHeight: number) => {
    const types: PowerUp['type'][] = ['SLOW_MOTION', 'SHIELD', 'WIND_BREAKER', 'SUPER_GLIDE'];
    const type = types[Math.floor(Math.random() * types.length)];

    const width = 40;
    const height = 40;
    const x = Math.random() * (canvasWidth - width);
    const y = canvasHeight + 100;

    powerUpsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      width,
      height,
      type,
      collected: false
    });
  };

  // Helper to spawn coins
  const spawnCoin = (canvasWidth: number, canvasHeight: number) => {
    const width = 30;
    const height = 30;
    const x = Math.random() * (canvasWidth - width);
    const y = canvasHeight + 100;

    coinsRef.current.push({
      id: Math.random().toString(36).substr(2, 9),
      x,
      y,
      width,
      height,
      collected: false,
      spin: 0
    });
  };

  const createExplosion = (x: number, y: number) => {
    // Trigger Screen Shake
    shakeRef.current = 15;

    // Shockwave
    particlesRef.current.push({
      id: 'shockwave-' + Math.random(),
      x,
      y,
      vx: 0,
      vy: 0,
      life: 1.0,
      color: '#ffffff',
      type: 'SHOCKWAVE',
      size: 10
    });

    // Debris
    for (let i = 0; i < 30; i++) {
      const color = Math.random() > 0.5 ? '#ef4444' : (Math.random() > 0.5 ? '#fca5a5' : '#1f2937'); // Red, Light Red, Dark Grey
      particlesRef.current.push({
        id: Math.random().toString(),
        x,
        y,
        vx: (Math.random() - 0.5) * 15,
        vy: (Math.random() - 0.5) * 15,
        life: 1.0 + Math.random() * 0.5,
        color: color,
        type: 'DEBRIS',
        size: Math.random() * 6 + 2
      });
    }

    // Smoke
    for (let i = 0; i < 15; i++) {
        particlesRef.current.push({
            id: 'smoke-' + Math.random(),
            x: x + (Math.random() - 0.5) * 20,
            y: y + (Math.random() - 0.5) * 20,
            vx: (Math.random() - 0.5) * 4,
            vy: (Math.random() - 0.5) * 4,
            life: 1.0 + Math.random(),
            color: `rgba(100, 100, 100, ${Math.random() * 0.5})`,
            type: 'DEBRIS',
            size: 10 + Math.random() * 15
        });
    }
  };

  const update = useCallback((canvas: HTMLCanvasElement) => {
    if (gameState !== GameState.PLAYING || isPaused) return;

    // --- DIFFICULTY CALCULATION ---
    // Scales from 0 to 1 over 5000 score units (was 8000, now faster ramp up)
    const currentScore = scoreRef.current;
    const difficulty = Math.min(Math.max(0, currentScore - 200) / 5000, 1);

    // Difficulty mode multiplier
    let modeMultiplier = 1;
    if (difficultyMode === 'EASY') modeMultiplier = 0.35; // Very easy - slow progression
    else if (difficultyMode === 'MEDIUM') modeMultiplier = 1.0;
    else if (difficultyMode === 'HARD') modeMultiplier = 1.5;

    // Storm Mode: 2x obstacles, more wind, constant rain/lightning
    let stormModeMultiplier = 1;
    let isStormMode = gameMode === 'STORM';
    if (isStormMode) {
      stormModeMultiplier = 2.0; // 2x obstacles
    }

    // Dynamic Spawn Rates
    const obstacleSpawnRate = Math.floor(Math.max(20, 60 - (difficulty * 35 * modeMultiplier * stormModeMultiplier))); // 60 -> 25 frames
    const windZoneSpawnRate = Math.floor(Math.max(80, 240 - (difficulty * 160 * modeMultiplier * stormModeMultiplier))); // 240 -> 80 frames
    const gustProbability = 0.001 + (difficulty * 0.008 * modeMultiplier) + (isStormMode ? 0.01 : 0); // More gusts in storm mode

    // Check active power-ups
    const hasSlowMotion = activePowerUpsRef.current.some(p => p.type === 'SLOW_MOTION');
    const hasWindBreaker = activePowerUpsRef.current.some(p => p.type === 'WIND_BREAKER');
    const hasSuperGlide = activePowerUpsRef.current.some(p => p.type === 'SUPER_GLIDE');

    // World Speed Scaling (1.0x -> 2.0x)
    let worldSpeedMultiplier = 1.0 + (difficulty * (WORLD_SPEED_MULTIPLIER_MAX - 1.0) * modeMultiplier);

    // Apply Slow Motion power-up (50% speed)
    if (hasSlowMotion) {
      worldSpeedMultiplier *= 0.5;
    }

    // Gravity Scaling (makes player fall faster at higher difficulties)
    const gravityMultiplier = 1.0 + (difficulty * 0.8 * modeMultiplier); // Up to 1.8x gravity

    // Score Multiplier (rewards increase with difficulty)
    let scoreMultiplier = 1.0 + (difficulty * 1.5); // Up to 2.5x scoring

    // Storm Mode: 3x score multiplier
    if (isStormMode) {
      scoreMultiplier *= 3.0;
    }

    const player = playerRef.current;
    
    // Decay Shake
    if (shakeRef.current > 0) {
        shakeRef.current *= 0.9;
        if (shakeRef.current < 0.5) shakeRef.current = 0;
    }

    // Decay Lightning
    if (lightningRef.current > 0) {
        lightningRef.current -= 0.05;
        if (lightningRef.current < 0) lightningRef.current = 0;
    }

    // Trigger Lightning (Storms or Storm Mode)
    const lightningChance = isStormMode ? 0.01 : (difficulty > 0.4 ? 0.002 * difficulty : 0);
    if (lightningChance > 0 && Math.random() < lightningChance) {
        lightningRef.current = 0.8 + Math.random() * 0.2;
        shakeRef.current = 5; // Thunder shake
    }

    // Detect Umbrella Toggle (Particle Effects & Sound)
    if (player.isUmbrellaOpen !== lastUmbrellaState.current) {
        const isOpening = player.isUmbrellaOpen;
        const effectY = player.y - 50; // Approximate center of umbrella
        
        // Audio Cues
        if (isOpening) {
            if (playOpenSound) playOpenSound();
            // Trigger umbrella bounce effect
            player.umbrellaBounce = 1.3; // Bounce to 130%
            player.bounceTimer = 10; // Bounce for 10 frames
        } else {
            if (playCloseSound) playCloseSound();
        }

        // Spawn puffs
        const count = isOpening ? 8 : 4;
        for (let i = 0; i < count; i++) {
            particlesRef.current.push({
                id: 'puff-' + Math.random(),
                x: player.x + (Math.random() - 0.5) * 30,
                y: effectY + (Math.random() - 0.5) * 30,
                vx: (Math.random() - 0.5) * (isOpening ? 4 : 2),
                vy: (Math.random() - 0.5) * (isOpening ? 4 : 2),
                life: 0.4,
                color: isOpening ? 'rgba(255, 255, 255, 0.5)' : 'rgba(200, 200, 200, 0.3)',
                type: 'DEBRIS',
                size: Math.random() * 3 + 2
            });
        }
        
        // Shockwave for opening (catching air)
        if (isOpening) {
             particlesRef.current.push({
                id: 'sw-' + Math.random(),
                x: player.x,
                y: effectY,
                vx: 0,
                vy: 0,
                life: 0.2,
                color: 'rgba(255, 255, 255, 0.3)',
                type: 'SHOCKWAVE',
                size: 5
             });
        }

        lastUmbrellaState.current = isOpening;
    }

    // --- PHYSICS ENGINE ---

    // 1. Umbrella State Animation
    const targetAnim = player.isUmbrellaOpen ? 1 : 0;
    player.umbrellaAnim += (targetAnim - player.umbrellaAnim) * 0.2;

    // Reset accumulated wind force for UI
    let currentWindX = 0;
    let currentWindY = 0;

    // 2. Wind Gust Logic (Global)
    if (windGustRef.current.active) {
        windGustRef.current.timeLeft--;
        if (windGustRef.current.timeLeft <= 0) {
            windGustRef.current.active = false;
        } else {
             // Visual Particles for Gust
             if (frameCountRef.current % 4 === 0) {
                 const isRight = windGustRef.current.vx > 0;
                 particlesRef.current.push({
                     id: 'gust-' + Math.random(),
                     x: isRight ? -50 : canvas.width + 50,
                     y: Math.random() * canvas.height,
                     vx: windGustRef.current.vx * (1.5 + Math.random()), // Fast gust lines
                     vy: (Math.random() - 0.5) * 2,
                     life: 0.8,
                     color: 'rgba(255, 255, 255, 0.15)',
                     type: 'GUST',
                     size: 50 + Math.random() * 100
                 });
             }
             // Accumulate global wind
             currentWindX += windGustRef.current.vx;
             currentWindY += windGustRef.current.vy;
        }
    } else {
        // Dynamic Gust Chance
        if (scoreRef.current > 300 && Math.random() < gustProbability) {
            const direction = Math.random() > 0.5 ? 1 : -1;
            const difficultyMult = 1 + difficulty;
            
            windGustRef.current = {
                active: true,
                vx: direction * (5 + Math.random() * 8) * difficultyMult, // Stronger with difficulty
                vy: -0.5 - Math.random() * 1.5 * difficultyMult, // Stronger updraft
                timeLeft: 60 + Math.random() * 60 // 1-2 seconds
            };
        }
    }

    // 3. Horizontal Movement (Drag & Inertia)
    // Calculate distance to target
    let dx = player.targetX - player.x;
    
    // Responsiveness: Lower = more drift/drag (Umbrella Open), Higher = Snappy (Closed)
    const responsiveness = player.isUmbrellaOpen ? 0.05 : 0.12;
    let moveSpeed = dx * responsiveness;

    // Clamp max lateral speed
    const MAX_LATERAL_SPEED = 20;
    if (moveSpeed > MAX_LATERAL_SPEED) moveSpeed = MAX_LATERAL_SPEED;
    if (moveSpeed < -MAX_LATERAL_SPEED) moveSpeed = -MAX_LATERAL_SPEED;
    
    // Apply Wind Gust Forces (unless Wind Breaker is active)
    let gustVx = 0;
    if (windGustRef.current.active && !hasWindBreaker) {
        gustVx = windGustRef.current.vx;
        player.vy += windGustRef.current.vy; // Apply Updraft
    }

    player.vx = moveSpeed + gustVx;

    // 5. Vertical Physics (Gravity & Lift) - SCALED WITH DIFFICULTY
    let currentGravity = player.isUmbrellaOpen ? BASE_GLIDE_GRAVITY : BASE_GRAVITY;
    let currentTerminal = player.isUmbrellaOpen ? BASE_GLIDE_TERMINAL_VELOCITY : BASE_TERMINAL_VELOCITY;

    // Apply difficulty scaling to gravity and terminal velocity
    currentGravity *= gravityMultiplier;
    currentTerminal *= gravityMultiplier;
    
    // Apply Lift: Moving horizontally creates lift (Bernoulli-ish)
    if (player.isUmbrellaOpen) {
        const liftForce = Math.abs(player.vx) * 0.1;
        currentGravity -= liftForce * 0.05; 
        
        // Slight direct upward force if moving fast
        if (Math.abs(player.vx) > 5) {
            player.vy -= 0.05;
        }
    }

    // --- WIND ZONES PHYSICS (Local) ---
    // Apply before velocity update (unless Wind Breaker is active)
    if (!hasWindBreaker) {
      for (const zone of windZonesRef.current) {
          // Simple AABB collision with player
          if (
              player.x > zone.x &&
              player.x < zone.x + zone.width &&
              player.y > zone.y &&
              player.y < zone.y + zone.height
          ) {
               // Effect is stronger if umbrella is open (more surface area)
               const surfaceFactor = player.isUmbrellaOpen ? 1.0 : 0.3;

               // Apply wind forces
               player.vx += zone.vx * surfaceFactor * 0.15;
               player.vy += zone.vy * surfaceFactor * 0.15;

               // Accumulate for UI
               currentWindX += zone.vx;
               currentWindY += zone.vy;

               // Trigger spinning animation if wind is strong enough
               const windStrength = Math.abs(zone.vx) + Math.abs(zone.vy);
               if (windStrength > 3 && player.isUmbrellaOpen) {
                   player.isSpinning = true;
               }

               // Add turbulence if gliding in wind
               if (player.isUmbrellaOpen) {
                   player.angle += (Math.random() - 0.5) * 0.08 * (1 + difficulty);
               }
          }
      }
    }

    // Update Wind Ref for Draw Loop
    activeWindRef.current = { x: currentWindX, y: currentWindY };

    player.x += player.vx;
    player.vy += currentGravity;

    // Keep player within screen bounds (horizontal)
    const PLAYER_MARGIN = 50; // Give some margin for umbrella
    if (player.x < PLAYER_MARGIN) {
      player.x = PLAYER_MARGIN;
      player.vx = 0;
    }
    if (player.x > canvas.width - PLAYER_MARGIN) {
      player.x = canvas.width - PLAYER_MARGIN;
      player.vx = 0;
    }

    // Keep player within screen bounds (vertical) - keep them visible
    if (player.y < 100) {
      player.y = 100;
      player.vy = Math.max(player.vy, 0); // Don't let them go up
    }
    if (player.y > canvas.height - 100) {
      player.y = canvas.height - 100;
      player.vy = Math.min(player.vy, 0); // Don't let them go down
    }

    // Super Glide Power-Up: Automatic float upward
    if (hasSuperGlide) {
      player.vy -= 0.4; // Constant upward force
    }

    // Clamp to terminal velocity (allow slight overspeed if pushed by downdraft)
    if (player.vy > currentTerminal * 2) player.vy = currentTerminal * 2;
    else if (player.vy > currentTerminal && !windGustRef.current.active) player.vy = currentTerminal;

    // Don't float up too fast (unless huge updraft or Super Glide)
    if (player.vy < -8 && !hasSuperGlide) player.vy = -8;


    // 4. Banking & Wobble (Visual Feedback)
    // Bank into the turn
    const targetAngle = player.vx * 0.02; 
    
    if (player.isUmbrellaOpen) {
       // Add turbulence/wobble when gliding
       const turbulence = Math.sin(frameCountRef.current * 0.1) * 0.05;
       player.angle = targetAngle + turbulence;
       
       // Extra turbulence if in gust
       if (windGustRef.current.active) {
           player.angle += (Math.random() - 0.5) * 0.2;
       }
    } else {
       // Aerodynamic dive angle
       player.angle = targetAngle; 
    }

    // --- GAME WORLD UPDATE ---

    // Simulate Falling (World moves up) - SCALED WITH DIFFICULTY
    const distanceTraveled = player.vy * worldSpeedMultiplier;

    // Score increases faster at higher difficulties
    scoreRef.current += Math.floor(distanceTraveled * scoreMultiplier);
    onScoreUpdate(Math.floor(scoreRef.current / 10));

    // --- CHALLENGE MODE: OBJECTIVES TRACKING ---
    if (gameMode === 'CHALLENGE' && levelProgress && selectedChallengeLevel !== null) {
      const currentDepth = Math.floor(scoreRef.current / 10);
      const timeElapsed = (Date.now() - levelProgress.startTime) / 1000; // in seconds

      // Update objectives
      const updatedObjectives = levelProgress.objectives.map(obj => {
        if (obj.completed) return obj;

        switch (obj.type) {
          case 'SURVIVE_TIME':
            obj.current = Math.floor(timeElapsed);
            obj.completed = timeElapsed >= obj.target;
            break;
          case 'REACH_DEPTH':
            obj.current = currentDepth;
            obj.completed = currentDepth >= obj.target;
            break;
          case 'COLLECT_COINS':
            // Coins are updated via onCoinCollect callback
            break;
          case 'NO_DAMAGE':
            // Will be set to false when player takes damage
            break;
          case 'AVOID_OBSTACLES':
            // Will be incremented when obstacles go off screen
            break;
        }
        return obj;
      });

      // Update level progress
      onLevelProgressUpdate({
        ...levelProgress,
        objectives: updatedObjectives,
        timeElapsed
      });

      // Check if all objectives are completed
      const allCompleted = updatedObjectives.every(obj => obj.completed);
      if (allCompleted) {
        // Player wins! Trigger game over with special message
        if (canvasRef.current) {
          const snapshot = canvasRef.current.toDataURL();
          onGameOver(currentDepth, `🎉 LEVEL ${selectedChallengeLevel} COMPLETE!`, snapshot);
        }
      }
    }

    // --- VISUAL EFFECTS ---
    
    // RAIN SYSTEM (Triggered by Difficulty or Storm Mode)
    const shouldSpawnRain = isStormMode || (difficulty > 0.3 && frameCountRef.current % Math.floor(5 - difficulty * 3) === 0);
    if (shouldSpawnRain) {
        // Storm Mode: Constant heavy rain (15 drops), otherwise based on difficulty
        const rainCount = isStormMode ? 15 : Math.floor(1 + difficulty * 8);
        
        for (let i = 0; i < rainCount; i++) {
             particlesRef.current.push({
                id: 'rain-' + Math.random(),
                x: Math.random() * canvas.width,
                y: -50, // Spawn above screen
                vx: currentWindX * 0.5 + (Math.random() - 0.5), // Rain follows wind
                vy: 20 + Math.random() * 10, // Falls fast
                life: 1.0,
                color: 'rgba(174, 194, 224, 0.4)',
                type: 'RAIN',
                size: 20 + Math.random() * 20
            });
        }
    }
    
    // Speed Lines (Diving)
    if (player.vy > 10 && player.umbrellaAnim < 0.2) {
        if (Math.random() > 0.5) {
            particlesRef.current.push({
                id: 'speed-' + Math.random(),
                x: Math.random() * canvas.width,
                y: canvas.height + 50,
                vx: 0,
                vy: - (20 + Math.random() * 10),
                life: 0.5,
                color: 'rgba(255, 255, 255, 0.2)',
                type: 'SPEED_LINE',
                size: 20 + Math.random() * 40
            });
        }
    }
    
    // Wind Trails (Gliding) - DYNAMIC VERSION
    if (player.umbrellaAnim > 0.6) {
         // Calculate physics-based intensity (Speed)
         const speed = Math.sqrt(player.vx * player.vx + player.vy * player.vy);
         const intensity = Math.min(speed / 15, 1); // Normalize 0-1 (Max speed ~15-20)

         // Spawn probability increases with intensity
         if (Math.random() > 0.6 - (intensity * 0.5)) { 
            const maxRadius = 40;
            const minRadius = 5;
            const currentRadius = minRadius + (maxRadius - minRadius) * player.umbrellaAnim;
            
            // Calculate accurate tip Y position to match drawing
            const tipYOffset = -65;
            const closedCornerY = tipYOffset + 25; // -40
            const currentCornerY = closedCornerY - (closedCornerY - tipYOffset) * player.umbrellaAnim;

            // Color variation based on speed
            const baseR = 240 - (intensity * 240);
            const baseG = 245 + (intensity * 10);
            const r = Math.floor(Math.max(0, baseR + (Math.random() - 0.5) * 40));
            const g = Math.floor(Math.min(255, baseG + (Math.random() - 0.5) * 20));
            const b = 255; 
            const a = 0.2 + intensity * 0.6; // More opaque when fast

            const color = `rgba(${r}, ${g}, ${b}, ${a})`;
            const size = 10 + intensity * 20 + Math.random() * 10;

            // Spawn from tips
            [-1, 1].forEach(direction => {
                const driftX = -player.vx * 0.3;
                particlesRef.current.push({
                    id: 'wind-' + Math.random(),
                    x: player.x + (currentRadius * direction),
                    y: player.y + currentCornerY, 
                    vx: (direction * 0.3) + driftX + (Math.random() - 0.5),
                    vy: - (4 + intensity * 6 + Math.random() * 2), // Faster upward flow with speed
                    life: 0.3 + intensity * 0.2, 
                    color: color,
                    type: 'WIND',
                    size: size
                });
            });
         }
    }


    // Update Background (Parallax)
    bgElementsRef.current.forEach(el => {
        el.y -= distanceTraveled * el.speedFactor;
        el.x += el.driftX;
        
        if (el.x > canvas.width + el.size) el.x = -el.size;
        if (el.x < -el.size) el.x = canvas.width + el.size;
    });
    // Remove off-screen & Respawn
    bgElementsRef.current = bgElementsRef.current.filter(el => el.y > -100);
    // Dark mode: spawn more stars for ambient particle effect
    const maxParticles = isDarkMode ? 80 : 50;
    const spawnChance = isDarkMode ? 0.7 : 0.5;
    if (bgElementsRef.current.length < maxParticles && Math.random() > spawnChance) {
        spawnBgElement(canvas.height + 50, canvas.width);
    }

    // Spawn Obstacles (Dynamic Rate)
    if (frameCountRef.current % obstacleSpawnRate === 0) {
      spawnObstacle(canvas.width, canvas.height, difficulty);
    }
    
    // Spawn Wind Zones (Dynamic Rate)
    if (frameCountRef.current % windZoneSpawnRate === 0 && scoreRef.current > 200) {
        spawnWindZone(canvas.width, canvas.height, difficulty);
    }

    // Spawn Power-Ups (Less frequent than obstacles)
    if (frameCountRef.current % 300 === 0 && scoreRef.current > 100) { // Every ~5 seconds
        spawnPowerUp(canvas.width, canvas.height);
    }

    // Spawn Coins (More frequent - every ~2 seconds)
    if (frameCountRef.current % 120 === 0 && scoreRef.current > 50) {
        spawnCoin(canvas.width, canvas.height);
    }

    // Update Active Power-Ups (Timers)
    for (let i = activePowerUpsRef.current.length - 1; i >= 0; i--) {
        const powerUp = activePowerUpsRef.current[i];
        powerUp.timeLeft--;

        if (powerUp.timeLeft <= 0) {
            activePowerUpsRef.current.splice(i, 1);
        }
    }

    // Update Wind Zones (Movement) - Move at world speed
    for (let i = windZonesRef.current.length - 1; i >= 0; i--) {
        const zone = windZonesRef.current[i];
        zone.y -= distanceTraveled * 1.5;

        if (zone.y < -zone.height - 100) {
            windZonesRef.current.splice(i, 1);
        }
    }

    // Update Obstacles - Move at world speed
    for (let i = obstaclesRef.current.length - 1; i >= 0; i--) {
      const obs = obstaclesRef.current[i];
      obs.y -= distanceTraveled * 1.5;
      obs.x += obs.speedX;

      if (obs.type === 'BIRD') {
        if (obs.x <= 0 || obs.x + obs.width >= canvas.width) obs.speedX *= -1;
      }

      if (obs.y < -500) {
        obstaclesRef.current.splice(i, 1);

        // Update AVOID_OBSTACLES objective if in Challenge Mode
        if (gameMode === 'CHALLENGE' && levelProgress) {
          const updatedObjectives = levelProgress.objectives.map(obj => {
            if (obj.type === 'AVOID_OBSTACLES' && !obj.completed) {
              obj.current += 1;
              obj.completed = obj.current >= obj.target;
            }
            return obj;
          });
          onLevelProgressUpdate({
            ...levelProgress,
            objectives: updatedObjectives
          });
        }

        continue;
      }

      // Collision
      const playerHitbox = {
        x: player.x - 10,
        y: player.y - 40,
        width: 20,
        height: 80
      };

      if (
        playerHitbox.x < obs.x + obs.width &&
        playerHitbox.x + playerHitbox.width > obs.x &&
        playerHitbox.y < obs.y + obs.height &&
        playerHitbox.height + playerHitbox.y > obs.y
      ) {
         // Check for shield power-up
         const hasShield = activePowerUpsRef.current.some(p => p.type === 'SHIELD');

         if (hasShield) {
           // Consume shield and remove obstacle
           const shieldIndex = activePowerUpsRef.current.findIndex(p => p.type === 'SHIELD');
           if (shieldIndex !== -1) {
             activePowerUpsRef.current.splice(shieldIndex, 1);
           }
           obstaclesRef.current.splice(i, 1);

           // Trigger broken umbrella animation
           player.umbrellaIsBroken = true;
           player.brokenTimer = 30; // ~0.5 seconds

           // Visual feedback - smaller explosion
           for (let j = 0; j < 10; j++) {
             particlesRef.current.push({
               id: 'shield-' + Math.random(),
               x: obs.x + obs.width / 2,
               y: obs.y + obs.height / 2,
               vx: (Math.random() - 0.5) * 8,
               vy: (Math.random() - 0.5) * 8,
               life: 0.5,
               color: '#fbbf24',
               type: 'DEBRIS',
               size: Math.random() * 4 + 2
             });
           }
           continue;
         } else {
           // No shield - game over
           createExplosion(player.x, player.y);
           if (playCrashSound) playCrashSound();

           // Mark NO_DAMAGE objective as failed if in Challenge Mode
           if (gameMode === 'CHALLENGE' && levelProgress) {
             const updatedObjectives = levelProgress.objectives.map(obj => {
               if (obj.type === 'NO_DAMAGE') {
                 obj.current = 0; // Failed
                 obj.completed = false;
               }
               return obj;
             });
             onLevelProgressUpdate({
               ...levelProgress,
               objectives: updatedObjectives
             });
           }

           const snapshot = canvas.toDataURL('image/jpeg', 0.5);
           onGameOver(Math.floor(scoreRef.current / 10), `Hit a ${obs.type.toLowerCase()}`, snapshot);
           return;
         }
      }
    }

    // Update Power-Ups
    for (let i = powerUpsRef.current.length - 1; i >= 0; i--) {
      const powerUp = powerUpsRef.current[i];
      powerUp.y -= distanceTraveled * 1.5;

      if (powerUp.y < -100) {
        powerUpsRef.current.splice(i, 1);
        continue;
      }

      // Collision with player
      const playerHitbox = {
        x: player.x - 10,
        y: player.y - 40,
        width: 20,
        height: 80
      };

      if (
        !powerUp.collected &&
        playerHitbox.x < powerUp.x + powerUp.width &&
        playerHitbox.x + playerHitbox.width > powerUp.x &&
        playerHitbox.y < powerUp.y + powerUp.height &&
        playerHitbox.height + playerHitbox.y > powerUp.y
      ) {
        // Collect power-up
        powerUp.collected = true;

        // Trigger dance animation!
        player.isDancing = true;
        player.danceTimer = 60; // 1 second dance

        // Activate power-up
        let duration = 0;
        switch (powerUp.type) {
          case 'SLOW_MOTION':
            duration = 180; // 3 seconds at 60fps
            break;
          case 'SHIELD':
            duration = -1; // Lasts until hit
            break;
          case 'WIND_BREAKER':
            duration = 300; // 5 seconds
            break;
          case 'SUPER_GLIDE':
            duration = 300; // 5 seconds
            break;
        }

        activePowerUpsRef.current.push({
          type: powerUp.type,
          timeLeft: duration,
          duration: duration
        });

        // Visual feedback - collection particles
        for (let j = 0; j < 15; j++) {
          const color = powerUp.type === 'SLOW_MOTION' ? '#60a5fa' :
                        powerUp.type === 'SHIELD' ? '#fbbf24' :
                        powerUp.type === 'WIND_BREAKER' ? '#34d399' :
                        '#f87171';

          particlesRef.current.push({
            id: 'collect-' + Math.random(),
            x: powerUp.x + powerUp.width / 2,
            y: powerUp.y + powerUp.height / 2,
            vx: (Math.random() - 0.5) * 6,
            vy: (Math.random() - 0.5) * 6,
            life: 0.8,
            color: color,
            type: 'DEBRIS',
            size: Math.random() * 4 + 2
          });
        }

        powerUpsRef.current.splice(i, 1);
      }
    }

    // Update Coins
    for (let i = coinsRef.current.length - 1; i >= 0; i--) {
      const coin = coinsRef.current[i];
      coin.y -= distanceTraveled * 1.5;
      coin.spin += 0.1; // Spinning animation

      if (coin.y < -100) {
        coinsRef.current.splice(i, 1);
        continue;
      }

      // Collision with player
      const playerHitbox = {
        x: player.x - 15,
        y: player.y - 45,
        width: 30,
        height: 90
      };

      if (
        !coin.collected &&
        playerHitbox.x < coin.x + coin.width &&
        playerHitbox.x + playerHitbox.width > coin.x &&
        playerHitbox.y < coin.y + coin.height &&
        playerHitbox.height + playerHitbox.y > coin.y
      ) {
        // Collect coin
        coin.collected = true;

        // Notify parent component
        if (onCoinCollect) {
          onCoinCollect(1);
        }

        // Update COLLECT_COINS objective if in Challenge Mode
        if (gameMode === 'CHALLENGE' && levelProgress) {
          const updatedObjectives = levelProgress.objectives.map(obj => {
            if (obj.type === 'COLLECT_COINS' && !obj.completed) {
              obj.current += 1;
              obj.completed = obj.current >= obj.target;
            }
            return obj;
          });
          onLevelProgressUpdate({
            ...levelProgress,
            objectives: updatedObjectives
          });
        }

        // Visual feedback - sparkle particles
        for (let j = 0; j < 12; j++) {
          particlesRef.current.push({
            id: 'coin-' + Math.random(),
            x: coin.x + coin.width / 2,
            y: coin.y + coin.height / 2,
            vx: (Math.random() - 0.5) * 8,
            vy: (Math.random() - 0.5) * 8,
            life: 0.6,
            color: '#fbbf24',
            type: 'DEBRIS',
            size: Math.random() * 3 + 1
          });
        }

        coinsRef.current.splice(i, 1);
      }
    }

    // Update Particles
    for (let i = particlesRef.current.length - 1; i >= 0; i--) {
        const p = particlesRef.current[i];
        p.life -= 0.03;
        
        if (p.type === 'SHOCKWAVE') {
             p.size += 5;
             p.life -= 0.05;
        } else if (p.type === 'DEBRIS') {
             p.x += p.vx;
             p.y += p.vy;
             p.vy += 0.5;
        } else if (p.type === 'GUST') {
             p.x += p.vx;
             p.y += p.vy;
        } else if (p.type === 'RAIN') {
             p.x += p.vx; // Wind influence
             p.y += p.vy - distanceTraveled; // Gravity relative to camera
             if (p.y > canvas.height + 50) p.life = 0; // Kill when off screen
        } else {
             p.x += p.vx;
             p.y += p.vy;
        }

        if (p.life <= 0) {
            particlesRef.current.splice(i, 1);
        }
    }

    // --- UPDATE ANIMATIONS ---

    // Dance animation timer
    if (player.danceTimer > 0) {
      player.danceTimer--;
      if (player.danceTimer === 0) {
        player.isDancing = false;
      }
    }

    // Broken umbrella timer
    if (player.brokenTimer > 0) {
      player.brokenTimer--;
      if (player.brokenTimer === 0) {
        player.umbrellaIsBroken = false;
      }
    }

    // Umbrella bounce animation
    if (player.bounceTimer > 0) {
      player.bounceTimer--;
      // Elastic bounce back to 1.0
      player.umbrellaBounce = 1.0 + (player.bounceTimer / 10) * 0.3;
      if (player.bounceTimer === 0) {
        player.umbrellaBounce = 1.0;
      }
    }

    // Spinning animation
    if (player.isSpinning) {
      player.spinRotation += 0.2;
      // Stop spinning when out of wind and slowed down
      if (currentWindX === 0 && currentWindY === 0 && Math.abs(player.vx) < 2) {
        player.isSpinning = false;
        player.spinRotation = 0;
      }
    } else {
      // Gradually reduce spin
      player.spinRotation *= 0.9;
      if (Math.abs(player.spinRotation) < 0.01) player.spinRotation = 0;
    }

    frameCountRef.current++;
  }, [gameState, isPaused, difficultyMode, isDarkMode, onScoreUpdate, onGameOver, onCoinCollect, playCrashSound, playOpenSound, playCloseSound]);

  const draw = useCallback((ctx: CanvasRenderingContext2D, canvas: HTMLCanvasElement) => {
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // --- APPLY SCREEN SHAKE ---
    ctx.save();
    if (shakeRef.current > 0) {
        const dx = (Math.random() - 0.5) * shakeRef.current;
        const dy = (Math.random() - 0.5) * shakeRef.current;
        ctx.translate(dx, dy);
    }

    // Background Gradient based on score (Depth) and Dark Mode
    const depth = scoreRef.current / 10;
    // Recalculate difficulty for rendering
    const difficulty = Math.min(Math.max(0, scoreRef.current - 200) / 5000, 1);

    let bgGradient;

    if (isDarkMode) {
      // Night Mode - Always dark sky with stars
      if (depth < 1000) {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#0f172a'); // Dark blue night
        bgGradient.addColorStop(1, '#1e293b');
      } else if (depth < 3000) {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#1e1b4b'); // Deep purple night
        bgGradient.addColorStop(1, '#312e81');
      } else {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#0c0a1f'); // Deep space
        bgGradient.addColorStop(1, '#1a1625');
      }
    } else {
      // Day Mode - Bright sky
      if (depth < 1000) {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#38bdf8'); // Sky blue
        bgGradient.addColorStop(1, '#bae6fd');
      } else if (depth < 3000) {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#e879f9'); // Sunset/Dusk
        bgGradient.addColorStop(1, '#818cf8');
      } else {
        bgGradient = ctx.createLinearGradient(0, 0, 0, canvas.height);
        bgGradient.addColorStop(0, '#1e1b4b'); // Space/Dark
        bgGradient.addColorStop(1, '#312e81');
      }
    }

    ctx.fillStyle = bgGradient;
    ctx.fillRect(
        -shakeRef.current, -shakeRef.current,
        canvas.width + shakeRef.current * 2, canvas.height + shakeRef.current * 2
    );

    // Storm Overlay (Darken sky based on difficulty, but not in deep space)
    if (difficulty > 0.2 && depth < 3500) {
        const stormIntensity = Math.min((difficulty - 0.2) * 1.2, 0.7);
        ctx.fillStyle = `rgba(30, 41, 59, ${stormIntensity})`; // Dark blue-grey
        ctx.fillRect(-shakeRef.current, -shakeRef.current, canvas.width + 50, canvas.height + 50);
    }

    // Draw Background Elements (Parallax Layer)
    bgElementsRef.current.forEach(el => {
        ctx.save(); // Save state before each element
        ctx.globalAlpha = el.opacity;
        ctx.fillStyle = '#ffffff';

        if (el.type === 'STAR') {
            ctx.beginPath();
            ctx.arc(el.x, el.y, el.size, 0, Math.PI * 2);
            ctx.fill();
        } else if (el.type === 'CLOUD_BG') {
            ctx.beginPath();
            ctx.arc(el.x, el.y, el.size, 0, Math.PI * 2);
            ctx.fill();
        }
        ctx.restore(); // Restore state after each element
    });

    // Draw Speed Lines, Gusts, and RAIN (Behind everything)
    particlesRef.current.forEach(p => {
        if (p.type === 'SPEED_LINE' || p.type === 'GUST' || p.type === 'RAIN') {
            ctx.save(); // Save state for each particle
            if (p.type === 'SPEED_LINE') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2;
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x, p.y - p.size);
                ctx.stroke();
            } else if (p.type === 'GUST') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 2 + Math.random() * 2;
                ctx.globalAlpha = p.life;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                ctx.lineTo(p.x - p.vx * 3, p.y); // Trail behind velocity
                ctx.stroke();
            } else if (p.type === 'RAIN') {
                ctx.strokeStyle = p.color;
                ctx.lineWidth = 1.5; // Thicker rain for visibility
                ctx.globalAlpha = 0.6;
                ctx.beginPath();
                ctx.moveTo(p.x, p.y);
                // Rain slant determined by vx
                ctx.lineTo(p.x - p.vx * 2, p.y - p.size);
                ctx.stroke();
            }
            ctx.restore(); // Restore state after each particle
        }
    });

    // --- DRAW WIND ZONES ---
    windZonesRef.current.forEach(zone => {
        ctx.save();
        ctx.beginPath();
        ctx.rect(zone.x, zone.y, zone.width, zone.height);
        ctx.clip(); // Clip drawing to zone area

        // Subtle tint
        ctx.fillStyle = 'rgba(255, 255, 255, 0.03)';
        ctx.fill();

        // Draw flowing streamlines
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.15)';
        ctx.lineWidth = 2;
        
        const spacing = 40;
        const animationOffset = (frameCountRef.current * 2) % spacing;
        
        if (Math.abs(zone.vx) > Math.abs(zone.vy)) {
            // Horizontal Flow
            const dir = Math.sign(zone.vx);
            for(let y = zone.y; y < zone.y + zone.height; y += 30) {
                const rowShift = (y % 60 === 0) ? 0 : 20; // Stagger rows
                const move = dir * animationOffset;
                
                for(let x = zone.x - spacing; x < zone.x + zone.width + spacing; x += spacing) {
                    const drawX = x + move + rowShift;
                    // Draw short arrow/line
                    ctx.beginPath();
                    ctx.moveTo(drawX, y);
                    ctx.lineTo(drawX + 15 * dir, y);
                    ctx.stroke();
                }
            }
        } else {
            // Vertical Flow
            const dir = Math.sign(zone.vy);
            for(let x = zone.x; x < zone.x + zone.width; x += 30) {
                const colShift = (x % 60 === 0) ? 0 : 20;
                const move = dir * animationOffset;

                for(let y = zone.y - spacing; y < zone.y + zone.height + spacing; y += spacing) {
                     const drawY = y + move + colShift;
                     ctx.beginPath();
                     ctx.moveTo(x, drawY);
                     ctx.lineTo(x, drawY + 15 * dir);
                     ctx.stroke();
                }
            }
        }
        
        ctx.restore(); // Remove clip
        
        // Faint border
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.05)';
        ctx.strokeRect(zone.x, zone.y, zone.width, zone.height);
    });

    // Draw Obstacles
    obstaclesRef.current.forEach(obs => {
      ctx.fillStyle = obs.type === 'BUILDING' ? '#374151' : obs.type === 'BIRD' ? '#ef4444' : '#f3f4f6';
      
      if (obs.type === 'CLOUD') {
        ctx.beginPath();
        ctx.arc(obs.x + 20, obs.y + 20, 20, 0, Math.PI * 2);
        ctx.arc(obs.x + 50, obs.y + 10, 30, 0, Math.PI * 2);
        ctx.arc(obs.x + 80, obs.y + 20, 20, 0, Math.PI * 2);
        ctx.fill();
      } else if (obs.type === 'BIRD') {
        ctx.beginPath();
        ctx.moveTo(obs.x, obs.y);
        ctx.quadraticCurveTo(obs.x + obs.width/2, obs.y - 10, obs.x + obs.width, obs.y);
        ctx.quadraticCurveTo(obs.x + obs.width/2, obs.y + 10, obs.x, obs.y);
        ctx.fill();
      } else {
        ctx.fillRect(obs.x, obs.y, obs.width, obs.height);
        if (obs.type === 'BUILDING') {
            ctx.fillStyle = '#facc15';
            for(let bx = 10; bx < obs.width; bx += 30) {
                for(let by = 10; by < obs.height; by += 40) {
                    if (Math.random() > 0.3) ctx.fillRect(obs.x + bx, obs.y + by, 15, 25);
                }
            }
        }
      }
    });

    // Draw Power-Ups
    powerUpsRef.current.forEach(powerUp => {
      if (powerUp.collected) return;

      // Pulsing animation
      const pulse = Math.sin(frameCountRef.current * 0.1) * 0.2 + 1;

      // Color and emoji based on type
      let color, emoji;
      switch (powerUp.type) {
        case 'SLOW_MOTION':
          color = '#60a5fa'; // Blue
          emoji = '⏱️';
          break;
        case 'SHIELD':
          color = '#fbbf24'; // Gold
          emoji = '🛡️';
          break;
        case 'WIND_BREAKER':
          color = '#34d399'; // Green
          emoji = '🌪️';
          break;
        case 'SUPER_GLIDE':
          color = '#f87171'; // Red
          emoji = '⬆️';
          break;
      }

      // Draw glow
      ctx.save();
      ctx.globalAlpha = 0.3 * pulse;
      ctx.fillStyle = color;
      ctx.beginPath();
      ctx.arc(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2, powerUp.width * 0.8 * pulse, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Draw circle
      ctx.fillStyle = color;
      ctx.strokeStyle = '#ffffff';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.arc(powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2, powerUp.width / 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Draw icon/emoji (simplified - using text)
      ctx.fillStyle = '#000000';
      ctx.font = 'bold 20px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(emoji, powerUp.x + powerUp.width / 2, powerUp.y + powerUp.height / 2);
    });

    // Draw Coins
    coinsRef.current.forEach(coin => {
      if (coin.collected) return;

      ctx.save();
      ctx.translate(coin.x + coin.width / 2, coin.y + coin.height / 2);

      // 3D spinning effect (scale with sin)
      const scale = Math.abs(Math.cos(coin.spin));

      // Outer glow
      ctx.globalAlpha = 0.4;
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(0, 0, coin.width * 0.7, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;

      // Coin body
      ctx.fillStyle = '#fbbf24';
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.ellipse(0, 0, coin.width / 2 * scale, coin.height / 2, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();

      // Inner circle detail
      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.ellipse(0, 0, coin.width / 3 * scale, coin.height / 3, 0, 0, Math.PI * 2);
      ctx.stroke();

      // Dollar sign or symbol
      if (scale > 0.3) {
        ctx.fillStyle = '#d97706';
        ctx.font = `bold ${16 * scale}px sans-serif`;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText('$', 0, 0);
      }

      ctx.restore();
    });

    // Draw Player
    const player = playerRef.current;

    ctx.save();
    ctx.translate(player.x, player.y);

    // Apply spin rotation if spinning
    if (player.isSpinning || player.spinRotation !== 0) {
      ctx.rotate(player.spinRotation);
    } else {
      ctx.rotate(player.angle);
    }

    // Stickman Body - Enhanced Design
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // "Oops" falling animation - flailing limbs when falling fast without umbrella
    const isFallingFast = player.vy > 12 && !player.isUmbrellaOpen;
    const flailOffset = isFallingFast ? Math.sin(frameCountRef.current * 0.3) * 10 : 0;

    // Head - Improved design with better proportions
    ctx.beginPath();
    ctx.arc(0, -30, 12, 0, Math.PI * 2);
    const headGradient = ctx.createRadialGradient(0, -30, 0, 0, -30, 12);
    headGradient.addColorStop(0, '#fcd34d'); // Brighter yellow center
    headGradient.addColorStop(1, '#f59e0b'); // Darker yellow edge
    ctx.fillStyle = headGradient;
    ctx.fill();
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.stroke();

    // Hair - Simple spiky style
    ctx.strokeStyle = '#92400e';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(-8, -38);
    ctx.lineTo(-10, -42);
    ctx.moveTo(-3, -40);
    ctx.lineTo(-3, -44);
    ctx.moveTo(3, -40);
    ctx.lineTo(3, -44);
    ctx.moveTo(8, -38);
    ctx.lineTo(10, -42);
    ctx.stroke();

    // Eyes - Animated based on state
    if (isFallingFast) {
      // Wide worried eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-4, -32, 3, 0, Math.PI * 2);
      ctx.arc(4, -32, 3, 0, Math.PI * 2);
      ctx.fill();

      // White scared highlights (smaller, more subtle)
      ctx.fillStyle = '#fff';
      ctx.beginPath();
      ctx.arc(-3, -33, 1, 0, Math.PI * 2);
      ctx.arc(5, -33, 1, 0, Math.PI * 2);
      ctx.fill();
    } else if (player.isUmbrellaOpen) {
      // Calm eyes
      ctx.fillStyle = '#000';
      ctx.beginPath();
      ctx.arc(-4, -31, 2, 0, Math.PI * 2);
      ctx.arc(4, -31, 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      // Normal eyes with blink animation
      const blinkPhase = frameCountRef.current % 200;
      if (blinkPhase < 5) {
        // Blinking - draw lines instead of circles
        ctx.strokeStyle = '#000';
        ctx.lineWidth = 2;
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(-6, -31);
        ctx.lineTo(-2, -31);
        ctx.moveTo(2, -31);
        ctx.lineTo(6, -31);
        ctx.stroke();
      } else {
        ctx.fillStyle = '#000';
        ctx.beginPath();
        ctx.arc(-4, -31, 2, 0, Math.PI * 2);
        ctx.arc(4, -31, 2, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Mouth - expression based on state
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    if (isFallingFast) {
      // Open mouth (scared)
      ctx.arc(0, -26, 3, 0, Math.PI);
    } else if (player.isUmbrellaOpen) {
      // Slight smile
      ctx.arc(0, -27, 2, 0.2, Math.PI - 0.2);
    } else {
      // Neutral
      ctx.moveTo(-3, -26);
      ctx.lineTo(3, -26);
    }
    ctx.stroke();

    // Body - Improved with torso
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(0, -18);
    ctx.lineTo(0, 0); // Torso
    ctx.stroke();

    // Shoulders/chest detail
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.arc(0, -15, 8, 0.3, Math.PI - 0.3); // Chest/shoulder line
    ctx.stroke();

    // Arms - Enhanced with joints and smoother motion
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    const shoulderY = -15;

    if (player.isDancing) {
      // Dance animation - arms waving enthusiastically
      const dancePhase = (player.danceTimer / 60) * Math.PI * 4;
      const leftArmAngle = Math.sin(dancePhase) * 0.8;
      const rightArmAngle = Math.sin(dancePhase + Math.PI) * 0.8;

      // Left arm
      ctx.beginPath();
      ctx.moveTo(0, shoulderY);
      const leftElbowX = -12 * Math.cos(leftArmAngle);
      const leftElbowY = shoulderY + 8 + 8 * Math.sin(leftArmAngle);
      ctx.lineTo(leftElbowX, leftElbowY);
      ctx.lineTo(leftElbowX - 10, leftElbowY - 12);
      ctx.stroke();

      // Right arm
      ctx.beginPath();
      ctx.moveTo(0, shoulderY);
      const rightElbowX = 12 * Math.cos(rightArmAngle);
      const rightElbowY = shoulderY + 8 + 8 * Math.sin(rightArmAngle);
      ctx.lineTo(rightElbowX, rightElbowY);
      ctx.lineTo(rightElbowX + 10, rightElbowY - 12);
      ctx.stroke();
    } else if (isFallingFast) {
      // Flailing arms with elbow joints
      ctx.beginPath();
      ctx.moveTo(0, shoulderY);
      ctx.lineTo(-12 - flailOffset, shoulderY - 5);
      ctx.lineTo(-18 - flailOffset * 1.5, shoulderY + 5 + flailOffset);
      ctx.moveTo(0, shoulderY);
      ctx.lineTo(12 + flailOffset, shoulderY - 5);
      ctx.lineTo(18 + flailOffset * 1.5, shoulderY + 5 - flailOffset);
      ctx.stroke();
    } else {
      // Normal arms holding umbrella - smooth raising motion
      const armY = shoulderY - (20 * player.umbrellaAnim);
      const armXOffset = 12;
      const elbowY = shoulderY + (armY - shoulderY) * 0.5;

      // Left arm with elbow
      ctx.beginPath();
      ctx.moveTo(0, shoulderY);
      ctx.lineTo(-armXOffset * 0.7, elbowY);
      ctx.lineTo(-armXOffset, armY);
      ctx.stroke();

      // Right arm with elbow
      ctx.beginPath();
      ctx.moveTo(0, shoulderY);
      ctx.lineTo(armXOffset * 0.7, elbowY);
      ctx.lineTo(armXOffset, armY);
      ctx.stroke();
    }

    // Hands holding umbrella
    if (player.umbrellaAnim > 0.5 && !player.isDancing) {
      ctx.fillStyle = '#fcd34d';
      ctx.beginPath();
      ctx.arc(-12, shoulderY - (20 * player.umbrellaAnim), 3, 0, Math.PI * 2);
      ctx.arc(12, shoulderY - (20 * player.umbrellaAnim), 3, 0, Math.PI * 2);
      ctx.fill();
    }

    // Legs - Enhanced with knee joints
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 3;
    const hipY = 0;
    const legLength = 22;

    if (player.isDancing) {
      // Dance animation - legs kicking with knees
      const dancePhase = (player.danceTimer / 60) * Math.PI * 4;
      const leftLegSpread = 8 + Math.sin(dancePhase) * 10;
      const rightLegSpread = 8 + Math.sin(dancePhase + Math.PI) * 10;

      // Left leg with knee
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      const leftKneeY = hipY + legLength * 0.6;
      ctx.lineTo(-leftLegSpread * 0.5, leftKneeY);
      ctx.lineTo(-leftLegSpread, hipY + legLength);
      ctx.stroke();

      // Right leg with knee
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      const rightKneeY = hipY + legLength * 0.6;
      ctx.lineTo(rightLegSpread * 0.5, rightKneeY);
      ctx.lineTo(rightLegSpread, hipY + legLength);
      ctx.stroke();
    } else if (isFallingFast) {
      // Legs flailing with dramatic knee bends
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(-8 - flailOffset, hipY + 12);
      ctx.lineTo(-5 - flailOffset * 1.5, hipY + legLength);
      ctx.moveTo(0, hipY);
      ctx.lineTo(8 + flailOffset, hipY + 12);
      ctx.lineTo(5 + flailOffset * 1.5, hipY + legLength);
      ctx.stroke();
    } else {
      // Normal legs with slight spread when umbrella opens
      const legSpread = 6 * player.umbrellaAnim;
      const kneeY = hipY + legLength * 0.55;

      // Left leg with knee
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(-legSpread * 0.6, kneeY);
      ctx.lineTo(-legSpread, hipY + legLength);
      ctx.stroke();

      // Right leg with knee
      ctx.beginPath();
      ctx.moveTo(0, hipY);
      ctx.lineTo(legSpread * 0.6, kneeY);
      ctx.lineTo(legSpread, hipY + legLength);
      ctx.stroke();
    }

    // Feet
    ctx.fillStyle = '#000';
    if (player.isDancing) {
      const dancePhase = (player.danceTimer / 60) * Math.PI * 4;
      const leftLegSpread = 8 + Math.sin(dancePhase) * 10;
      const rightLegSpread = 8 + Math.sin(dancePhase + Math.PI) * 10;
      ctx.beginPath();
      ctx.ellipse(-leftLegSpread, hipY + legLength, 3, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(rightLegSpread, hipY + legLength, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    } else {
      const legSpread = isFallingFast ? 5 : 6 * player.umbrellaAnim;
      ctx.beginPath();
      ctx.ellipse(-legSpread, hipY + legLength, 3, 2, 0, 0, Math.PI * 2);
      ctx.ellipse(legSpread, hipY + legLength, 3, 2, 0, 0, Math.PI * 2);
      ctx.fill();
    }

    // Umbrella (with bounce effect) - Enhanced Design
    // Apply bounce scale
    ctx.save();
    ctx.scale(player.umbrellaBounce, player.umbrellaBounce);

    const handleY = -35;
    const stickLength = 32;
    const tipY = handleY - stickLength;

    // Umbrella stick/shaft with gradient
    const stickGradient = ctx.createLinearGradient(0, handleY, 0, tipY);
    stickGradient.addColorStop(0, '#8b5cf6'); // Purple handle
    stickGradient.addColorStop(0.3, '#7c3aed');
    stickGradient.addColorStop(1, '#6d28d9'); // Darker tip
    ctx.strokeStyle = stickGradient;
    ctx.lineWidth = 3;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, handleY);
    ctx.lineTo(0, tipY);
    ctx.stroke();

    // Umbrella handle curve
    ctx.strokeStyle = '#8b5cf6';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.arc(0, handleY, 4, Math.PI, Math.PI * 2);
    ctx.stroke();

    const maxRadius = 40;
    const minRadius = 5;
    const currentRadius = minRadius + (maxRadius - minRadius) * player.umbrellaAnim;

    const openCornerY = tipY;
    const closedCornerY = tipY + 25;
    const currentCornerY = closedCornerY - (closedCornerY - openCornerY) * player.umbrellaAnim;

    // Broken umbrella animation
    if (player.umbrellaIsBroken && player.umbrellaAnim > 0.3) {
      // Draw torn/broken umbrella
      ctx.save();
      const breakShake = Math.sin(player.brokenTimer * 0.5) * 3;

      // Left side (bent)
      ctx.beginPath();
      ctx.moveTo(0, tipY);
      ctx.quadraticCurveTo(
        -currentRadius / 2 + breakShake, tipY - (10 * player.umbrellaAnim) + breakShake,
        -currentRadius + breakShake, currentCornerY + 10
      );
      ctx.strokeStyle = '#b91c1c';
      ctx.fillStyle = '#ef4444';
      ctx.fill();
      ctx.stroke();

      // Right side (bent opposite direction)
      ctx.beginPath();
      ctx.moveTo(0, tipY);
      ctx.quadraticCurveTo(
        currentRadius / 2 - breakShake, tipY - (10 * player.umbrellaAnim) - breakShake,
        currentRadius - breakShake, currentCornerY + 10
      );
      ctx.fill();
      ctx.stroke();

      // Rips/tears (jagged lines)
      ctx.strokeStyle = '#7f1d1d';
      ctx.lineWidth = 2;
      for (let i = 0; i < 3; i++) {
        ctx.beginPath();
        ctx.moveTo(-currentRadius / 2 + i * 10, tipY + i * 5);
        ctx.lineTo(-currentRadius / 2 + i * 10 + 5, tipY + i * 5 + 10);
        ctx.stroke();
      }

      ctx.restore();
    } else {
      // Normal umbrella with enhanced design
      const archHeight = 12 * player.umbrellaAnim;

      // Umbrella canopy with gradient
      const canopyGradient = ctx.createRadialGradient(0, tipY - archHeight * 0.5, 0, 0, tipY - archHeight * 0.5, currentRadius);
      canopyGradient.addColorStop(0, '#fca5a5'); // Light red center
      canopyGradient.addColorStop(0.5, '#ef4444'); // Bright red
      canopyGradient.addColorStop(1, '#b91c1c'); // Dark red edge

      ctx.fillStyle = canopyGradient;
      ctx.strokeStyle = '#991b1b';
      ctx.lineWidth = 2;

      // Draw main canopy shape
      ctx.beginPath();
      ctx.moveTo(0, tipY);
      ctx.quadraticCurveTo(
        -currentRadius / 2, tipY - archHeight,
        -currentRadius, currentCornerY
      );
      ctx.lineTo(currentRadius, currentCornerY);
      ctx.quadraticCurveTo(
        currentRadius / 2, tipY - archHeight,
        0, tipY
      );
      ctx.fill();
      ctx.stroke();

      // Umbrella ribs/segments for detail (only when open enough)
      if (player.umbrellaAnim > 0.5) {
        ctx.strokeStyle = '#7f1d1d';
        ctx.lineWidth = 1.5;
        const numRibs = 6;
        for (let i = 0; i < numRibs; i++) {
          const angle = (i / (numRibs - 1)) * Math.PI;
          const ribX = Math.cos(angle - Math.PI / 2) * currentRadius;
          const ribY = currentCornerY + Math.sin(angle - Math.PI / 2) * archHeight;

          ctx.beginPath();
          ctx.moveTo(0, tipY);
          ctx.lineTo(ribX, ribY);
          ctx.stroke();
        }
      }

      // Decorative edge trim
      if (player.umbrellaAnim > 0.8) {
        ctx.strokeStyle = '#fef3c7';
        ctx.lineWidth = 2;
        ctx.globalAlpha = 0.6;
        ctx.beginPath();
        ctx.moveTo(-currentRadius, currentCornerY);
        ctx.lineTo(currentRadius, currentCornerY);
        ctx.stroke();
        ctx.globalAlpha = 1.0;
      }
    }

    ctx.restore();

    // Particles (Foreground)
    particlesRef.current.forEach((p) => {
        if (p.type === 'SPEED_LINE' || p.type === 'GUST' || p.type === 'RAIN') return;

        ctx.save(); // Save state for each particle
        ctx.globalAlpha = p.life;

        if (p.type === 'SHOCKWAVE') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 4 * p.life;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
            ctx.stroke();
        } else if (p.type === 'WIND') {
            ctx.strokeStyle = p.color;
            ctx.lineWidth = 2;
            ctx.lineCap = 'round';
            ctx.beginPath();
            ctx.moveTo(p.x, p.y);
            ctx.lineTo(p.x, p.y + p.size);
            ctx.stroke();
        } else {
            ctx.fillStyle = p.color;
            ctx.beginPath();
            ctx.arc(p.x, p.y, p.size, 0, Math.PI*2);
            ctx.fill();
        }
        ctx.restore(); // Restore state after each particle
    });

    // Lightning Flash Effect (Overlay)
    if (lightningRef.current > 0) {
        ctx.save();
        ctx.fillStyle = `rgba(255, 255, 255, ${lightningRef.current * 0.4})`;
        ctx.fillRect(-shakeRef.current, -shakeRef.current, canvas.width+50, canvas.height+50);
        ctx.restore();
    }

    ctx.restore();

    // --- HUD: WIND INDICATOR ---
    // Draw on top of everything without shake offset (unless specific UI shake desired)
    // We already restored context, so we are at 0,0
    const wind = activeWindRef.current;
    const windMag = Math.sqrt(wind.x * wind.x + wind.y * wind.y);
    
    if (windMag > 0.5) {
        const cx = canvas.width / 2;
        const cy = 80;
        const angle = Math.atan2(wind.y, wind.x);
        
        ctx.save();
        ctx.translate(cx, cy);
        
        // Gauge Background
        ctx.beginPath();
        ctx.arc(0, 0, 24, 0, Math.PI * 2);
        ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
        ctx.fill();
        ctx.strokeStyle = 'rgba(255, 255, 255, 0.2)';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Arrow
        ctx.rotate(angle);
        ctx.beginPath();
        // Scale arrow length with magnitude
        const arrowLen = Math.min(10 + windMag * 2, 20); 
        ctx.moveTo(-arrowLen/2, 0);
        ctx.lineTo(arrowLen/2, 0);
        ctx.lineTo(arrowLen/2 - 6, -6);
        ctx.moveTo(arrowLen/2, 0);
        ctx.lineTo(arrowLen/2 - 6, 6);
        
        ctx.strokeStyle = '#38bdf8'; // Sky blue indicator
        ctx.lineWidth = 3;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.stroke();

        ctx.restore();
        
        // Text
        ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
        ctx.font = 'bold 10px sans-serif';
        ctx.textAlign = 'center';
        ctx.fillText("WIND", cx, cy + 36);
    }

    // --- HUD: ACTIVE POWER-UPS INDICATORS ---
    if (activePowerUpsRef.current.length > 0) {
      const startX = 10;
      const startY = 10;
      const boxSize = 50;
      const spacing = 10;

      activePowerUpsRef.current.forEach((powerUp, index) => {
        const x = startX;
        const y = startY + (index * (boxSize + spacing));

        // Power-up info
        let color, emoji, name;
        switch (powerUp.type) {
          case 'SLOW_MOTION':
            color = '#60a5fa';
            emoji = '⏱️';
            name = 'SLOW-MO';
            break;
          case 'SHIELD':
            color = '#fbbf24';
            emoji = '🛡️';
            name = 'SHIELD';
            break;
          case 'WIND_BREAKER':
            color = '#34d399';
            emoji = '🌪️';
            name = 'WIND BREAK';
            break;
          case 'SUPER_GLIDE':
            color = '#f87171';
            emoji = '⬆️';
            name = 'SUPER GLIDE';
            break;
        }

        // Background box
        ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
        ctx.fillRect(x, y, boxSize, boxSize);

        // Border with power-up color
        ctx.strokeStyle = color;
        ctx.lineWidth = 3;
        ctx.strokeRect(x, y, boxSize, boxSize);

        // Icon
        ctx.font = 'bold 24px sans-serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(emoji, x + boxSize / 2, y + boxSize / 2 - 5);

        // Timer bar (if not shield)
        if (powerUp.timeLeft > 0) {
          const progress = powerUp.timeLeft / powerUp.duration;
          const barHeight = 4;
          const barY = y + boxSize - barHeight;

          // Background
          ctx.fillStyle = 'rgba(0, 0, 0, 0.5)';
          ctx.fillRect(x, barY, boxSize, barHeight);

          // Progress
          ctx.fillStyle = color;
          ctx.fillRect(x, barY, boxSize * progress, barHeight);
        }

        // Name label (outside box)
        ctx.fillStyle = 'rgba(255, 255, 255, 0.9)';
        ctx.font = 'bold 8px sans-serif';
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.fillText(name, x + boxSize + 5, y + boxSize / 2 - 4);
      });
    }

  }, [gameState]);

  // Main Loop
  const loop = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (gameState === GameState.START) {
         // Demo Mode Loop
         const player = playerRef.current;
         // Hover
         player.y = canvas.height / 3 + Math.sin(frameCountRef.current * 0.05) * 10;
         player.angle = Math.sin(frameCountRef.current * 0.02) * 0.05;
         player.umbrellaAnim = 1; // Always open in menu

         // Move BG
         bgElementsRef.current.forEach(el => {
            el.y -= 0.5 * el.speedFactor; // Slow scroll
            el.x += el.driftX;
            if (el.x > canvas.width + el.size) el.x = -el.size;
            if (el.x < -el.size) el.x = canvas.width + el.size;
         });
         bgElementsRef.current = bgElementsRef.current.filter(el => el.y > -100);
         if (bgElementsRef.current.length < 50 && Math.random() > 0.5) spawnBgElement(canvas.height + 50, canvas.width);

         // Spawn wind particles for ambiance
         if (frameCountRef.current % 10 === 0) {
             particlesRef.current.push({
                id: 'menu-wind-' + Math.random(),
                x: Math.random() * canvas.width,
                y: canvas.height + 20,
                vx: (Math.random() - 0.5) * 2,
                vy: - (2 + Math.random() * 3),
                life: 0.8,
                color: 'rgba(255, 255, 255, 0.2)',
                type: 'WIND',
                size: 10 + Math.random() * 20
             });
         }
         // Update particles
         for (let i = particlesRef.current.length - 1; i >= 0; i--) {
            const p = particlesRef.current[i];
            p.y += p.vy;
            p.x += p.vx;
            p.life -= 0.01;
            if (p.life <= 0) particlesRef.current.splice(i, 1);
         }
         frameCountRef.current++;
         draw(ctx, canvas);
    } else {
        update(canvas);
        draw(ctx, canvas);
    }

    requestRef.current = requestAnimationFrame(loop);
  }, [update, draw, gameState]);

  // Setup / Cleanup
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const resize = () => {
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        if (gameState === GameState.START) {
            playerRef.current.x = canvas.width / 2;
            playerRef.current.y = canvas.height / 3;
            playerRef.current.targetX = canvas.width / 2;
        }
    };
    window.addEventListener('resize', resize);
    resize();

    requestRef.current = requestAnimationFrame(loop);

    return () => {
        if (requestRef.current) cancelAnimationFrame(requestRef.current);
        window.removeEventListener('resize', resize);
    };
  }, [loop, gameState]);

  // Input Handling
  useEffect(() => {
    const handleStart = (e: MouseEvent | TouchEvent) => {
       playerRef.current.isUmbrellaOpen = true;
    };
    
    const handleEnd = () => {
       playerRef.current.isUmbrellaOpen = false;
    };

    const handleMove = (e: MouseEvent | TouchEvent) => {
        let clientX = 0;
        if ('touches' in e) {
            clientX = e.touches[0].clientX;
        } else {
            clientX = (e as MouseEvent).clientX;
        }
        // Update target, physics happens in update()
        playerRef.current.targetX = clientX;
    };

    window.addEventListener('mousedown', handleStart);
    window.addEventListener('mouseup', handleEnd);
    window.addEventListener('touchstart', handleStart);
    window.addEventListener('touchend', handleEnd);
    window.addEventListener('mousemove', handleMove);
    window.addEventListener('touchmove', handleMove);

    return () => {
        window.removeEventListener('mousedown', handleStart);
        window.removeEventListener('mouseup', handleEnd);
        window.removeEventListener('touchstart', handleStart);
        window.removeEventListener('touchend', handleEnd);
        window.removeEventListener('mousemove', handleMove);
        window.removeEventListener('touchmove', handleMove);
    };
  }, []);

  // Reset logic
  useEffect(() => {
    if (gameState === GameState.START || (gameState === GameState.PLAYING && prevGameStateRef.current === GameState.GAME_OVER)) {
        obstaclesRef.current = [];
        particlesRef.current = [];
        bgElementsRef.current = [];
        windZonesRef.current = [];
        powerUpsRef.current = [];
        activePowerUpsRef.current = [];
        coinsRef.current = [];
        scoreRef.current = 0;
        frameCountRef.current = 0;
        shakeRef.current = 0;
        lightningRef.current = 0;
        lastUmbrellaState.current = false;
        windGustRef.current.active = false;

        // Storm Mode: Give player a free shield at start
        if (gameMode === 'STORM') {
          activePowerUpsRef.current = [{
            type: 'SHIELD',
            timeLeft: 5000, // 5 seconds
            duration: 5000
          }];
        }
        
        if (canvasRef.current) {
             playerRef.current.x = canvasRef.current.width / 2;
             playerRef.current.y = canvasRef.current.height / 3;
             playerRef.current.vy = 0;
             playerRef.current.vx = 0;
             playerRef.current.targetX = canvasRef.current.width / 2;
             playerRef.current.umbrellaAnim = 0;
             playerRef.current.isDancing = false;
             playerRef.current.danceTimer = 0;
             playerRef.current.isSpinning = false;
             playerRef.current.spinRotation = 0;
             playerRef.current.umbrellaIsBroken = false;
             playerRef.current.brokenTimer = 0;

             // Pre-populate background
             for(let i=0; i<40; i++) {
                 spawnBgElement(Math.random() * canvasRef.current.height, canvasRef.current.width);
             }
        }
    }
    prevGameStateRef.current = gameState;
  }, [gameState]);

  return <canvas ref={canvasRef} className="w-full h-full" />;
};

export default GameCanvas;