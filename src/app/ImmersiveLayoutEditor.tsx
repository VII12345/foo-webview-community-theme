import { Button, Tooltip } from '@fluentui/react-components';
import { ArrowDown20Regular, ArrowReset20Regular, ArrowUp20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync, useStore } from 'jotai/react';
import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
} from 'react';
import type { MessageKey } from '../i18n/en.ts';
import { translateAtom } from '../i18n/locale.ts';
import { useCommand } from '../nav/useCommand.ts';
import { useElementWidth } from '../kit/useElementWidth.ts';
import {
  hiddenModulesFor,
  IMMERSIVE_LAYOUTS,
  IMMERSIVE_PANEL_LABELS,
  immersiveComponentsAtom,
  type ImmersivePanelId,
} from '../immersive/page/immersiveComponents.ts';
import { IMMERSIVE_SCENES, type ImmersiveScene } from '../immersive/page/immersivePrefs.ts';
import { sheetGeometry, type PaperTier } from '../immersive/paper/paperTiers.ts';
import type { StageBox } from '../immersive/paper/paperComponentLayout.ts';
import {
  defaultBoxes,
  placementFor,
  placementsFor,
  resolvedBox,
} from '../immersive/layout/immersiveBoxes.ts';
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
const STAGE_SIZE = { width: STAGE_WIDTH, height: STAGE_HEIGHT };
/** 拖动吸附的步长（舞台像素）；键盘按住 Shift 也用它。 */
const SNAP = 8;

/** 方向键：键名 → 舞台坐标里的位移。 */
const ARROWS: Readonly<Record<string, { readonly dx: number; readonly dy: number }>> = {
  ArrowLeft: { dx: -1, dy: 0 },
  ArrowRight: { dx: 1, dy: 0 },
  ArrowUp: { dx: 0, dy: -1 },
  ArrowDown: { dx: 0, dy: 1 },
};

/** 预览的缩放档：适应窗口，或按倍数放大后滚动查看。 */
const ZOOM_CHOICES = ['fit', '1', '2'] as const;
type ZoomChoice = (typeof ZOOM_CHOICES)[number];
const ZOOM_LABELS: Readonly<Record<ZoomChoice, MessageKey>> = {
  fit: 'settings.immersiveLayoutZoomFit',
  '1': 'settings.immersiveLayoutZoom100',
  '2': 'settings.immersiveLayoutZoom200',
};

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

/** 一次键盘编辑的起点：Esc 撤销时写回这里。 */
interface KeyboardSession {
  readonly id: ImmersivePanelId;
  readonly box: { x: number; y: number; w: number; h: number };
}

const snap = (value: number) => Math.round(value / SNAP) * SNAP;

/**
 * 沉浸视图的组件编排器。
 *
 * 上半是预览：按舞台比例缩放的一张示意图，每个可摆放的组件一个框，框的位置与大小就是布局算出来的盒子。
 * 两条路都能改：鼠标拖框挪位置、拖右下角改大小；键盘用方向键微调（按住不放连发，Shift 走一个网格、
 * Alt 改宽高），Tab 在组件之间换焦点，Esc 撤销。下半是清单：每个组件一行，写着 x/y/宽/高，
 * 可以单独放回默认。
 *
 * 改动只写"挪过"的那几项（`immersive/layout/immersivePlacement.ts`），没动过的组件沿用默认盒子，
 * 组件内部照旧按舞台坐标排 —— 覆盖落在组件外层的一套 `translate() scale()` 上。
 */
