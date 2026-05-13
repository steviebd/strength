export interface VideoTutorial {
  youtubeId: string;
  title: string;
  coachName: string;
  keyCues: string[];
}

export type ExerciseType = 'weights' | 'bodyweight' | 'timed' | 'cardio' | 'plyo';

export interface ExerciseLibraryItem {
  id: string;
  name: string;
  muscleGroup: string;
  description: string;
  exerciseType: ExerciseType;
  videoTutorial?: VideoTutorial;
}

import type { LiftType } from '../../../apps/worker/src/programs/types';

export const LIFT_TYPE_LIBRARY_ID: Record<LiftType, string> = {
  squat: 'barbell-squat',
  bench: 'barbell-bench-press',
  deadlift: 'deadlift',
  ohp: 'overhead-press',
  row: 'barbell-row',
};

export const exerciseLibrary: ExerciseLibraryItem[] = [
  {
    id: 'barbell-bench-press',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Dumbbell Bench Press',
    muscleGroup: 'Chest',
    description:
      'A compound chest exercise performed on a bench using dumbbells, allowing for a greater range of motion and independent arm movement.',
  },
  {
    id: 'incline-dumbbell-press',
    exerciseType: 'weights',
    name: 'Incline Dumbbell Press',
    muscleGroup: 'Chest',
    description:
      'A variation of the bench press performed on an incline bench, emphasizing the upper portion of the pectoralis major.',
  },
  {
    id: 'cable-fly',
    exerciseType: 'weights',
    name: 'Cable Fly',
    muscleGroup: 'Chest',
    description:
      'An isolation exercise using cables to maintain constant tension while bringing hands together in front of the chest, targeting the pectorals.',
  },
  {
    id: 'push-ups',
    exerciseType: 'bodyweight',
    name: 'Push-ups',
    muscleGroup: 'Chest',
    description:
      'A bodyweight exercise where you push yourself up from the ground, primarily working the chest, shoulders, and triceps.',
  },
  {
    id: 'chest-dips',
    exerciseType: 'bodyweight',
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
    exerciseType: 'weights',
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
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Lat Pulldowns',
    muscleGroup: 'Back',
    description:
      'A cable exercise pulling a bar down to chest level while seated, effectively targeting the latissimus dorsi and upper back muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/diBoTD4-uG8',
      title: 'How to Lat Pulldowns',
      coachName: 'ArielYu_Fit',
      keyCues: ['Pull to chest', 'Retract scapula', 'Arch back slightly', 'Control the release'],
    },
  },
  {
    id: 'pull-ups',
    exerciseType: 'bodyweight',
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
    exerciseType: 'weights',
    name: 'Seated Cable Row',
    muscleGroup: 'Back',
    description:
      'A compound back exercise performed sitting, pulling a handle toward the abdomen while keeping the back straight, targeting the middle back.',
  },
  {
    id: 'dumbbell-row',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Dumbbell Shoulder Press',
    muscleGroup: 'Shoulders',
    description:
      'A shoulder exercise pressing dumbbells from shoulder height to overhead, allowing greater shoulder stabilization and range of motion.',
  },
  {
    id: 'lateral-raises',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Front Raises',
    muscleGroup: 'Shoulders',
    description:
      'An isolation exercise raising weights in front to target the anterior deltoid, often performed with dumbbells or a barbell.',
  },
  {
    id: 'face-pulls',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Rear Delt Fly',
    muscleGroup: 'Shoulders',
    description:
      'An isolation exercise bending forward and raising dumbbells to the sides, specifically targeting the posterior deltoid muscles.',
  },

  {
    id: 'barbell-curl',
    exerciseType: 'weights',
    name: 'Barbell Curl',
    muscleGroup: 'Biceps',
    description:
      'The classic biceps exercise curling a barbell from hip level to the shoulders, primarily targeting the biceps brachii.',
  },
  {
    id: 'dumbbell-curl',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Hammer Curl',
    muscleGroup: 'Biceps',
    description:
      'A variation of the dumbbell curl with neutral grip, targeting the brachialis and brachioradialis for arm thickness.',
  },
  {
    id: 'preacher-curl',
    exerciseType: 'weights',
    name: 'Preacher Curl',
    muscleGroup: 'Biceps',
    description:
      'An isolation exercise performed on a preacher bench, preventing cheating by isolating the biceps through a full contraction.',
  },

  {
    id: 'tricep-pushdown',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Skull Crushers',
    muscleGroup: 'Triceps',
    description:
      'An isolation exercise lowering a weight to the forehead while lying on a bench, then extending the arms to work the triceps.',
  },
  {
    id: 'overhead-tricep-extension',
    exerciseType: 'weights',
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
    exerciseType: 'bodyweight',
    name: 'Dips',
    muscleGroup: 'Triceps',
    description:
      'A compound exercise on parallel bars where you lower and push yourself up, with upright positioning emphasizing triceps engagement.',
  },

  {
    id: 'wrist-curl',
    exerciseType: 'weights',
    name: 'Wrist Curl',
    muscleGroup: 'Forearms',
    description:
      'An isolation exercise curling the wrists with palms facing up to target the flexor muscles of the forearm.',
  },
  {
    id: 'reverse-wrist-curl',
    exerciseType: 'weights',
    name: 'Reverse Wrist Curl',
    muscleGroup: 'Forearms',
    description:
      'An isolation exercise curling the wrists with palms facing down to target the extensor muscles of the forearm.',
  },
  {
    id: 'farmers-walk',
    exerciseType: 'weights',
    name: "Farmer's Walk",
    muscleGroup: 'Forearms',
    description:
      'A compound exercise carrying heavy weights while walking, building grip strength and forearm endurance through sustained holding.',
  },

  {
    id: 'plank',
    exerciseType: 'timed',
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
    exerciseType: 'weights',
    name: 'Hanging Leg Raise',
    muscleGroup: 'Core',
    description:
      'An advanced core exercise hanging from a bar and raising legs to horizontal, targeting the hip flexors and lower abs.',
  },
  {
    id: 'cable-crunch',
    exerciseType: 'weights',
    name: 'Cable Crunch',
    muscleGroup: 'Core',
    description:
      'A weighted ab exercise kneeling in front of a cable, crunching down to flex the spine against resistance.',
  },
  {
    id: 'russian-twist',
    exerciseType: 'weights',
    name: 'Russian Twist',
    muscleGroup: 'Core',
    description:
      'A rotational core exercise sitting and twisting side to side, targeting the obliques and entire abdominal region.',
  },

  {
    id: 'barbell-squat',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
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
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Leg Extensions',
    muscleGroup: 'Quads',
    description:
      'An isolation machine exercise extending the legs against resistance, directly targeting the quadriceps muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/2zZ3vkPsExQ',
      title: 'How to Leg Extensions',
      coachName: 'LISAFIITT',
      keyCues: ['Pause at top', 'Full extension', 'Squeeze quads', 'Control the descent'],
    },
  },

  {
    id: 'romanian-deadlift',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Leg Curls',
    muscleGroup: 'Hamstrings',
    description:
      'A machine isolation exercise curling the legs against resistance while lying down, directly targeting the hamstring muscles.',
    videoTutorial: {
      youtubeId: 'https://www.youtube.com/shorts/yjWAuFOjhuY',
      title: 'How to Leg Curls',
      coachName: 'ArielYu_Fit',
      keyCues: ['Full contraction', 'Squeeze hamstrings', 'Control release', 'No cheating'],
    },
  },
  {
    id: 'good-mornings',
    exerciseType: 'weights',
    name: 'Good Mornings',
    muscleGroup: 'Hamstrings',
    description:
      'A hip-hinge exercise resembling a bow, bending at the waist with a barbell on the back to stretch and load the hamstrings.',
  },

  {
    id: 'hip-thrust',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Cable Kickback',
    muscleGroup: 'Glutes',
    description:
      'A unilateral cable exercise kicking one leg back to target the gluteus maximus, providing constant tension through the movement.',
  },

  {
    id: 'standing-calf-raise',
    exerciseType: 'weights',
    name: 'Standing Calf Raise',
    muscleGroup: 'Calves',
    description:
      'A calf exercise rising onto the toes while standing, primarily targeting the gastrocnemius muscle for overall calf development.',
  },
  {
    id: 'seated-calf-raise',
    exerciseType: 'weights',
    name: 'Seated Calf Raise',
    muscleGroup: 'Calves',
    description:
      'A calf exercise performed seated with weight on the knees, targeting the soleus muscle beneath the gastrocnemius.',
  },

  {
    id: 'burpees',
    exerciseType: 'bodyweight',
    name: 'Burpees',
    muscleGroup: 'Full Body',
    description:
      'A high-intensity bodyweight exercise combining a squat, push-up, and jump, providing a full body cardiovascular and strength challenge.',
  },
  {
    id: 'kettlebell-swings',
    exerciseType: 'weights',
    name: 'Kettlebell Swings',
    muscleGroup: 'Full Body',
    description:
      'A dynamic hip-hinge exercise swinging a kettlebell to shoulder height, combining strength and cardio while working the posterior chain.',
  },

  {
    id: 'treadmill',
    exerciseType: 'cardio',
    name: 'Treadmill',
    muscleGroup: 'Cardio',
    description:
      'A cardio machine for walking or running in place, providing an adjustable intensity workout for cardiovascular endurance.',
  },
  {
    id: 'rowing-machine',
    exerciseType: 'cardio',
    name: 'Rowing Machine',
    muscleGroup: 'Cardio',
    description:
      'A full-body cardio exercise simulating rowing a boat, engaging legs, core, and arms for an efficient aerobic workout.',
  },
  {
    id: 'stationary-bike',
    exerciseType: 'cardio',
    name: 'Stationary Bike',
    muscleGroup: 'Cardio',
    description:
      'A low-impact cycling exercise providing excellent cardiovascular benefits without stressing the joints.',
  },
  {
    id: 'box-jump',
    exerciseType: 'plyo',
    name: 'Box Jumps',
    muscleGroup: 'Cardio',
    description:
      'A plyometric exercise jumping onto a box, building explosive power and cardiovascular endurance.',
  },

  {
    id: 'front-squat',
    exerciseType: 'weights',
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
    exerciseType: 'weights',
    name: 'Back Raises',
    muscleGroup: 'Back',
    description:
      'A back extension exercise performed on a roman chair, targeting the erector spinae and glutes.',
  },
  {
    id: 'hyperextensions',
    exerciseType: 'weights',
    name: 'Hyperextensions',
    muscleGroup: 'Back',
    description:
      'Lying face down on a hyperextension bench, raise your upper body to target the lower back muscles.',
  },
  {
    id: 'weighted-pullups',
    exerciseType: 'weights',
    name: 'Weighted Pull-ups',
    muscleGroup: 'Back',
    description: 'Pull-ups with added weight (belt or dumbbell) for increased resistance.',
  },
  {
    id: 'weighted-dips',
    exerciseType: 'weights',
    name: 'Weighted Dips',
    muscleGroup: 'Chest',
    description: 'Dips with added weight belt or dumbbell between feet for increased difficulty.',
  },
  {
    id: 'inverted-rows',
    exerciseType: 'weights',
    name: 'Inverted Rows',
    muscleGroup: 'Back',
    description:
      'Horizontal pulling exercise using a bar at waist height, similar to a pull-up but easier.',
  },
  {
    id: 'pause-squat',
    exerciseType: 'weights',
    name: 'Pause Squat',
    muscleGroup: 'Quads',
    description:
      'Squat with a 2-3 second pause at the bottom to build strength at the sticking point.',
  },
  {
    id: 'paused-bench',
    exerciseType: 'weights',
    name: 'Paused Bench Press',
    muscleGroup: 'Chest',
    description: 'Bench press with a 2-3 second pause on the chest to build strength and control.',
  },
  {
    id: 'paused-deadlift',
    exerciseType: 'weights',
    name: 'Paused Deadlift',
    muscleGroup: 'Back',
    description: 'Deadlift with a pause just above the knee to build lockout strength.',
  },
  {
    id: 'deficit-deadlift',
    exerciseType: 'weights',
    name: 'Deficit Deadlift',
    muscleGroup: 'Back',
    description:
      'Deadlift performed standing on a platform to increase range of motion and build strength.',
  },
  {
    id: 'rack-pull',
    exerciseType: 'weights',
    name: 'Rack Pull',
    muscleGroup: 'Back',
    description: 'Deadlift from pins in the rack, emphasizing lockout strength above the knee.',
  },

  {
    id: 'ab-wheel',
    exerciseType: 'weights',
    name: 'Ab Wheel',
    muscleGroup: 'Core',
    description:
      'Rolling wheel exercise extending and contracting the core for intense abdominal work.',
  },
];

