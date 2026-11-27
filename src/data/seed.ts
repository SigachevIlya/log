import type { Exercise, ProgramState, Settings, TemplateSlot, WorkoutTemplate } from '../domain/models';

const machine = 'Указывайте вес, отображаемый или установленный на этом тренажёре.';
const bar = 'Указывайте общий вес вместе с грифом.';
const dumbbell = 'Указывайте вес одной гантели.';
const smith = 'Указывайте вес блинов без грифа. Если учитываете гриф, измените эту подпись под свой тренажёр: вес грифа зависит от оборудования.';
export const initialExercises: Exercise[] = [
  { id: 'pull-up', name: 'Подтягивания', description: 'Указывайте дополнительное отягощение отдельно от собственного веса.', weightMode: 'additional', unilateral: false, bodyWeightModel: 'pull-up' },
  { id: 'row-lats', name: 'Горизонтальная тяга одной рукой к тазу', description: `Выполняйте одной рукой, локоть ближе к корпусу. Тяните к тазу с акцентом на широчайшие. Результат на одну сторону. ${machine}`, weightMode: 'machine', unilateral: true },
  { id: 'single-pulldown', name: 'Верхний блок одной рукой', description: `Результат указывается на одну сторону. ${machine}`, weightMode: 'machine', unilateral: true },
  { id: 'smith-rear-delt', name: 'Задняя дельта в Смите', description: smith, weightMode: 'smith', unilateral: false },
  { id: 'shrug', name: 'Шраги с гантелями', description: `${dumbbell} Движение плеч вверх и вниз без вращения.`, weightMode: 'per-dumbbell', unilateral: false },
  { id: 'barbell-curl', name: 'Бицепс со штангой', description: bar, weightMode: 'total', unilateral: false },
  { id: 'hammer', name: 'Молотки', description: `${dumbbell} Количество повторений на одну руку.`, weightMode: 'per-dumbbell', unilateral: true },
  { id: 'incline-press', name: 'Наклонный жим гантелей', description: `Угол скамьи 15–30 градусов. ${dumbbell}`, weightMode: 'per-dumbbell', unilateral: false },
  { id: 'split-squat', name: 'Болгарские выпады', description: `Задняя нога на лавке. ${dumbbell} Количество повторений на одну ногу.`, weightMode: 'per-dumbbell', unilateral: true },
  { id: 'squat', name: 'Присед со штангой', description: bar, weightMode: 'total', unilateral: false },
  { id: 'rdl', name: 'Румынская тяга', description: bar, weightMode: 'total', unilateral: false },
  { id: 'leg-curl', name: 'Сгибания ног', description: machine, weightMode: 'machine', unilateral: false },
  { id: 'lateral-raise', name: 'Махи гантелями в стороны', description: dumbbell, weightMode: 'per-dumbbell', unilateral: false },
  { id: 'calf-raise', name: 'Подъёмы на носки стоя', description: `Необязательное упражнение. ${machine}`, weightMode: 'machine', unilateral: false },
  { id: 'bench-press', name: 'Жим штанги лёжа', description: bar, weightMode: 'total', unilateral: false },
  { id: 'pec-fly', name: 'Сведения рук в бабочке', description: machine, weightMode: 'machine', unilateral: false },
  { id: 'row-upper', name: 'Горизонтальная тяга на толщину спины', description: `Локти отведены от корпуса примерно на 45–70 градусов. Тяга к верхней части живота, акцент на толщину спины. ${machine}`, weightMode: 'machine', unilateral: false },
  { id: 'smith-pullover', name: 'Пуловер в Смите', description: smith, weightMode: 'smith', unilateral: false },
  { id: 'pushdown', name: 'Разгибание рук в кроссовере вниз', description: machine, weightMode: 'machine', unilateral: false },
].map(exercise => ({ ...exercise, loadCalculation: exercise.weightMode === 'per-dumbbell' ? exercise.unilateral ? exercise.id === 'split-squat' ? 'per-side-pair' : 'per-side-one' : 'paired' : exercise.unilateral ? 'per-side-one' : ['total', 'machine', 'smith', 'plates'].includes(exercise.weightMode) ? 'total' : 'unknown' })) as Exercise[];
function slot(id: string, exerciseId: string, sets: number, reps: [number, number], optional = false, alternate?: string): TemplateSlot {
  return { id, exerciseIds: alternate ? [exerciseId, alternate] : [exerciseId], sets, reps, optional };
}
export const initialTemplates: WorkoutTemplate[] = [
  { id: 'A', name: 'Тренировка A', revision: 1, muscleGroups: ['Спина', 'Бицепс', 'Трапеция'], slots: [
    slot('A-1', 'pull-up', 4, [8, 12]), slot('A-2', 'row-lats', 4, [8, 12]), slot('A-3', 'single-pulldown', 3, [10, 12]), slot('A-4', 'smith-rear-delt', 3, [12, 15]), slot('A-5', 'shrug', 3, [10, 15]), slot('A-6', 'barbell-curl', 3, [8, 12]), slot('A-7', 'hammer', 2, [10, 15]),
  ] },
  { id: 'B', name: 'Тренировка B', revision: 1, muscleGroups: ['Ноги', 'Грудь', 'Плечи', 'Трапеция'], slots: [
    slot('B-1', 'incline-press', 3, [10, 12]), slot('B-2', 'split-squat', 3, [8, 12], false, 'squat'), slot('B-3', 'rdl', 3, [8, 12]), slot('B-4', 'leg-curl', 3, [10, 15]), slot('B-5', 'lateral-raise', 4, [12, 20]), slot('B-6', 'shrug', 3, [15, 20]), slot('B-7', 'calf-raise', 3, [10, 20], true),
  ] },
  { id: 'C', name: 'Тренировка C', revision: 1, muscleGroups: ['Грудь', 'Спина', 'Плечи', 'Трицепс'], slots: [
    slot('C-1', 'incline-press', 3, [8, 12]), slot('C-2', 'bench-press', 3, [6, 10]), slot('C-3', 'pec-fly', 3, [12, 15]), slot('C-4', 'row-upper', 4, [10, 12]), slot('C-5', 'smith-pullover', 3, [12, 15]), slot('C-6', 'lateral-raise', 4, [12, 20]), slot('C-7', 'pushdown', 2, [10, 15]),
  ] },
];
export const initialSettings: Settings = { id: 'user', theme: 'dark', trainingDays: [2, 4, 0] };
export const initialProgram: ProgramState = { id: 'program', nextTemplateId: 'A', completedCounts: { A: 0, B: 0, C: 0 }, activeSessionId: null, alternationCount: 0 };
