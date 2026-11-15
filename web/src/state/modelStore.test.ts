import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SAVED_MODEL_URL } from '../config';
import { ModelMissingError } from '../model/modelLoader';
import { makeFakeModel } from '../test/fixtures';
import { selectActiveSlot, useModelStore } from './modelStore';

const get = () => useModelStore.getState();
beforeEach(() => {
  useModelStore.setState({
    saved: { status: 'idle', model: null, error: null },
    retrained: { status: 'idle', model: null, error: null },
    retrainedRunId: null,
    active: 'saved',
  });
});

describe('loadSaved', () => {
  it('loads the model once', async () => {
    const model = makeFakeModel();
    const loader = vi.fn(async () => model);
    const first = get().loadSaved(loader);
    expect(get().saved.status).toBe('loading');
    await first;
    await get().loadSaved(loader);
    expect(loader).toHaveBeenCalledTimes(1);
    expect(loader).toHaveBeenCalledWith(SAVED_MODEL_URL);
    expect(get().saved).toEqual({ status: 'ready', model, error: null });
  });

  it('reports "missing" when the files are not there', async () => {
    await get().loadSaved(async () => {
      throw new ModelMissingError('no model');
    });
    expect(get().saved).toEqual({ status: 'missing', model: null, error: null });
  });

  it('reports "error" with a sentence for other failures', async () => {
    await get().loadSaved(async () => {
      throw new Error('The model files could not be read.');
    });
    expect(get().saved).toEqual({ status: 'error', model: null, error: 'The model files could not be read.' });
  });
});

describe('retrained model', () => {
  it('is stored but not made active', () => {
    const model = makeFakeModel();
    get().setRetrained(model, 'job-1');
    expect(get().retrained.status).toBe('ready');
    expect(get().retrainedRunId).toBe('job-1');
    expect(get().active).toBe('saved');
  });

  it('setActive ignores "retrained" until there is one', () => {
    get().setActive('retrained');
    expect(get().active).toBe('saved');
    get().setRetrained(makeFakeModel(), 'job-1');
    get().setActive('retrained');
    expect(get().active).toBe('retrained');
    get().setActive('saved');
    expect(get().active).toBe('saved');
  });

  it('disposes the previous model but not the same one again', () => {
    const a = makeFakeModel();
    const b = makeFakeModel();
    get().setRetrained(a, 'job-1');
    get().setRetrained(a, 'job-1');
    expect(a.disposed).toBe(false);
    get().setRetrained(b, 'job-2');
    expect(a.disposed).toBe(true);
    expect(b.disposed).toBe(false);
    expect(get().retrainedRunId).toBe('job-2');
  });

  it('selectActiveSlot follows the active model', () => {
    const model = makeFakeModel();
    get().setRetrained(model, 'job-1');
    expect(selectActiveSlot(get())).toBe(get().saved);
    get().setActive('retrained');
    expect(selectActiveSlot(get()).model).toBe(model);
  });
});
