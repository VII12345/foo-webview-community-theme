import { Button, Tooltip } from '@fluentui/react-components';
import { ArrowReset20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync, useStore } from 'jotai/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MessageKey } from '../i18n/en.ts';
import { translateAtom } from '../i18n/locale.ts';
import { useCommand } from '../nav/useCommand.ts';
import { useElementWidth } from '../kit/useElementWidth.ts';
import {
  hiddenModulesFor,
  IMMERSIVE_PANEL_LABELS,
  immersiveComponentsAtom,
  type ImmersivePanelId,
} from '../immersive/page/immersiveComponents.ts';
import { IMMERSIVE_SCENES, type ImmersiveScene } from '../immersive/page/immersivePrefs.ts';
import type { PaperTier } from '../immersive/paper/paperTiers.ts';
import type { StageBox } from '../immersive/paper/paperComponentLayout.ts';
import { defaultBoxes, placementsFor, resolvedBox } from '../immersive/layout/immersiveBoxes.ts';
import {
  chooseImmersivePlacement,
  immersivePlacementsAtom,
  resetImmersivePlacement,
  resetImmersivePlacementGroup,
  type ImmersivePlacement,
} from '../immersive/layout/immersivePlacement.ts';
import { SettingsRow } from '../settings/SettingsRow.tsx';
import { SettingsSelect } from '../settings/SettingsSelect.tsx';
import styles from './ImmersiveLayoutEditor.module.css';

const STAGE_WIDTH = 1920;
const STAGE_HEIGHT = 1080;
/** 拖动吸附的步长（舞台像素）。 */
const SNAP = 8;

const SCENE_LABELS: Readonly<Record<ImmersiveScene, MessageKey>> = {
  paper: 'settings.immersiveViewPaper',
  focus: 'settings.immersiveViewFocus',
  lyrics: 'settings.immersiveViewLyrics',
  card: 'settings.immersiveViewCard',
  cardLyrics: 'settings.immersiveViewCardLyrics',
};

const LAYOUT_LABELS: Readonly<Record<PaperTier, MessageKey>> = {
  full: 'settings.immersiveLayoutFull',
  compact: 'settings.immersiveLayoutCompact',
  narrow: 'settings.immersiveLayoutNarrow',
  portrait: 'settings.immersiveLayoutPortrait',
  'portrait-compact': 'settings.immersiveLayoutPortraitCompact',
  'portrait-narrow': 'settings.immersiveLayoutPortraitNarrow',
};

interface Drag {
  readonly id: ImmersivePanelId;
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  /** 按下时的位置与尺寸；Esc 取消回到这里。 */
  readonly origin: { x: number; y: number; w: number; h: number };
  readonly mode: 'move' | 'resize';
}

const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/**
 * 沉浸视图的组件编排器。
 *
 * 上半是预览：按舞台比例缩放的一张示意图，每个可摆放的组件一个框，框的位置与大小就是布局算出来的盒子。
 * 拖框挪位置、拖右下角改大小；下半是清单：每个组件一行，写着 x/y/宽/高，可以单独放回默认。
 *
 * 改动只写"挪过"的那几项（`immersive/layout/immersivePlacement.ts`），没动过的组件沿用默认盒子，
 * 组件内部照旧按舞台坐标排 —— 覆盖落在组件外层的一套 `translate() scale()` 上。
 */
