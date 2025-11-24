import { initializeApp } from 'firebase/app';
import { getFirestore } from 'firebase/firestore';

// TODO: Replace with your actual Firebase project configuration
// You can find this in your Firebase Console -> Project Settings -> General -> Your apps
const firebaseConfig = {
   apiKey: "AIzaSyDaRwqPmoO3-mnlBXWbk4xufjzxLK32tQ8",
  authDomain: "stickman-umbrella-glide.firebaseapp.com",
  projectId: "stickman-umbrella-glide",
  storageBucket: "stickman-umbrella-glide.firebasestorage.app",
  messagingSenderId: "823709341226",
  appId: "1:823709341226:web:28ea76de719520d7101553",
  measurementId: "G-DRQYRXT111"
};

// Initialize Firebase
// We use a try-catch block to prevent the app from crashing if config is missing during development
let app;
let db: any;

try {
    app = initializeApp(firebaseConfig);
    db = getFirestore(app);
    console.log("Firebase initialized successfully");
} catch (error) {
    console.warn("Firebase initialization failed. Leaderboard will work in offline/mock mode if implemented, or fail silently.", error);
}

export { db };