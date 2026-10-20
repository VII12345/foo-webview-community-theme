import { useEffect, useMemo, useRef, useState } from 'react';
import type { ImmersivePanelId } from '../page/immersiveComponents.ts';
import type { ImmersiveScene } from '../page/immersivePrefs.ts';
import type { PaperTier } from '../paper/paperTiers.ts';
import {
  readImmersiveEditorState,
  writeImmersiveEditorState,
  type ImmersiveEditorState,
  type ImmersiveEditorZoom,
} from './immersiveEditorState.ts';

/**
 * 编排器记住的那几样：视图、布局档、预览缩放与选中的组件。
 *
 * 挪完去看沉浸视图的实际效果，回来时不想把视图、布局与组件重选一遍——这四项记在本机
 * （`immersiveEditorState.ts`）。这里把存取包成 hook：组件里只有一行，其余照旧用状态。
 */
export interface ImmersiveEditorMemory {
  readonly view: ImmersiveScene;
  readonly setView: (view: ImmersiveScene) => void;
  readonly layout: PaperTier;
  readonly setLayout: (layout: PaperTier) => void;
  readonly zoom: ImmersiveEditorZoom;
  readonly setZoom: (zoom: ImmersiveEditorZoom) => void;
  /** 当前选中的组件；null 表示没选。 */
  readonly selected: ImmersivePanelId | null;
  readonly setSelected: (selected: ImmersivePanelId | null) => void;
}

export function useImmersiveEditorState(): ImmersiveEditorMemory {
  const remembered = useMemo(() => readImmersiveEditorState(), []);
  const [view, setView] = useState<ImmersiveScene>(remembered.view);
  const [layout, setLayout] = useState<PaperTier>(remembered.layout);
  const [zoom, setZoom] = useState<ImmersiveEditorZoom>(remembered.zoom);
  const [selected, setSelected] = useState<ImmersivePanelId | null>(remembered.selected);
  // 变了才写：按方向键微调时写的是同一个组件，不该每一下都落一次盘。
  const written = useRef<ImmersiveEditorState | null>(null);
  useEffect(() => {
    const next: ImmersiveEditorState = { version: 1, view, layout, zoom, selected };
    const previous = written.current;
    if (
      previous &&
      previous.view === next.view &&
      previous.layout === next.layout &&
      previous.zoom === next.zoom &&
      previous.selected === next.selected
    )
      return;
    written.current = next;
    writeImmersiveEditorState(next);
  }, [layout, selected, view, zoom]);
  return { view, setView, layout, setLayout, zoom, setZoom, selected, setSelected };
}