export function ImmersiveLayoutEditor() {
  const store = useStore();
  const t = useAtomValueRawSync(translateAtom);
  const [view, setView] = useState<ImmersiveScene>('paper');
  const [drag, setDrag] = useState<Drag | null>(null);
  // 目前只有 full 档（1920 × 1080 的整幅舞台）有逐件的盒子：其余各档是版心坐标、由版心的流式排法决定，
  // 组件之间没有独立的位置可改。编排器先把 full 档这一套做通。
  const layout: PaperTier = 'full';
  const effectiveLayout: PaperTier = 'full';
  const placements = useAtomValueRawSync(immersivePlacementsAtom);
  const components = useAtomValueRawSync(immersiveComponentsAtom);
  const hidden = hiddenModulesFor(components, view, layout);
  const boxes = defaultBoxes(view, layout, hidden);
  const overrides = placementsFor(placements, view, layout);
  const [pane, setPane] = useState<number | null>(null);
  const observe = useElementWidth<HTMLDivElement>(setPane);
  const scale = pane && pane > 0 ? pane / STAGE_WIDTH : 0.4;

  // 拖动途中只改本地的状态，松开才写存档；Esc 取消回到按下时的位置。
  const session = useRef<Drag | null>(null);
  useCommand({
    id: 'immersiveLayout.drag',
    layer: 'gesture',
    keys: [{ key: 'Escape' }],
    enabled: () => session.current !== null,
    run: () => {
      session.current = null;
      setDrag(null);
    },
  });

  const begin = useCallback(
    (event: ReactPointerEvent<HTMLElement>, id: ImmersivePanelId, mode: 'move' | 'resize') => {
      if (event.button !== 0) return;
      const box = boxes.get(id);
      if (!box) return;
      event.preventDefault();
      event.stopPropagation();
      const target = resolvedBox(box, overrides[id]);
      const next: Drag = {
        id,
        x: target.x,
        y: target.y,
        w: target.w,
        h: target.h,
        origin: { x: target.x, y: target.y, w: target.w, h: target.h },
        mode,
      };
      session.current = next;
      setDrag(next);
      const pointer = event.pointerId;
      const startX = event.clientX;
      const startY = event.clientY;
      const move = (nextEvent: PointerEvent) => {
        if (nextEvent.pointerId !== pointer) return;
        const dx = (nextEvent.clientX - startX) / scale;
        const dy = (nextEvent.clientY - startY) / scale;
        const current = session.current;
        if (!current) return;
        const moved =
          current.mode === 'move'
            ? {
                ...current,
                x: snap(current.origin.x + dx),
                y: snap(current.origin.y + dy),
              }
            : {
                ...current,
                w: Math.max(SNAP, snap(current.origin.w + dx)),
                h: Math.max(SNAP, snap(current.origin.h + dy)),
              };
        session.current = moved;
        setDrag(moved);
      };
      const end = (nextEvent: PointerEvent) => {
        if (nextEvent.pointerId !== pointer) return;
        finish(true);
      };
      const finish = (keep: boolean) => {
        window.removeEventListener('pointermove', move);
        window.removeEventListener('pointerup', end);
        window.removeEventListener('pointercancel', end);
        const current = session.current;
        session.current = null;
        setDrag(null);
        if (!keep || !current) return;
        chooseImmersivePlacement(store, view, effectiveLayout, current.id, {
          x: current.x,
          y: current.y,
          w: current.w,
          h: current.h,
        });
      };
      window.addEventListener('pointermove', move);
      window.addEventListener('pointerup', end);
      window.addEventListener('pointercancel', end);
    },
    [boxes, effectiveLayout, overrides, scale, store, view],
  );

  useEffect(
    () => () => {
      session.current = null;
    },
    [],
  );

  const ids = useMemo(() => [...boxes.keys()], [boxes]);
  const boxOf = (id: ImmersivePanelId): StageBox | undefined => {
    const base = boxes.get(id);
    if (!base) return undefined;
    const override = overrides[id];
    const moved = drag && drag.id === id ? drag : undefined;
    if (moved) return { x: moved.x, y: moved.y, w: moved.w, h: moved.h };
    return resolvedBox(base, override);
  };

  return (
    <div className={styles.editor}>
      <SettingsRow title={t('settings.immersiveLayoutEditorView')} field>
        {(ids2) => (
          <SettingsSelect
            {...ids2}
            value={view}
            options={IMMERSIVE_SCENES.map((value) => ({
              value,
              label: t(SCENE_LABELS[value]),
            }))}
            onChange={(value) => {
              const next = IMMERSIVE_SCENES.find((item) => item === value);
              if (!next) return;
              setView(next);
            }}
          />
        )}
      </SettingsRow>
      <SettingsRow title={t('settings.immersiveLayoutEditorLayout')} field>
        {(ids2) => (
          <SettingsSelect
            {...ids2}
            value={'full'}
            options={[{ value: 'full', label: t(LAYOUT_LABELS.full) }]}
            onChange={() => undefined}
          />
        )}
      </SettingsRow>
      <div className={styles.pane} ref={observe} data-layout-pane>
        <div
          className={styles.stage}
          data-layout-stage
          style={{
            width: STAGE_WIDTH,
            height: STAGE_HEIGHT,
            transform: `scale(${scale})`,
          }}
        >
          {ids.map((id) => {
            const box = boxOf(id);
            if (!box) return null;
            const style: CSSProperties = {
              left: box.x,
              top: box.y,
              width: box.w,
              height: box.h,
            };
            return (
              <div
                key={id}
                className={styles.item}
                style={style}
                data-layout-item={id}
                data-moved={overrides[id] ? 'on' : undefined}
                onPointerDown={(event) => begin(event, id, 'move')}
              >
                <span className={styles.label}>{t(IMMERSIVE_PANEL_LABELS[id])}</span>
                <span
                  className={styles.handle}
                  data-layout-handle
                  onPointerDown={(event) => begin(event, id, 'resize')}
                />
              </div>
            );
          })}
        </div>
      </div>
      <div className={styles.list} data-layout-list>
        {ids.map((id) => {
          const box = boxOf(id);
          if (!box) return null;
          const moved = overrides[id];
          return (
            <div key={id} className={styles.row}>
              <span className={styles.name}>{t(IMMERSIVE_PANEL_LABELS[id])}</span>
              <span className={styles.numbers}>
                {`${box.x}, ${box.y} · ${box.w} × ${box.h}`}
              </span>
              {moved && (
                <Tooltip content={t('settings.immersiveLayoutResetOne')} relationship="label">
                  <Button
                    appearance="subtle"
                    size="small"
                    icon={<ArrowReset20Regular />}
                    aria-label={`${t('settings.immersiveLayoutResetOne')}: ${t(IMMERSIVE_PANEL_LABELS[id])}`}
                    onClick={() =>
                      resetImmersivePlacement(store, view, effectiveLayout, id)
                    }
                  />
                </Tooltip>
              )}
            </div>
          );
        })}
      </div>
      <Button
        appearance="secondary"
        icon={<ArrowReset20Regular />}
        onClick={() => resetImmersivePlacementGroup(store, view, effectiveLayout)}
      >
        {t('settings.immersiveLayoutResetAll')}
      </Button>
    </div>
  );
}

/** 编排器里用到的覆盖类型，导出给测试与别的入口。 */
export type { ImmersivePlacement };
