# Exercise catalog

The closed list of exercises the API accepts (decision D5), generated from `prisma/seed/exercise-catalog.json`.
Names and aliases match case-insensitively with collapsed spaces. A unit test keeps this file in sync with the JSON.
Muscle-group codes for the `muscleGroup` filter: `chest`, `upper_back`, `lats`, `traps`, `front_delts`, `side_delts`, `rear_delts`, `biceps`, `triceps`, `forearms`, `abs`, `obliques`, `lower_back`, `glutes`, `quads`, `hamstrings`, `adductors`, `calves`.

| Exercise | Aliases | Primary | Secondary |
|---|---|---|---|
| Bench Press | Barbell Bench Press, Flat Bench Press, BB Bench | chest | front_delts, triceps |
| Incline Bench Press | Incline Barbell Bench Press | chest | front_delts, triceps |
| Decline Bench Press | Decline Barbell Bench Press | chest | triceps |
| Dumbbell Bench Press | DB Bench Press, Flat Dumbbell Press | chest | front_delts, triceps |
| Incline Dumbbell Press | Incline DB Press | chest | front_delts, triceps |
| Dumbbell Fly | DB Fly, Dumbbell Flye | chest | front_delts |
| Cable Crossover | Cable Fly, Cable Flye | chest | front_delts |
| Machine Chest Press | Chest Press | chest | triceps |
| Push-Up | Push Up, Pushup, Press-Up | chest | triceps, front_delts |
| Dips | Dip, Parallel Bar Dip | triceps, chest | front_delts |
| Deadlift | Conventional Deadlift, Barbell Deadlift | hamstrings, glutes, lower_back | traps, forearms, quads |
| Romanian Deadlift | RDL | hamstrings, glutes | lower_back |
| Sumo Deadlift | – | glutes, hamstrings, adductors | quads, lower_back |
| Pull-Up | Pull Up, Pullup | lats | biceps, upper_back |
| Chin-Up | Chin Up, Chinup | lats, biceps | upper_back |
| Lat Pulldown | Lat Pull-Down, Pulldown | lats | biceps, upper_back |
| Barbell Row | Bent-Over Row, Bent Over Barbell Row, Pendlay Row | upper_back, lats | biceps, rear_delts, lower_back |
| Dumbbell Row | One-Arm Dumbbell Row, DB Row | lats, upper_back | biceps, rear_delts |
| Seated Cable Row | Cable Row, Seated Row | upper_back, lats | biceps |
| T-Bar Row | T Bar Row | upper_back, lats | biceps |
| Face Pull | Cable Face Pull | rear_delts | upper_back, traps |
| Barbell Shrug | Shrug, Shrugs | traps | forearms |
| Back Extension | Hyperextension, 45 Degree Back Extension | lower_back | glutes, hamstrings |
| Overhead Press | OHP, Military Press, Standing Barbell Press | front_delts | side_delts, triceps |
| Seated Dumbbell Shoulder Press | Dumbbell Shoulder Press, DB Shoulder Press | front_delts | side_delts, triceps |
| Arnold Press | – | front_delts, side_delts | triceps |
| Lateral Raise | Dumbbell Lateral Raise, Side Raise | side_delts | – |
| Front Raise | Dumbbell Front Raise | front_delts | – |
| Rear Delt Fly | Reverse Fly, Reverse Dumbbell Fly | rear_delts | upper_back |
| Upright Row | Barbell Upright Row | side_delts, traps | biceps |
| Barbell Curl | BB Curl, Standing Barbell Curl | biceps | forearms |
| Dumbbell Curl | DB Curl, Bicep Curl, Biceps Curl | biceps | forearms |
| Hammer Curl | Dumbbell Hammer Curl | biceps, forearms | – |
| Preacher Curl | EZ Bar Preacher Curl | biceps | – |
| Triceps Pushdown | Tricep Pushdown, Cable Pushdown, Rope Pushdown | triceps | – |
| Skull Crusher | Lying Triceps Extension, Skullcrusher | triceps | – |
| Overhead Triceps Extension | Overhead Tricep Extension | triceps | – |
| Close-Grip Bench Press | Close Grip Bench Press, CGBP | triceps | chest, front_delts |
| Wrist Curl | Barbell Wrist Curl | forearms | – |
| Back Squat | Squat, Barbell Squat, Barbell Back Squat | quads, glutes | hamstrings, adductors, lower_back |
| Front Squat | Barbell Front Squat | quads | glutes, abs |
| Goblet Squat | – | quads, glutes | adductors |
| Leg Press | Machine Leg Press, 45 Degree Leg Press | quads, glutes | hamstrings |
| Bulgarian Split Squat | BSS, Rear-Foot-Elevated Split Squat | quads, glutes | adductors |
| Walking Lunge | Lunge, Lunges, Dumbbell Lunge | quads, glutes | hamstrings |
| Leg Extension | Machine Leg Extension | quads | – |
| Lying Leg Curl | Leg Curl, Hamstring Curl | hamstrings | – |
| Seated Leg Curl | – | hamstrings | – |
| Hip Thrust | Barbell Hip Thrust | glutes | hamstrings |
| Hip Adduction | Adductor Machine | adductors | – |
| Standing Calf Raise | Calf Raise, Calf Raises | calves | – |
| Seated Calf Raise | – | calves | – |
| Plank | Front Plank | abs | obliques |
| Hanging Leg Raise | Leg Raise | abs | obliques |
| Cable Crunch | Kneeling Cable Crunch | abs | – |
| Russian Twist | – | obliques | abs |
| Ab Wheel Rollout | Ab Rollout, Ab Wheel | abs | lats |
