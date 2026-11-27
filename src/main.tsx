import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { App } from './App';
import './styles/tokens.css';
import './styles/app.css';
import './styles/workout.css';
import './styles/program.css';
import './styles/progress.css';
import './styles/settings-data.css';

createRoot(document.getElementById('root')!).render(<StrictMode><App /></StrictMode>);
