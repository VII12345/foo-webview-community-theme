import { Slider, Switch } from '@fluentui/react-components';
import {
  FullScreenMaximize20Regular,
  Grid20Regular,
  Image20Regular,
  Gauge20Regular,
  SoundWaveCircle20Regular,
} from '@fluentui/react-icons';
import { useAtomValueRawSync, useStore } from 'jotai/react';
import { useLayoutEffect, useState } from 'react';
import type { MessageKey } from '../i18n/en.ts';
import { translateAtom } from '../i18n/locale.ts';
import {
  chooseImmersiveFpsCap,
  chooseImmersiveHostFullscreen,
  chooseImmersiveTerrain,
  chooseImmersiveWash,
  chooseImmersiveScene,
  chooseImmersiveTextBoost,
  chooseWaveformMode,
  FPS_CAPS,
  immersiveFpsCapAtom,
  immersiveHostFullscreenAtom,
  immersiveSceneAtom,
  immersiveTerrainAtom,
  immersiveTextBoostAtom,
  immersiveWashAtom,
  IMMERSIVE_PREF_KEYS,
  IMMERSIVE_SCENES,
  WASH_CHOICES,
  waveformModeAtom,
  type ImmersiveScene,
  type WashChoice,
} from '../immersive/page/immersivePrefs.ts';
import {
  choosePerfOverlay,
  perfOverlayEnabledAtom,
  PERF_OVERLAY_STORAGE_KEY,
} from '../immersive/perf/perfOverlay.ts';
import { WAVEFORM_MODES, type WaveformMode } from '../immersive/waveform/waveformModes.ts';
import {
  chooseImmersiveComponent,
  hiddenModulesFor,
  IMMERSIVE_COMPONENTS_KEY,
  IMMERSIVE_LAYOUTS,
  IMMERSIVE_PANEL_GROUPS,
  IMMERSIVE_PANEL_LABELS,
  immersiveComponentsAtom,
  panelsFor,
} from '../immersive/page/immersiveComponents.ts';
import type { PaperTier } from '../immersive/paper/paperTiers.ts';
import { SettingsCard } from '../settings/SettingsCard.tsx';
import { SettingsExpander } from '../settings/SettingsExpander.tsx';
import { SettingsRow } from '../settings/SettingsRow.tsx';
import { SettingsSelect } from '../settings/SettingsSelect.tsx';
import { LocalSaveNotice } from '../settings/SettingsSaveNotice.tsx';
import { initializeImmersivePrefs } from './immersivePrefs.ts';
import styles from './ImmersiveSettings.module.css';

