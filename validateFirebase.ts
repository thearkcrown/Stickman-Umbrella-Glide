import { db } from './firebaseConfig';
import { collection, getDocs, addDoc, deleteDoc, doc } from 'firebase/firestore';

async function validateFirebaseConnection() {
  console.log('🔍 Starting Firebase validation...\n');

  // Step 1: Check if database is initialized
  if (!db) {
    console.error('❌ Firebase database is not initialized!');
    console.error('   Please check your firebaseConfig.ts');
    process.exit(1);
  }
  console.log('✅ Firebase database initialized');

  try {
    // Step 2: Test read access to leaderboard collection
    console.log('\n📖 Testing read access to "leaderboard" collection...');
    const leaderboardRef = collection(db, 'leaderboard');
    const snapshot = await getDocs(leaderboardRef);
    console.log(`✅ Read successful - Found ${snapshot.size} document(s)`);

    // Step 3: Test write access
    console.log('\n✍️  Testing write access...');
    const testDocRef = await addDoc(collection(db, 'leaderboard'), {
      name: 'TEST_VALIDATION',
      score: 9999,
      date: new Date()
    });
    console.log(`✅ Write successful - Document ID: ${testDocRef.id}`);

    // Step 4: Clean up test document
    console.log('\n🧹 Cleaning up test document...');
    await deleteDoc(doc(db, 'leaderboard', testDocRef.id));
    console.log('✅ Cleanup successful');

    // Step 5: Final success message
    console.log('\n🎉 Firebase connection validated successfully!');
    console.log('\nConnection Details:');
    console.log('  - Project ID: stickman-umbrella-glide');
    console.log('  - Database: Cloud Firestore');
    console.log('  - Collections tested: leaderboard');
    console.log('  - Read/Write permissions: ✅ Working');

  } catch (error: any) {
    console.error('\n❌ Firebase validation failed!');
    console.error('Error:', error.message);

    if (error.code === 'permission-denied') {
      console.error('\n💡 Tip: Check your Firestore security rules in Firebase Console');
    } else if (error.code === 'unavailable') {
      console.error('\n💡 Tip: Check your internet connection');
    }

    process.exit(1);
  }
}

validateFirebaseConnection();
