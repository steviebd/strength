const DAYS_OF_WEEK = [
  'sunday',
  'monday',
  'tuesday',
  'wednesday',
  'thursday',
  'friday',
  'saturday',
] as const;
export type DayOfWeek = (typeof DAYS_OF_WEEK)[number];

export function getDayIndex(day: DayOfWeek): number {
  return DAYS_OF_WEEK.indexOf(day);
}

export function isSameDate(a: Date, b: Date): boolean {
  return (
    a.getFullYear() === b.getFullYear() &&
    a.getMonth() === b.getMonth() &&
    a.getDate() === b.getDate()
  );
}

export function addDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setDate(result.getDate() + days);
  return result;
}

export function getMonday(date: Date): Date {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day + (day === 0 ? -6 : 1);
  d.setDate(diff);
  return d;
}

export function isGymDay(date: Date, preferredDays: DayOfWeek[]): boolean {
  const dayName = DAYS_OF_WEEK[date.getDay()];
  return preferredDays.includes(dayName);
}

export interface WorkoutScheduleEntry {
  weekNumber: number;
  sessionNumber: number;
  sessionName: string;
  scheduledDate: Date;
  scheduledTime?: string;
}

export interface ScheduleWorkout {
  weekNumber: number;
  sessionNumber: number;
  sessionName: string;
}

export interface ScheduleOptions {
  preferredDays: DayOfWeek[];
  preferredTimeOfDay?: 'morning' | 'afternoon' | 'evening';
  skipBankHolidays?: boolean;
  forceFirstSessionDate?: Date;
}

export function generateWorkoutSchedule(
  workouts: ScheduleWorkout[],
  startDate: Date,
  options: ScheduleOptions,
): WorkoutScheduleEntry[] {
  const schedule: WorkoutScheduleEntry[] = [];
  let currentDate = new Date(startDate);
  const scheduledDates = new Set<string>();

  const timeMap = {
    morning: 7,
    afternoon: 12,
    evening: 17,
  };
  const hour = options.preferredTimeOfDay ? timeMap[options.preferredTimeOfDay] : undefined;

  for (let workoutIndex = 0; workoutIndex < workouts.length; workoutIndex++) {
    const workout = workouts[workoutIndex];
    let foundDate: Date | null = null;

    const isFirstWorkout = workoutIndex === 0;
    const forceDate =
      isFirstWorkout && options.forceFirstSessionDate ? options.forceFirstSessionDate : null;

    if (forceDate) {
      foundDate = forceDate;
      scheduledDates.add(
        `${foundDate.getFullYear()}-${foundDate.getMonth()}-${foundDate.getDate()}`,
      );
    } else {
      let iterations = 0;
      while (!foundDate) {
        if (iterations >= 365) {
          throw new Error('Unable to schedule workout: no valid gym day found within 365 days');
        }
        iterations++;

        const dateToCheck = new Date(currentDate);
        const dateKey = `${dateToCheck.getFullYear()}-${dateToCheck.getMonth()}-${dateToCheck.getDate()}`;

        if (isGymDay(dateToCheck, options.preferredDays) && !scheduledDates.has(dateKey)) {
          foundDate = dateToCheck;
          scheduledDates.add(dateKey);
        } else {
          currentDate = addDays(currentDate, 1);
        }
      }
    }

    schedule.push({
      weekNumber: workout.weekNumber,
      sessionNumber: workout.sessionNumber,
      sessionName: workout.sessionName,
      scheduledDate: foundDate,
      scheduledTime: hour ? `${hour.toString().padStart(2, '0')}:00` : undefined,
    });

    currentDate = addDays(foundDate, 1);
  }

  return schedule;
}

export function getCurrentWeekNumber(
  schedule: WorkoutScheduleEntry[],
  today: Date = new Date(),
): number {
  const todayEntry = schedule.find((s) => isSameDate(s.scheduledDate, today));
  if (todayEntry) return todayEntry.weekNumber;

  const sortedSchedule = [...schedule].sort(
    (a, b) => a.scheduledDate.getTime() - b.scheduledDate.getTime(),
  );
  const upcoming = sortedSchedule.find((s) => s.scheduledDate > today);
  const previous = [...sortedSchedule].reverse().find((s) => s.scheduledDate <= today);

  return upcoming?.weekNumber ?? previous?.weekNumber ?? 1;
}

export function getWorkoutsForWeek(
  schedule: WorkoutScheduleEntry[],
  weekNumber: number,
): WorkoutScheduleEntry[] {
  return schedule.filter((s) => s.weekNumber === weekNumber);
}

export function getWeekDateRange(
  weekNumber: number,
  schedule: WorkoutScheduleEntry[],
): { start: Date; end: Date; days: Date[] } {
  const weekWorkouts = getWorkoutsForWeek(schedule, weekNumber);
  if (weekWorkouts.length === 0) {
    return { start: new Date(), end: new Date(), days: [] };
  }

  const dates = weekWorkouts.map((w) => w.scheduledDate);
  const start = getMonday(dates[0]);
  const end = addDays(start, 6);

  const days: Date[] = [];
  for (let i = 0; i < 7; i++) {
    days.push(addDays(start, i));
  }

  return { start, end, days };
}

export function formatTime(time: string): string {
  const [hours] = time.split(':');
  const hour = parseInt(hours, 10);
  const ampm = hour >= 12 ? 'PM' : 'AM';
  const hour12 = hour % 12 || 12;
  return `${hour12}:00 ${ampm}`;
}

export function formatDateShort(date: Date): string {
  return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

export function formatDateLong(dateStr: string): string {
  const date = new Date(`${dateStr}T00:00:00`);
  return date.toLocaleDateString('en-US', {
    weekday: 'long',
    month: 'long',
    day: 'numeric',
    year: 'numeric',
  });
}