export const EXERCISE_TYPE_BY_LIBRARY_ID: Record<string, ExerciseType> = {
  'barbell-bench-press': 'weights',
  'dumbbell-bench-press': 'weights',
  'incline-dumbbell-press': 'weights',
  'cable-fly': 'weights',
  'barbell-row': 'weights',
  deadlift: 'weights',
  'lat-pulldown': 'weights',
  'seated-cable-row': 'weights',
  'dumbbell-row': 'weights',
  'overhead-press': 'weights',
  'dumbbell-shoulder-press': 'weights',
  'lateral-raises': 'weights',
  'front-raises': 'weights',
  'face-pulls': 'weights',
  'rear-delt-fly': 'weights',
  'barbell-curl': 'weights',
  'dumbbell-curl': 'weights',
  'hammer-curl': 'weights',
  'preacher-curl': 'weights',
  'tricep-pushdown': 'weights',
  'skull-crushers': 'weights',
  'overhead-tricep-extension': 'weights',
  'wrist-curl': 'weights',
  'reverse-wrist-curl': 'weights',
  'farmers-walk': 'weights',
  'russian-twist': 'weights',
  'barbell-squat': 'weights',
  'leg-press': 'weights',
  lunges: 'weights',
  'leg-extension': 'weights',
  'romanian-deadlift': 'weights',
  'leg-curl': 'weights',
  'good-mornings': 'weights',
  'hip-thrust': 'weights',
  'cable-kickback': 'weights',
  'standing-calf-raise': 'weights',
  'seated-calf-raise': 'weights',
  'front-squat': 'weights',
  'weighted-pullups': 'weights',
  'weighted-dips': 'weights',
  'inverted-rows': 'weights',
  'pause-squat': 'weights',
  'paused-bench': 'weights',
  'paused-deadlift': 'weights',
  'deficit-deadlift': 'weights',
  'rack-pull': 'weights',
  'ab-wheel': 'weights',
  'kettlebell-swings': 'weights',
  'push-ups': 'bodyweight',
  'pull-ups': 'bodyweight',
  'chest-dips': 'bodyweight',
  'tricep-dips': 'bodyweight',
  burpees: 'bodyweight',
  plank: 'timed',
  'hanging-leg-raise': 'weights',
  'cable-crunch': 'weights',
  'back-raises': 'weights',
  hyperextensions: 'weights',
  treadmill: 'cardio',
  'rowing-machine': 'cardio',
  'stationary-bike': 'cardio',
  'box-jump': 'plyo',
};

