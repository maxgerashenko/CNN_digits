import { render } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';

import { AppRoutes } from '../App';
import { LayoutModeProvider } from '../hooks/useLayoutMode';
import { useDrawingStore } from '../state/drawingStore';
import { useInferenceStore } from '../state/inferenceStore';
import { useModelStore } from '../state/modelStore';
import { useSettingsStore } from '../state/settingsStore';
import { useTrainingStore } from '../state/trainingStore';
import type { LayoutMode } from '../types';

export interface RenderAppOptions {
  /** Address to start at, like '/train'. Default '/'. */
  route?: string;
  /** Fixes the layout. Default 'phone'. */
  mode?: LayoutMode;
}

/** Renders the whole route tree with a memory router and a fixed layout. */
export function renderApp({ route = '/', mode = 'phone' }: RenderAppOptions = {}) {
  return render(
    <LayoutModeProvider mode={mode}>
      <MemoryRouter initialEntries={[route]}>
        <AppRoutes />
      </MemoryRouter>
    </LayoutModeProvider>,
  );
}

/** Puts every store back to the state it had when the module was loaded. */
export function resetStores(): void {
  useDrawingStore.setState(useDrawingStore.getInitialState(), true);
  useModelStore.setState(useModelStore.getInitialState(), true);
  useInferenceStore.setState(useInferenceStore.getInitialState(), true);
  useSettingsStore.setState(useSettingsStore.getInitialState(), true);
  useTrainingStore.setState(useTrainingStore.getInitialState(), true);
}
