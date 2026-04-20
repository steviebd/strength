1. localstorage should hit programs. currently when you start a workout, it doesn't call the API to save until compelte since it would hit the d1 database and reduce reliability.
2. figure out wrangler + front-end app on expo in staging and prod
3. remote d1 for dev, database for staging and prod
4. localstorage to store last workout for an exercise (set, weight, reps) so we can use it for the current exercise