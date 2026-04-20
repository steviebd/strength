export interface VideoTutorial {
  youtubeId: string;
  title: string;
  coachName: string;
  keyCues: string[];
}

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  muscleGroup: string;
  description: string;
  videoTutorial?: VideoTutorial;
}

export const exerciseLibrary: ExerciseLibraryItem[] = [
  {
    id: 'barbell-bench-press',
    name: 'Bench Press',
    muscleGroup: 'Chest',
    description:
      'A compound exercise where you lie on a bench and press a barbell up from chest level, primarily targeting the pectoralis major.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/7GtUE1MAniY',
      title: 'How to Bench Press (Barbell)',
      coachName: 'LIndseyReneeBell',
      keyCues: ['Retract shoulder blades', 'Leg drive', 'Elbow tuck', 'Controlled descent'],
    },
  },
  {
    id: 'dumbbell-bench-press',
    name: 'Dumbbell Bench Press',
    muscleGroup: 'Chest',
    description:
      'A compound chest exercise performed on a bench using dumbbells, allowing for a greater range of motion and independent arm movement.',
  },
  {
    id: 'incline-dumbbell-press',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    description:
      'A variation of the bench press performed on an incline bench, emphasizing the upper portion of the pectoralis major.',
  },
  {
    id: 'cable-fly',
    name: 'Cable Fly',
    muscleGroup: 'Chest',
    description:
      'An isolation exercise using cables to maintain constant tension while bringing hands together in front of the chest, targeting the pectorals.',
  },
  {
    id: 'push-ups',
    name: 'Push-ups',
    muscleGroup: 'Chest',
    description:
      'A bodyweight exercise where you push yourself up from the ground, primarily working the chest, shoulders, and triceps.',
  },
  {
    id: 'chest-dips',
    name: 'Dips',
    muscleGroup: 'Chest',
    description:
      'A compound exercise performed on parallel bars, leaning forward emphasizes chest involvement while upright targets triceps more.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/naAv3nWlZFE',
      title: 'How to Do Dips',
      coachName: 'Jen Sinkler',
      keyCues: ['Upright torso', 'Shoulder depression', 'Elbow extension', "Don't go too deep"],
    },
  },

  {
    id: 'barbell-row',
    name: 'Barbell Row',
    muscleGroup: 'Back',
    description:
      'A compound back exercise where you bend over and pull a barbell toward your lower chest, targeting the latissimus dorsi and rhomboids.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/SBA5DY_HfUU',
      title: 'Barbell Row',
      coachName: 'Melissa Kendter',
      keyCues: ['Flat back', 'Pull to hip', 'Squeeze back', 'Control descent'],
    },
  },
  {
    id: 'deadlift',
    name: 'Deadlift',
    muscleGroup: 'Back',
    description:
      'A compound exercise lifting a barbell from the floor to hip level, working the entire posterior chain including back, glutes, and hamstrings.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/O1lJXVUh2Pk',
      title: 'How To Deadlift',
      coachName: 'bodybuildingcom',
      keyCues: ['Bar over mid-foot', 'Hips down', 'Chest up', 'Push floor away'],
    },
  },
  {
    id: 'lat-pulldown',
    name: 'Lat Pulldown',
    muscleGroup: 'Back',
    description:
      'A cable exercise pulling a bar down to chest level while seated, effectively targeting the latissimus dorsi and upper back muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/diBoTD4-uG8',
      title: 'How to Lat Pulldown',
      coachName: 'ArielYu_Fit',
      keyCues: ['Pull to chest', 'Retract scapula', 'Arch back slightly', 'Control the release'],
    },
  },
  {
    id: 'pull-ups',
    name: 'Pull-ups',
    muscleGroup: 'Back',
    description:
      'A bodyweight exercise hanging from a bar and pulling yourself up, primarily working the lats with secondary engagement of biceps and rear delts.',
    videoTutorial: {
      youtubeId: 'youtube.com/shorts/j-H5VmNj-Iw',
      title: 'How to Do An Assisted Pull-Up',
      coachName: 'KenziieJohnson',
      keyCues: ['Dead hang', 'Retract scapula', 'Pull to chest', 'Control descent'],
    },
  },
  {
    id: 'seated-cable-row',
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    description:
      'A compound back exercise performed sitting, pulling a handle toward the abdomen while keeping the back straight, targeting the middle back.',
  },
  {
    id: 'dumbbell-row',
    name: 'Dumbbell Row',
    muscleGroup: 'Back',
    description:
      'A unilateral back exercise bent over with one hand supporting, pulling a dumbbell up to the hip to target the lat and upper back.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/jpi4reqwiKY',
      title: 'How to Dumbbell Row',
      coachName: 'ArielYu_Fit',
      keyCues: ['Flat back', 'Pull to hip', 'Squeeze back', 'Control descent'],
    },
  },

  {
    id: 'overhead-press',
    name: 'Overhead Press',
    muscleGroup: 'Shoulders',
    description:
      'A compound shoulder exercise pressing a barbell from shoulders to overhead, primarily targeting the anterior and lateral deltoids.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/YD7xwkprtTA',
      title: '4 OVERHEAD PRESS TIPS',
      coachName: 'Megsquats',
      keyCues: ['Brace core', 'Vertical forearms', 'Head through', 'Lockout overhead'],
    },
  },
  {
    id: 'dumbbell-shoulder-press',
    name: 'Dumbbell Shoulder Press',
    muscleGroup: 'Shoulders',
    description:
      'A shoulder exercise pressing dumbbells from shoulder height to overhead, allowing greater shoulder stabilization and range of motion.',
  },
  {
    id: 'lateral-raises',
    name: 'Lateral Raises',
    muscleGroup: 'Shoulders',
    description:
      'An isolation exercise raising dumbbells to the sides to target the lateral deltoid muscles, creating shoulder width and definition.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/UFcaodmbXd8',
      title: 'How to Lateral Raise',
      coachName: 'ArielYu_Fit',
      keyCues: ['Slight bend in elbows', 'Lead with elbows', 'Squeeze at top', 'Control descent'],
    },
  },
  {
    id: 'front-raises',
    name: 'Front Raises',
    muscleGroup: 'Shoulders',
    description:
      'An isolation exercise raising weights in front to target the anterior deltoid, often performed with dumbbells or a barbell.',
  },
  {
    id: 'face-pulls',
    name: 'Face Pulls',
    muscleGroup: 'Shoulders',
    description:
      'A rear delt exercise using a cable rope pulled toward the face, targeting the rear deltoids, rhomboids, and rotator cuff muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/I41wK3wTZlo',
      title: 'How to Face Pull',
      coachName: 'ArielYu_Fit',
      keyCues: ['Pull to face', 'External rotation', 'Squeeze rear delts', 'Elbows high'],
    },
  },
  {
    id: 'rear-delt-fly',
    name: 'Rear Delt Fly',
    muscleGroup: 'Shoulders',
    description:
      'An isolation exercise bending forward and raising dumbbells to the sides, specifically targeting the posterior deltoid muscles.',
  },

  {
    id: 'barbell-curl',
    name: 'Barbell Curl',
    muscleGroup: 'Biceps',
    description:
      'The classic biceps exercise curling a barbell from hip level to the shoulders, primarily targeting the biceps brachii.',
  },
  {
    id: 'dumbbell-curl',
    name: 'Dumbbell Curl',
    muscleGroup: 'Biceps',
    description:
      'A fundamental bicep curl using individual dumbbells, allowing each arm to work independently with a full range of motion.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/j1FjaWu5Am4',
      title: 'How to Dumbbell Curl',
      coachName: 'ArielYu_Fit',
      keyCues: ['Elbows pinned', 'Full range', 'Squeeze at top', 'No momentum'],
    },
  },
  {
    id: 'hammer-curl',
    name: 'Hammer Curl',
    muscleGroup: 'Biceps',
    description:
      'A variation of the dumbbell curl with neutral grip, targeting the brachialis and brachioradialis for arm thickness.',
  },
  {
    id: 'preacher-curl',
    name: 'Preacher Curl',
    muscleGroup: 'Biceps',
    description:
      'An isolation exercise performed on a preacher bench, preventing cheating by isolating the biceps through a full contraction.',
  },

  {
    id: 'tricep-pushdown',
    name: 'Tricep Pushdowns',
    muscleGroup: 'Triceps',
    description:
      'A cable exercise pushing a bar down by extending the elbows, one of the most effective exercises for targeting the triceps.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/nhbjwYcL6m8',
      title: 'How to Tricep Pushdown',
      coachName: 'infotainment5454',
      keyCues: ['Elbows pinned', 'Full extension', 'Squeeze triceps', 'Control the weight'],
    },
  },
  {
    id: 'skull-crushers',
    name: 'Skull Crushers',
    muscleGroup: 'Triceps',
    description:
      'An isolation exercise lowering a weight to the forehead while lying on a bench, then extending the arms to work the triceps.',
  },
  {
    id: 'overhead-tricep-extension',
    name: 'Overhead Tricep Extension',
    muscleGroup: 'Triceps',
    description:
      'A tricep isolation exercise extending a weight overhead behind the head, providing a deep stretch and contraction.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/xiXJxlGKryY',
      title: 'How to Overhead Tricep Extension',
      coachName: 'lisafittworkouts',
      keyCues: ['Elbows forward', 'Full stretch', 'Squeeze at top', 'Control the descent'],
    },
  },
  {
    id: 'tricep-dips',
    name: 'Dips',
    muscleGroup: 'Triceps',
    description:
      'A compound exercise on parallel bars where you lower and push yourself up, with upright positioning emphasizing triceps engagement.',
  },

  {
    id: 'wrist-curl',
    name: 'Wrist Curl',
    muscleGroup: 'Forearms',
    description:
      'An isolation exercise curling the wrists with palms facing up to target the flexor muscles of the forearm.',
  },
  {
    id: 'reverse-wrist-curl',
    name: 'Reverse Wrist Curl',
    muscleGroup: 'Forearms',
    description:
      'An isolation exercise curling the wrists with palms facing down to target the extensor muscles of the forearm.',
  },
  {
    id: 'farmers-walk',
    name: "Farmer's Walk",
    muscleGroup: 'Forearms',
    description:
      'A compound exercise carrying heavy weights while walking, building grip strength and forearm endurance through sustained holding.',
  },

  {
    id: 'plank',
    name: 'Plank',
    muscleGroup: 'Core',
    description:
      'An isometric core exercise holding a push-up position, engaging the entire midsection including abs, obliques, and lower back.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/Pkp3SOvipZ0',
      title: 'How to Plank Correctly',
      coachName: 'MarieKme',
      keyCues: ['Straight line', 'Squeeze glutes', 'Engage core', "Don't sag hips"],
    },
  },
  {
    id: 'hanging-leg-raise',
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    description:
      'An advanced core exercise hanging from a bar and raising legs to horizontal, targeting the hip flexors and lower abs.',
  },
  {
    id: 'cable-crunch',
    name: 'Cable Crunch',
    muscleGroup: 'Core',
    description:
      'A weighted ab exercise kneeling in front of a cable, crunching down to flex the spine against resistance.',
  },
  {
    id: 'russian-twist',
    name: 'Russian Twist',
    muscleGroup: 'Core',
    description:
      'A rotational core exercise sitting and twisting side to side, targeting the obliques and entire abdominal region.',
  },

  {
    id: 'barbell-squat',
    name: 'Squat',
    muscleGroup: 'Quads',
    description:
      'The king of leg exercises, squatting with a barbell on the back to build overall leg mass and strength, primarily targeting quads.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/Lq9bf_QUSns',
      title: 'How to Squat with Perfect Form',
      coachName: 'LISAFIITT',
      keyCues: ['Keep chest up', 'Break at hips', 'Knees out', 'Drive through heels'],
    },
  },
  {
    id: 'leg-press',
    name: 'Leg Press',
    muscleGroup: 'Quads',
    description:
      'A machine-based compound exercise pushing a platform away while seated, targeting the quadriceps with less spinal loading than squats.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/OlWE5rOjS5o',
      title: 'Leg Press Form Tips',
      coachName: 'Squat University',
      keyCues: ['Feet low and wide', "Don't lock knees", 'Knees track toes', 'Control weight'],
    },
  },
  {
    id: 'lunges',
    name: 'Walking Lunges',
    muscleGroup: 'Quads',
    description:
      'A unilateral leg exercise stepping forward and lowering the body, targeting quads, glutes, and hamstrings while improving balance.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/2ea3_b9rFdM',
      title: 'Walking Lunges',
      coachName: 'Melissa Kendter',
      keyCues: ['Tall posture', '90 degree knee', 'Drive through heel', 'Upright torso'],
    },
  },
  {
    id: 'leg-extension',
    name: 'Leg Extension',
    muscleGroup: 'Quads',
    description:
      'An isolation machine exercise extending the legs against resistance, directly targeting the quadriceps muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/2zZ3vkPsExQ',
      title: 'How to Leg Extension',
      coachName: 'LISAFIITT',
      keyCues: ['Pause at top', 'Full extension', 'Squeeze quads', 'Control the descent'],
    },
  },

  {
    id: 'romanian-deadlift',
    name: 'Romanian Deadlift',
    muscleGroup: 'Hamstrings',
    description:
      'A hip-hinge movement lowering a barbell while keeping legs slightly bent, intensely targeting the hamstrings and glutes.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/CBOhr6H7BEY',
      title: 'How to Romanian Deadlift',
      coachName: 'ArielYu_Fit',
      keyCues: ['Soft knee bend', 'Hips back', 'Flat back', 'Stretch hamstrings'],
    },
  },
  {
    id: 'leg-curl',
    name: 'Leg Curl',
    muscleGroup: 'Hamstrings',
    description:
      'A machine isolation exercise curling the legs against resistance while lying down, directly targeting the hamstring muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/yjWAuFOjhuY',
      title: 'How to Leg Curl',
      coachName: 'ArielYu_Fit',
      keyCues: ['Full contraction', 'Squeeze hamstrings', 'Control release', 'No cheating'],
    },
  },
  {
    id: 'good-mornings',
    name: 'Good Mornings',
    muscleGroup: 'Hamstrings',
    description:
      'A hip-hinge exercise resembling a bow, bending at the waist with a barbell on the back to stretch and load the hamstrings.',
  },

  {
    id: 'hip-thrust',
    name: 'Hip Thrust',
    muscleGroup: 'Glutes',
    description:
      'A glute isolation exercise thrusting hips upward with weight on the pelvis, one of the most effective movements for glute development.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/PqC0fmyNlmw',
      title: 'Hip Thrust Tips',
      coachName: 'ArielYu_Fit',
      keyCues: ['Soft knee bend', 'Squeeze glutes', 'Chin tucked', 'Full hip extension'],
    },
  },
  {
    id: 'cable-kickback',
    name: 'Cable Kickback',
    muscleGroup: 'Glutes',
    description:
      'A unilateral cable exercise kicking one leg back to target the gluteus maximus, providing constant tension through the movement.',
  },

  {
    id: 'standing-calf-raise',
    name: 'Standing Calf Raise',
    muscleGroup: 'Calves',
    description:
      'A calf exercise rising onto the toes while standing, primarily targeting the gastrocnemius muscle for overall calf development.',
  },
  {
    id: 'seated-calf-raise',
    name: 'Seated Calf Raise',
    muscleGroup: 'Calves',
    description:
      'A calf exercise performed seated with weight on the knees, targeting the soleus muscle beneath the gastrocnemius.',
  },

  {
    id: 'burpees',
    name: 'Burpees',
    muscleGroup: 'Full Body',
    description:
      'A high-intensity bodyweight exercise combining a squat, push-up, and jump, providing a full body cardiovascular and strength challenge.',
  },
  {
    id: 'kettlebell-swings',
    name: 'Kettlebell Swings',
    muscleGroup: 'Full Body',
    description:
      'A dynamic hip-hinge exercise swinging a kettlebell to shoulder height, combining strength and cardio while working the posterior chain.',
  },

  {
    id: 'treadmill',
    name: 'Treadmill',
    muscleGroup: 'Cardio',
    description:
      'A cardio machine for walking or running in place, providing an adjustable intensity workout for cardiovascular endurance.',
  },
  {
    id: 'rowing-machine',
    name: 'Rowing Machine',
    muscleGroup: 'Cardio',
    description:
      'A full-body cardio exercise simulating rowing a boat, engaging legs, core, and arms for an efficient aerobic workout.',
  },
  {
    id: 'stationary-bike',
    name: 'Stationary Bike',
    muscleGroup: 'Cardio',
    description:
      'A low-impact cycling exercise providing excellent cardiovascular benefits without stressing the joints.',
  },
  {
    id: 'box-jump',
    name: 'Box Jump',
    muscleGroup: 'Cardio',
    description:
      'A plyometric exercise jumping onto a box, building explosive power and cardiovascular endurance.',
  },

  {
    id: 'front-squat',
    name: 'Front Squat',
    muscleGroup: 'Quads',
    description:
      'A squat variation with the barbell resting on the front of the shoulders, emphasizing quadriceps and upright torso position.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/-hiSsWvHPc4',
      title: 'How to Front Squat',
      coachName: 'lisafittworkouts',
      keyCues: ['Elbows up', 'Upright torso', 'Break at hips', 'Drive through heels'],
    },
  },

  {
    id: 'back-raises',
    name: 'Back Raises',
    muscleGroup: 'Back',
    description:
      'A back extension exercise performed on a roman chair, targeting the erector spinae and glutes.',
  },
  {
    id: 'hyperextensions',
    name: 'Hyperextensions',
    muscleGroup: 'Back',
    description:
      'Lying face down on a hyperextension bench, raise your upper body to target the lower back muscles.',
  },
  {
    id: 'weighted-pullups',
    name: 'Weighted Pull-ups',
    muscleGroup: 'Back',
    description: 'Pull-ups with added weight (belt or dumbbell) for increased resistance.',
  },
  {
    id: 'weighted-dips',
    name: 'Weighted Dips',
    muscleGroup: 'Chest',
    description: 'Dips with added weight belt or dumbbell between feet for increased difficulty.',
  },
  {
    id: 'inverted-rows',
    name: 'Inverted Rows',
    muscleGroup: 'Back',
    description:
      'Horizontal pulling exercise using a bar at waist height, similar to a pull-up but easier.',
  },
  {
    id: 'pause-squat',
    name: 'Pause Squat',
    muscleGroup: 'Quads',
    description:
      'Squat with a 2-3 second pause at the bottom to build strength at the sticking point.',
  },
  {
    id: 'paused-bench',
    name: 'Paused Bench Press',
    muscleGroup: 'Chest',
    description: 'Bench press with a 2-3 second pause on the chest to build strength and control.',
  },
  {
    id: 'paused-deadlift',
    name: 'Paused Deadlift',
    muscleGroup: 'Back',
    description: 'Deadlift with a pause just above the knee to build lockout strength.',
  },
  {
    id: 'deficit-deadlift',
    name: 'Deficit Deadlift',
    muscleGroup: 'Back',
    description:
      'Deadlift performed standing on a platform to increase range of motion and build strength.',
  },
  {
    id: 'rack-pull',
    name: 'Rack Pull',
    muscleGroup: 'Back',
    description: 'Deadlift from pins in the rack, emphasizing lockout strength above the knee.',
  },

  {
    id: 'ab-wheel',
    name: 'Ab Wheel',
    muscleGroup: 'Core',
    description:
      'Rolling wheel exercise extending and contracting the core for intense abdominal work.',
  },
];

export function getVideoTutorialByName(
  exerciseName: string | undefined | null,
): VideoTutorial | undefined {
  if (!exerciseName) return undefined;
  const normalizedName = exerciseName.toLowerCase().trim();
  const match = exerciseLibrary.find((ex) => ex.name.toLowerCase() === normalizedName);
  return match?.videoTutorial;
}
