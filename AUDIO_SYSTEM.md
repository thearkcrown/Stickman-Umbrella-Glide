# Audio System Documentation

## Overview

The game features a comprehensive audio system with background music, sound effects, and granular volume controls. All audio is generated procedurally using the Web Audio API.

## Features

### 🎵 Background Music
- **Procedurally generated ambient music** using Web Audio API oscillators
- **Automatically loops** continuously while playing
- **Atmospheric pad sound** with 4 detuned sine wave oscillators
- **Subtle shimmer effect** using LFO (Low Frequency Oscillator) modulation
- **Notes**: C3, E3, G3, B3 (creates a calming ambient sound)

### 🎧 Sound Effects
1. **Wind Sound** - White noise filtered through lowpass (gliding effect)
2. **Drone/Rumble** - Low frequency sawtooth (depth ambience)
3. **Crash Sound** - Impact tone + noise burst
4. **Umbrella Open** - "Whoomp" cloth catching air
5. **Umbrella Close** - "Zip" fabric snap

### 🎚️ Volume Controls

Three-tier volume system:
- **Master Volume** (controls everything)
- **Music Volume** (background music only)
- **SFX Volume** (all sound effects)

Plus:
- **Mute Button** (instant silence)
- **Real-time adjustments** (smooth transitions)
- **Persistent settings** (saved to localStorage)

## Architecture

### Gain Node Hierarchy

```
AudioContext
    └─ Master Gain (masterGainRef)
        ├─ Music Gain (musicGainRef)
        │   └─ Background Music Oscillators (4x)
        │
        └─ SFX Gain (sfxGainRef)
            ├─ Wind Sound
            ├─ Drone/Rumble
            ├─ Crash Effects
            ├─ Umbrella Open/Close
            └─ All other SFX
```

### State Management

```typescript
// Volume State (0.0 - 1.0)
const [masterVolume, setMasterVolume] = useState(0.7);
const [musicVolume, setMusicVolume] = useState(0.5);
const [sfxVolume, setSfxVolume] = useState(0.7);
const [isMuted, setIsMuted] = useState(false);

// Audio Refs
const audioCtxRef = useRef<AudioContext | null>(null);
const masterGainRef = useRef<GainNode | null>(null);
const musicGainRef = useRef<GainNode | null>(null);
const sfxGainRef = useRef<GainNode | null>(null);
const musicOscillatorsRef = useRef<OscillatorNode[]>([]);
```

## Background Music Details

### Music Generation

The background music uses a **multi-oscillator pad** technique:

```typescript
const notes = [
  { freq: 130.81, detune: 0 },    // C3
  { freq: 164.81, detune: 5 },    // E3
  { freq: 196.00, detune: -5 },   // G3
  { freq: 246.94, detune: 3 },    // B3
];
```

Each note:
- Uses a **sine wave** oscillator (smooth, warm tone)
- Has **slight detuning** (-5 to +5 cents) for richness
- Volume set to **0.15** (soft ambient level)
- Modulated by **LFO** for shimmer effect

### LFO Modulation

Each oscillator has an LFO that:
- Modulates at **0.1-0.25 Hz** (very slow)
- Adds **±2 cents** of detune variation
- Creates a **subtle shimmer/chorus** effect
- Makes the music feel "alive"

### Looping

The music loops **indefinitely** because:
- Oscillators never stop (until explicitly stopped)
- Each oscillator runs continuously
- LFO modulation creates variation
- No need for manual loop triggers

## Volume Control System

### Real-time Updates

Volume changes are applied smoothly:

```typescript
useEffect(() => {
  if (masterGainRef.current) {
    const targetValue = isMuted ? 0 : masterVolume;
    masterGainRef.current.gain.setTargetAtTime(
      targetValue,
      audioCtxRef.current?.currentTime || 0,
      0.05  // 50ms smooth transition
    );
  }
}, [masterVolume, isMuted]);
```

### Persistence

Settings are saved to localStorage:

```typescript
localStorage.setItem('masterVolume', masterVolume.toString());
localStorage.setItem('musicVolume', musicVolume.toString());
localStorage.setItem('sfxVolume', sfxVolume.toString());
```

And loaded on startup:

```typescript
const [masterVolume, setMasterVolume] = useState(() => {
  const stored = localStorage.getItem('masterVolume');
  return stored ? parseFloat(stored) : 0.7;
});
```

## UI Components

