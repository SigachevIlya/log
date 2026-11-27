import type { BodyWeightEntry, Exercise, ProgramState, RecoveryDraft, ScheduleException, Settings, WorkoutSession, WorkoutTemplate } from '../models';
import { classify, validSet } from '../workout';
import { localDate } from '../calendar';
import { DATABASE_SCHEMA } from '../../lib/version';
export const BACKUP_FORMAT = 'LOG.backup';
export const BACKUP_VERSION = 1;
export const MAX_BACKUP_BYTES = 50 * 1024 * 1024;
export interface BackupData {
  library: Exercise[]; workoutTemplates: WorkoutTemplate[]; workouts: WorkoutSession[];
  cycle: ProgramState; preferences: Settings; weightMeasurements: BodyWeightEntry[];
  scheduleChanges: ScheduleException[]; editorDrafts: RecoveryDraft[];
}
export interface LogBackup { format: typeof BACKUP_FORMAT; formatVersion: number; appVersion: string; schemaVersion: number; createdAt: string; data: BackupData }
type ObjectValue = Record<string, any>;
function fail(path: string, message: string): never { throw new Error(`Некорректная копия: ${path} — ${message}.`); }
function object(value: unknown, path: string): ObjectValue { if (!value || typeof value !== 'object' || Array.isArray(value)) fail(path, 'ожидался объект'); return value as ObjectValue; }
function array(value: unknown, path: string, maximum = 40_000): any[] { if (!Array.isArray(value) || value.length > maximum) fail(path, `ожидался список не более ${maximum} элементов`); return value; }
function text(value: unknown, path: string, maximum = 4000, empty = true): asserts value is string { if (typeof value !== 'string' || value.length > maximum || (!empty && !value.trim())) fail(path, 'недопустимая строка'); }
function integer(value: unknown, path: string, minimum = 0, maximum = Number.MAX_SAFE_INTEGER) { if (!Number.isSafeInteger(value) || (value as number) < minimum || (value as number) > maximum) fail(path, 'недопустимое целое число'); }
function number(value: unknown, path: string, minimum = 0) { if (typeof value !== 'number' || !Number.isFinite(value) || value < minimum) fail(path, 'недопустимое число'); }
function optional(value: ObjectValue, field: string, check: (value: unknown, path: string) => void, path: string) { if (value[field] !== undefined) check(value[field], `${path}.${field}`); }
function bool(value: unknown, path: string) { if (typeof value !== 'boolean') fail(path, 'ожидалось логическое значение'); }
function oneOf(value: unknown, values: readonly string[], path: string) { if (typeof value !== 'string' || !values.includes(value)) fail(path, 'неподдерживаемое значение'); }
function id(value: unknown, path: string) { text(value, path, 1000, false); }
function strings(value: unknown, path: string, maximum = 2000) { const values = array(value, path, maximum); values.forEach((row, index) => text(row, `${path}[${index}]`)); return values as string[]; }
function unique(values: string[], path: string) { if (new Set(values).size !== values.length) fail(path, 'повторяются идентификаторы или значения'); }
function iso(value: unknown, path: string) {
  text(value, path, 64, false);
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})$/.test(value) || !Number.isFinite(Date.parse(value))) fail(path, 'некорректные дата и время');
  day(value.slice(0, 10), path);
}
function day(value: unknown, path: string) { text(value, path, 10); try { localDate(value); } catch { fail(path, 'некорректная календарная дата'); } }
function record(value: unknown, path: string, check: (value: unknown, path: string) => void) { for (const [key, row] of Object.entries(object(value, path))) { id(key, path); check(row, `${path}.${key}`); } }
function revision(value: ObjectValue, path: string) { optional(value, 'revision', integer, path); }
function exercise(value: unknown, path: string, draft = false) {
  const row = object(value, path); id(row.id, `${path}.id`); text(row.name, `${path}.name`, 200, draft); text(row.description, `${path}.description`);
  oneOf(row.weightMode, ['total', 'per-dumbbell', 'machine', 'additional', 'smith', 'plates', 'bodyweight', 'custom'], `${path}.weightMode`); bool(row.unilateral, `${path}.unilateral`);
  for (const key of ['primaryMuscle', 'repetitionRule', 'customWeightNote', 'comparisonKey']) optional(row, key, text, path);
  optional(row, 'secondaryMuscles', strings, path); for (const key of ['bodyWeight', 'archived']) optional(row, key, bool, path); revision(row, path);
  optional(row, 'loadCalculation', (value, path) => oneOf(value, ['unknown', 'total', 'paired', 'per-side-one', 'per-side-pair'], path), path);
  optional(row, 'bodyWeightModel', (value, path) => oneOf(value, ['unknown', 'pull-up'], path), path);
  // Historical metadata can be absent. Do not infer equipment or full body mass by name.
  return row;
}
function reps(value: unknown, path: string, draft = false) { const rows = array(value, path, 2); if (rows.length !== 2) fail(path, 'нужны две границы'); rows.forEach(row => integer(row, path, draft ? 0 : 1, draft ? Number.MAX_SAFE_INTEGER : 1000)); if (!draft && rows[0] > rows[1]) fail(path, 'нижняя граница больше верхней'); }
function template(value: unknown, path: string, draft = false) {
  const row = object(value, path); id(row.id, path); text(row.name, `${path}.name`, 150, draft); integer(row.revision, `${path}.revision`); strings(row.muscleGroups, `${path}.muscleGroups`);
  optional(row, 'code', (value, path) => text(value, path, 12, draft), path); optional(row, 'description', text, path); optional(row, 'archived', bool, path);
  const slots = array(row.slots, `${path}.slots`, 1000); unique(slots.map(slot => slot.id), `${path}.slots`);
  for (const [index, value] of slots.entries()) { const slot = object(value, `${path}.slots[${index}]`); id(slot.id, path); const ids = strings(slot.exerciseIds, path, 1000); if (!ids.length) fail(path, 'пустая позиция упражнения'); ids.forEach(value => id(value, path)); unique(ids, path); integer(slot.sets, path, draft ? 0 : 1, draft ? Number.MAX_SAFE_INTEGER : 100); reps(slot.reps, path, draft); bool(slot.optional, path); optional(slot, 'descriptionOverride', text, path); optional(slot, 'alternating', bool, path); optional(slot, 'primaryExerciseId', id, path); if (slot.primaryExerciseId && !ids.includes(slot.primaryExerciseId)) fail(path, 'основное упражнение отсутствует среди вариантов'); }
  return row;
}
function workingSet(value: unknown, path: string) {
  const set = object(value, path); id(set.id, path); oneOf(set.status, ['pending', 'completed', 'skipped'], path);
  for (const key of ['weightKg', 'rightWeightKg']) if (set[key] !== undefined && set[key] !== null) number(set[key], `${path}.${key}`);
  for (const key of ['reps', 'rightReps']) if (set[key] !== undefined && set[key] !== null) integer(set[key], `${path}.${key}`, 1);
  for (const key of ['weightText', 'repsText', 'rightWeightText', 'rightRepsText']) optional(set, key, (value, path) => text(value, path, 200), path);
  if (!('weightKg' in set) || !('reps' in set)) fail(path, 'отсутствуют поля результата'); return set;
}
function sessionRows(value: unknown, path: string, original = false) {
  const rows = array(value, path, 1000); unique(rows.map(row => row.slotId), path);
  unique(rows.flatMap(row => array(row.sets, path, 100).map(set => set.id)), `${path}.setIds`);
  for (const [index, value] of rows.entries()) {
    const row = object(value, `${path}[${index}]`); id(row.slotId, path); exercise(row.exercise, `${path}[${index}].exercise`); reps(row.targetReps, path); bool(row.optional, path); text(row.notes, path);
    for (const key of ['skipped', 'added', 'separateSides']) optional(row, key, bool, path); optional(row, 'plannedSets', (value, path) => integer(value, path, 0, 100), path);
    const sets = array(row.sets, path, 100); unique(sets.map(set => set.id), path); sets.forEach((set, index) => { workingSet(set, `${path}.sets[${index}]`); if (!original && set.status === 'completed' && !validSet(set, row.separateSides)) fail(path, 'подтверждённый подход не содержит корректных результатов обеих сторон'); });
    if (row.previousSets !== undefined) array(row.previousSets, path, 100).forEach(set => workingSet(set, path));
    if (row.alternation !== undefined) { const alternation = object(row.alternation, path); const ids = strings(alternation.variantIds, path); unique(ids, path); id(alternation.selectedId, path); if (!ids.includes(alternation.selectedId) || row.exercise.id !== alternation.selectedId) fail(path, 'несогласованный вариант чередования'); }
  }
}
function cycleSnapshot(value: unknown, path: string) {
  const row = object(value, path); id(row.nextTemplateId, path); integer(row.alternationCount, path); optional(row, 'cycleRevision', integer, path); optional(row, 'name', (value, path) => text(value, path, 150), path); record(row.completedCounts, path, integer);
  if (row.sequence !== undefined) { const ids = strings(row.sequence, path); unique(ids, path); if (!ids.length || !ids.includes(row.nextTemplateId)) fail(path, 'следующая тренировка не входит в цикл'); }
  optional(row, 'alternationNext', (value, path) => record(value, path, id), path); return row;
}
function workout(value: unknown, path: string, draft = false) {
  const row = object(value, path); id(row.id, path); id(row.templateId, path); integer(row.templateRevision, path); text(row.name, path, 150, false); strings(row.muscleGroups, path); oneOf(row.status, ['active', 'completed', 'incomplete', 'skipped'], path); iso(row.startedAt, path);
  if (row.status === 'active') { if (row.endedAt !== null) fail(path, 'у активной тренировки есть окончание'); } else { iso(row.endedAt, path); if (Date.parse(row.endedAt) < Date.parse(row.startedAt)) fail(path, 'окончание раньше начала'); }
  integer(row.revision, path); bool(row.advanceCycle, path); text(row.notes, path); optional(row, 'templateCode', text, path);
  sessionRows(row.exercises, `${path}.exercises`); sessionRows(row.originalExercises, `${path}.originalExercises`, true);
  for (const key of ['cycleBefore', 'cycleAfter']) optional(row, key, cycleSnapshot, path);
  if (!draft && row.status !== 'active' && classify(row as WorkoutSession) !== row.status) fail(path, 'статус не соответствует подтверждённым результатам и исходной цели');
  return row;
}
function validateDraft(value: unknown, path: string) {
  const row = object(value, path); id(row.id, path); id(row.objectId, path); iso(row.savedAt, path); oneOf(row.kind, ['template', 'exercise', 'cycle', 'schedule', 'history', 'description', 'body-weight'], path);
  const form = object(row.value, path);
  if (row.kind === 'template') { template(form.baseline, path, true); template(form.draft, path, true); integer(form.expected, path); record(form.variants, path, id); record(form.initialVariants, path, id); }
  else if (row.kind === 'exercise') { exercise(form.baseline, path, true); exercise(form.draft, path, true); }
  else if (row.kind === 'cycle') for (const key of ['baseline', 'draft']) { const cycle = object(form[key], path); strings(cycle.order, path); text(cycle.next, path); text(cycle.name, path); integer(cycle.revision, path); }
  else if (row.kind === 'history') { workout(form.baseline, path); workout(form.draft, path, true); text(form.start, path); text(form.end, path); }
  else if (row.kind === 'schedule') { for (const key of ['baseline', 'days']) array(form[key], path, 7).forEach(day => integer(day, path, 0, 6)); integer(form.expected, path); }
  else if (row.kind === 'description') { text(form.text, path); text(form.baseline, path); integer(form.revision, path); }
  else { for (const key of ['baseline', 'draft']) { const body = object(form[key], path); text(body.time, path, 100); text(body.weight, path, 200); } integer(form.expected, path); }
}
/** Explicit import migration, independent of IndexedDB upgrade transactions. */
function migrate(data: ObjectValue, schema: number) {
  data.editorDrafts ??= [];
  if (schema >= 6) return;
  if (schema < 4) data.scheduleChanges ??= [];
  for (const template of array(data.workoutTemplates, 'workoutTemplates')) { template.code ??= template.id; template.description ??= ''; template.archived ??= false; }
  const cycle = object(data.cycle, 'cycle'); cycle.sequence ??= data.workoutTemplates.filter((row: any) => !row.archived).map((row: any) => row.id); cycle.cycleRevision ??= 0; cycle.alternationNext ??= {}; cycle.alternationCount ??= 0;
  for (const template of data.workoutTemplates) for (const slot of array(template.slots, 'slots')) if (slot.exerciseIds?.length > 1) cycle.alternationNext[slot.id] ??= slot.exerciseIds[(slot.id === 'B-2' ? cycle.alternationCount : 0) % slot.exerciseIds.length];
  for (const entry of array(data.weightMeasurements, 'weightMeasurements')) entry.revision ??= 0;
  for (const session of array(data.workouts, 'workouts')) { session.revision ??= 0; session.advanceCycle ??= true; session.originalExercises ??= structuredClone(session.exercises); for (const row of session.exercises ?? []) row.plannedSets ??= row.sets?.length; if (schema < 3 && session.status !== 'active') session.status = classify(session); }
}
export function validateBackup(value: unknown): LogBackup {
  const root = object(value, 'файл'); if (root.format !== BACKUP_FORMAT) throw new Error('Это не резервная копия LOG. Выберите JSON-файл резервного копирования.');
  integer(root.formatVersion, 'formatVersion', 1); if (root.formatVersion > BACKUP_VERSION) throw new Error('Формат копии новее поддерживаемого. Обновите LOG. перед восстановлением.');
  integer(root.schemaVersion, 'schemaVersion', 1); if (root.schemaVersion > DATABASE_SCHEMA) throw new Error('Копия использует более новую схему данных. Сначала обновите LOG.'); text(root.appVersion, 'appVersion', 64, false); iso(root.createdAt, 'createdAt');
  const data = object(root.data, 'data'); migrate(data, root.schemaVersion);
  const library = array(data.library, 'library', 10_000), templates = array(data.workoutTemplates, 'workoutTemplates', 2000), sessions = array(data.workouts, 'workouts');
  library.forEach((row, index) => exercise(row, `library[${index}]`)); templates.forEach((row, index) => template(row, `workoutTemplates[${index}]`)); sessions.forEach((row, index) => workout(row, `workouts[${index}]`));
  for (const [name, rows] of [['library', library], ['templates', templates], ['workouts', sessions]] as const) unique(rows.map(row => row.id), name);
  const exerciseIds = new Set(library.map(row => row.id)), templateIds = new Set(templates.map(row => row.id)), slots = templates.flatMap(row => row.slots);
  for (const session of sessions) {
    if (!templateIds.has(session.templateId)) fail('workouts.templateId', 'источник тренировки отсутствует в копии');
    for (const row of [...session.exercises, ...session.originalExercises]) if (!exerciseIds.has(row.exercise.id)) fail('workouts.exercise', 'упражнение снимка отсутствует в библиотеке копии');
  }
  unique(slots.map(slot => slot.id), 'идентификаторы позиций шаблонов'); unique(templates.map(row => (row.code ?? row.id).trim().toLocaleLowerCase()), 'обозначения шаблонов');
  for (const template of templates) for (const slot of template.slots) for (const id of slot.exerciseIds) { if (!exerciseIds.has(id)) fail('шаблоны', 'позиция ссылается на отсутствующее упражнение'); if (!template.archived && library.find(row => row.id === id)?.archived) fail('шаблоны', 'активный шаблон ссылается на архивное упражнение'); }
  const cycle = cycleSnapshot(data.cycle, 'cycle'); if (cycle.id !== 'program') fail('cycle.id', 'неверный ключ'); const order = strings(cycle.sequence, 'cycle.sequence');
  const activeTemplates = templates.filter(row => !row.archived).map(row => row.id); if (!order.length || order.length !== activeTemplates.length || activeTemplates.some(id => !order.includes(id))) fail('cycle.sequence', 'цикл должен содержать все активные шаблоны');
  for (const slot of slots) { const next = cycle.alternationNext?.[slot.id]; if (next !== undefined && !slot.exerciseIds.includes(next)) fail('cycle.alternationNext', 'следующий вариант отсутствует в позиции'); }
  const active = sessions.filter(row => row.status === 'active'); if (active.length > 1 || (active[0]?.id ?? null) !== cycle.activeSessionId) fail('cycle.activeSessionId', 'должна быть одна согласованная активная тренировка либо ни одной'); if (active[0] && (!templateIds.has(active[0].templateId) || !order.includes(active[0].templateId))) fail('workouts', 'активная тренировка не принадлежит текущему циклу');
  const preferences = object(data.preferences, 'preferences'); if (preferences.id !== 'user') fail('preferences.id', 'неверный ключ'); oneOf(preferences.theme, ['dark', 'light'], 'theme'); const days = array(preferences.trainingDays, 'trainingDays', 7); if (!days.length) fail('trainingDays', 'нужен хотя бы один день'); days.forEach(value => integer(value, 'trainingDays', 0, 6)); unique(days, 'trainingDays');
  optional(preferences, 'scheduleRevision', integer, 'preferences'); for (const key of ['recommendationsEnabled', 'backupRemindersEnabled']) optional(preferences, key, bool, 'preferences'); for (const key of ['lastBackupAt', 'backupReminderDismissedUntil']) optional(preferences, key, iso, 'preferences');
  const weights = array(data.weightMeasurements, 'weightMeasurements'); unique(weights.map(row => row.id), 'weightMeasurements'); weights.forEach((value, index) => { const row = object(value, `weightMeasurements[${index}]`); id(row.id, 'измерение'); iso(row.measuredAt, 'measuredAt'); number(row.weightKg, 'weightKg', Number.MIN_VALUE); if (row.weightKg > 1000) fail('weightKg', 'вес больше 1000 кг'); revision(row, 'измерение'); });
  const changes = array(data.scheduleChanges, 'scheduleChanges'); unique(changes.map(row => row.id), 'scheduleChanges'); const occupied = new Set<string>();
  changes.forEach(value => { const row = object(value, 'scheduleChanges'); id(row.id, 'изменение даты'); oneOf(row.kind, ['skip', 'move', 'extra'], 'kind'); day(row.date, 'date'); integer(row.revision, 'revision'); const dates = [row.date]; if (row.kind === 'move') { day(row.targetDate, 'targetDate'); dates.push(row.targetDate); } else if (row.targetDate !== undefined) fail('targetDate', 'целевая дата допустима только для переноса'); dates.forEach(date => { if (occupied.has(date)) fail('scheduleChanges', 'коллизия дат'); occupied.add(date); }); });
  const drafts = array(data.editorDrafts, 'editorDrafts', 10_000); unique(drafts.map(row => row.id), 'editorDrafts'); drafts.forEach((row, index) => validateDraft(row, `editorDrafts[${index}]`));
  return root as LogBackup;
}
export function parseBackup(text: string): LogBackup {
  if (text.length > MAX_BACKUP_BYTES || new TextEncoder().encode(text).length > MAX_BACKUP_BYTES) throw new Error('Файл слишком большой. Максимальный размер резервной копии — 50 МБ.');
  let value: unknown;
  try { value = JSON.parse(text.replace(/^\uFEFF/, ''), (key, value) => { if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('Небезопасный ключ'); return value; }); }
  catch { throw new Error('Не удалось прочитать JSON. Файл повреждён или имеет другой формат.'); }
  try { return validateBackup(value); }
  catch (cause) { if (cause instanceof TypeError) throw new Error('Неверная структура резервной копии: вместо объекта обнаружено пустое или неподдерживаемое значение.'); throw cause; }
}
