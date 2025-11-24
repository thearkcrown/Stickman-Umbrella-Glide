import React, { useState, useEffect, useRef, useCallback } from 'react';
import GameCanvas from './components/GameCanvas';
import HomeStickman from './components/HomeStickman';
import { GameState, LeaderboardEntry, CosmeticItem, PlayerCosmetics, GameMode, ChallengeLevel, LevelProgress } from './types';
import { getGameOverRoast } from './services/geminiService';
import { getLeaderboard, submitScore, isHighScore } from './services/leaderboardService';
import { getOrCreatePlayerName, generateShortUniqueName } from './services/nameGenerator';
import { CHALLENGE_LEVELS, initializeLevelObjectives } from './services/challengeLevels';
import {
  initCrazyGames,
  getCrazyGamesUser,
  crazyGamesLogin,
  reportGameplayStart,
  reportGameplayStop,
  triggerHappyTime,
  getCrazyGamesSDKStatus,
  CrazyGamesUser
} from './services/crazyGamesService';

// Helper: Create White Noise Buffer for Wind Sound
const createNoiseBuffer = (ctx: AudioContext, duration: number = 2) => {
  const bufferSize = ctx.sampleRate * duration; 
  const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < bufferSize; i++) {
    data[i] = Math.random() * 2 - 1;
  }
  return buffer;
};

