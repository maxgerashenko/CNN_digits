import { useEffect } from 'react';
import { HashRouter, Route, Routes } from 'react-router-dom';

import { AppShell } from './components/shell';
import { ChartsPage } from './pages/ChartsPage';
import { DetailsPage } from './pages/DetailsPage';
import { InsidePage } from './pages/InsidePage';
import { RecognizePage } from './pages/RecognizePage';
import { TrainingPage } from './pages/TrainingPage';
import { TrainPage } from './pages/TrainPage';
import { ROUTES } from './routes';
import { startInference } from './state/inferenceStore';
import { useModelStore } from './state/modelStore';
import { useTrainingStore } from './state/trainingStore';

/** Routes of the app, without a router, so tests can wrap them in their own. */
export function AppRoutes() {
  return (
    <Routes>
      <Route element={<AppShell />}>
        <Route path={ROUTES.recognize} element={<RecognizePage />} />
        <Route path={ROUTES.inside} element={<InsidePage />} />
        <Route path={ROUTES.train} element={<TrainPage />} />
        <Route path={ROUTES.training} element={<TrainingPage />} />
        <Route path={ROUTES.details} element={<DetailsPage />} />
        <Route path={ROUTES.charts} element={<ChartsPage />} />
        <Route path="*" element={<RecognizePage />} />
      </Route>
    </Routes>
  );
}

/** Start-up: load the saved model, wake the training server, follow drawing and model. */
export function useStartUp() {
  useEffect(() => {
    void useModelStore.getState().loadSaved();
    void useTrainingStore.getState().wake();
    return startInference();
  }, []);
}

export function App() {
  useStartUp();
  return (
    <HashRouter>
      <AppRoutes />
    </HashRouter>
  );
}
