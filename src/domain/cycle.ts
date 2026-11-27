import type { CycleSnapshot, ProgramState, WorkoutSession } from './models';
export function cycleSnapshot(program: ProgramState): CycleSnapshot {
  return { nextTemplateId: program.nextTemplateId, completedCounts: { ...program.completedCounts }, alternationCount: program.alternationCount, cycleRevision: program.cycleRevision ?? 0, sequence: [...(program.sequence ?? ['A', 'B', 'C'])], alternationNext: { ...program.alternationNext } };
}
export function rollbackReason(session: WorkoutSession, program: ProgramState, active: boolean): string | null {
  if (active || program.activeSessionId) return 'Есть активная тренировка. Восстановление цикла недоступно.';
  if (!session.cycleBefore || !session.cycleAfter) return 'У записи нет контрольного снимка цикла (старая версия приложения).';
  if (session.cycleBefore.nextTemplateId === session.cycleAfter.nextTemplateId && session.cycleBefore.alternationCount === session.cycleAfter.alternationCount && JSON.stringify(session.cycleBefore.alternationNext) === JSON.stringify(session.cycleAfter.alternationNext)) return 'Эта тренировка не продвигала цикл или чередование.';
  const current = cycleSnapshot(program), after = session.cycleAfter;
  if (current.cycleRevision !== after.cycleRevision || current.nextTemplateId !== after.nextTemplateId || current.alternationCount !== after.alternationCount || Object.keys({ ...current.completedCounts, ...after.completedCounts }).some(id => current.completedCounts[id] !== after.completedCounts[id]) || (after.sequence && JSON.stringify(current.sequence) !== JSON.stringify(after.sequence)) || (after.alternationNext && JSON.stringify(current.alternationNext) !== JSON.stringify(after.alternationNext))) return 'После этой тренировки были другие завершения или изменения цикла.';
  return null;
}
