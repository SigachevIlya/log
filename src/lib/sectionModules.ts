/** One importer shared by offline preparation and React.lazy. No UI is mounted here. */
export function boundedImport<T>(load: () => Promise<T>, timeout = 15000): Promise<T> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('Загрузка раздела не завершилась. Повторите попытку или перезагрузите вкладку.')), timeout);
    Promise.resolve().then(load).then(value => { clearTimeout(timer); resolve(value); }, error => { clearTimeout(timer); reject(error); });
  });
}
function section<T>(load: () => Promise<T>) {
  let pending: Promise<T> | undefined;
  return () => pending ??= boundedImport(load).catch(error => { pending = undefined; throw error; });
}
export const loadProgress = section(() => import('../pages/progress/ProgressPage'));
export const loadDataPage = section(() => import('../pages/settings/DataPage').then(module => ({ default: module.DataPage })));
export const loadGuide = section(() => import('../pages/settings/GuidePage').then(module => ({ default: module.GuidePage })));
export const prepareSectionModules = () => Promise.all([loadProgress(), loadDataPage(), loadGuide()]);