export function getExerciseTypeByLibraryId(id: string): ExerciseType {
  return EXERCISE_TYPE_BY_LIBRARY_ID[id] ?? 'weights';
}

export const LIBRARY_ID_TO_LIFT_TYPE: Record<string, string> = {
  'barbell-squat': 'squat',
  'front-squat': 'squat',
  'pause-squat': 'squat',
  'barbell-bench-press': 'bench',
  'dumbbell-bench-press': 'bench',
  'incline-dumbbell-press': 'bench',
  'paused-bench': 'bench',
  deadlift: 'deadlift',
  'paused-deadlift': 'deadlift',
  'deficit-deadlift': 'deadlift',
  'rack-pull': 'deadlift',
  'overhead-press': 'ohp',
  'dumbbell-shoulder-press': 'ohp',
  'barbell-row': 'deadlift',
};

export function getDefaultLiftForExercise(
  libraryId: string | null | undefined,
): 'squat' | 'bench' | 'deadlift' | 'ohp' {
  if (!libraryId) return 'squat';
  const mapped = LIBRARY_ID_TO_LIFT_TYPE[libraryId];
  if (mapped === 'squat' || mapped === 'bench' || mapped === 'deadlift' || mapped === 'ohp') {
    return mapped;
  }
  return 'squat';
}

export function getVideoTutorialByName(
  exerciseName: string | undefined | null,
): VideoTutorial | undefined {
  if (!exerciseName) return undefined;
  const normalizedName = exerciseName.toLowerCase().trim();
  const match = exerciseLibrary.find((ex) => ex.name.toLowerCase() === normalizedName);
  return match?.videoTutorial;
}
