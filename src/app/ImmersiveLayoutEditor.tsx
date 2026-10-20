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
import { IMMERSIVE_EDITOR_ZOOMS, type ImmersiveEditorZoom } from '../immersive/layout/immersiveEditorState.ts';
import { useImmersiveEditorState } from '../immersive/layout/useImmersiveEditorState.ts';
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

const ZOOM_LABELS: Readonly<Record<ImmersiveEditorZoom, MessageKey>> = {
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
 * 这些控件自己要用方向键（下拉框展开时用方向键选项、输入框里移动光标），不抢。
 * Fluent 的下拉框触发按钮带 `aria-haspopup`，一并算进去。
 */
function usesArrowKeys(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  return target.closest('input, textarea, select, [aria-haspopup]') !== null;
}

/**
 * 沉浸视图的组件编排器。
 *
 * 上半是预览：按舞台比例缩放的一张示意图，每个可摆放的组件一个框，框的位置与大小就是布局算出来的盒子。
 * 两条路都能改：鼠标拖框挪位置、拖右下角改大小；键盘用方向键微调（按住不放连发，Shift 走一个网格、
 * Alt 改宽高），Tab 在组件之间换焦点，Esc 撤销。下半是清单：每个组件一行，写着 x/y/宽/高，
 * 可以单独放回默认。
 *
 * 点谁就选中谁：点下去时把 DOM 焦点交给那个组件（拖拽要 `preventDefault`，浏览器默认的聚焦被挡掉了，
 * 得自己补），选中的框画实心描边、清单里对应那行也标出来。键盘挂在整块编排器上，焦点在预览里、
 * 在清单里都一样能微调。
 *
 * 视图、布局档、缩放与选中的组件都记在本机（`immersive/layout/immersiveEditorState.ts`）：
 * 挪完去看沉浸视图的实际效果，回来时接着弄，不用重选一遍。
 *
 * 改动只写"挪过"的那几项（`immersive/layout/immersivePlacement.ts`），没动过的组件沿用默认盒子，
 * 组件内部照旧按舞台坐标排 —— 覆盖落在组件外层的一套 `translate() scale()` 上。
 */
export function ImmersiveLayoutEditor() {
  const store = useStore();
  const t = useAtomValueRawSync(translateAtom);
  const root = useRef<HTMLDivElement>(null);
  // 上次在弄哪个：视图、布局档、预览缩放与选中的组件。回来时接着弄。
  const {
    view,
    setView,
    layout,
    setLayout,
    zoom,
    setZoom,
    selected: focused,
    setSelected: setFocused,
  } = useImmersiveEditorState();
  const [drag, setDrag] = useState<Drag | null>(null);
  const placements = useAtomValueRawSync(immersivePlacementsAtom);
  const components = useAtomValueRawSync(immersiveComponentsAtom);
  // 卡片两档本来就按 full 舞台排，编排器里也只有它一个布局可选。
  const card = view === 'card' || view === 'cardLyrics';
  const effectiveLayout: PaperTier = card ? 'full' : layout;
  const layouts = card ? (['full'] as const) : IMMERSIVE_LAYOUTS;
  const hidden = useMemo(
    () => hiddenModulesFor(components, view, effectiveLayout),
    [components, effectiveLayout, view],
  );
  const boxes = useMemo(
    () => defaultBoxes(view, effectiveLayout, hidden),
    [effectiveLayout, hidden, view],
  );
  const overrides = useMemo(
    () => placementsFor(placements, view, effectiveLayout),
    [effectiveLayout, placements, view],
  );
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

  /** 预览里某个框的元素：选中时要把焦点交过去。 */
  const elementOf = useCallback(
    (id: ImmersivePanelId): HTMLElement | null =>
      root.current?.querySelector<HTMLElement>(`[data-layout-item="${id}"]`) ?? null,
    [],
  );

  /** 选中一个组件：状态与 DOM 焦点一起换过去。 */
  const select = useCallback(
    (id: ImmersivePanelId) => {
      setFocused(id);
      elementOf(id)?.focus({ preventScroll: true });
    },
    [elementOf, setFocused],
  );

  /**
   * 挪到一个绝对位置：存的是相对默认盒子的偏移与比例，窗口怎么变都不漂。
   *
   * 位置与大小都没变时不写：点一下（没拖动）不该在存档里留下一条"挪过"的记录，
   * 清单里也不该多出一个"恢复默认位置"的按钮。
   */
  const writeBox = useCallback(
    (id: ImmersivePanelId, target: StageBox) => {
      const base = boxes.get(id);
      if (!base) return;
      const patch = placementFor(base, target);
      if (patch.dx === 0 && patch.dy === 0 && patch.sw === 1 && patch.sh === 1) {
        const existing = overrides[id];
        if (!existing) return;
        // 位置回到默认：删掉这条覆盖。叠放次序是另一回事，留着。
        const { order } = existing;
        resetImmersivePlacement(store, view, effectiveLayout, id);
        if (order !== undefined) {
          chooseImmersivePlacement(store, view, effectiveLayout, id, { order });
        }
        return;
      }
      chooseImmersivePlacement(store, view, effectiveLayout, id, patch);
    },
    [boxes, effectiveLayout, overrides, store, view],
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
      // 按下就把焦点交给这个组件：拖拽要 preventDefault，浏览器默认的"点谁聚焦谁"被挡掉了，
      // 不自己补上的话方向键动的还是上一个组件，看着就像"方向键时好时坏"。
      select(id);
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
    [boxes, overrides, scale, select, writeBox],
  );

  /**
   * 方向键微调。走元素自己的 onKeyDown（与表格列头用 Alt+← 换列同一路子），不登记到命令登记处：
   * 登记处的按键是"和弦"匹配的，方向键的四种修饰组合要登记十六条，而这里一次按键处理里就能读到修饰键。
   * 按住不放时系统连发 keydown，每一下都走这里，长按即连续微调。
   *
   * 挂在整块编排器上而不是只挂预览：焦点在预览的框上、在右边的清单里，都一样能微调。
   */
  const onKeyDown = useCallback(
    (event: ReactKeyboardEvent<HTMLDivElement>) => {
      if (event.defaultPrevented || event.nativeEvent.isComposing || !focused) return;
      if (usesArrowKeys(event.target)) return;
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

  /** 焦点离开编排器：这一段键盘编辑算完了，Esc 不再撤它。 */
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

  // 换到那一档没有这个组件的视图时，选中项作废（清单里也不再标它）。
  useEffect(() => {
    if (focused && !boxes.has(focused)) setFocused(null);
  }, [boxes, focused, setFocused]);

  /**
   * 点目录跳到「沉浸编排」这一组时，焦点落在组标题上（`useSettingsNav` 的做法）。
   * 再把焦点挪到上次选中的那个组件上：回来就能接着按方向键调，不用重新点一遍。
   */
  useEffect(() => {
    const section = root.current?.closest('[data-settings-group]');
    if (!section) return undefined;
    const onFocusIn = (event: Event) => {
      const target = event.target;
      if (!(target instanceof HTMLElement) || target.tagName !== 'H2') return;
      if (!focused) return;
      elementOf(focused)?.focus({ preventScroll: true });
    };
    section.addEventListener('focusin', onFocusIn);
    return () => section.removeEventListener('focusin', onFocusIn);
  }, [elementOf, focused]);

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
    <div
      className={styles.editor}
      ref={root}
      onKeyDown={onKeyDown}
      onBlur={onBlur}
      data-layout-editor
    >
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
            options={IMMERSIVE_EDITOR_ZOOMS.map((value) => ({
              value,
              label: t(ZOOM_LABELS[value]),
            }))}
            onChange={(value) => {
              const next = IMMERSIVE_EDITOR_ZOOMS.find((item) => item === value);
              if (next) setZoom(next);
            }}
          />
        )}
      </SettingsRow>
      <div className={styles.pane} ref={observe} data-layout-pane>
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
                  data-selected={focused === id ? 'on' : undefined}
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
        <br />
        {t('settings.immersiveLayoutRemember')}
      </p>
      <p className={styles.status} data-layout-status>
        {focused
          ? t('settings.immersiveLayoutSelected', {
              name: t(IMMERSIVE_PANEL_LABELS[focused]),
            })
          : t('settings.immersiveLayoutSelectedNone')}
      </p>
      <div className={styles.list} data-layout-list>
        {ids.map((id) => {
          const box = boxOf(id);
          if (!box) return null;
          const moved = overrides[id];
          return (
            <div
              key={id}
              className={styles.row}
              data-layout-row={id}
              data-selected={focused === id ? 'on' : undefined}
            >
              <button
                type="button"
                className={styles.name}
                data-layout-select={id}
                aria-pressed={focused === id}
                title={t('settings.immersiveLayoutSelectOne')}
                onClick={() => {
                  select(id);
                  elementOf(id)?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
                }}
              >
                {t(IMMERSIVE_PANEL_LABELS[id])}
              </button>
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
