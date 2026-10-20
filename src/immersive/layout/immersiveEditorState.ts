import {
  browserStorage,
  defineLocalPref,
  storedRecord,
  type LocalPref,
  type PrefStorage,
} from '../../kit/localPref.ts';
import {
  IMMERSIVE_LAYOUTS,
  IMMERSIVE_PANEL_IDS,
  type ImmersivePanelId,
} from '../page/immersiveComponents.ts';
import { IMMERSIVE_SCENES, type ImmersiveScene } from '../page/immersivePrefs.ts';
import type { PaperTier } from '../paper/paperTiers.ts';

/**
 * 编排器自己那份「上次在弄哪个」的记忆：视图、布局档、预览缩放与选中的组件。
 *
 * 挪完去看沉浸视图的实际效果，回来时不想把视图、布局与组件重选一遍——这四项记在本机
 * （不进 profile），写的是新键 `default-theme.immersive.layoutEditor.v1`。
 *
 * 与摆放覆盖（`immersivePlacement.ts`）分开存：那份是布局本身，这一份只是编排器的操作位置。
 */

/** 预览缩放档：适应窗口，或按倍数放大后滚动查看。 */
export type ImmersiveEditorZoom = 'fit' | '1' | '2';

export const IMMERSIVE_EDITOR_ZOOMS: readonly ImmersiveEditorZoom[] = ['fit', '1', '2'];

export interface ImmersiveEditorState {
  readonly version: 1;
  /** 上次在排的视图。 */
  readonly view: ImmersiveScene;
  /** 上次在排的布局档；卡片两档不分档位，记的也是 `full`。 */
  readonly layout: PaperTier;
  /** 上次的预览缩放。 */
  readonly zoom: ImmersiveEditorZoom;
  /** 上次选中的组件；换到那一档没有的视图时按缺省丢掉。 */
  readonly selected: ImmersivePanelId | null;
}

export const IMMERSIVE_EDITOR_STATE_KEY = 'default-theme.immersive.layoutEditor.v1';

const ZOOMS = IMMERSIVE_EDITOR_ZOOMS;

export const DEFAULT_EDITOR_STATE: ImmersiveEditorState = {
  version: 1,
  view: 'paper',
  layout: 'full',
  zoom: 'fit',
  selected: null,
};

const PANEL_IDS: readonly string[] = IMMERSIVE_PANEL_IDS;

/** 取值表里的一项；认不出的（旧的场景名、旧的档位名）按缺省。 */
function oneOf<T extends string>(choices: readonly T[], value: unknown): T | undefined {
  return choices.find((choice) => String(choice) === String(value));
}

/** 读存档：认不出的键丢掉，其余原样留下。版本不对就整份不要。 */
function parseState(raw: string): ImmersiveEditorState | undefined {
  const value = storedRecord(raw);
  if (Reflect.get(value, 'version') !== 1) return undefined;
  const view = oneOf(IMMERSIVE_SCENES, Reflect.get(value, 'view'));
  const layout = oneOf(IMMERSIVE_LAYOUTS, Reflect.get(value, 'layout'));
  const zoom = oneOf(ZOOMS, Reflect.get(value, 'zoom'));
  if (!view || !layout || !zoom) return undefined;
  const rawSelected = Reflect.get(value, 'selected');
  const selected =
    typeof rawSelected === 'string' && PANEL_IDS.includes(rawSelected)
      ? (rawSelected as ImmersivePanelId)
      : null;
  return { version: 1, view, layout, zoom, selected };
}

const pref: LocalPref<ImmersiveEditorState> = defineLocalPref({
  key: IMMERSIVE_EDITOR_STATE_KEY,
  fallback: DEFAULT_EDITOR_STATE,
  parse: parseState,
  format: (value) => JSON.stringify(value),
});

/** 读编排器上次的记忆；没有存档或认不出时给缺省。 */
export function readImmersiveEditorState(
  storage: PrefStorage | null = browserStorage(),
): ImmersiveEditorState {
  return pref.read(storage);
}

/** 写编排器上次的记忆。写不进去只影响下次启动，这一次照样生效。 */
export function writeImmersiveEditorState(
  value: ImmersiveEditorState,
  storage: PrefStorage | null = browserStorage(),
): void {
  pref.write(value, storage);
}
