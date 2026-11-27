import { db } from './database';
import type { Exercise, ProgramState, WorkoutTemplate } from '../domain/models';
import { createId } from '../domain/id';
import { muscles, withExerciseMetadata } from '../data/muscles';
import { weightLabels } from '../domain/workout';

function revision(program: ProgramState, expected: number) { if ((program.cycleRevision ?? 0) !== expected) throw new Error('Программа изменена в другой вкладке. Откройте редактор заново.'); }
async function noActive() { if (await db.sessions.where('status').equals('active').count()) throw new Error('Сначала завершите или отмените активную тренировку. Изменение цикла и чередования пока запрещено.'); }
export function validateTemplate(template: WorkoutTemplate) {
  if (!template.name.trim() || template.name.length > 150 || !template.code?.trim() || template.code.length > 12) throw new Error('Введите название (до 150 символов) и обозначение (до 12 символов).');
  if (new Set(template.slots.map(slot => slot.id)).size !== template.slots.length) throw new Error('Повторяются идентификаторы позиций.');
  for (const slot of template.slots) {
    if (slot.primaryExerciseId && !slot.exerciseIds.includes(slot.primaryExerciseId)) throw new Error('Основное упражнение должно оставаться среди вариантов позиции.');
    if (!slot.exerciseIds.length || new Set(slot.exerciseIds).size !== slot.exerciseIds.length || !Number.isInteger(slot.sets) || slot.sets < 1 || slot.sets > 100 || !slot.reps.every(rep => Number.isInteger(rep) && rep > 0 && rep <= 1000) || slot.reps[0] > slot.reps[1]) throw new Error('Проверьте упражнения, подходы (1–100) и диапазон повторений (1–1000, минимум ≤ максимум).');
  }
}
export async function saveTemplate(draft: WorkoutTemplate, expectedProgramRevision: number, nextVariants: Record<string, string> = {}) {
  return db.transaction('rw', [db.templates, db.program, db.exercises, db.sessions], async () => {
    validateTemplate(draft);
    const program = (await db.program.get('program'))!; revision(program, expectedProgramRevision);
    const old = await db.templates.get(draft.id);
    if (old && old.revision !== draft.revision) throw new Error('Шаблон изменён. Откройте его заново.');
    if (!old) await noActive();
    const all = await db.templates.toArray();
    if (all.some(row => row.id !== draft.id && (row.code ?? row.id).trim().toLocaleLowerCase() === draft.code!.trim().toLocaleLowerCase())) throw new Error('Это обозначение уже используется, в том числе в архиве.');
    for (const slot of draft.slots) for (const id of slot.exerciseIds) {
      const exercise = await db.exercises.get(id);
      if (!exercise || exercise.archived) throw new Error('Шаблон содержит отсутствующее или архивное упражнение. Замените его.');
    }
    const shape = (template: WorkoutTemplate) => template.slots.filter(slot => slot.exerciseIds.length > 1).map(slot => [slot.id, slot.exerciseIds, slot.alternating !== false, slot.primaryExerciseId]).sort();
    const alt = { ...program.alternationNext };
    for (const slot of draft.slots) {
      const next = nextVariants[slot.id] ?? alt[slot.id];
      alt[slot.id] = slot.exerciseIds.includes(next) ? next : slot.exerciseIds[0];
    }
    if (old && (JSON.stringify(shape(old)) !== JSON.stringify(shape(draft)) || Object.keys(nextVariants).some(id => nextVariants[id] !== program.alternationNext?.[id]))) await noActive();
    const saved = { ...structuredClone(draft), name: draft.name.trim(), code: draft.code!.trim(), archived: old?.archived ?? false, revision: (old?.revision ?? 0) + 1 };
    await db.templates.put(saved);
    await db.program.update('program', { sequence: old ? program.sequence : [...(program.sequence ?? []), saved.id], completedCounts: { ...program.completedCounts, [saved.id]: program.completedCounts[saved.id] ?? 0 }, alternationNext: alt, cycleRevision: (program.cycleRevision ?? 0) + 1 });
    return saved;
  });
}
export async function updateCycle(order: string[], next: string, name: string, expected: number) {
  await db.transaction('rw', [db.templates, db.program, db.sessions], async () => {
    const program = (await db.program.get('program'))!; revision(program, expected); await noActive();
    const active = (await db.templates.toArray()).filter(row => !row.archived).map(row => row.id);
    if (!name.trim() || name.length > 150 || !order.length || new Set(order).size !== order.length || !order.includes(next) || active.length !== order.length || active.some(id => !order.includes(id))) throw new Error('Цикл должен содержать все активные шаблоны, без повторений, и выбранную следующую тренировку. Название — до 150 символов.');
    await db.program.update('program', { name: name.trim(), sequence: [...order], nextTemplateId: next, cycleRevision: (program.cycleRevision ?? 0) + 1 });
  });
}
export async function archiveTemplate(id: string, archive: boolean, expected: number, replacementNext?: string) {
  await db.transaction('rw', [db.templates, db.program, db.sessions, db.exercises], async () => {
    const program = (await db.program.get('program'))!; revision(program, expected); await noActive();
    const template = await db.templates.get(id); if (!template) throw new Error('Шаблон не найден.');
    if (!archive) for (const slot of template.slots) for (const exerciseId of slot.exerciseIds) { const exercise = await db.exercises.get(exerciseId); if (!exercise || exercise.archived) throw new Error('Перед восстановлением шаблона восстановите или замените его архивные упражнения.'); }
    const order = archive ? (program.sequence ?? []).filter(value => value !== id) : [...new Set([...(program.sequence ?? []), id])];
    if (!order.length) throw new Error('Нельзя архивировать последнюю активную тренировку.');
    const next = archive && program.nextTemplateId === id ? replacementNext : program.nextTemplateId;
    if (!next || !order.includes(next)) throw new Error('Выберите новую следующую тренировку.');
    await db.templates.update(id, { archived: archive, revision: template.revision + 1 });
    await db.program.update('program', { sequence: order, nextTemplateId: next, cycleRevision: (program.cycleRevision ?? 0) + 1 });
  });
}
export async function duplicateTemplate(id: string, expected: number) {
  const source = await db.templates.get(id); if (!source) throw new Error('Шаблон не найден.');
  const all = await db.templates.toArray(); let code = `${(source.code ?? source.id).slice(0, 8)}2`, index = 2;
  while (all.some(row => (row.code ?? row.id).toLowerCase() === code.toLowerCase())) code = `${(source.code ?? source.id).slice(0, 8)}${++index}`;
  return saveTemplate({ ...structuredClone(source), id: createId(), code, name: `${source.name} (копия)`.slice(0, 150), archived: false, revision: 0, slots: source.slots.map(slot => ({ ...slot, id: createId() })) }, expected);
}
export async function saveExercise(draft: Exercise, expected: number | null, variant = false) {
  return db.transaction('rw', [db.exercises], async () => {
    if (!draft.name.trim() || draft.name.length > 200 || !muscles.includes(draft.primaryMuscle ?? '') || !draft.repetitionRule?.trim() || (draft.weightMode === 'custom' && !draft.customWeightNote?.trim())) throw new Error('Проверьте название, мышечную группу, правила повторений и пользовательское пояснение веса.');
    if (draft.loadCalculation && !['unknown', 'total', 'paired', 'per-side-one', 'per-side-pair'].includes(draft.loadCalculation)) throw new Error('Неизвестный способ расчёта нагрузки.');
    if ((draft.unilateral && ['total', 'paired'].includes(draft.loadCalculation ?? '')) || (!draft.unilateral && ['per-side-one', 'per-side-pair'].includes(draft.loadCalculation ?? '')) || (draft.loadCalculation === 'paired' && draft.weightMode !== 'per-dumbbell')) throw new Error('Способ расчёта тоннажа не соответствует сторонам или снарядам.');
    if (draft.bodyWeightModel === 'pull-up' && (!draft.bodyWeight || draft.unilateral || !['additional', 'bodyweight'].includes(draft.weightMode))) throw new Error('Модель полной массы тела доступна только для двусторонних подтягиваний.');
    if (!(draft.weightMode in weightLabels) || (draft.secondaryMuscles ?? []).some(group => !muscles.includes(group) || group === draft.primaryMuscle) || new Set(draft.secondaryMuscles).size !== (draft.secondaryMuscles ?? []).length || (['additional', 'bodyweight'].includes(draft.weightMode) && !draft.bodyWeight)) throw new Error('Проверьте группы мышц и правила учёта собственного веса.');
    const old = await db.exercises.get(draft.id);
    if (expected !== null && (!old || (old.revision ?? 0) !== expected)) throw new Error('Упражнение изменено в другой вкладке.');
    if (expected === null && old && !variant) throw new Error('Такое упражнение уже существует.');
    const saved = withExerciseMetadata({ ...structuredClone(draft), id: variant ? createId() : draft.id, name: draft.name.trim(), archived: variant ? false : old?.archived ?? false, revision: variant ? 0 : (old?.revision ?? -1) + 1 });
    const technical = (exercise: Exercise) => [exercise.description, exercise.weightMode, exercise.unilateral, exercise.repetitionRule, exercise.customWeightNote, exercise.bodyWeight, exercise.loadCalculation, exercise.bodyWeightModel];
    saved.comparisonKey = variant ? saved.id : old && JSON.stringify(technical(old)) !== JSON.stringify(technical(saved)) ? createId() : old?.comparisonKey ?? saved.id;
    await db.exercises.put(saved); return saved;
  });
}
export async function archiveExercise(id: string, archived: boolean, expected: number) {
  await db.transaction('rw', [db.exercises, db.templates], async () => {
    const exercise = await db.exercises.get(id);
    if (!exercise || (exercise.revision ?? 0) !== expected) throw new Error('Упражнение изменилось. Откройте его заново.');
    const used = (await db.templates.toArray()).filter(row => !row.archived && row.slots.some(slot => slot.exerciseIds.includes(id)));
    if (archived && used.length) throw new Error(`Сначала замените или удалите упражнение в шаблонах: ${used.map(row => row.name).join(', ')}.`);
    await db.exercises.update(id, { archived, revision: expected + 1 });
  });
}