export function ImmersiveLayoutEditor() {
  const store = useStore();
  const t = useAtomValueRawSync(translateAtom);
  const [view, setView] = useState<ImmersiveScene>('paper');
  const [drag, setDrag] = useState<Drag | null>(null);
  const [focused, setFocused] = useState<ImmersivePanelId | null>(null);
  const [zoom, setZoom] = useState<ZoomChoice>('fit');
  const [layout, setLayout] = useState<PaperTier>('full');
  // 卡片两档本来就按 full 舞台排，编排器里也只有它一个布局可选。
  const card = view === 'card' || view === 'cardLyrics';
  const effectiveLayout: PaperTier = card ? 'full' : layout;
  const layouts = card ? (['full'] as const) : IMMERSIVE_LAYOUTS;
  const placements = useAtomValueRawSync(immersivePlacementsAtom);
  const components = useAtomValueRawSync(immersiveComponentsAtom);
  const hidden = hiddenModulesFor(components, view, effectiveLayout);
  const boxes = defaultBoxes(view, effectiveLayout, hidden);
  const overrides = placementsFor(placements, view, effectiveLayout);
  const [pane, setPane] = useState<number | null>(null);
  const observe = useElementWidth<HTMLDivElement>(setPane);
  // 预览画的是这一档的版心：full 档是 1920 × 1080 的舞台，其余各档是版心（竖版三档是竖构图）。
  const preview =
    effectiveLayout === 'full' ? STAGE_SIZE : sheetGeometry(effectiveLayout).sheet;
  const fit = pane && pane > 0 ? pane / preview.width : 0.4;
  const scale = zoom === 'fit' ? fit : Number(zoom);

  // 拖动途中只改本地的状态，松开才写存档；Esc 取消回到按下时的位置。
  const session = useRef<Drag | null>(null);
  // 键盘编辑没有"松手"这一刻，每一下都直接写存档；Esc 撤销整段编辑。
  const keyboard = useRef<KeyboardSession | null>(null);

  /** 挪到一个绝对位置：存的是相对默认盒子的偏移与比例，窗口怎么变都不漂。 */
  const writeBox = useCallback(
    (id: ImmersivePanelId, target: StageBox) => {
      const base = boxes.get(id);
      if (!base) return;
      chooseImmersivePlacement(store, view, effectiveLayout, id, placementFor(base, target));
    },
    [boxes, effectiveLayout, store, view],
  );

  useCommand({
    id: 'immersiveLayout.drag',
    layer: 'gesture',
    keys: [{ key: 'Escape' }],
    enabled: () => session.current !== null || keyboard.current !== null,
    run: () => {
      const edit = keyboard.current;
      session.current = null;
      setDrag(null);
      keyboard.current = null;
      if (!edit) return;
      // 撤销到本次编辑前的位置；那个位置就是默认位置时直接删掉这条覆盖，
      // 别留一条"挪过但没挪"的记录（清单里会显示成已改动）。
      const base = boxes.get(edit.id);
      const origin = edit.box;
      const same =
        base !== undefined &&
        base.x === origin.x &&
        base.y === origin.y &&
        base.w === origin.w &&
        base.h === origin.h;
      if (same) resetImmersivePlacement(store, view, effectiveLayout, edit.id);
      else writeBox(edit.id, origin);
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
        writeBox(current.id, {
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
    [boxes, overrides, scale, writeBox],
  );

  /**
   * 方向键微调。走元素自己的 onKeyDown（与表格列头用 Alt+← 换列同一路子），不登记到命令登记处：
   * 登记处的按键是"和弦"匹配的，方向键的四种修饰组合要登记十六条，而这里一次按键处理里就能读到修饰键。
   * 按住不放时系统连发 keydown，每一下都走这里，长按即连续微调。
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || !focused) return;
      const arrow = ARROWS[event.key];
      if (!arrow) return;
      const box = boxes.get(focused);
      if (!box) return;
      event.preventDefault();
      event.stopPropagation();
      const step = event.shiftKey ? SNAP : 1;
      const current = resolvedBox(box, overrides[focused]);
      // 整段键盘编辑的起点：第一次按键前的位置，Esc 撤销时写回它。
      keyboard.current ??= { id: focused, box: { ...current } };
      const next = event.altKey
        ? {
            ...current,
            w: Math.max(SNAP, current.w + arrow.dx * step),
            h: Math.max(SNAP, current.h + arrow.dy * step),
          }
        : {
            ...current,
            x: current.x + arrow.dx * step,
            y: current.y + arrow.dy * step,
          };
      writeBox(focused, next);
    },
    [boxes, focused, overrides, writeBox],
  );

  /** 焦点离开预览：这一段键盘编辑算完了，Esc 不再撤它。 */
  const onBlur = useCallback((event: FocusEvent<HTMLDivElement>) => {
    const next = event.relatedTarget;
    if (next instanceof Node && event.currentTarget.contains(next)) return;
    keyboard.current = null;
  }, []);

  useEffect(
    () => () => {
      session.current = null;
    },
    [],
  );

  /** 改叠放次序：大的在前。没写过次序的按 0 算。 */
  const shiftOrder = (id: ImmersivePanelId, delta: number) => {
    const current = overrides[id]?.order ?? 0;
    chooseImmersivePlacement(store, view, effectiveLayout, id, { order: current + delta });
  };

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
            value={effectiveLayout}
            options={layouts.map((value) => ({
              value,
              label: t(LAYOUT_LABELS[value]),
            }))}
            onChange={(value) => {
              const next = IMMERSIVE_LAYOUTS.find((item) => item === value);
              if (next) setLayout(next);
            }}
          />
        )}
      </SettingsRow>
      <SettingsRow title={t('settings.immersiveLayoutZoom')} field>
        {(ids2) => (
          <SettingsSelect
            {...ids2}
            value={zoom}
            options={ZOOM_CHOICES.map((value) => ({
              value,
              label: t(ZOOM_LABELS[value]),
            }))}
            onChange={(value) => {
              const next = ZOOM_CHOICES.find((item) => item === value);
              if (next) setZoom(next);
            }}
          />
        )}
      </SettingsRow>
      <div
        className={styles.pane}
        ref={observe}
        data-layout-pane
        onKeyDown={onKeyDown}
        onBlur={onBlur}
      >
        <div
          className={styles.canvas}
          style={{ width: preview.width * scale, height: preview.height * scale }}
        >
          <div
            className={styles.stage}
            data-layout-stage
            style={{
              width: preview.width,
              height: preview.height,
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
                  tabIndex={0}
                  aria-label={t(IMMERSIVE_PANEL_LABELS[id])}
                  onFocus={() => setFocused(id)}
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
      </div>
      <p className={styles.hint} data-layout-hint>
        {t('settings.immersiveLayoutHintMouse')}
        <br />
        {t('settings.immersiveLayoutHintKeys')}
      </p>
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
              <Tooltip content={t('settings.immersiveLayoutOrderFront')} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowUp20Regular />}
                  aria-label={`${t('settings.immersiveLayoutOrderFront')}: ${t(IMMERSIVE_PANEL_LABELS[id])}`}
                  onClick={() => shiftOrder(id, 1)}
                />
              </Tooltip>
              <Tooltip content={t('settings.immersiveLayoutOrderBack')} relationship="label">
                <Button
                  appearance="subtle"
                  size="small"
                  icon={<ArrowDown20Regular />}
                  aria-label={`${t('settings.immersiveLayoutOrderBack')}: ${t(IMMERSIVE_PANEL_LABELS[id])}`}
                  onClick={() => shiftOrder(id, -1)}
                />
              </Tooltip>
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