const App: React.FC = () => {
  const [gameState, setGameState] = useState<GameState>(GameState.START);
  const [isPaused, setIsPaused] = useState(false);
  const [score, setScore] = useState(0);
  const [highScore, setHighScore] = useState(0);
  const [roast, setRoast] = useState<string>('');
  const [loadingRoast, setLoadingRoast] = useState(false);
  const [crashSnapshot, setCrashSnapshot] = useState<string | null>(null);
  const [scorePulse, setScorePulse] = useState(false);

  // Coins & Shop State
  const [coins, setCoins] = useState(() => {
    const stored = localStorage.getItem('coins');
    return stored ? parseInt(stored) : 0;
  });
  const [showShop, setShowShop] = useState(false);

  // Cosmetics State
  const [unlockedItems, setUnlockedItems] = useState<string[]>(() => {
    const stored = localStorage.getItem('unlockedItems');
    return stored ? JSON.parse(stored) : ['umbrella_red']; // Default red umbrella
  });

  const [selectedCosmetics, setSelectedCosmetics] = useState<PlayerCosmetics>(() => {
    const stored = localStorage.getItem('selectedCosmetics');
    return stored ? JSON.parse(stored) : {
      umbrellaColor: '#ef4444',
      hat: null,
      accessory: null,
      trail: null
    };
  });

  // Define Shop Items
  const shopItems: CosmeticItem[] = [
    // Umbrella Colors
    { id: 'umbrella_red', name: 'Red Umbrella', type: 'umbrella_color', cost: 0, unlocked: true, value: '#ef4444' },
    { id: 'umbrella_blue', name: 'Blue Umbrella', type: 'umbrella_color', cost: 50, unlocked: unlockedItems.includes('umbrella_blue'), value: '#3b82f6' },
    { id: 'umbrella_green', name: 'Green Umbrella', type: 'umbrella_color', cost: 50, unlocked: unlockedItems.includes('umbrella_green'), value: '#10b981' },
    { id: 'umbrella_purple', name: 'Purple Umbrella', type: 'umbrella_color', cost: 75, unlocked: unlockedItems.includes('umbrella_purple'), value: '#a855f7' },
    { id: 'umbrella_gold', name: 'Golden Umbrella', type: 'umbrella_color', cost: 100, unlocked: unlockedItems.includes('umbrella_gold'), value: '#fbbf24' },
    { id: 'umbrella_rainbow', name: 'Rainbow Umbrella', type: 'umbrella_color', cost: 200, unlocked: unlockedItems.includes('umbrella_rainbow'), value: 'rainbow' },

    // Hats
    { id: 'hat_cap', name: 'Baseball Cap', type: 'hat', cost: 100, unlocked: unlockedItems.includes('hat_cap'), value: 'cap' },
    { id: 'hat_tophat', name: 'Top Hat', type: 'hat', cost: 150, unlocked: unlockedItems.includes('hat_tophat'), value: 'tophat' },
    { id: 'hat_crown', name: 'Crown', type: 'hat', cost: 250, unlocked: unlockedItems.includes('hat_crown'), value: 'crown' },
    { id: 'hat_halo', name: 'Halo', type: 'hat', cost: 300, unlocked: unlockedItems.includes('hat_halo'), value: 'halo' },

    // Accessories
    { id: 'acc_scarf', name: 'Scarf', type: 'accessory', cost: 75, unlocked: unlockedItems.includes('acc_scarf'), value: 'scarf' },
    { id: 'acc_headphones', name: 'Headphones', type: 'accessory', cost: 100, unlocked: unlockedItems.includes('acc_headphones'), value: 'headphones' },
    { id: 'acc_cape', name: 'Cape', type: 'accessory', cost: 150, unlocked: unlockedItems.includes('acc_cape'), value: 'cape' },
    { id: 'acc_glasses', name: 'Sunglasses', type: 'accessory', cost: 80, unlocked: unlockedItems.includes('acc_glasses'), value: 'glasses' },

    // Trails
    { id: 'trail_sparkle', name: 'Sparkle Trail', type: 'trail', cost: 120, unlocked: unlockedItems.includes('trail_sparkle'), value: 'sparkle' },
    { id: 'trail_cloud', name: 'Cloud Trail', type: 'trail', cost: 150, unlocked: unlockedItems.includes('trail_cloud'), value: 'cloud' },
    { id: 'trail_rainbow', name: 'Rainbow Trail', type: 'trail', cost: 200, unlocked: unlockedItems.includes('trail_rainbow'), value: 'rainbow' },
    { id: 'trail_fire', name: 'Fire Trail', type: 'trail', cost: 180, unlocked: unlockedItems.includes('trail_fire'), value: 'fire' },
  ];

  // Leaderboard State
  const [leaderboard, setLeaderboard] = useState<LeaderboardEntry[]>([]);
  const [showNameInput, setShowNameInput] = useState(false);
  const [playerName, setPlayerName] = useState(() => {
    // Always use auto-generated unique name
    return getOrCreatePlayerName();
  });
  const [submittingScore, setSubmittingScore] = useState(false);
  const [scoreSubmitted, setScoreSubmitted] = useState(false);

  // CrazyGames State
  const [crazyUser, setCrazyUser] = useState<CrazyGamesUser | null>(null);
  const [showDebugPanel, setShowDebugPanel] = useState(false);

  // Difficulty Mode State
  const [difficultyMode, setDifficultyMode] = useState<'EASY' | 'MEDIUM' | 'HARD'>(() => {
    const stored = localStorage.getItem('difficultyMode');
    return (stored as 'EASY' | 'MEDIUM' | 'HARD') || 'MEDIUM';
  });

  // Dark Mode State
  const [isDarkMode, setIsDarkMode] = useState(() => {
    const stored = localStorage.getItem('darkMode');
    return stored === 'true';
  });

  // Game Mode State
  const [gameMode, setGameMode] = useState<GameMode>(() => {
    const stored = localStorage.getItem('gameMode');
    return (stored as GameMode) || 'ENDLESS';
  });
  const [selectedChallengeLevel, setSelectedChallengeLevel] = useState<number | null>(null);
  const [showChallengeLevels, setShowChallengeLevels] = useState(false);
  const [levelProgress, setLevelProgress] = useState<LevelProgress | null>(null);

  // Audio State
  const [masterVolume, setMasterVolume] = useState(() => {
    const stored = localStorage.getItem('masterVolume');
    return stored ? parseFloat(stored) : 0.7;
  });
  const [musicVolume, setMusicVolume] = useState(() => {
    const stored = localStorage.getItem('musicVolume');
    return stored ? parseFloat(stored) : 0.5;
  });
  const [sfxVolume, setSfxVolume] = useState(() => {
    const stored = localStorage.getItem('sfxVolume');
    return stored ? parseFloat(stored) : 0.7;
  });
  const [isMuted, setIsMuted] = useState(false);
  const [showVolumeControls, setShowVolumeControls] = useState(false);
  const [currentMusicTrack, setCurrentMusicTrack] = useState(() => {
    const stored = localStorage.getItem('musicTrack');
    return stored || 'Stickman Glide.mp3';
  });

  // Refs
  const audioCtxRef = useRef<AudioContext | null>(null);
  const windGainRef = useRef<GainNode | null>(null);
  const droneGainRef = useRef<GainNode | null>(null);
  const droneOscRef = useRef<OscillatorNode | null>(null);
  const sfxBufferRef = useRef<AudioBuffer | null>(null); // Reusable noise buffer for SFX
  const prevScoreRef = useRef(0);

  // Music System Refs
  const musicGainRef = useRef<GainNode | null>(null);
  const masterGainRef = useRef<GainNode | null>(null);
  const sfxGainRef = useRef<GainNode | null>(null);
  const backgroundMusicRef = useRef<HTMLAudioElement | null>(null);
  const musicSourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);

  // Get or create unique user ID
  const getUserId = useCallback(() => {
    let userId = localStorage.getItem('stickman_user_id');
    if (!userId) {
      userId = `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('stickman_user_id', userId);
    }
    return userId;
  }, []);

  useEffect(() => {
    const stored = localStorage.getItem('stickman_glide_highscore');
    if (stored) setHighScore(parseInt(stored));

    // Ensure user has a unique ID
    getUserId();

    // Load leaderboard initially
    loadLeaderboard();

    // Initialize CrazyGames SDK
    const setupCrazyGames = async () => {
      const initialized = await initCrazyGames();

      if (initialized) {
        const user = await getCrazyGamesUser();

        if (user) {
          setCrazyUser(user);
          // Keep auto-generated name, don't override with CrazyGames username
        }
      }
    };

    setupCrazyGames();

    return () => {
      // Cleanup audio on unmount
      if (backgroundMusicRef.current) {
        backgroundMusicRef.current.pause();
        backgroundMusicRef.current.src = '';
      }
      audioCtxRef.current?.close();
    };
  }, [getUserId]);

  const loadLeaderboard = async () => {
      const data = await getLeaderboard();
      setLeaderboard(data);
  };

  // Background Music System - Using MP3 files
  const startBackgroundMusic = useCallback(() => {
    const ctx = audioCtxRef.current;
    const musicGain = musicGainRef.current;
    if (!ctx || !musicGain) return;

    // Stop existing music if playing
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.currentTime = 0;
    }

    // Create audio element
    const audio = new Audio();
    audio.src = `/${currentMusicTrack}`;
    audio.loop = true;
    audio.volume = 1.0; // Volume controlled by gain node

    // Connect to Web Audio API for volume control
    if (!musicSourceNodeRef.current) {
      const source = ctx.createMediaElementSource(audio);
      source.connect(musicGain);
      musicSourceNodeRef.current = source;
    }

    backgroundMusicRef.current = audio;

    // Play music
    audio.play()
      .catch((error) => {
        console.error('❌ Failed to play background music:', error);
      });
  }, [currentMusicTrack]);

  const stopBackgroundMusic = useCallback(() => {
    if (backgroundMusicRef.current) {
      backgroundMusicRef.current.pause();
      backgroundMusicRef.current.currentTime = 0;
    }
  }, []);

  const switchMusicTrack = useCallback(() => {
    const tracks = ['Stickman Glide.mp3', 'Stickman Glide 2.mp3'];
    const currentIndex = tracks.indexOf(currentMusicTrack);
    const nextTrack = tracks[(currentIndex + 1) % tracks.length];

    setCurrentMusicTrack(nextTrack);
    localStorage.setItem('musicTrack', nextTrack);

    // Restart music with new track
    if (backgroundMusicRef.current && audioCtxRef.current) {
      stopBackgroundMusic();
      setTimeout(() => startBackgroundMusic(), 100);
    }
  }, [currentMusicTrack, startBackgroundMusic, stopBackgroundMusic]);

  const initAudio = () => {
    if (audioCtxRef.current) return;

    const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
    const ctx = new AudioContext();
    audioCtxRef.current = ctx;

    // Create Master Gain Node (controls everything)
    const masterGain = ctx.createGain();
    masterGain.gain.value = masterVolume;
    masterGain.connect(ctx.destination);
    masterGainRef.current = masterGain;

    // Create Music Gain Node (controls background music)
    const musicGain = ctx.createGain();
    musicGain.gain.value = musicVolume;
    musicGain.connect(masterGain);
    musicGainRef.current = musicGain;

    // Create SFX Gain Node (controls all sound effects)
    const sfxGain = ctx.createGain();
    sfxGain.gain.value = sfxVolume;
    sfxGain.connect(masterGain);
    sfxGainRef.current = sfxGain;

    // Pre-generate SFX buffer (1 second is enough for clicks/puffs)
    sfxBufferRef.current = createNoiseBuffer(ctx, 1.0);

    // 1. Wind Sound (White Noise -> Lowpass Filter)
    const noiseBuffer = createNoiseBuffer(ctx, 2.0);
    const noiseSource = ctx.createBufferSource();
    noiseSource.buffer = noiseBuffer;
    noiseSource.loop = true;

    const windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 800;
    windFilter.Q.value = 1;

    const windGain = ctx.createGain();
    windGain.gain.value = 0; // Start silent

    noiseSource.connect(windFilter);
    windFilter.connect(windGain);
    windGain.connect(sfxGain); // Connect to SFX gain instead of destination
    noiseSource.start();
    windGainRef.current = windGain;

    // 2. Drone/Rumble (Low Osc)
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.value = 60; // Start with a low hum

    const droneFilter = ctx.createBiquadFilter();
    droneFilter.type = 'lowpass';
    droneFilter.frequency.value = 120;

    const droneGain = ctx.createGain();
    droneGain.gain.value = 0;

    osc.connect(droneFilter);
    droneFilter.connect(droneGain);
    droneGain.connect(sfxGain); // Connect to SFX gain instead of destination
    osc.start();

    droneGainRef.current = droneGain;
    droneOscRef.current = osc;

    // Start background music
    startBackgroundMusic();
  };

  // Audio Logic: Wind Control (Gliding)
  useEffect(() => {
    if (gameState !== GameState.PLAYING) {
        // Fade out sounds if game not playing
        const ctx = audioCtxRef.current;
        if (ctx && windGainRef.current) windGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        if (ctx && droneGainRef.current) droneGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1);
        return;
    }

    const ctx = audioCtxRef.current;
    if (!ctx) return;

    const startWind = () => {
        if (windGainRef.current) {
            windGainRef.current.gain.setTargetAtTime(0.15, ctx.currentTime, 0.2); // Fade in wind
        }
    };
    
    const stopWind = () => {
        if (windGainRef.current) {
            windGainRef.current.gain.setTargetAtTime(0, ctx.currentTime, 0.1); // Fade out wind
        }
    };

    window.addEventListener('mousedown', startWind);
    window.addEventListener('mouseup', stopWind);
    window.addEventListener('touchstart', startWind);
    window.addEventListener('touchend', stopWind);

    return () => {
        window.removeEventListener('mousedown', startWind);
        window.removeEventListener('mouseup', stopWind);
        window.removeEventListener('touchstart', startWind);
        window.removeEventListener('touchend', stopWind);
    };
  }, [gameState]);

  // Audio Logic: Depth Ambience (Drone)
  useEffect(() => {
     if (gameState === GameState.PLAYING && droneGainRef.current && audioCtxRef.current && droneOscRef.current) {
         // The deeper you go, the louder and DEEPER the rumble
         const depthRatio = Math.min(score / 5000, 1); // Max effect at 5000m
         
         const vol = 0.02 + (depthRatio * 0.15); // Baseline + depth volume
         droneGainRef.current.gain.setTargetAtTime(vol, audioCtxRef.current.currentTime, 0.5);

         // Pitch Drop: 60Hz -> 30Hz
         const freq = 60 - (depthRatio * 30);
         droneOscRef.current.frequency.setTargetAtTime(freq, audioCtxRef.current.currentTime, 0.5);
     }
  }, [score, gameState]);

  const playCrashSound = useCallback(() => {
    const ctx = audioCtxRef.current;
    const sfxGain = sfxGainRef.current;
    if (!ctx || !sfxGain) return;

    // 1. Impact Tone (Low Sawtooth Drop)
    const osc = ctx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(80, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(10, ctx.currentTime + 0.3);

    const oscGain = ctx.createGain();
    oscGain.gain.setValueAtTime(0.5, ctx.currentTime);
    oscGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    osc.connect(oscGain);
    oscGain.connect(sfxGain);
    osc.start();
    osc.stop(ctx.currentTime + 0.4);

    // 2. Noise Burst (Crunch)
    const noise = ctx.createBufferSource();
    noise.buffer = sfxBufferRef.current || createNoiseBuffer(ctx, 1.0);

    const noiseFilter = ctx.createBiquadFilter();
    noiseFilter.type = 'lowpass';
    noiseFilter.frequency.value = 1000; // Muffled impact

    const noiseGain = ctx.createGain();
    noiseGain.gain.setValueAtTime(0.4, ctx.currentTime);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.3);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(sfxGain);
    noise.start();
  }, []);

  const playOpenSound = useCallback(() => {
    // "Whoomp" / Cloth catch air sound
    const ctx = audioCtxRef.current;
    const sfxGain = sfxGainRef.current;
    if (!ctx || !sfxGain) return;

    const noise = ctx.createBufferSource();
    noise.buffer = sfxBufferRef.current || createNoiseBuffer(ctx, 1.0);

    // Lowpass sweep 100Hz -> 600Hz (Deep air fill)
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(100, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(600, ctx.currentTime + 0.2);
    filter.Q.value = 1;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.4, ctx.currentTime + 0.05); // Attack
    gain.gain.linearRampToValueAtTime(0, ctx.currentTime + 0.3); // Decay

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    noise.start();
  }, []);

  const playCloseSound = useCallback(() => {
    // "Zip" / Fabric snap sound
    const ctx = audioCtxRef.current;
    const sfxGain = sfxGainRef.current;
    if (!ctx || !sfxGain) return;

    const noise = ctx.createBufferSource();
    noise.buffer = sfxBufferRef.current || createNoiseBuffer(ctx, 1.0);

    // Highpass sweep 800Hz -> 200Hz (Quick snap down)
    const filter = ctx.createBiquadFilter();
    filter.type = 'bandpass';
    filter.frequency.setValueAtTime(800, ctx.currentTime);
    filter.frequency.exponentialRampToValueAtTime(200, ctx.currentTime + 0.1);
    filter.Q.value = 2;

    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0, ctx.currentTime);
    gain.gain.linearRampToValueAtTime(0.3, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.01, ctx.currentTime + 0.15);

    noise.connect(filter);
    filter.connect(gain);
    gain.connect(sfxGain);
    noise.start();
  }, []);

  // Volume Control Effects
  useEffect(() => {
    if (masterGainRef.current) {
      const targetValue = isMuted ? 0 : masterVolume;
      masterGainRef.current.gain.setTargetAtTime(targetValue, audioCtxRef.current?.currentTime || 0, 0.05);
      localStorage.setItem('masterVolume', masterVolume.toString());
    }
  }, [masterVolume, isMuted]);

  useEffect(() => {
    if (musicGainRef.current) {
      musicGainRef.current.gain.setTargetAtTime(musicVolume, audioCtxRef.current?.currentTime || 0, 0.05);
      localStorage.setItem('musicVolume', musicVolume.toString());
    }
  }, [musicVolume]);

  useEffect(() => {
    if (sfxGainRef.current) {
      sfxGainRef.current.gain.setTargetAtTime(sfxVolume, audioCtxRef.current?.currentTime || 0, 0.05);
      localStorage.setItem('sfxVolume', sfxVolume.toString());
    }
  }, [sfxVolume]);

  // Save coins to localStorage
  useEffect(() => {
    localStorage.setItem('coins', coins.toString());
  }, [coins]);

  // Save unlocked items to localStorage
  useEffect(() => {
    localStorage.setItem('unlockedItems', JSON.stringify(unlockedItems));
  }, [unlockedItems]);

  // Save selected cosmetics to localStorage
  useEffect(() => {
    localStorage.setItem('selectedCosmetics', JSON.stringify(selectedCosmetics));
  }, [selectedCosmetics]);

  // Save difficulty mode to localStorage
  useEffect(() => {
    localStorage.setItem('difficultyMode', difficultyMode);
  }, [difficultyMode]);

  // Save dark mode to localStorage
  useEffect(() => {
    localStorage.setItem('darkMode', isDarkMode.toString());
  }, [isDarkMode]);

  // Save game mode to localStorage
  useEffect(() => {
    localStorage.setItem('gameMode', gameMode);
  }, [gameMode]);

  const handleCoinCollect = useCallback((amount: number) => {
    setCoins(prev => prev + amount);
  }, []);

  const handlePurchaseItem = (item: CosmeticItem) => {
    if (item.unlocked) return;
    if (coins < item.cost) return;

    // Deduct coins
    setCoins(prev => prev - item.cost);

    // Unlock item
    setUnlockedItems(prev => [...prev, item.id]);

    // Auto-equip the item
    if (item.type === 'umbrella_color') {
      setSelectedCosmetics(prev => ({ ...prev, umbrellaColor: item.value! }));
    } else if (item.type === 'hat') {
      setSelectedCosmetics(prev => ({ ...prev, hat: item.value! }));
    } else if (item.type === 'accessory') {
      setSelectedCosmetics(prev => ({ ...prev, accessory: item.value! }));
    } else if (item.type === 'trail') {
      setSelectedCosmetics(prev => ({ ...prev, trail: item.value! }));
    }
  };

  const handleEquipItem = (item: CosmeticItem) => {
    if (!item.unlocked) return;

    if (item.type === 'umbrella_color') {
      setSelectedCosmetics(prev => ({ ...prev, umbrellaColor: item.value! }));
    } else if (item.type === 'hat') {
      setSelectedCosmetics(prev => ({ ...prev, hat: item.value! }));
    } else if (item.type === 'accessory') {
      setSelectedCosmetics(prev => ({ ...prev, accessory: item.value! }));
    } else if (item.type === 'trail') {
      setSelectedCosmetics(prev => ({ ...prev, trail: item.value! }));
    }
  };

  const handleUnequipItem = (type: 'hat' | 'accessory' | 'trail') => {
    setSelectedCosmetics(prev => ({ ...prev, [type]: null }));
  };

  const handleStart = () => {
    // For Challenge mode, require level selection
    if (gameMode === 'CHALLENGE' && selectedChallengeLevel === null) {
      setShowChallengeLevels(true);
      return;
    }

    initAudio();
    if (audioCtxRef.current?.state === 'suspended') {
        audioCtxRef.current.resume();
    }

    // Initialize level progress for Challenge mode
    if (gameMode === 'CHALLENGE' && selectedChallengeLevel !== null) {
      const objectives = initializeLevelObjectives(selectedChallengeLevel);
      setLevelProgress({
        objectives,
        startTime: Date.now(),
        timeElapsed: 0
      });
    } else {
      setLevelProgress(null);
    }

    // CrazyGames
    reportGameplayStart();

    setGameState(GameState.PLAYING);
    setIsPaused(false);
    setScore(0);
    prevScoreRef.current = 0;
    setScorePulse(false);
    setShowNameInput(false);
    setScoreSubmitted(false);
    // Don't clear roast/snapshot here to allow smooth fade out of Game Over screen
  };

  const handleSelectGameMode = (mode: GameMode) => {
    setGameMode(mode);
    if (mode !== 'CHALLENGE') {
      setSelectedChallengeLevel(null);
      setShowChallengeLevels(false);
    }
  };

  const handleSelectChallengeLevel = (levelId: number) => {
    setSelectedChallengeLevel(levelId);
    setShowChallengeLevels(false);
  };

  const handlePause = () => {
    setIsPaused(true);
  };

  const handleResume = () => {
    setIsPaused(false);
    // Resume audio context if suspended
    if (audioCtxRef.current?.state === 'suspended') {
      audioCtxRef.current.resume();
    }
  };

  // Memoized to prevent GameCanvas loop restart jitter
  const handleScoreUpdate = useCallback((newScore: number) => {
    // Dynamic Pulse on milestones (every 50m)
    if (newScore > 0 && Math.floor(newScore / 50) > Math.floor(prevScoreRef.current / 50)) {
        setScorePulse(true);
        setTimeout(() => setScorePulse(false), 200);
    }
    
    prevScoreRef.current = newScore;
    setScore(newScore);
  }, []);

  const handleGameOver = async (finalScore: number, cause: string, snapshot: string) => {
    setGameState(GameState.GAME_OVER);
    setCrashSnapshot(snapshot);

    // CrazyGames
    reportGameplayStop();
    if (finalScore > highScore) {
        triggerHappyTime();
    }

    // Personal Best Update
    if (finalScore > highScore) {
      setHighScore(finalScore);
      localStorage.setItem('stickman_glide_highscore', finalScore.toString());
    }

    // Auto-submit Global High Score
    if (isHighScore(finalScore, leaderboard)) {
        // If user has a name set, auto-submit
        if (playerName && playerName.trim()) {
            setSubmittingScore(true);
            const userId = getUserId();
            const result = await submitScore(playerName, finalScore, userId);
            setSubmittingScore(false);

            if (result.success) {
                setScoreSubmitted(true);
                setShowNameInput(false);
                loadLeaderboard(); // Refresh leaderboard
            } else {
                setShowNameInput(true); // Show input on error for retry
            }
        } else {
            // No name set, show name input
            setShowNameInput(true);
        }
    } else {
        setShowNameInput(false);
    }

    // AI Roast
    setLoadingRoast(true);
    const comment = await getGameOverRoast(finalScore, cause);
    setRoast(comment);
    setLoadingRoast(false);
  };

  const handleScoreSubmit = async () => {
      // Use the player's current name (can be customized even if logged in)
      const nameToSubmit = playerName;

      if (!nameToSubmit.trim() || submittingScore) return;

      setSubmittingScore(true);
      const userId = getUserId();
      const result = await submitScore(nameToSubmit, score, userId);
      setSubmittingScore(false);

      if (result.success) {
          setScoreSubmitted(true);
          setShowNameInput(false);
          loadLeaderboard(); // Refresh list
      } else {
          alert(`Failed to save score: ${result.error}`);
      }
  };

  const handleShare = async () => {
      const shareData = {
          title: 'Stickman Umbrella Glide',
          text: `I plummeted ${score}m in Stickman Umbrella Glide! Can you beat my depth? ☂️📉 #StickmanGlide`,
          url: window.location.href
      };

      if (navigator.share) {
          try {
              await navigator.share(shareData);
          } catch (err) {
              console.log("Share cancelled");
          }
      } else {
          // Fallback copy
          navigator.clipboard.writeText(shareData.text + ' ' + shareData.url);
          alert("Score copied to clipboard!");
      }
  };

  const handleCrazyGamesLogin = async () => {
    try {
      const user = await crazyGamesLogin();

      if (user) {
        setCrazyUser(user);
        // Keep auto-generated name, don't override
      }
    } catch (error) {
      console.error('Unexpected error during login:', error);
    }
  };

  const handleRegenerateName = () => {
    const newName = generateShortUniqueName();
    setPlayerName(newName);
    localStorage.setItem('playerName', newName);
  };

  const handleGoHome = () => {
    setGameState(GameState.START);
    setRoast('');
    setCrashSnapshot(null);
    setShowNameInput(false);
    setScoreSubmitted(false);
    loadLeaderboard(); // Refresh leaderboard when returning home
  };

  const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`I plummeted ${score}m in Stickman Umbrella Glide! Can you beat my depth? ☂️📉 #StickmanGlide`)}`;

  return (
    <div className="relative w-full h-screen bg-gray-900 overflow-hidden font-sans text-white selection:bg-transparent">
      
      {/* Game Layer */}
      <GameCanvas
        gameState={gameState}
        isPaused={isPaused}
        onScoreUpdate={handleScoreUpdate}
        onGameOver={handleGameOver}
        onCoinCollect={handleCoinCollect}
        playerCosmetics={selectedCosmetics}
        difficultyMode={difficultyMode}
        isDarkMode={isDarkMode}
        gameMode={gameMode}
        selectedChallengeLevel={selectedChallengeLevel}
        levelProgress={levelProgress}
        onLevelProgressUpdate={setLevelProgress}
        playCrashSound={playCrashSound}
        playOpenSound={playOpenSound}
        playCloseSound={playCloseSound}
      />

      {/* HUD */}
      <div className={`absolute top-0 left-0 w-full p-6 flex justify-between items-start pointer-events-none z-20 transition-opacity duration-500 ${gameState === GameState.PLAYING && !isPaused ? 'opacity-100' : 'opacity-0'}`}>
          <div className="flex flex-col gap-4">
             <div>
               <span className="text-gray-400 text-sm font-bold tracking-wider shadow-black drop-shadow-sm">DEPTH</span>
               <div className={`text-4xl font-black text-white drop-shadow-md tabular-nums transition-all duration-150 ${scorePulse ? 'scale-125 text-blue-300' : 'scale-100'}`}>
                  {score}m
               </div>
             </div>
             <div>
               <span className="text-gray-400 text-sm font-bold tracking-wider shadow-black drop-shadow-sm">COINS</span>
               <div className="text-2xl font-black text-yellow-400 drop-shadow-md tabular-nums flex items-center gap-1">
                  <span className="text-3xl">💰</span> {coins}
               </div>
             </div>
          </div>
          <div className="flex flex-col items-end gap-3">
             <div className="flex gap-2">
               <button
                 onClick={handlePause}
                 className="pointer-events-auto bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white font-bold px-4 py-2 rounded-lg border border-white/20 transition-all hover:scale-105 flex items-center gap-2"
               >
                 <span className="text-xl">⏸️</span>
                 <span className="text-sm">PAUSE</span>
               </button>
               <button
                 onClick={() => setIsDarkMode(!isDarkMode)}
                 className="pointer-events-auto bg-black/60 hover:bg-black/80 backdrop-blur-sm text-white font-bold px-3 py-2 rounded-lg border border-white/20 transition-all hover:scale-105"
                 title={isDarkMode ? 'Switch to Day Mode' : 'Switch to Night Mode'}
               >
                 <span className="text-xl">{isDarkMode ? '☀️' : '🌙'}</span>
               </button>
             </div>
             <div className="text-right">
               <span className="text-gray-400 text-sm font-bold tracking-wider shadow-black drop-shadow-sm">RECORD</span>
               <div className="text-xl font-bold text-yellow-400 drop-shadow-md tabular-nums">{highScore}m</div>
               {crazyUser && (
                  <span className="text-xs text-blue-300 mt-1 font-bold block">Logged in as: {crazyUser.username}</span>
               )}
             </div>
          </div>
      </div>

      {/* Start Screen */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/60 backdrop-blur-sm z-30 transition-all duration-700 ${gameState === GameState.START ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          {/* Animated Falling Stickman */}
          {gameState === GameState.START && <HomeStickman />}

          <div className="flex flex-col md:flex-row gap-8 items-center max-w-4xl w-full p-4">

              {/* Left Column: Title & Play */}
              <div className="text-center md:text-left flex-1">
                <h1 className="text-6xl font-black mb-2 text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500 transform -rotate-2 animate-float">
                UMBRELLA<br/>GLIDE
                </h1>
                <p className="text-gray-300 mb-8 text-lg">
                Hold to <span className="text-blue-400 font-bold">Open Umbrella</span> (Slow)<br/>
                Release to <span className="text-red-400 font-bold">Dive</span> (Fast)<br/>
                Drag to Move
                </p>
                
                <button
                onClick={handleStart}
                className="group relative inline-flex h-16 w-full md:w-64 items-center justify-center overflow-hidden rounded-full bg-white font-medium text-black transition-all duration-300 hover:scale-105 hover:bg-blue-400 hover:text-white focus:outline-none focus:ring-4 focus:ring-blue-400/50"
                >
                <span className="mr-2 text-xl font-bold">DROP!</span>
                <svg className="h-6 w-6 transition-transform duration-300 group-hover:translate-y-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 14l-7 7m0 0l-7-7m7 7V3" />
                </svg>
                </button>

                <button
                onClick={() => setShowShop(true)}
                className="mt-4 group relative inline-flex h-14 w-full md:w-64 items-center justify-center overflow-hidden rounded-full bg-gradient-to-r from-yellow-400 to-orange-500 font-medium text-black transition-all duration-300 hover:scale-105 focus:outline-none focus:ring-4 focus:ring-yellow-400/50 pointer-events-auto"
                >
                <span className="mr-2 text-lg font-bold">🛍️ SHOP</span>
                <span className="text-xs bg-black/20 px-2 py-0.5 rounded-full">{coins} coins</span>
                </button>

                <div className="mt-6 space-y-2">
                    <div className="text-xs text-gray-500 uppercase tracking-widest">
                        Your Personal Best: {highScore}m
                    </div>
                    
                    {!crazyUser ? (
                        <button
                        onClick={handleCrazyGamesLogin}
                        className="text-xs font-bold text-blue-300 hover:text-white underline decoration-blue-500/50 underline-offset-4"
                        >
                        LOGIN WITH CRAZYGAMES
                        </button>
                    ) : (
                        <div className="text-xs font-bold text-green-400">
                             Logged in as {crazyUser.username}
                        </div>
                    )}

                    {/* Player Name Display with Regenerate */}
                    <div className="mt-3 pt-3 border-t border-white/10">
                        <div className="flex flex-col items-center gap-2">
                            <div className="text-center">
                                <div className="text-xs text-gray-400 mb-1">Your Unique Name</div>
                                <div className="text-sm font-bold text-blue-300 bg-black/40 px-3 py-1.5 rounded border border-blue-400/30">
                                    {playerName}
                                </div>
                            </div>
                            <button
                                onClick={handleRegenerateName}
                                className="text-xs font-bold text-yellow-300 hover:text-yellow-100 underline decoration-yellow-500/50 underline-offset-4 flex items-center gap-1"
                            >
                                <span>🎲</span>
                                <span>Generate New Name</span>
                            </button>
                        </div>
                    </div>

                    {/* Game Mode Selector */}
                    <div className="mt-3 pt-3 border-t border-white/10 pointer-events-auto">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-3 text-center">
                            Game Mode
                        </div>
                        <div className="space-y-2">
                            <button
                                onClick={() => handleSelectGameMode('ENDLESS')}
                                className={`w-full py-3 px-4 rounded-lg text-left transition-all ${
                                    gameMode === 'ENDLESS'
                                        ? 'bg-blue-500 text-white scale-105 shadow-lg shadow-blue-500/50'
                                        : 'bg-black/40 text-gray-300 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🎯</span>
                                    <div className="flex-1">
                                        <div className="font-bold text-sm">Endless Mode</div>
                                        <div className="text-xs opacity-80">Survive as long as possible</div>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => handleSelectGameMode('STORM')}
                                className={`w-full py-3 px-4 rounded-lg text-left transition-all ${
                                    gameMode === 'STORM'
                                        ? 'bg-purple-500 text-white scale-105 shadow-lg shadow-purple-500/50'
                                        : 'bg-black/40 text-gray-300 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🌀</span>
                                    <div className="flex-1">
                                        <div className="font-bold text-sm">Storm Mode</div>
                                        <div className="text-xs opacity-80">Hardcore · 3x Score · Free Shield</div>
                                    </div>
                                </div>
                            </button>

                            <button
                                onClick={() => gameMode === 'CHALLENGE' ? setShowChallengeLevels(true) : handleSelectGameMode('CHALLENGE')}
                                className={`w-full py-3 px-4 rounded-lg text-left transition-all ${
                                    gameMode === 'CHALLENGE'
                                        ? 'bg-yellow-500 text-black scale-105 shadow-lg shadow-yellow-500/50'
                                        : 'bg-black/40 text-gray-300 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                <div className="flex items-center gap-2">
                                    <span className="text-xl">🪂</span>
                                    <div className="flex-1">
                                        <div className="font-bold text-sm">Challenge Levels</div>
                                        <div className="text-xs opacity-80">
                                            {selectedChallengeLevel
                                                ? `Level ${selectedChallengeLevel} Selected`
                                                : '5 Handcrafted Missions'
                                            }
                                        </div>
                                    </div>
                                    {gameMode === 'CHALLENGE' && (
                                        <span className="text-sm">▶</span>
                                    )}
                                </div>
                            </button>
                        </div>
                    </div>

                    {/* Difficulty Selector - Only show for Endless and Storm modes */}
                    {gameMode !== 'CHALLENGE' && (
                    <div className="mt-3 pt-3 border-t border-white/10 pointer-events-auto">
                        <div className="text-xs text-gray-400 uppercase tracking-widest mb-2 text-center">
                            Difficulty
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={() => setDifficultyMode('EASY')}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                                    difficultyMode === 'EASY'
                                        ? 'bg-green-500 text-white scale-105'
                                        : 'bg-black/40 text-gray-400 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                😊 EASY
                            </button>
                            <button
                                onClick={() => setDifficultyMode('MEDIUM')}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                                    difficultyMode === 'MEDIUM'
                                        ? 'bg-yellow-500 text-black scale-105'
                                        : 'bg-black/40 text-gray-400 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                😐 MEDIUM
                            </button>
                            <button
                                onClick={() => setDifficultyMode('HARD')}
                                className={`flex-1 py-2 px-3 rounded-lg text-xs font-bold transition-all ${
                                    difficultyMode === 'HARD'
                                        ? 'bg-red-500 text-white scale-105'
                                        : 'bg-black/40 text-gray-400 hover:bg-black/60 border border-white/20'
                                }`}
                            >
                                😈 HARD
                            </button>
                        </div>
                    </div>
                    )}
                </div>
              </div>

              {/* Right Column: Leaderboard */}
              <div className="w-full md:w-80 bg-white/5 border border-white/10 rounded-2xl p-4 backdrop-blur-md shadow-xl flex flex-col h-96">
                  <h3 className="text-center text-sm font-bold text-blue-300 tracking-widest uppercase mb-4 border-b border-white/10 pb-2">Global Top 10</h3>
                  
                  <div className="flex-1 overflow-y-auto scrollbar-hide space-y-2">
                    {leaderboard.length === 0 ? (
                        <div className="text-center text-gray-400 py-8">
                          <div className="text-4xl mb-3">🏆</div>
                          <p className="text-sm font-bold mb-1">No Scores Yet!</p>
                          <p className="text-xs text-gray-500">Be the first to make it<br/>to the leaderboard</p>
                        </div>
                    ) : (
                        leaderboard.map((entry, index) => (
                            <div key={entry.id || index} className="flex justify-between items-center bg-white/5 px-3 py-2 rounded hover:bg-white/10 transition-colors">
                                <div className="flex items-center gap-3">
                                    <span className={`font-mono text-sm font-bold w-4 text-center ${index === 0 ? 'text-yellow-400' : index === 1 ? 'text-gray-300' : index === 2 ? 'text-orange-400' : 'text-gray-500'}`}>
                                        {index + 1}
                                    </span>
                                    <div className="flex flex-col">
                                      <span className="text-sm font-medium truncate max-w-[100px] text-gray-200">
                                          {entry.name}
                                      </span>
                                      {entry.userId === getUserId() && (
                                        <span className="text-[10px] text-blue-400">You</span>
                                      )}
                                    </div>
                                </div>
                                <span className="text-sm font-bold text-blue-200 tabular-nums">{entry.score}m</span>
                            </div>
                        ))
                    )}
                  </div>
              </div>

          </div>
      </div>

      {/* Shop Modal */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 transition-all duration-300 ${showShop ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-yellow-400/30 rounded-3xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">SHOP</h2>
              <p className="text-sm text-gray-400 mt-1">Customize your stickman!</p>
            </div>
            <div className="flex items-center gap-4">
              <div className="bg-black/40 px-4 py-2 rounded-full border border-yellow-400/30">
                <span className="text-yellow-400 font-bold text-xl">💰 {coins}</span>
              </div>
              <button
                onClick={() => setShowShop(false)}
                className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-400 transition-colors"
              >
                <span className="text-white text-xl font-bold">×</span>
              </button>
            </div>
          </div>

          {/* Shop Content */}
          <div className="flex-1 overflow-y-auto space-y-6 pr-2">
            {/* Umbrella Colors */}
            <div>
              <h3 className="text-xl font-bold text-blue-300 mb-3 flex items-center gap-2">
                <span>☂️</span> Umbrella Colors
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {shopItems.filter(item => item.type === 'umbrella_color').map(item => {
                  const isEquipped = selectedCosmetics.umbrellaColor === item.value;
                  return (
                    <div
                      key={item.id}
                      className={`bg-black/40 border-2 ${isEquipped ? 'border-green-400' : item.unlocked ? 'border-white/20' : 'border-gray-600'} rounded-xl p-3 transition-all hover:scale-105`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <div className="w-8 h-8 rounded-full" style={{ backgroundColor: item.value === 'rainbow' ? '#ff0000' : item.value }}></div>
                        {isEquipped && <span className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold">EQUIPPED</span>}
                      </div>
                      <p className="text-sm font-bold text-white mb-1">{item.name}</p>
                      {item.unlocked ? (
                        !isEquipped && (
                          <button
                            onClick={() => handleEquipItem(item)}
                            className="w-full py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded font-bold"
                          >
                            Equip
                          </button>
                        )
                      ) : (
                        <button
                          onClick={() => handlePurchaseItem(item)}
                          disabled={coins < item.cost}
                          className={`w-full py-1 text-xs rounded font-bold ${coins >= item.cost ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                        >
                          {item.cost} 💰
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Hats */}
            <div>
              <h3 className="text-xl font-bold text-purple-300 mb-3 flex items-center gap-2">
                <span>🎩</span> Hats
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {shopItems.filter(item => item.type === 'hat').map(item => {
                  const isEquipped = selectedCosmetics.hat === item.value;
                  return (
                    <div
                      key={item.id}
                      className={`bg-black/40 border-2 ${isEquipped ? 'border-green-400' : item.unlocked ? 'border-white/20' : 'border-gray-600'} rounded-xl p-3 transition-all hover:scale-105`}
                    >
                      <div className="text-center mb-2">
                        <span className="text-3xl">{item.value === 'cap' ? '🧢' : item.value === 'tophat' ? '🎩' : item.value === 'crown' ? '👑' : '😇'}</span>
                      </div>
                      {isEquipped && <div className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold text-center mb-1">EQUIPPED</div>}
                      <p className="text-xs font-bold text-white mb-1 text-center">{item.name}</p>
                      {item.unlocked ? (
                        <div className="flex gap-1">
                          {!isEquipped && (
                            <button
                              onClick={() => handleEquipItem(item)}
                              className="flex-1 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded font-bold"
                            >
                              Equip
                            </button>
                          )}
                          {isEquipped && (
                            <button
                              onClick={() => handleUnequipItem('hat')}
                              className="flex-1 py-1 text-xs bg-red-500 hover:bg-red-400 rounded font-bold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchaseItem(item)}
                          disabled={coins < item.cost}
                          className={`w-full py-1 text-xs rounded font-bold ${coins >= item.cost ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                        >
                          {item.cost} 💰
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Accessories */}
            <div>
              <h3 className="text-xl font-bold text-green-300 mb-3 flex items-center gap-2">
                <span>✨</span> Accessories
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {shopItems.filter(item => item.type === 'accessory').map(item => {
                  const isEquipped = selectedCosmetics.accessory === item.value;
                  return (
                    <div
                      key={item.id}
                      className={`bg-black/40 border-2 ${isEquipped ? 'border-green-400' : item.unlocked ? 'border-white/20' : 'border-gray-600'} rounded-xl p-3 transition-all hover:scale-105`}
                    >
                      <div className="text-center mb-2">
                        <span className="text-3xl">{item.value === 'scarf' ? '🧣' : item.value === 'headphones' ? '🎧' : item.value === 'cape' ? '🦸' : '🕶️'}</span>
                      </div>
                      {isEquipped && <div className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold text-center mb-1">EQUIPPED</div>}
                      <p className="text-xs font-bold text-white mb-1 text-center">{item.name}</p>
                      {item.unlocked ? (
                        <div className="flex gap-1">
                          {!isEquipped && (
                            <button
                              onClick={() => handleEquipItem(item)}
                              className="flex-1 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded font-bold"
                            >
                              Equip
                            </button>
                          )}
                          {isEquipped && (
                            <button
                              onClick={() => handleUnequipItem('accessory')}
                              className="flex-1 py-1 text-xs bg-red-500 hover:bg-red-400 rounded font-bold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchaseItem(item)}
                          disabled={coins < item.cost}
                          className={`w-full py-1 text-xs rounded font-bold ${coins >= item.cost ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                        >
                          {item.cost} 💰
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Trails */}
            <div>
              <h3 className="text-xl font-bold text-pink-300 mb-3 flex items-center gap-2">
                <span>✨</span> Umbrella Trails
              </h3>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                {shopItems.filter(item => item.type === 'trail').map(item => {
                  const isEquipped = selectedCosmetics.trail === item.value;
                  return (
                    <div
                      key={item.id}
                      className={`bg-black/40 border-2 ${isEquipped ? 'border-green-400' : item.unlocked ? 'border-white/20' : 'border-gray-600'} rounded-xl p-3 transition-all hover:scale-105`}
                    >
                      <div className="text-center mb-2">
                        <span className="text-3xl">{item.value === 'sparkle' ? '✨' : item.value === 'cloud' ? '☁️' : item.value === 'rainbow' ? '🌈' : '🔥'}</span>
                      </div>
                      {isEquipped && <div className="text-xs bg-green-500 text-white px-2 py-0.5 rounded-full font-bold text-center mb-1">EQUIPPED</div>}
                      <p className="text-xs font-bold text-white mb-1 text-center">{item.name}</p>
                      {item.unlocked ? (
                        <div className="flex gap-1">
                          {!isEquipped && (
                            <button
                              onClick={() => handleEquipItem(item)}
                              className="flex-1 py-1 text-xs bg-blue-500 hover:bg-blue-400 rounded font-bold"
                            >
                              Equip
                            </button>
                          )}
                          {isEquipped && (
                            <button
                              onClick={() => handleUnequipItem('trail')}
                              className="flex-1 py-1 text-xs bg-red-500 hover:bg-red-400 rounded font-bold"
                            >
                              Remove
                            </button>
                          )}
                        </div>
                      ) : (
                        <button
                          onClick={() => handlePurchaseItem(item)}
                          disabled={coins < item.cost}
                          className={`w-full py-1 text-xs rounded font-bold ${coins >= item.cost ? 'bg-yellow-500 hover:bg-yellow-400 text-black' : 'bg-gray-600 text-gray-400 cursor-not-allowed'}`}
                        >
                          {item.cost} 💰
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Challenge Levels Selection Modal */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/80 backdrop-blur-md z-50 transition-all duration-300 ${showChallengeLevels ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
        <div className="bg-gradient-to-br from-gray-900 to-gray-800 border-2 border-yellow-400/30 rounded-3xl p-6 max-w-4xl w-full mx-4 max-h-[90vh] overflow-hidden flex flex-col shadow-2xl">
          {/* Header */}
          <div className="flex justify-between items-center mb-6 pb-4 border-b border-white/10">
            <div>
              <h2 className="text-3xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">CHALLENGE LEVELS</h2>
              <p className="text-sm text-gray-400 mt-1">Complete objectives to win!</p>
            </div>
            <button
              onClick={() => setShowChallengeLevels(false)}
              className="w-10 h-10 flex items-center justify-center rounded-full bg-red-500 hover:bg-red-400 transition-colors"
            >
              <span className="text-white text-xl font-bold">×</span>
            </button>
          </div>

          {/* Levels Grid */}
          <div className="flex-1 overflow-y-auto space-y-3 pr-2">
            {CHALLENGE_LEVELS.map(level => (
              <button
                key={level.id}
                onClick={() => handleSelectChallengeLevel(level.id)}
                className={`w-full p-4 rounded-xl text-left transition-all ${
                  selectedChallengeLevel === level.id
                    ? 'bg-gradient-to-r from-yellow-500 to-orange-500 text-black scale-105 shadow-lg shadow-yellow-500/50'
                    : 'bg-black/40 hover:bg-black/60 border border-white/20 text-white hover:border-yellow-400/50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div className="text-3xl">{
                    level.theme === 'GENTLE' ? '🌤️' :
                    level.theme === 'NIGHT' ? '🌙' :
                    level.theme === 'THUNDER' ? '⚡' :
                    level.theme === 'TORNADO' ? '🌪️' :
                    '🚀'
                  }</div>
                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <span className={`text-xs font-bold px-2 py-0.5 rounded ${
                        selectedChallengeLevel === level.id ? 'bg-black/30 text-white' : 'bg-yellow-500/20 text-yellow-400'
                      }`}>
                        LEVEL {level.id}
                      </span>
                      <h3 className="font-bold text-lg">{level.name}</h3>
                    </div>
                    <p className={`text-sm mb-3 ${selectedChallengeLevel === level.id ? 'text-black/80' : 'text-gray-400'}`}>
                      {level.description}
                    </p>
                    <div className="space-y-1">
                      <div className={`text-xs font-bold uppercase tracking-wider mb-1 ${
                        selectedChallengeLevel === level.id ? 'text-black/70' : 'text-gray-500'
                      }`}>
                        Objectives:
                      </div>
                      {level.objectives.map((obj, idx) => (
                        <div key={idx} className={`text-xs flex items-start gap-2 ${
                          selectedChallengeLevel === level.id ? 'text-black/90' : 'text-gray-300'
                        }`}>
                          <span>•</span>
                          <span>{obj.description}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  {selectedChallengeLevel === level.id && (
                    <div className="text-2xl">✓</div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* Footer */}
          <div className="mt-4 pt-4 border-t border-white/10 flex justify-between items-center">
            <p className="text-xs text-gray-400">
              {selectedChallengeLevel ? 'Level selected! Click START to begin' : 'Select a level to continue'}
            </p>
            <button
              onClick={() => {
                setShowChallengeLevels(false);
                if (selectedChallengeLevel) {
                  handleStart();
                }
              }}
              disabled={!selectedChallengeLevel}
              className={`px-6 py-2 rounded-lg font-bold ${
                selectedChallengeLevel
                  ? 'bg-green-500 hover:bg-green-400 text-white'
                  : 'bg-gray-600 text-gray-400 cursor-not-allowed'
              }`}
            >
              START LEVEL
            </button>
          </div>
        </div>
      </div>

      {/* Game Over Screen */}
      <div className={`absolute inset-0 flex items-center justify-center bg-red-900/90 backdrop-blur-md z-40 transition-all duration-700 ${gameState === GameState.GAME_OVER ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-black/50 p-6 rounded-3xl border border-white/10 shadow-2xl max-w-sm w-full text-center relative overflow-hidden">
            
            <h2 className="text-4xl font-black text-white mb-1 uppercase tracking-widest">Wasted</h2>
            <div className="text-5xl font-black text-yellow-400 mb-4 tracking-tighter drop-shadow-lg">
              {score}m
            </div>

            {/* High Score Input */}
            {showNameInput && !scoreSubmitted && (
                 <div className="mb-4 bg-green-500/20 p-3 rounded-xl border border-green-500/30 animate-pulse-slow">
                     <p className="text-green-300 text-xs font-bold uppercase tracking-wider mb-2">New Global High Score!</p>
                     <div className="flex gap-2">
                         <input
                            type="text"
                            placeholder="ENTER NAME"
                            maxLength={10}
                            value={playerName}
                            onChange={(e) => setPlayerName(e.target.value.toUpperCase())}
                            className="flex-1 bg-black/40 text-white px-3 py-2 rounded text-sm font-bold tracking-wider outline-none border border-transparent focus:border-green-400 placeholder-gray-600"
                         />
                         <button
                            onClick={handleScoreSubmit}
                            disabled={submittingScore || !playerName}
                            className="bg-green-500 hover:bg-green-400 disabled:opacity-50 disabled:cursor-not-allowed text-black font-bold px-3 py-2 rounded text-sm"
                         >
                             {submittingScore ? '...' : 'SAVE'}
                         </button>
                     </div>
                 </div>
            )}
            {submittingScore && !scoreSubmitted && (
                <div className="mb-4 bg-blue-500/20 p-3 rounded-xl border border-blue-500/30">
                    <p className="text-blue-300 text-xs font-bold uppercase tracking-wider">Saving High Score...</p>
                </div>
            )}
            {scoreSubmitted && (
                <div className="mb-4 bg-green-500/20 p-3 rounded-xl border border-green-500/30">
                    <p className="text-green-300 text-xs font-bold uppercase tracking-wider flex items-center justify-center gap-2">
                        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd"/>
                        </svg>
                        High Score Saved to Leaderboard!
                    </p>
                </div>
            )}

            {/* Crash Snapshot */}
            {crashSnapshot && (
                <div className="relative w-48 h-32 mx-auto mb-4 rotate-2 p-2 bg-white shadow-lg transform transition hover:scale-110 hover:rotate-0 duration-300 cursor-pointer">
                     <div className="w-full h-full overflow-hidden bg-gray-800">
                        <img src={crashSnapshot} className="w-full h-full object-cover" alt="Crash Site" />
                     </div>
                     <div className="text-[8px] text-gray-500 text-center mt-1 font-mono leading-none">EVIDENCE #{Math.floor(Math.random()*9000)+1000}</div>
                </div>
            )}
            
            {/* Roast Box */}
            <div className="bg-white/10 rounded-xl p-3 mb-4 min-h-[60px] flex items-center justify-center border border-white/5">
              {loadingRoast ? (
                 <div className="animate-pulse flex space-x-1">
                    <div className="h-1.5 w-1.5 bg-blue-300 rounded-full"></div>
                    <div className="h-1.5 w-1.5 bg-blue-300 rounded-full"></div>
                    <div className="h-1.5 w-1.5 bg-blue-300 rounded-full"></div>
                 </div>
              ) : (
                <p className="text-blue-200 italic text-sm font-medium leading-snug">
                  "{roast}"
                </p>
              )}
            </div>

            {/* Player Name Display - Game Over Screen */}
            <div className="mb-4 bg-white/5 rounded-xl p-3 border border-white/10">
              <div className="flex flex-col items-center gap-2">
                <div className="text-center">
                  <div className="text-xs text-gray-400 mb-1">Your Unique Name</div>
                  <div className="text-sm font-bold text-blue-300 bg-black/40 px-3 py-1.5 rounded border border-blue-400/30">
                    {playerName}
                  </div>
                </div>
                <button
                  onClick={handleRegenerateName}
                  className="text-xs font-bold text-yellow-300 hover:text-yellow-100 underline decoration-yellow-500/50 underline-offset-4 flex items-center gap-1"
                >
                  <span>🎲</span>
                  <span>Generate New Name</span>
                </button>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="grid grid-cols-2 gap-3 mb-4">
                <a 
                   href={twitterUrl}
                   target="_blank"
                   rel="noopener noreferrer"
                   className="flex items-center justify-center py-3 bg-[#1DA1F2] hover:bg-[#1a91da] rounded-xl font-bold text-sm transition-colors"
                >
                    Share on X
                </a>
                <button 
                   onClick={handleShare}
                   className="flex items-center justify-center py-3 bg-gray-700 hover:bg-gray-600 rounded-xl font-bold text-sm transition-colors"
                >
                    Share / Copy
                </button>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <button
                onClick={handleGoHome}
                className="py-4 bg-gray-700 hover:bg-gray-600 text-white font-bold text-lg rounded-xl hover:scale-[1.02] transition-all"
              >
                Go Home
              </button>
              <button
                onClick={handleStart}
                className="py-4 bg-white text-black font-bold text-lg rounded-xl hover:bg-gray-200 hover:scale-[1.02] transition-all shadow-lg shadow-white/10"
              >
                Restart
              </button>
            </div>
          </div>
      </div>

      {/* Pause Screen */}
      <div className={`absolute inset-0 flex items-center justify-center bg-black/70 backdrop-blur-md z-40 transition-all duration-300 ${gameState === GameState.PLAYING && isPaused ? 'opacity-100 pointer-events-auto' : 'opacity-0 pointer-events-none'}`}>
          <div className="bg-gradient-to-br from-gray-900 to-gray-800 p-8 rounded-3xl border-2 border-blue-400/30 shadow-2xl max-w-md w-full text-center">
            <h2 className="text-5xl font-black text-white mb-2 uppercase tracking-widest">Paused</h2>
            <div className="text-6xl mb-6">⏸️</div>

            <div className="bg-white/5 rounded-xl p-4 mb-6 border border-white/10">
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Current Depth</span>
                <span className="text-white font-bold text-xl">{score}m</span>
              </div>
              <div className="flex justify-between items-center mb-2">
                <span className="text-gray-400 text-sm">Coins Collected</span>
                <span className="text-yellow-400 font-bold text-xl">💰 {coins}</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-gray-400 text-sm">Difficulty</span>
                <span className={`font-bold text-sm ${difficultyMode === 'EASY' ? 'text-green-400' : difficultyMode === 'MEDIUM' ? 'text-yellow-400' : 'text-red-400'}`}>
                  {difficultyMode === 'EASY' ? '😊 EASY' : difficultyMode === 'MEDIUM' ? '😐 MEDIUM' : '😈 HARD'}
                </span>
              </div>
            </div>

            <div className="space-y-3">
              <button
                onClick={handleResume}
                className="w-full py-4 bg-gradient-to-r from-blue-500 to-purple-500 hover:from-blue-600 hover:to-purple-600 text-white font-bold text-lg rounded-xl hover:scale-[1.02] transition-all shadow-lg flex items-center justify-center gap-2"
              >
                <span className="text-2xl">▶️</span>
                <span>Resume Game</span>
              </button>

              <button
                onClick={handleStart}
                className="w-full py-3 bg-gray-700 hover:bg-gray-600 text-white font-bold text-base rounded-xl hover:scale-[1.02] transition-all"
              >
                🔄 Restart
              </button>

              <button
                onClick={handleGoHome}
                className="w-full py-3 bg-gray-800 hover:bg-gray-700 text-white font-bold text-base rounded-xl hover:scale-[1.02] transition-all border border-white/10"
              >
                🏠 Go Home
              </button>
            </div>
          </div>
      </div>

      {/* Tutorial / Controls Hint */}
      <div className={`absolute bottom-10 left-0 w-full text-center pointer-events-none z-20 transition-opacity duration-500 ${gameState === GameState.PLAYING && !isPaused && score < 50 ? 'opacity-100' : 'opacity-0'}`}>
         <div className="animate-bounce">
            <p className="text-white/50 text-sm font-medium">Hold to Glide • Release to Dive</p>
         </div>
      </div>

      {/* Volume Controls Panel */}
      <div className="absolute bottom-2 left-2 z-50 pointer-events-auto">
        {showVolumeControls && (
          <div className="bg-black/90 text-white p-4 rounded-lg text-xs mb-2 border border-white/20 w-64">
            <div className="font-bold mb-3 flex items-center justify-between">
              <span>🎵 Audio Settings</span>
              <button
                onClick={() => {
                  if (!audioCtxRef.current) initAudio();
                  setIsMuted(!isMuted);
                }}
                className={`px-2 py-1 rounded ${isMuted ? 'bg-red-500 hover:bg-red-600' : 'bg-green-500 hover:bg-green-600'}`}
              >
                {isMuted ? '🔇 Muted' : '🔊 On'}
              </button>
            </div>

            {/* Master Volume */}
            <div className="mb-3">
              <label className="flex justify-between mb-1">
                <span>Master Volume</span>
                <span className="text-blue-300">{Math.round(masterVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={masterVolume}
                onChange={(e) => {
                  if (!audioCtxRef.current) initAudio();
                  setMasterVolume(parseFloat(e.target.value));
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
              />
            </div>

            {/* Music Volume */}
            <div className="mb-3">
              <label className="flex justify-between mb-1">
                <span>🎶 Music</span>
                <span className="text-purple-300">{Math.round(musicVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={musicVolume}
                onChange={(e) => {
                  if (!audioCtxRef.current) initAudio();
                  setMusicVolume(parseFloat(e.target.value));
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-purple-500"
              />
            </div>

            {/* SFX Volume */}
            <div className="mb-3">
              <label className="flex justify-between mb-1">
                <span>🎧 Sound Effects</span>
                <span className="text-green-300">{Math.round(sfxVolume * 100)}%</span>
              </label>
              <input
                type="range"
                min="0"
                max="1"
                step="0.01"
                value={sfxVolume}
                onChange={(e) => {
                  if (!audioCtxRef.current) initAudio();
                  setSfxVolume(parseFloat(e.target.value));
                }}
                className="w-full h-2 bg-gray-700 rounded-lg appearance-none cursor-pointer accent-green-500"
              />
            </div>

            {/* Music Track Switcher */}
            <div className="border-t border-white/10 pt-3">
              <label className="text-xs text-gray-400 mb-2 block">Current Track</label>
              <button
                onClick={switchMusicTrack}
                className="w-full bg-gradient-to-r from-purple-500 to-pink-500 hover:from-purple-600 hover:to-pink-600 text-white font-bold py-2 px-3 rounded-lg text-xs transition-all flex items-center justify-between"
              >
                <span>🎵 {currentMusicTrack === 'Stickman Glide.mp3' ? 'Track 1' : 'Track 2'}</span>
                <span className="text-[10px] opacity-75">Click to Switch</span>
              </button>
            </div>
          </div>
        )}
        <button
          onClick={() => setShowVolumeControls(!showVolumeControls)}
          className="bg-gray-700 hover:bg-gray-600 text-white px-3 py-2 rounded-lg text-xs flex items-center gap-2"
        >
          {showVolumeControls ? '🔽' : '🎵'} {showVolumeControls ? 'Hide' : 'Volume'}
        </button>
      </div>

      {/* Debug Panel */}
      <div className="absolute bottom-2 right-2 z-50 pointer-events-auto">
        {showDebugPanel && (
          <div className="bg-black/90 text-white p-3 rounded-lg text-xs font-mono mb-2 border border-white/20">
            <div className="font-bold mb-2">CrazyGames SDK Debug</div>
            <div>Initialized: {getCrazyGamesSDKStatus().sdkInitialized ? '✅' : '❌'}</div>
            <div>SDK Available: {getCrazyGamesSDKStatus().sdkAvailable ? '✅' : '❌'}</div>
            <div>SDK Object: {getCrazyGamesSDKStatus().sdkObject}</div>
            <div>User: {crazyUser ? `✅ ${crazyUser.username}` : '❌ Not logged in'}</div>
            <button
              onClick={async () => {
                console.log('=== MANUAL SDK TEST ===');
                console.log('Status:', getCrazyGamesSDKStatus());
                console.log('Window.CrazyGames:', window.CrazyGames);
                const user = await getCrazyGamesUser();
                console.log('Current user:', user);
              }}
              className="mt-2 bg-blue-500 hover:bg-blue-600 px-2 py-1 rounded text-xs w-full"
            >
              Test SDK
            </button>
          </div>
        )}
      
      </div>

    </div>
  );
};

export default App;