export type TemplateId = string;
export type Theme = 'dark' | 'light';
export type WeightMode = 'total' | 'per-dumbbell' | 'machine' | 'additional' | 'smith' | 'plates' | 'bodyweight' | 'custom';
export type LoadCalculation = 'unknown' | 'total' | 'paired' | 'per-side-one' | 'per-side-pair';

export interface Exercise {
  id: string;
  name: string;
  description: string;
  weightMode: WeightMode;
  unilateral: boolean;
  primaryMuscle?: string;
  secondaryMuscles?: string[];
  repetitionRule?: string;
  bodyWeight?: boolean;
  customWeightNote?: string;
  archived?: boolean;
  revision?: number;
  comparisonKey?: string;
  /** Explicit mechanics, never inferred from an exercise name. */
  loadCalculation?: LoadCalculation;
  bodyWeightModel?: 'unknown' | 'pull-up';
}
export interface TemplateSlot {
  id: string;
  exerciseIds: string[];
  sets: number;
  reps: [number, number];
  optional: boolean;
  descriptionOverride?: string;
  alternating?: boolean;
  primaryExerciseId?: string;
}
export interface WorkoutTemplate {
  id: TemplateId;
  name: string;
  muscleGroups: string[];
  revision: number;
  slots: TemplateSlot[];
  code?: string;
  description?: string;
  archived?: boolean;
}
export interface WorkingSet {
  id: string;
  weightKg: number | null;
  reps: number | null;
  status: 'pending' | 'completed' | 'skipped';
  weightText?: string;
  repsText?: string;
  rightWeightKg?: number | null;
  rightReps?: number | null;
  rightWeightText?: string;
  rightRepsText?: string;
}
export interface SessionExercise {
  slotId: string;
  exercise: Exercise;
  targetReps: [number, number];
  optional: boolean;
  sets: WorkingSet[];
  notes: string;
  plannedSets?: number;
  skipped?: boolean;
  added?: boolean;
  separateSides?: boolean;
  previousSets?: WorkingSet[];
  alternation?: { variantIds: string[]; selectedId: string };
}
export interface WorkoutSession {
  id: string;
  templateId: TemplateId;
  templateRevision: number;
  name: string;
  muscleGroups: string[];
  status: 'active' | 'completed' | 'incomplete' | 'skipped';
  startedAt: string;
  endedAt: string | null;
  exercises: SessionExercise[];
  notes: string;
  revision: number;
  advanceCycle: boolean;
  originalExercises: SessionExercise[];
  cycleBefore?: CycleSnapshot;
  cycleAfter?: CycleSnapshot;
  templateCode?: string;
}
export interface Settings {
  id: 'user';
  theme: Theme;
  /** JavaScript days: Sunday = 0. */
  trainingDays: number[];
  scheduleRevision?: number;
  recommendationsEnabled?: boolean;
  lastBackupAt?: string;
  backupRemindersEnabled?: boolean;
  backupReminderDismissedUntil?: string;
}
export interface ProgramState {
  id: 'program';
  nextTemplateId: TemplateId;
  /** Increment only on completion, never on preview/start/abandon. */
  completedCounts: Record<TemplateId, number>;
  activeSessionId: string | null;
  alternationCount: number;
  cycleRevision?: number;
  name?: string;
  sequence?: string[];
  alternationNext?: Record<string, string>;
}
export interface CycleSnapshot {
  nextTemplateId: TemplateId;
  completedCounts: Record<TemplateId, number>;
  alternationCount: number;
  cycleRevision: number;
  sequence?: string[];
  alternationNext?: Record<string, string>;
}
export interface ScheduleException {
  id: string;
  date: string;
  targetDate?: string;
  kind: 'skip' | 'move' | 'extra';
  revision: number;
}
export interface BodyWeightEntry {
  id: string;
  measuredAt: string;
  weightKg: number;
  revision?: number;
}
export interface DatabaseState { id: 'state'; epoch: string; changes: number }
export type DraftKind = 'template' | 'exercise' | 'cycle' | 'schedule' | 'history' | 'description' | 'body-weight';
export interface RecoveryDraft { id: string; kind: DraftKind; objectId: string; value: Record<string, unknown>; savedAt: string }
