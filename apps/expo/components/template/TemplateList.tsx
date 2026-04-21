import { View, Text, Pressable, ActivityIndicator, Alert, StyleSheet } from 'react-native';
import { useTemplates, type Template } from '@/hooks/useTemplates';
import { Badge, SectionTitle, Surface } from '@/components/ui/app-primitives';
import { ScreenScrollView } from '@/components/ui/Screen';
import { colors, spacing } from '@/theme';

interface TemplateListProps {
  onEditTemplate?: (template: Template) => void;
  onStartWorkout?: (template: Template) => void;
}

export function TemplateList({ onEditTemplate, onStartWorkout }: TemplateListProps) {
  const { templates, isLoading, isError: _isError, deleteTemplate } = useTemplates();

  const handleDelete = (template: Template) => {
    Alert.alert('Delete Template', `Are you sure you want to delete "${template.name}"?`, [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => {
          if (!template.id) {
            return;
          }
          deleteTemplate.mutate(template.id);
        },
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={colors.accent} />
      </View>
    );
  }

  if (templates.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyTitle}>No Templates Yet</Text>
        <Text style={styles.emptyText}>Tap "+ New" to create your first workout template.</Text>
      </View>
    );
  }

  return (
    <ScreenScrollView horizontalPadding={16} bottomInset={188}>
      {templates.map((template) => (
        <Surface key={template.id} style={styles.templateCard}>
          <Pressable
            onPress={() => {
              if (onEditTemplate) {
                onEditTemplate(template);
              }
            }}
            style={styles.templateHeader}
          >
            <View style={styles.templateTitleRow}>
              <Text style={styles.templateName} numberOfLines={1}>
                {template.name}
              </Text>
              <Badge label={`${template.exercises?.length || 0} exercises`} tone="orange" />
            </View>
            {template.description && (
              <Text style={styles.templateDescription} numberOfLines={2}>
                {template.description}
              </Text>
            )}
          </Pressable>

          {template.exercises && template.exercises.length > 0 && (
            <View style={styles.exercisesSection}>
              <SectionTitle title="Exercises" />
              <View style={styles.exerciseList}>
                {template.exercises.slice(0, 3).map((ex) => (
                  <View key={ex.id} style={styles.exerciseRow}>
                    <Text style={styles.exerciseName} numberOfLines={1}>
                      {ex.name}
                    </Text>
                    <Text style={styles.exerciseSets}>
                      {ex.sets} × {ex.reps}
                      {ex.isAmrap ? '+' : ''}
                    </Text>
                  </View>
                ))}
                {template.exercises.length > 3 && (
                  <Text style={styles.moreExercises}>+{template.exercises.length - 3} more</Text>
                )}
              </View>
            </View>
          )}

          <View style={styles.actionRow}>
            <Pressable
              onPress={() => {
                if (onStartWorkout) {
                  onStartWorkout(template);
                }
              }}
              style={styles.startButton}
            >
              <Text style={styles.startButtonText}>Start Workout</Text>
            </Pressable>
            <Pressable onPress={() => handleDelete(template)} style={styles.deleteButton}>
              <Text style={styles.deleteButtonText}>🗑</Text>
            </Pressable>
          </View>
        </Surface>
      ))}
    </ScreenScrollView>
  );
}

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.background,
    paddingHorizontal: spacing.lg,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: '600',
    color: colors.text,
    marginBottom: spacing.sm,
  },
  emptyText: {
    fontSize: 15,
    color: colors.textMuted,
    textAlign: 'center',
    lineHeight: 22,
  },
  templateCard: {
    marginBottom: spacing.md,
    backgroundColor: 'rgba(24,24,27,0.7)',
  },
  templateHeader: {
    marginBottom: spacing.md,
    gap: spacing.sm,
  },
  templateTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  templateName: {
    flex: 1,
    fontSize: 17,
    fontWeight: '600',
    color: colors.text,
    marginRight: spacing.sm,
  },
  templateDescription: {
    fontSize: 13,
    color: colors.textMuted,
    lineHeight: 20,
  },
  exercisesSection: {
    borderTopWidth: 1,
    borderTopColor: 'rgba(255,255,255,0.08)',
    paddingTop: spacing.md,
    marginBottom: spacing.md,
  },
  exerciseList: {
    gap: spacing.xs,
  },
  exerciseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  exerciseName: {
    flex: 1,
    fontSize: 14,
    color: '#e2e8f0',
  },
  exerciseSets: {
    fontSize: 12,
    color: '#64748b',
  },
  moreExercises: {
    fontSize: 12,
    color: '#64748b',
    marginTop: 4,
  },
  actionRow: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  startButton: {
    flex: 1,
    backgroundColor: colors.accent,
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
  },
  startButtonText: {
    color: '#ffffff',
    fontSize: 14,
    fontWeight: '600',
  },
  deleteButton: {
    height: 48,
    width: 48,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(251,113,133,0.2)',
    backgroundColor: 'rgba(251,113,133,0.1)',
  },
  deleteButtonText: {
    fontSize: 16,
  },
});
