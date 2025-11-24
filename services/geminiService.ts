// Local dataset of 100 roasts categorized by score range
const roastsData = [
    // --- 0 to 200m (Instant Fail) ---
    { max: 200, text: "Gravity checked. It works." },
    { max: 200, text: "That was a short flight." },
    { max: 200, text: "Did you trip?" },
    { max: 200, text: "The ground approached faster than expected." },
    { max: 200, text: "Umbrella failure or user error?" },
    { max: 200, text: "Splats are messy." },
    { max: 200, text: "Are you trying to hit the ground?" },
    { max: 200, text: "Speedrun to the bottom?" },
    { max: 200, text: "Oof. Just oof." },
    { max: 200, text: "Newton is laughing at you." },
    { max: 200, text: "Flap your arms harder next time." },
    { max: 200, text: "That barely counts as a fall." },
    { max: 200, text: "Elevator would have been safer." },
    { max: 200, text: "Parachute > Umbrella?" },
    { max: 200, text: "Physics 101: Failed." },
    { max: 200, text: "Aim for the bushes next time." },
    { max: 200, text: "Flat as a pancake." },
    { max: 200, text: "Wile E. Coyote style." },
    { max: 200, text: "Maybe try gliding?" },
    { max: 200, text: "Face, meet pavement." },
  
    // --- 200 to 500m (Mediocre) ---
    { max: 500, text: "Mediocrity achieved." },
    { max: 500, text: "A solid effort at failing." },
    { max: 500, text: "You can do better." },
    { max: 500, text: "Is that all you got?" },
    { max: 500, text: "Warm up round?" },
    { max: 500, text: "Almost impressive. Almost." },
    { max: 500, text: "Wind resistance is futile." },
    { max: 500, text: "Not quite terminal velocity." },
    { max: 500, text: "You fell. Good job." },
    { max: 500, text: "Participation award winner." },
    { max: 500, text: "Bird food." },
    { max: 500, text: "Cloud gazing interrupted." },
    { max: 500, text: "Decent descent." },
    { max: 500, text: "Slightly less embarrassing." },
    { max: 500, text: "You cleared the trees at least." },
    { max: 500, text: "The sky is the limit, not the ground." },
    { max: 500, text: "Stuck the landing... sort of." },
    { max: 500, text: "Needs more glide." },
    { max: 500, text: "Practice makes perfect." },
    { max: 500, text: "Keep your head up." },
  
    // --- 500 to 1000m (Okay) ---
    { max: 1000, text: "Respectable plummet." },
    { max: 1000, text: "Getting the hang of this." },
    { max: 1000, text: "Cruising altitude reached." },
    { max: 1000, text: "Not bad for a stickman." },
    { max: 1000, text: "You're a falling star." },
    { max: 1000, text: "Steady glide." },
    { max: 1000, text: "Avoiding obstacles like a pro." },
    { max: 1000, text: "Solid run." },
    { max: 1000, text: "Mid-tier falling skills." },
    { max: 1000, text: "You're in the zone." },
    { max: 1000, text: "Gravity is your friend." },
    { max: 1000, text: "Swoosh." },
    { max: 1000, text: "Graceful... until the end." },
    { max: 1000, text: "Nice airtime." },
    { max: 1000, text: "A decent drop." },
    { max: 1000, text: "Breaking the sound barrier?" },
    { max: 1000, text: "You've got potential." },
    { max: 1000, text: "Falling with style." },
    { max: 1000, text: "Better than walking." },
    { max: 1000, text: "Sky high." },
  
    // --- 1000 to 2000m (Good) ---
    { max: 2000, text: "Impressive depth!" },
    { max: 2000, text: "You're a natural glider." },
    { max: 2000, text: "Marathon faller." },
    { max: 2000, text: "The birds are jealous." },
    { max: 2000, text: "Defying physics for a while." },
    { max: 2000, text: "That's a long way down." },
    { max: 2000, text: "High altitude achiever." },
    { max: 2000, text: "Look at you go!" },
    { max: 2000, text: "Professional skydiver?" },
    { max: 2000, text: "Stratospheric performance." },
    { max: 2000, text: "You owned the sky." },
    { max: 2000, text: "Fantastic voyage." },
    { max: 2000, text: "Epic descent." },
    { max: 2000, text: "Gravity who?" },
    { max: 2000, text: "Master of the wind." },
    { max: 2000, text: "Cloud surfer." },
    { max: 2000, text: "Way down we go." },
    { max: 2000, text: "Just keep falling." },
    { max: 2000, text: "Airborne elite." },
    { max: 2000, text: "Soaring success." },
  
    // --- 2000+ (Legendary) ---
    { max: 999999, text: "LEGENDARY FALL." },
    { max: 999999, text: "Are you even human?" },
    { max: 999999, text: "The bottomless pit called." },
    { max: 999999, text: "You beat gravity." },
    { max: 999999, text: "God-tier gliding." },
    { max: 999999, text: "Space station to ground." },
    { max: 999999, text: "Infinite descent mode?" },
    { max: 999999, text: "A truly chaotic fall." },
    { max: 999999, text: "Stickman supreme." },
    { max: 999999, text: "Umbrella mastery level 100." },
    { max: 999999, text: "You live in the sky now." },
    { max: 999999, text: "Unstoppable force." },
    { max: 999999, text: "Historic performance." },
    { max: 999999, text: "The abyss stared back." },
    { max: 999999, text: "Falling forever." },
    { max: 999999, text: "Sky king." },
    { max: 999999, text: "Absolute unit of a glider." },
    { max: 999999, text: "Physics is broken." },
    { max: 999999, text: "Ascended... downwards." },
    { max: 999999, text: "The void welcomes you." }
  ];
  
  export const getGameOverRoast = async (score: number, cause: string): Promise<string> => {
    // Determine the bracket based on score
    let eligibleRoasts = [];
    
    if (score <= 200) {
        eligibleRoasts = roastsData.filter(r => r.max === 200);
    } else if (score <= 500) {
        eligibleRoasts = roastsData.filter(r => r.max === 500);
    } else if (score <= 1000) {
        eligibleRoasts = roastsData.filter(r => r.max === 1000);
    } else if (score <= 2000) {
        eligibleRoasts = roastsData.filter(r => r.max === 2000);
    } else {
        eligibleRoasts = roastsData.filter(r => r.max === 999999);
    }
  
    // Fallback if something goes wrong, though logic covers all cases
    if (eligibleRoasts.length === 0) return "Gravity wins.";
  
    // Pick a random roast from the eligible list
    const randomRoast = eligibleRoasts[Math.floor(Math.random() * eligibleRoasts.length)];
    
    // Simulate a tiny delay for effect (optional, feels more natural)
    await new Promise(resolve => setTimeout(resolve, 300));
    
    return randomRoast.text;
  };
