// Unique name generator for players

const adjectives = [
  'Swift', 'Brave', 'Flying', 'Epic', 'Mighty', 'Turbo', 'Cyber', 'Cosmic',
  'Shadow', 'Lightning', 'Thunder', 'Phoenix', 'Dragon', 'Ninja', 'Stealth',
  'Blazing', 'Frozen', 'Golden', 'Silver', 'Neon', 'Quantum', 'Mystic',
  'Wild', 'Fearless', 'Sonic', 'Hyper', 'Ultra', 'Mega', 'Super', 'Alpha',
  'Beta', 'Omega', 'Prime', 'Royal', 'Elite', 'Legendary', 'Heroic', 'Noble'
];

const nouns = [
  'Glider', 'Diver', 'Falcon', 'Eagle', 'Hawk', 'Raven', 'Phoenix', 'Dragon',
  'Tiger', 'Panther', 'Wolf', 'Fox', 'Bear', 'Lion', 'Shark', 'Ace',
  'Champion', 'Warrior', 'Knight', 'Hunter', 'Ranger', 'Pilot', 'Master',
  'Legend', 'Hero', 'Storm', 'Blaze', 'Comet', 'Meteor', 'Star', 'Nova',
  'Racer', 'Runner', 'Jumper', 'Flyer', 'Dasher', 'Speedster', 'Rider'
];

/**
 * Generates a unique player name
 * Format: [Adjective][Noun][4-digit number]
 * Example: SwiftGlider7492, BraveFalcon1234
 */
export const generateUniqueName = (): string => {
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  // Generate 4-digit random number
  const randomNumber = Math.floor(1000 + Math.random() * 9000);

  // Add timestamp-based suffix for extra uniqueness
  const timestamp = Date.now().toString().slice(-3);

  return `${randomAdjective}${randomNoun}${randomNumber}${timestamp}`;
};

/**
 * Generates a shorter unique name (for display)
 * Format: [Adjective][Noun][3-digit number]
 * Example: SwiftGlider749
 */
export const generateShortUniqueName = (): string => {
  const randomAdjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const randomNoun = nouns[Math.floor(Math.random() * nouns.length)];

  // Generate 3-digit random number + 2 digit from timestamp
  const randomNumber = Math.floor(100 + Math.random() * 900);
  const timestamp = Date.now().toString().slice(-2);

  return `${randomAdjective}${randomNoun}${randomNumber}${timestamp}`;
};

/**
 * Gets or creates a unique player name
 * Checks localStorage first, generates new if not found
 */
export const getOrCreatePlayerName = (): string => {
  const stored = localStorage.getItem('playerName');

  // If name exists and looks like an auto-generated name, use it
  if (stored && stored.length > 0) {
    return stored;
  }

  // Generate new unique name (only for first-time users)
  const newName = generateShortUniqueName();
  localStorage.setItem('playerName', newName);

  return newName;
};
