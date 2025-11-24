// Wrapper for CrazyGames SDK v2

declare global {
  interface Window {
    CrazyGames?: {
      SDK?: {
        game: {
          sdkGameLoadingStart: () => void;
          sdkGameLoadingStop: () => void;
          gameplayStart: () => void;
          gameplayStop: () => void;
          happytime: () => void;
        };
        user: {
          getUser: () => Promise<CrazyGamesUser | null>;
          showAuthPrompt: () => Promise<CrazyGamesUser | null>;
          systemInfo: {
            countryCode: string;
            browser: any;
            os: any;
            device: any;
          };
        };
        ad: {
          requestAd: (type: 'midgame' | 'rewarded') => Promise<void>;
        };
      };
    };
  }
}

export interface CrazyGamesUser {
  username: string;
  profilePictureUrl: string;
  token: string;
}

let sdkInitialized = false;
let initializationPromise: Promise<boolean> | null = null;

// Helper to wait for SDK to be available
const waitForSDK = (): Promise<boolean> => {
  return new Promise((resolve) => {
    if (window.CrazyGames?.SDK) {
      resolve(true);
      return;
    }

    // Check every 100ms for up to 5 seconds
    let attempts = 0;
    const maxAttempts = 50;

    const checkSDK = setInterval(() => {
      attempts++;

      if (window.CrazyGames?.SDK) {
        clearInterval(checkSDK);
        resolve(true);
      } else if (attempts >= maxAttempts) {
        clearInterval(checkSDK);
        console.warn('CrazyGames SDK not loaded after 5 seconds');
        resolve(false);
      }
    }, 100);
  });
};

export const initCrazyGames = async (): Promise<boolean> => {
  // Return cached result if already initialized
  if (sdkInitialized) return true;

  // Return ongoing initialization if already in progress
  if (initializationPromise) return initializationPromise;

  // Start new initialization
  initializationPromise = (async () => {
    try {
      // Wait for SDK to be available
      const sdkAvailable = await waitForSDK();

      if (!sdkAvailable || !window.CrazyGames?.SDK) {
        console.warn('CrazyGames SDK not available (running locally or SDK failed to load)');
        return false;
      }

      // Call sdkGameLoadingStart to notify SDK that game is loading
      try {
        window.CrazyGames.SDK.game.sdkGameLoadingStart();
      } catch (e) {
        console.warn('Error calling sdkGameLoadingStart:', e);
      }

      // Signal that game loading has completed
      await window.CrazyGames.SDK.game.sdkGameLoadingStop();

      sdkInitialized = true;
      return true;

    } catch (e) {
      console.error('❌ Error initializing CrazyGames SDK:', e);
      return false;
    } finally {
      initializationPromise = null;
    }
  })();

  return initializationPromise;
};

export const crazyGamesLogin = async (): Promise<CrazyGamesUser | null> => {
  if (!sdkInitialized) {
    console.warn('CrazyGames SDK not initialized, attempting to initialize...');
    const initialized = await initCrazyGames();
    if (!initialized) {
      console.error('Cannot login: SDK initialization failed');
      return null;
    }
  }

  if (!window.CrazyGames?.SDK) {
    console.error('CrazyGames SDK not available');
    return null;
  }

  try {
    const user = await window.CrazyGames.SDK.user.showAuthPrompt();

    if (user) {
      return user;
    } else {
      return null;
    }
  } catch (e: any) {
    console.error('❌ CrazyGames Login Error:', e);

    // Provide specific error messages
    if (e?.message) {
      console.error('Error details:', e.message);
    }

    return null;
  }
};

export const getCrazyGamesUser = async (): Promise<CrazyGamesUser | null> => {
  if (!sdkInitialized) {
    return null;
  }

  if (!window.CrazyGames?.SDK) {
    console.warn('CrazyGames SDK not available');
    return null;
  }

  try {
    const user = await window.CrazyGames.SDK.user.getUser();

    if (user) {
      return user;
    } else {
      return null;
    }
  } catch (e: any) {
    return null;
  }
};

export const reportGameplayStart = () => {
  if (!sdkInitialized || !window.CrazyGames?.SDK) {
    return;
  }

  try {
    window.CrazyGames.SDK.game.gameplayStart();
  } catch (e) {
    console.error('Error reporting gameplay start:', e);
  }
};

export const reportGameplayStop = () => {
  if (!sdkInitialized || !window.CrazyGames?.SDK) {
    return;
  }

  try {
    window.CrazyGames.SDK.game.gameplayStop();
  } catch (e) {
    console.error('Error reporting gameplay stop:', e);
  }
};

export const triggerHappyTime = () => {
  if (!sdkInitialized || !window.CrazyGames?.SDK) {
    return;
  }

  try {
    window.CrazyGames.SDK.game.happytime();
  } catch (e) {
    console.error('Error triggering happytime:', e);
  }
};

// Debug helper
export const getCrazyGamesSDKStatus = () => {
  return {
    sdkInitialized,
    sdkAvailable: !!window.CrazyGames?.SDK,
    sdkObject: window.CrazyGames?.SDK ? 'present' : 'missing',
  };
};