### Volume Panel (Bottom-left)

Click the **"🎵 Volume"** button to show:

- **Mute/Unmute** toggle button
- **Master Volume** slider (blue)
- **Music Volume** slider (purple)
- **SFX Volume** slider (green)
- **Real-time percentage** display

### Features:
- Smooth slider interactions
- Color-coded by type
- Percentage labels
- Compact, non-intrusive design
- Positioned at bottom-left to avoid gameplay

## Console Logging

The audio system provides helpful console feedback:

```
🎵 Initializing audio system...
✅ Audio system initialized
🎶 Starting background music...
✅ Background music started
```

## Usage Examples

### Adjusting Volume Programmatically

```typescript
// Set master volume to 50%
setMasterVolume(0.5);

// Mute all audio
setIsMuted(true);

// Set music louder than SFX
setMusicVolume(0.8);
setSfxVolume(0.4);
```

### Starting/Stopping Music

```typescript
// Music starts automatically with initAudio()

// Manually stop music
stopBackgroundMusic();

// Restart music
startBackgroundMusic();
```

## Technical Details

### Audio Context Setup

```typescript
const AudioContext = window.AudioContext || (window as any).webkitAudioContext;
const ctx = new AudioContext();
```

### Gain Node Creation

```typescript
const masterGain = ctx.createGain();
masterGain.gain.value = masterVolume;
masterGain.connect(ctx.destination);

const musicGain = ctx.createGain();
musicGain.gain.value = musicVolume;
musicGain.connect(masterGain);

const sfxGain = ctx.createGain();
sfxGain.gain.value = sfxVolume;
sfxGain.connect(masterGain);
```

### Why This Architecture?

1. **Separation of Concerns**: Music and SFX can be controlled independently
2. **Master Control**: One slider to rule them all
3. **Smooth Transitions**: setTargetAtTime prevents clicks/pops
4. **CPU Efficient**: Oscillators use minimal resources
5. **No Loading Time**: Procedural audio = instant playback

## Browser Compatibility

**Web Audio API Support**:
- ✅ Chrome/Edge (all versions)
- ✅ Firefox (all versions)
- ✅ Safari (all versions)
- ✅ Mobile browsers

**Note**: Some browsers require user interaction before playing audio (handled by the "DROP!" button).

## Performance

### Memory Usage
- **Background Music**: ~4 oscillators + 4 LFOs = minimal memory
- **SFX**: Short-lived nodes, cleaned up automatically

### CPU Usage
- **Oscillators**: Very lightweight
- **Gain Nodes**: Negligible overhead
- **Total**: <1% CPU on modern devices

## Troubleshooting

### Music Not Playing?

1. Check console for `✅ Audio system initialized`
2. Check volume sliders aren't at 0%
3. Check mute button isn't active
4. Click "DROP!" to trigger audio context

### Volume Controls Not Working?

1. Open browser console
2. Look for errors
3. Try refreshing the page
4. Check localStorage isn't disabled

### No Sound Effects?

1. Check SFX volume slider
2. Check master volume slider
3. Verify audio context started (click "DROP!")

## Future Enhancements

Potential improvements:

1. **Dynamic Music**: Change music based on depth/difficulty
2. **Music Tracks**: Add multiple procedural tracks
3. **Reverb/Effects**: Add spatial audio effects
4. **Custom Audio Files**: Support MP3/OGG background music
5. **Equalizer**: Add frequency controls
6. **Presets**: Quick volume presets (Quiet, Balanced, Loud)

## Code Location

### Main Implementation
- **File**: `App.tsx`
- **Lines**: 48-433 (audio state, refs, functions)
- **Lines**: 781-853 (volume UI)

### Key Functions
- `initAudio()` - Initialize audio system (line 124)
- `startBackgroundMusic()` - Start music (line 254)
- `stopBackgroundMusic()` - Stop music (line 308)
- `playCrashSound()` - Crash SFX (line 320)
- `playOpenSound()` - Umbrella open (line 358)
- `playCloseSound()` - Umbrella close (line 385)

## Summary

The audio system provides:
- ✅ Continuous looping background music
- ✅ Procedurally generated ambient sounds
- ✅ Full volume control (master, music, sfx)
- ✅ Mute functionality
- ✅ Persistent settings
- ✅ Clean UI
- ✅ Smooth transitions
- ✅ Excellent performance

All without requiring any external audio files!
