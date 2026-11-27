import { useId, useState } from 'react';
import { CartesianGrid, Line, LineChart, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts';
import { shortDate } from '../../domain/analytics/periods';
import { plural } from '../../domain/format';
export interface ChartPoint { id: string; timestamp: number; value: number | null; average?: number; label: string }
export const numberText = (value: number, maximumFractionDigits = 2) => value.toLocaleString('ru-RU', { maximumFractionDigits });
export function TimeChart({ points, unit, label, compact = false, average = false, onSelect }: { points: ChartPoint[]; unit: string; label: string; compact?: boolean; average?: boolean; onSelect?: (id: string) => void }) {
  const [selected, setSelected] = useState('');
  const selectorId = useId();
  const values = points.filter(point => point.value !== null), active = values.find(row => row.id === selected);
  if (!values.length) return <p className="analytics-empty small">Нет данных для этого показателя за выбранный период.</p>;
  const choose = (id: string) => { setSelected(id); onSelect?.(id); };
  const min = Math.min(...points.map(row => row.timestamp)), max = Math.max(...points.map(row => row.timestamp));
  const axisDate = (value: number) => max - min > 180 * 86_400_000 ? new Date(value).toLocaleDateString('ru-RU', { month: 'short', year: '2-digit' }) : shortDate(value);
  return <div className={`time-chart ${compact ? 'compact-chart' : ''}`}>
    <p className="small muted">{label} · {unit}</p>
    <div className="chart-canvas" role="img" aria-label={`${label}, ${values.length} ${plural(values.length, ['точка', 'точки', 'точек'])}. Значения доступны в списке под графиком.`}>
      <ResponsiveContainer width="100%" height="100%" minWidth={0}>
        <LineChart data={points} margin={{ top: 12, right: 16, left: 0, bottom: 4 }} onClick={state => { const point = points[Number(state.activeTooltipIndex)]; if (point && point.value !== null) choose(point.id); }}>
          <CartesianGrid vertical={false} stroke="var(--line)" strokeDasharray="2 4" />
          <XAxis dataKey="timestamp" type="number" scale="time" domain={min === max ? [min - 43_200_000, max + 43_200_000] : [min, max]} tickFormatter={axisDate} tickCount={3} minTickGap={25} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <YAxis width={44} tickCount={3} domain={['auto', 'auto']} tickFormatter={value => numberText(Number(value), 1)} tick={{ fill: 'var(--muted)', fontSize: 11 }} axisLine={false} tickLine={false} />
          <Tooltip content={() => null} cursor={false} />
          <Line dataKey="value" type="linear" stroke="var(--text)" strokeWidth={1.8} isAnimationActive={false} connectNulls={false} dot={points.length > 150 ? false : props => props.payload.value === null || !Number.isFinite(props.cx) || !Number.isFinite(props.cy) ? <g key={props.key} /> : <g key={props.key} data-chart-point={props.payload.id} onClick={event => { event.stopPropagation(); choose(props.payload.id); }} style={{ cursor: 'pointer' }}><circle cx={props.cx} cy={props.cy} r={22} fill="transparent" /><circle cx={props.cx} cy={props.cy} r={3.5} fill="var(--bg)" stroke="var(--text)" strokeWidth={1.5} /></g>} />
          {average && <Line dataKey="average" type="linear" stroke="var(--muted)" strokeWidth={1.5} strokeDasharray="5 4" dot={false} isAnimationActive={false} />}
        </LineChart>
      </ResponsiveContainer>
    </div>
    {!compact && <><label className="field-label" htmlFor={selectorId}>Точка графика</label><select id={selectorId} aria-label="Точка графика" value={active?.id ?? ''} onChange={event => choose(event.target.value)}><option value="">Выберите дату и значение</option>{values.map(point => <option key={point.id} value={point.id}>{shortDate(point.timestamp)} · {numberText(point.value!)} {unit}</option>)}</select></>}
    {active && <p className="chart-value" role="status">{active.label} · {numberText(active.value!)} {unit}{average && active.average !== undefined && ` · Среднее 7 дней: ${numberText(active.average)} кг`}</p>}
  </div>;
}
