import { atom, createStore } from 'jotai/vanilla';
import { describe, expect, it, onTestFinished, vi } from 'vitest';
import {
  startLoudnessIntegration,
  type LoudnessIntegrationHost,
} from '../../../src/app/loudnessIntegration.ts';

describe('loudness integration', () => {
  it('把宿主传给统计记录器并读取 profile 里的统计文件', async () => {
    vi.stubGlobal('document', {
      visibilityState: 'visible',
      addEventListener: () => {},
      removeEventListener: () => {},
    });
    onTestFinished(() => vi.unstubAllGlobals());

    const reads: string[] = [];
    const host = {
      audio: {
        subscribeStream: () => ({
          ready: Promise.resolve({ ok: false }),
          format: null,
          read: () => null,
          unsubscribe: () => {},
        }),
        subscribeSpectrum: Object.assign(() => {}, {
          ready: Promise.resolve({ ok: false }),
        }),
        getSpectrum: async () => ({ success: false, code: 'NOT_FOUND', error: 'none' }),
      },
      misc: {
        getProfilePath: async () => ({ success: true, path: 'C:\\profile' }),
      },
      file: {
        read: async (path: string) => {
          reads.push(path);
          return { success: false, code: 'NOT_FOUND', error: 'not found' };
        },
        write: async () => ({ success: true }),
      },
    } as unknown as LoudnessIntegrationHost;
    const store = createStore();
    const integration = startLoudnessIntegration(store, { active: atom(false) }, host);
    onTestFinished(() => integration.dispose());

    await vi.waitFor(() => expect(reads.length).toBeGreaterThan(0));
    expect(reads[0]?.endsWith('webview-ui-stats\\loudness-v2.json')).toBe(true);
  });
});
