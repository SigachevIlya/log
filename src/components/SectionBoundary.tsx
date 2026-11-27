import { Component, Suspense, lazy, type ComponentType, type ReactNode } from 'react';
import { reportError } from '../lib/reportError';

class Boundary extends Component<{ children: ReactNode; retry: () => void; reload: () => void }, { error: boolean }> {
  state = { error: false };
  static getDerivedStateFromError() { return { error: true }; }
  componentDidCatch(error: Error) { reportError('Загрузка раздела', error); }
  render() {
    if (this.state.error) return <div role="alert" className="error-banner"><p>Не удалось открыть раздел. Сохранённые данные не удалены. Повторите загрузку; если автономная подготовка не завершена, подключитесь к сети.</p><button className="small-button" onClick={this.props.retry}>Повторить загрузку раздела</button><button className="small-button" onClick={this.props.reload}>Перезагрузить вкладку</button></div>;
    return this.props.children;
  }
}
/** Recreate React.lazy on explicit retry: rejected lazy promises are otherwise sticky. */
export function sectionComponent<P extends object>(load: () => Promise<{ default: ComponentType<P> }>, message: string) {
  return class Section extends Component<P & { reloadSection: () => void }, { attempt: number }> {
    state = { attempt: 0 };
    Page = lazy(load);
    retry = () => { this.Page = lazy(load); this.setState(({ attempt }) => ({ attempt: attempt + 1 })); };
    render() {
      const { reloadSection, ...props } = this.props;
      const Page = this.Page;
      return <Boundary key={this.state.attempt} retry={this.retry} reload={reloadSection}><Suspense fallback={<p className="loading" role="status">{message}</p>}><Page {...props as P} /></Suspense></Boundary>;
    }
  };
}
