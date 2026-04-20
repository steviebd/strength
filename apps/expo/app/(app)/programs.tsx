/* oxlint-disable no-unused-vars */
import { useEffect, useState, useRef } from 'react';
import {
  ActivityIndicator,
  Alert,
  Keyboard,
  LayoutChangeEvent,
  Platform,
  Pressable,
  ScrollView,
  Text,
  TextInput,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { env } from '@/lib/env';
import { apiFetch } from '@/lib/api';
import { useUserPreferences } from '@/context/UserPreferencesContext';

type WeightUnit = 'kg' | 'lbs';

const LBS_TO_KG = 0.453592;

interface ProgramListItem {
  slug: string;
  name: string;
  description: string;
  difficulty: string;
  daysPerWeek: number;
  estimatedWeeks: number;
  totalSessions: number;
}

interface ActiveProgram {
  id: string;
  programSlug: string;
  name: string;
  currentWeek: number | null;
  currentSession: number | null;
  totalSessionsCompleted: number;
  totalSessionsPlanned: number;
}

interface LatestOneRMs {
  squat1rm: number | null;
  bench1rm: number | null;
  deadlift1rm: number | null;
  ohp1rm: number | null;
}

const PROGRAM_INFO: ProgramListItem[] = [
  {
    slug: 'stronglifts-5x5',
    name: 'StrongLifts 5×5',
    description:
      'The classic beginner program that has helped millions get stronger. Simple, effective, and proven.',
    difficulty: 'beginner',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
  {
    slug: '531',
    name: 'Wendler 5/3/1',
    description:
      'A time-tested strength program that uses wave loading and AMRAP sets to build real strength.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 12,
    totalSessions: 48,
  },
  {
    slug: 'madcow-5x5',
    name: 'MadCow 5×5',
    description:
      'An intermediate progression from StrongLifts with more volume and progressive overload.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 12,
    totalSessions: 36,
  },
  {
    slug: 'candito-6-week',
    name: 'Candito 6-Week',
    description:
      'A high-volume powerlifting program designed for intermediates looking to break through plateaus.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 6,
    totalSessions: 24,
  },
  {
    slug: 'nsuns-lp',
    name: 'nSuns LP',
    description:
      'A high-volume linear progression program that builds impressive strength and volume.',
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'sheiko',
    name: 'Sheiko',
    description: 'A Russian-inspired powerlifting program known for its high frequency and volume.',
    difficulty: 'advanced',
    daysPerWeek: 4,
    estimatedWeeks: 12,
    totalSessions: 48,
  },
  {
    slug: 'nuckols-28-programs',
    name: 'Nuckols 28 Programs',
    description: 'A customizable program system by Greg Nuckols with options for all skill levels.',
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
  {
    slug: 'stronger-by-the-day',
    name: 'Stronger By The Day',
    description: "Megsquats' program designed to build lasting strength with smart periodization.",
    difficulty: 'intermediate',
    daysPerWeek: 4,
    estimatedWeeks: 8,
    totalSessions: 32,
  },
  {
    slug: 'unapologetically-strong',
    name: 'Unapologetically Strong',
    description: "Jen Sinkler's program focused on building functional strength for women.",
    difficulty: 'intermediate',
    daysPerWeek: 3,
    estimatedWeeks: 8,
    totalSessions: 24,
  },
];

function getDisplaySessionNumber(program: ActiveProgram) {
  return Math.min(program.totalSessionsCompleted + 1, program.totalSessionsPlanned);
}

export default function ProgramsScreen() {
  const router = useRouter();
  const [availablePrograms, setAvailablePrograms] = useState<ProgramListItem[]>(PROGRAM_INFO);
  const [activePrograms, setActivePrograms] = useState<ActiveProgram[]>([]);
  const [latestOneRMs, setLatestOneRMs] = useState<LatestOneRMs | null>(null);
  const [loading, setLoading] = useState(true);
  const [showStartModal, setShowStartModal] = useState(false);
  const [selectedProgram, setSelectedProgram] = useState<ProgramListItem | null>(null);
  const [showDetailModal, setShowDetailModal] = useState(false);
  const [startingProgram, setStartingProgram] = useState(false);
  const [openingProgramWorkoutId, setOpeningProgramWorkoutId] = useState<string | null>(null);
  const [deletingProgramId, setDeletingProgramId] = useState<string | null>(null);
  const [values, setValues] = useState({ squat: '', bench: '', deadlift: '', ohp: '' });
  const [keyboardInset, setKeyboardInset] = useState(0);
  const [viewportHeight, setViewportHeight] = useState(0);
  const { weightUnit } = useUserPreferences();
  const insets = useSafeAreaInsets();
  const scrollViewRef = useRef<ScrollView>(null);
  const inputRefs = useRef<Record<string, TextInput | null>>({});
  const inputPositions = useRef<Record<string, number>>({});
  const activeInputKey = useRef<string | null>(null);
  const keyboardHeight = useRef(0);
  const scrollViewportHeight = useRef(0);
  const scrollOffsetY = useRef(0);
  const pendingScrollTimeouts = useRef<number[]>([]);
  const inputOrder = ['squat', 'bench', 'deadlift', 'ohp'] as const;

  const scrollToInput = (key: string) => {
    const scrollView = scrollViewRef.current;
    if (!scrollView || scrollViewportHeight.current === 0) {
      return;
    }

    const inputY = inputPositions.current[key];
    if (inputY === undefined) {
      return;
    }

    const desiredTopOffset = Platform.OS === 'android' ? 8 : 24;
    const targetY = Math.max(0, inputY - desiredTopOffset);

    scrollView.scrollTo({ y: targetY, animated: true });
  };

  const clearPendingScrolls = () => {
    pendingScrollTimeouts.current.forEach((timeoutId) => clearTimeout(timeoutId));
    pendingScrollTimeouts.current = [];
  };

  const scheduleScrollToInput = (key: string) => {
    clearPendingScrolls();
    [0, 120, 280, 420].forEach((delay) => {
      const timeoutId = setTimeout(() => {
        if (activeInputKey.current === key) {
          scrollToInput(key);
        }
      }, delay);
      pendingScrollTimeouts.current.push(timeoutId as unknown as number);
    });
  };

  const focusNextInput = (key: (typeof inputOrder)[number]) => {
    const currentIndex = inputOrder.indexOf(key);
    const nextKey = inputOrder[currentIndex + 1];

    if (nextKey) {
      inputRefs.current[nextKey]?.focus();
    }
  };

  const handleInputLayout =
    (key: string) =>
    (event: LayoutChangeEvent): void => {
      inputPositions.current[key] = event.nativeEvent.layout.y;
    };

  useEffect(() => {
    void fetchProgramsScreenData();
  }, []);

  useEffect(() => {
    const showEvent = Platform.OS === 'ios' ? 'keyboardWillShow' : 'keyboardDidShow';
    const hideEvent = Platform.OS === 'ios' ? 'keyboardWillHide' : 'keyboardDidHide';

    const showSubscription = Keyboard.addListener(showEvent, (event) => {
      keyboardHeight.current = event.endCoordinates.height;
      setKeyboardInset(event.endCoordinates.height);

      if (activeInputKey.current) {
        scheduleScrollToInput(activeInputKey.current);
      }
    });

    const hideSubscription = Keyboard.addListener(hideEvent, () => {
      keyboardHeight.current = 0;
      setKeyboardInset(0);
      clearPendingScrolls();
    });

    return () => {
      clearPendingScrolls();
      showSubscription.remove();
      hideSubscription.remove();
    };
  }, []);

  async function fetchProgramsScreenData() {
    try {
      const [programs, activePrograms] = await Promise.all([
        apiFetch<ProgramListItem[]>('/api/programs'),
        apiFetch<ActiveProgram[]>('/api/programs/active'),
      ]);
      setAvailablePrograms(
        Array.isArray(programs) && programs.length > 0 ? programs : PROGRAM_INFO,
      );
      setActivePrograms(Array.isArray(activePrograms) ? activePrograms : []);
      try {
        const latestOneRMs = await apiFetch<LatestOneRMs | null>('/api/programs/latest-1rms');
        setLatestOneRMs(latestOneRMs);
      } catch {
        setLatestOneRMs(null);
      }
    } catch (e) {
      console.error('Failed to fetch programs:', e);
    } finally {
      setLoading(false);
    }
  }

  const getDifficultyColor = (difficulty: string) => {
    switch (difficulty) {
      case 'beginner':
        return 'bg-green-500/20 text-green-400';
      case 'intermediate':
        return 'bg-yellow-500/20 text-yellow-400';
      case 'advanced':
        return 'bg-red-500/20 text-red-400';
      default:
        return 'bg-darkBorder text-darkMuted';
    }
  };

  const getTotalSessions = (slug: string): number => {
    switch (slug) {
      case 'stronglifts-5x5':
        return 24;
      case '531':
        return 48;
      case 'madcow-5x5':
        return 36;
      case 'candito-6-week':
        return 24;
      case 'nsuns-lp':
        return 32;
      case 'sheiko':
        return 48;
      case 'nuckols-28-programs':
        return 24;
      case 'stronger-by-the-day':
        return 32;
      case 'unapologetically-strong':
        return 24;
      default:
        return 24;
    }
  };

  const handleStartProgram = async () => {
    if (!values.squat || !values.bench || !values.deadlift || !values.ohp) {
      Alert.alert('Missing Values', 'Please enter all your 1RM values to continue.');
      return;
    }

    if (!selectedProgram) return;

    setStartingProgram(true);
    try {
      const convertToKg = (value: number) => (weightUnit === 'lbs' ? value * LBS_TO_KG : value);

      await apiFetch('/api/programs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          programSlug: selectedProgram.slug,
          name: selectedProgram.name,
          squat1rm: convertToKg(parseFloat(values.squat)),
          bench1rm: convertToKg(parseFloat(values.bench)),
          deadlift1rm: convertToKg(parseFloat(values.deadlift)),
          ohp1rm: convertToKg(parseFloat(values.ohp)),
          totalSessionsPlanned: getTotalSessions(selectedProgram.slug),
          estimatedWeeks: selectedProgram.estimatedWeeks,
        }),
      });

      setShowStartModal(false);
      setShowDetailModal(false);
      setSelectedProgram(null);
      setValues({ squat: '', bench: '', deadlift: '', ohp: '' });
      await fetchProgramsScreenData();
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to start program');
    } finally {
      setStartingProgram(false);
    }
  };

  const handleOpenCurrentProgramWorkout = async (program: ActiveProgram) => {
    if (!program.id) {
      return;
    }

    setOpeningProgramWorkoutId(program.id);
    try {
      const result = await apiFetch<{
        workoutId: string;
        created: boolean;
        completed: boolean;
      }>(`/api/programs/cycles/${program.id}/workouts/current/start`, {
        method: 'POST',
      });

      if (result.completed) {
        Alert.alert(
          'Session Already Completed',
          'This program session has already been completed.',
        );
        await fetchProgramsScreenData();
        return;
      }

      router.push(`/workout-session?workoutId=${result.workoutId}&source=program`);
    } catch (e) {
      Alert.alert('Error', e instanceof Error ? e.message : 'Failed to open current session');
    } finally {
      setOpeningProgramWorkoutId(null);
    }
  };

  const handleDeleteProgram = (program: ActiveProgram) => {
    Alert.alert('Delete Active Program', `Delete ${program.name}?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeletingProgramId(program.id);
          try {
            await apiFetch(`/api/programs/cycles/${program.id}`, { method: 'DELETE' });
            await fetchProgramsScreenData();
          } catch (e) {
            Alert.alert('Error', e instanceof Error ? e.message : 'Failed to delete program');
          } finally {
            setDeletingProgramId(null);
          }
        },
      },
    ]);
  };

  const openProgramDetail = (program: ProgramListItem) => {
    setSelectedProgram(program);
    setShowDetailModal(true);
  };

  const openStartModal = () => {
    if (latestOneRMs) {
      const toDisplay = (value: number | null) => {
        if (value === null) return '';
        return weightUnit === 'lbs' ? (value * 2.20462).toFixed(1) : value.toString();
      };

      setValues({
        squat: toDisplay(latestOneRMs.squat1rm),
        bench: toDisplay(latestOneRMs.bench1rm),
        deadlift: toDisplay(latestOneRMs.deadlift1rm),
        ohp: toDisplay(latestOneRMs.ohp1rm),
      });
    }
    setShowStartModal(true);
  };

  return (
    <View className="flex-1 bg-darkBg">
      <ScrollView
        className="flex-1"
        contentContainerStyle={{ paddingBottom: 100 }}
        showsVerticalScrollIndicator={false}
      >
        <View className="px-6 pt-16">
          <Text className="text-darkMuted text-sm mb-2">Training Programs</Text>
          <Text className="text-darkText text-3xl font-semibold mb-6">Programs</Text>

          {loading ? (
            <View className="flex-1 items-center justify-center py-20">
              <ActivityIndicator size="large" color="#ef6f4f" />
            </View>
          ) : activePrograms.length > 0 ? (
            <View className="mb-6 gap-4">
              {activePrograms.map((activeProgram) => {
                const isOpening = openingProgramWorkoutId === activeProgram.id;
                const currentSession = activeProgram.currentSession ?? 1;
                const displaySessionNumber = getDisplaySessionNumber(activeProgram);
                const progress = Math.min(
                  100,
                  (displaySessionNumber / activeProgram.totalSessionsPlanned) * 100,
                );

                return (
                  <View
                    key={activeProgram.id}
                    className="rounded-2xl border border-coral/50 bg-coral/10 p-5"
                  >
                    <View className="mb-3 flex-row items-center justify-between">
                      <View className="rounded-full bg-coral/20 px-3 py-1">
                        <Text className="text-coral text-xs font-semibold">Active</Text>
                      </View>
                      {activeProgram.currentWeek ? (
                        <Text className="text-darkMuted text-xs">
                          Week {activeProgram.currentWeek} · Session {currentSession}
                        </Text>
                      ) : null}
                    </View>
                    <Text className="mb-1 text-lg font-semibold text-darkText">
                      {activeProgram.name}
                    </Text>
                    <Text className="mb-4 text-sm text-darkMuted">
                      {displaySessionNumber} / {activeProgram.totalSessionsPlanned} sessions
                    </Text>
                    <View className="h-2 overflow-hidden rounded-full bg-darkBorder">
                      <View
                        className="h-full rounded-full bg-coral"
                        style={{ width: `${progress}%` }}
                      />
                    </View>
                    <View className="mt-4 flex-row gap-3">
                      <Pressable
                        className={`flex-1 flex-row items-center justify-center rounded-xl bg-coral px-4 py-3 ${
                          isOpening ? 'opacity-50' : ''
                        }`}
                        onPress={() => handleOpenCurrentProgramWorkout(activeProgram)}
                        disabled={isOpening || deletingProgramId === activeProgram.id}
                      >
                        {isOpening ? <ActivityIndicator size="small" color="#ffffff" /> : null}
                        <Text className="text-sm font-semibold text-white">
                          {isOpening ? ' Opening...' : 'Resume session'}
                        </Text>
                      </Pressable>
                      <Pressable
                        className="items-center justify-center rounded-xl border border-pine/40 px-4 py-3"
                        onPress={() => router.push(`/program-1rm-test?cycleId=${activeProgram.id}`)}
                        disabled={isOpening || deletingProgramId === activeProgram.id}
                      >
                        <Text className="text-sm font-medium text-pine">1RM Test</Text>
                      </Pressable>
                      <Pressable
                        className={`items-center justify-center rounded-xl border border-red-500/40 px-4 py-3 ${
                          deletingProgramId === activeProgram.id ? 'opacity-50' : ''
                        }`}
                        onPress={() => handleDeleteProgram(activeProgram)}
                        disabled={isOpening || deletingProgramId === activeProgram.id}
                      >
                        {deletingProgramId === activeProgram.id ? (
                          <ActivityIndicator size="small" color="#f87171" />
                        ) : (
                          <Text className="text-sm font-medium text-red-400">Delete</Text>
                        )}
                      </Pressable>
                    </View>
                  </View>
                );
              })}
            </View>
          ) : null}

          <Text className="text-darkText text-lg font-semibold mb-4">Available Programs</Text>
          <View className="gap-4">
            {availablePrograms.map((program) => (
              <Pressable
                key={program.slug}
                className="rounded-xl border border-darkBorder bg-darkCard p-5"
                onPress={() => openProgramDetail(program)}
              >
                <View className="flex-row items-start justify-between mb-2">
                  <View className="flex-1">
                    <Text className="text-darkText text-base font-semibold">{program.name}</Text>
                    <Text className="text-darkMuted text-xs mt-1">{program.description}</Text>
                  </View>
                </View>
                <View className="flex-row items-center gap-2 mt-3">
                  <View
                    className={`rounded-full px-2 py-1 ${getDifficultyColor(program.difficulty)}`}
                  >
                    <Text className="text-xs font-medium capitalize">{program.difficulty}</Text>
                  </View>
                  <Text className="text-darkMuted text-xs">·</Text>
                  <Text className="text-darkMuted text-xs">{program.daysPerWeek} days/week</Text>
                  <Text className="text-darkMuted text-xs">·</Text>
                  <Text className="text-darkMuted text-xs">{program.estimatedWeeks} weeks</Text>
                </View>
              </Pressable>
            ))}
          </View>
        </View>
      </ScrollView>

      {/* Program Detail Modal */}
      {selectedProgram && (
        <View className={showDetailModal ? 'absolute inset-0 bg-darkBg' : 'hidden'}>
          <ScrollView className="flex-1" contentContainerStyle={{ paddingBottom: 100 }}>
            <View className="px-6 pt-16">
              <View className="flex-row items-center justify-between mb-6">
                <Pressable
                  onPress={() => setShowDetailModal(false)}
                  className="h-10 w-10 items-center justify-center rounded-full bg-darkBorder"
                >
                  <Text className="text-darkText text-xl">←</Text>
                </Pressable>
                <Text className="text-darkText text-lg font-semibold">Program Details</Text>
                <View className="w-10" />
              </View>

              <Text className="text-darkMuted text-sm mb-1">
                {selectedProgram.daysPerWeek} days/week · {selectedProgram.estimatedWeeks} weeks
              </Text>
              <Text className="text-darkText text-2xl font-semibold mb-2">
                {selectedProgram.name}
              </Text>
              <Text className="text-darkMuted text-sm mb-6">{selectedProgram.description}</Text>

              <Pressable
                className="rounded-xl bg-coral py-4 items-center mb-4"
                onPress={() => {
                  setShowDetailModal(false);
                  openStartModal();
                }}
              >
                <Text className="text-white text-base font-semibold">Start This Program</Text>
              </Pressable>

              <Pressable
                className="rounded-xl border border-darkBorder py-4 items-center"
                onPress={() => setShowDetailModal(false)}
              >
                <Text className="text-darkMuted text-base">Cancel</Text>
              </Pressable>
            </View>
          </ScrollView>
        </View>
      )}

      {/* 1RM Input Modal */}
      <View className={showStartModal ? 'absolute inset-0 bg-darkBg' : 'hidden'}>
        <ScrollView
          ref={scrollViewRef}
          className="flex-1"
          contentContainerStyle={{
            paddingBottom: keyboardInset + insets.bottom + Math.max(520, viewportHeight * 1.35),
          }}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
          onLayout={(event) => {
            scrollViewportHeight.current = event.nativeEvent.layout.height;
            setViewportHeight(event.nativeEvent.layout.height);
          }}
          onScroll={(event) => {
            scrollOffsetY.current = event.nativeEvent.contentOffset.y;
          }}
          scrollEventThrottle={16}
        >
          <View className="px-6 pt-16">
            <View className="flex-row items-center justify-between mb-6">
              <Pressable
                onPress={() => setShowStartModal(false)}
                className="h-10 w-10 items-center justify-center rounded-full bg-darkBorder"
              >
                <Text className="text-darkText text-xl">←</Text>
              </Pressable>
              <Text className="text-darkText text-lg font-semibold">Enter 1RM</Text>
              <View className="w-10" />
            </View>

            <View className="rounded-xl border border-darkBorder bg-darkCard p-4 mb-6">
              <Text className="text-darkText text-sm font-semibold mb-2">
                How to estimate your 1RM
              </Text>
              <Text className="text-darkMuted text-xs leading-relaxed">
                Your 1RM is the maximum weight you can lift for a single rep with good form. If
                you're unsure, you can estimate by lifting a weight you can do for 5-8 reps and
                using the formula: 1RM = weight × (1 + reps/30).
              </Text>
            </View>

            <Text className="text-darkMuted text-sm mb-1">Starting Program</Text>
            <Text className="text-darkText text-xl font-semibold mb-2">
              {selectedProgram?.name}
            </Text>
            <Text className="text-darkMuted text-sm mb-8">
              Enter your current one-rep max (1RM) estimates for each lift. These will be used to
              calculate your working weights.
            </Text>

            <View className="gap-4 mb-8">
              {[
                { key: 'squat', label: 'Squat 1RM', icon: '🏋️' },
                { key: 'bench', label: 'Bench Press 1RM', icon: '💪' },
                { key: 'deadlift', label: 'Deadlift 1RM', icon: '🦵' },
                { key: 'ohp', label: 'Overhead Press 1RM', icon: '🙆' },
              ].map(({ key, label, icon }) => (
                <View key={key} className="rounded-xl border border-darkBorder bg-darkCard p-4">
                  <View className="flex-row items-center justify-between mb-2">
                    <View className="flex-row items-center gap-2">
                      <Text className="text-xl">{icon}</Text>
                      <Text className="text-darkText font-medium">{label}</Text>
                    </View>
                    <Text className="text-darkMuted text-xs">{weightUnit}</Text>
                  </View>
                  <TextInput
                    ref={(ref) => {
                      inputRefs.current[key] = ref;
                    }}
                    className="text-darkText text-2xl font-bold bg-darkBg rounded-lg px-4 py-3"
                    onLayout={handleInputLayout(key)}
                    value={values[key as keyof typeof values]}
                    onChangeText={(v) =>
                      setValues((prev) => ({ ...prev, [key]: v.replace(/[^0-9.]/g, '') }))
                    }
                    onFocus={() => {
                      activeInputKey.current = key;
                      scheduleScrollToInput(key);
                    }}
                    onBlur={() => {
                      if (activeInputKey.current === key) {
                        activeInputKey.current = null;
                      }
                      clearPendingScrolls();
                    }}
                    placeholder="0"
                    placeholderTextColor="#71717a"
                    keyboardType="decimal-pad"
                    returnKeyType={key === 'ohp' ? 'done' : 'next'}
                    blurOnSubmit={key === 'ohp'}
                    onSubmitEditing={() => focusNextInput(key as (typeof inputOrder)[number])}
                  />
                </View>
              ))}
            </View>

            <Pressable
              className={`rounded-xl bg-coral py-4 ${startingProgram ? 'opacity-50' : ''}`}
              onPress={handleStartProgram}
              disabled={startingProgram}
            >
              {startingProgram ? (
                <View className="flex-row items-center justify-center gap-2">
                  <ActivityIndicator size="small" color="#ffffff" />
                  <Text className="text-white font-semibold">Starting Program...</Text>
                </View>
              ) : (
                <Text className="text-center text-base font-semibold text-white">
                  Start Program
                </Text>
              )}
            </Pressable>
          </View>
        </ScrollView>
      </View>
    </View>
  );
}
