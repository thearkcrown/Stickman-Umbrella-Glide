import { ChallengeLevel, ChallengObjective } from '../types';

/**
 * Challenge Levels Configuration
 * Handcrafted levels with specific objectives and themes
 */

export const CHALLENGE_LEVELS: ChallengeLevel[] = [
  // Level 1: Gentle Breeze
  {
    id: 1,
    name: 'Gentle Breeze',
    description: 'Learn the basics with calm skies and gentle winds',
    theme: 'GENTLE',
    targetDepth: 500,
    coinGoal: 10,
    objectives: [
      {
        type: 'REACH_DEPTH',
        description: 'Reach 500m depth',
        target: 500,
        current: 0,
        completed: false
      },
      {
        type: 'COLLECT_COINS',
        description: 'Collect 10 coins',
        target: 10,
        current: 0,
        completed: false
      }
    ]
  },

  // Level 2: Night Glide
  {
    id: 2,
    name: 'Night Glide',
    description: 'Glide through the starry night sky',
    theme: 'NIGHT',
    duration: 90, // 90 seconds
    targetDepth: 1000,
    objectives: [
      {
        type: 'SURVIVE_TIME',
        description: 'Survive for 90 seconds',
        target: 90,
        current: 0,
        completed: false
      },
      {
        type: 'REACH_DEPTH',
        description: 'Reach 1000m depth',
        target: 1000,
        current: 0,
        completed: false
      },
      {
        type: 'NO_DAMAGE',
        description: 'Take no damage',
        target: 1,
        current: 1,
        completed: false
      }
    ]
  },

  // Level 3: Thunder Run
  {
    id: 3,
    name: 'Thunder Run',
    description: 'Navigate through thunderstorms and lightning',
    theme: 'THUNDER',
    targetDepth: 1500,
    coinGoal: 25,
    objectives: [
      {
        type: 'REACH_DEPTH',
        description: 'Reach 1500m depth',
        target: 1500,
        current: 0,
        completed: false
      },
      {
        type: 'COLLECT_COINS',
        description: 'Collect 25 coins',
        target: 25,
        current: 0,
        completed: false
      },
      {
        type: 'AVOID_OBSTACLES',
        description: 'Avoid 50 obstacles',
        target: 50,
        current: 0,
        completed: false
      }
    ]
  },

  // Level 4: Tornado Alley
  {
    id: 4,
    name: 'Tornado Alley',
    description: 'Master extreme winds and turbulence',
    theme: 'TORNADO',
    duration: 120,
    targetDepth: 2000,
    objectives: [
      {
        type: 'SURVIVE_TIME',
        description: 'Survive for 120 seconds',
        target: 120,
        current: 0,
        completed: false
      },
      {
        type: 'REACH_DEPTH',
        description: 'Reach 2000m depth',
        target: 2000,
        current: 0,
        completed: false
      },
      {
        type: 'COLLECT_COINS',
        description: 'Collect 30 coins',
        target: 30,
        current: 0,
        completed: false
      }
    ]
  },

  // Level 5: Outer Space
  {
    id: 5,
    name: 'Outer Space',
    description: 'Glide through the cosmos beyond atmosphere',
    theme: 'SPACE',
    duration: 180,
    targetDepth: 5000,
    coinGoal: 50,
    objectives: [
      {
        type: 'SURVIVE_TIME',
        description: 'Survive for 180 seconds',
        target: 180,
        current: 0,
        completed: false
      },
      {
        type: 'REACH_DEPTH',
        description: 'Reach 5000m depth',
        target: 5000,
        current: 0,
        completed: false
      },
      {
        type: 'COLLECT_COINS',
        description: 'Collect 50 coins',
        target: 50,
        current: 0,
        completed: false
      },
      {
        type: 'NO_DAMAGE',
        description: 'Complete with no damage',
        target: 1,
        current: 1,
        completed: false
      }
    ]
  }
];

/**
 * Get level configuration by ID
 */
export const getLevelById = (id: number): ChallengeLevel | undefined => {
  return CHALLENGE_LEVELS.find(level => level.id === id);
};

/**
 * Initialize level objectives (creates fresh copy)
 */
export const initializeLevelObjectives = (levelId: number): ChallengObjective[] => {
  const level = getLevelById(levelId);
  if (!level) return [];

  // Return deep copy of objectives
  return level.objectives.map(obj => ({ ...obj }));
};