const WASH_LABELS: Readonly<Record<WashChoice, MessageKey>> = {
  flow: 'settings.immersiveWashFlow',
  static: 'settings.immersiveWashStatic',
  off: 'settings.immersiveWashOff',
};
const WAVEFORM_LABELS: Readonly<Record<WaveformMode, MessageKey>> = {
  rms: 'immersive.waveformRms',
  weighted: 'immersive.waveformWeighted',
  midHigh: 'immersive.waveformMidHigh',
  layers: 'immersive.waveformLayers',
  lanes: 'immersive.waveformLanes',
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

/** 设置插槽只加载偏好；进入沉浸视图时仍由对应页面建立资源与全屏控制。 */
export function ImmersiveSettings() {
  const store = useStore();
  const [ready, setReady] = useState(false);
  const t = useAtomValueRawSync(translateAtom);
  const fullscreen = useAtomValueRawSync(immersiveHostFullscreenAtom);
  const wash = useAtomValueRawSync(immersiveWashAtom);
  const terrain = useAtomValueRawSync(immersiveTerrainAtom);
  const textBoost = useAtomValueRawSync(immersiveTextBoostAtom);
  const waveform = useAtomValueRawSync(waveformModeAtom);
  const scene = useAtomValueRawSync(immersiveSceneAtom);
  const fps = useAtomValueRawSync(immersiveFpsCapAtom);
  const overlay = useAtomValueRawSync(perfOverlayEnabledAtom);
  const components = useAtomValueRawSync(immersiveComponentsAtom);
  const [panelView, setPanelView] = useState<ImmersiveScene>(scene);
  const [panelLayout, setPanelLayout] = useState<PaperTier>('full');
  const layouts =
    panelView === 'card' || panelView === 'cardLyrics'
      ? (['full'] as const)
      : IMMERSIVE_LAYOUTS;
  const layout = (layouts as readonly PaperTier[]).includes(panelLayout)
    ? panelLayout
    : 'full';
  const hidden = hiddenModulesFor(components, panelView, layout);
  const available = panelsFor(panelView, layout);
  useLayoutEffect(() => {
    initializeImmersivePrefs(store);
    setReady(true);
  }, [store]);
  if (!ready) return null;
  return (
    <>
      <SettingsCard
        icon={<FullScreenMaximize20Regular />}
        title={t('settings.immersiveFullscreen')}
        feedback={<LocalSaveNotice keys={[IMMERSIVE_PREF_KEYS.hostFullscreen]} />}
      >
        {({ labelId, descriptionId }) => (
          <Switch
            checked={fullscreen}
            aria-labelledby={labelId}
            aria-describedby={descriptionId}
            onChange={(_, data) => chooseImmersiveHostFullscreen(store, data.checked)}
          />
        )}
      </SettingsCard>
      <SettingsExpander
        icon={<Image20Regular />}
        title={t('settings.immersiveBackground')}
        defaultOpen={false}
        feedback={
          <LocalSaveNotice
            keys={[
              IMMERSIVE_PREF_KEYS.wash,
              IMMERSIVE_PREF_KEYS.terrain,
              IMMERSIVE_PREF_KEYS.textBoost,
            ]}
          />
        }
      >
        <SettingsRow title={t('settings.immersiveWash')} field>
          {(ids) => (
            <SettingsSelect
              {...ids}
              value={wash}
              options={WASH_CHOICES.map((value) => ({ value, label: t(WASH_LABELS[value]) }))}
              onChange={(value) => chooseImmersiveWash(store, value)}
            />
          )}
        </SettingsRow>
        <SettingsRow title={t('settings.immersiveTerrain')}>
          {({ labelId, descriptionId }) => (
            <Switch
              checked={terrain}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              onChange={(_, data) => chooseImmersiveTerrain(store, data.checked)}
            />
          )}
        </SettingsRow>
        <SettingsRow
          title={t('settings.immersiveTextBoost')}
          description={t('settings.immersiveTextBoostHint')}
          field
        >
          {({ labelId }) => (
            <div className={styles.textBoost}>
              <Slider
                min={0}
                max={100}
                step={1}
                value={textBoost}
                aria-labelledby={labelId}
                aria-valuetext={`${textBoost}%`}
                onChange={(_, data) => chooseImmersiveTextBoost(store, data.value)}
              />
              <output className={styles.textBoostValue}>{textBoost}%</output>
            </div>
          )}
        </SettingsRow>
      </SettingsExpander>
      <SettingsExpander
        icon={<Grid20Regular />}
        title={t('settings.immersiveComponents')}
        description={t('settings.immersiveComponentsHint')}
        defaultOpen={false}
        feedback={<LocalSaveNotice keys={[IMMERSIVE_COMPONENTS_KEY]} />}
      >
        <SettingsRow title={t('settings.immersiveComponentsView')} field>
          {(ids) => (
            <SettingsSelect
              {...ids}
              value={panelView}
              options={IMMERSIVE_SCENES.map((value) => ({
                value,
                label: t(SCENE_LABELS[value]),
              }))}
              onChange={(value) => {
                const next = IMMERSIVE_SCENES.find((item) => item === value);
                if (!next) return;
                setPanelView(next);
                if (next === 'card' || next === 'cardLyrics') setPanelLayout('full');
              }}
            />
          )}
        </SettingsRow>
        <SettingsRow title={t('settings.immersiveComponentsLayout')} field>
          {(ids) => (
            <SettingsSelect
              {...ids}
              value={layout}
              options={layouts.map((value) => ({
                value,
                label: t(LAYOUT_LABELS[value]),
              }))}
              onChange={(value) => {
                const next = IMMERSIVE_LAYOUTS.find((item) => item === value);
                if (next) setPanelLayout(next);
              }}
            />
          )}
        </SettingsRow>
        {IMMERSIVE_PANEL_GROUPS.map((group) => {
          const panels = group.panels.filter((id) => available.has(id));
          if (panels.length === 0) return null;
          return (
            <section key={group.id} className={styles.group}>
              <h3 className={styles['group-title']}>{t(group.label)}</h3>
              {panels.map((id) => (
                <SettingsRow key={id} title={t(IMMERSIVE_PANEL_LABELS[id])}>
                  {({ labelId, descriptionId }) => (
                    <Switch
                      aria-labelledby={labelId}
                      aria-describedby={descriptionId}
                      checked={!hidden.has(id)}
                      onChange={(_, data) =>
                        chooseImmersiveComponent(
                          store,
                          panelView,
                          layout,
                          id,
                          data.checked,
                        )
                      }
                    />
                  )}
                </SettingsRow>
              ))}
            </section>
          );
        })}
      </SettingsExpander>
      <SettingsCard
        icon={<Image20Regular />}
        title={t('settings.immersiveView')}
        field
        feedback={<LocalSaveNotice keys={[IMMERSIVE_PREF_KEYS.scene]} />}
      >
        {(ids) => (
          <SettingsSelect
            {...ids}
            value={scene}
            options={IMMERSIVE_SCENES.map((value) => ({ value, label: t(SCENE_LABELS[value]) }))}
            onChange={(value) => {
              const next = IMMERSIVE_SCENES.find((item) => item === value);
              if (next) chooseImmersiveScene(store, next);
            }}
          />
        )}
      </SettingsCard>
      <SettingsCard
        icon={<SoundWaveCircle20Regular />}
        title={t('immersive.waveformMode')}
        field
        feedback={<LocalSaveNotice keys={[IMMERSIVE_PREF_KEYS.waveformMode]} />}
      >
        {(ids) => (
          <SettingsSelect
            {...ids}
            value={waveform}
            options={WAVEFORM_MODES.map((value) => ({ value, label: t(WAVEFORM_LABELS[value]) }))}
            onChange={(value) => chooseWaveformMode(store, value)}
          />
        )}
      </SettingsCard>
      <SettingsExpander
        icon={<Gauge20Regular />}
        title={t('settings.immersivePerformance')}
        defaultOpen={false}
        feedback={<LocalSaveNotice keys={[IMMERSIVE_PREF_KEYS.fpsCap, PERF_OVERLAY_STORAGE_KEY]} />}
      >
        <SettingsRow title={t('settings.immersiveFps')} field>
          {(ids) => (
            <SettingsSelect
              {...ids}
              value={String(fps)}
              options={FPS_CAPS.map((value) => ({
                value: String(value),
                label: value === 0 ? t('settings.immersiveFpsUnlimited') : `${value} fps`,
              }))}
              onChange={(value) => {
                const chosen = FPS_CAPS.find((cap) => String(cap) === value);
                if (chosen !== undefined) chooseImmersiveFpsCap(store, chosen);
              }}
            />
          )}
        </SettingsRow>
        <SettingsRow title={t('settings.immersivePerfOverlay')}>
          {({ labelId, descriptionId }) => (
            <Switch
              checked={overlay}
              aria-labelledby={labelId}
              aria-describedby={descriptionId}
              onChange={(_, data) => choosePerfOverlay(store, data.checked)}
            />
          )}
        </SettingsRow>
      </SettingsExpander>
    </>
  );
}
