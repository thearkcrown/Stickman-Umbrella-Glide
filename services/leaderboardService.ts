import { db } from '../firebaseConfig';
import { collection, query, orderBy, limit, getDocs, addDoc, updateDoc, doc, where, serverTimestamp } from 'firebase/firestore';
import { LeaderboardEntry } from '../types';

const COLLECTION_NAME = 'leaderboard';

export const getLeaderboard = async (): Promise<LeaderboardEntry[]> => {
  if (!db) {
    console.warn("Database not initialized. Returning empty leaderboard.");
    return [];
  }

  try {
    const q = query(
      collection(db, COLLECTION_NAME),
      orderBy('score', 'desc'),
      limit(10)
    );

    const querySnapshot = await getDocs(q);
    const leaderboard: LeaderboardEntry[] = [];
    
    querySnapshot.forEach((doc) => {
      leaderboard.push({ id: doc.id, ...doc.data() } as LeaderboardEntry);
    });

    return leaderboard;
  } catch (error) {
    console.error("Error fetching leaderboard:", error);
    return [];
  }
};

export const submitScore = async (name: string, score: number, userId?: string): Promise<{ success: boolean; error?: string }> => {
  if (!db) {
    return { success: false, error: "Database connection not established. Check configuration." };
  }

  try {
    // If userId is provided, check for existing entry
    if (userId) {
      const q = query(
        collection(db, COLLECTION_NAME),
        where('userId', '==', userId)
      );

      const querySnapshot = await getDocs(q);

      if (!querySnapshot.empty) {
        // User already has an entry
        const existingDoc = querySnapshot.docs[0];
        const existingData = existingDoc.data() as LeaderboardEntry;

        // Only update if new score is higher
        if (score > existingData.score) {
          await updateDoc(doc(db, COLLECTION_NAME, existingDoc.id), {
            name: name.slice(0, 15), // Update name in case they changed it
            score: score,
            date: serverTimestamp()
          });
          console.log(`✅ Updated high score for user ${userId}: ${existingData.score} → ${score}`);
          return { success: true };
        } else {
          console.log(`ℹ️ Score ${score} not higher than existing score ${existingData.score}. Not updating.`);
          return { success: true }; // Still return success, just didn't update
        }
      }
    }

    // No existing entry found, or no userId - create new entry
    await addDoc(collection(db, COLLECTION_NAME), {
      userId: userId || null,
      name: name.slice(0, 15), // Limit name length
      score: score,
      date: serverTimestamp()
    });
    console.log(`✅ Created new leaderboard entry for ${name}: ${score}`);
    return { success: true };
  } catch (error: any) {
    console.error("Error submitting score:", error);
    const errorMessage = error.message || "Unknown network or permission error.";
    return { success: false, error: errorMessage };
  }
};

// Helper to check if a score qualifies for top 10 locally before sending
export const isHighScore = (score: number, currentLeaderboard: LeaderboardEntry[]): boolean => {
    if (currentLeaderboard.length < 10) return true;
    const lowestScore = currentLeaderboard[currentLeaderboard.length - 1].score;
    return score > lowestScore;
};