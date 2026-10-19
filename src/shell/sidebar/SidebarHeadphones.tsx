import { Popover, PopoverSurface, PopoverTrigger, mergeClasses } from '@fluentui/react-components';
import { Checkmark16Regular, Headphones20Regular } from '@fluentui/react-icons';
import { useAtomValueRawSync } from 'jotai/react';
import { useState } from 'react';
import { translateAtom } from '../../i18n/locale.ts';
import {
  headphoneRigAtom,
  soundPressureKey,
} from '../../playback/soundPressurePrefs.ts';
import { selectedRig } from '../../playback/soundPressure.ts';
import { SidebarItem } from '../../nav/sidebar/SidebarItem.tsx';
import { SidebarSection } from '../../nav/sidebar/SidebarSection.tsx';
import {
  sidebarPrefsAtom,
  sidebarPrefsKey,
} from '../../nav/sidebar/sidebarPrefs.ts';
import { useSidebarItemStyles } from '../../nav/sidebar/useSidebarItemStyles.ts';
import { useService } from '../../kit/useService.ts';
import styles from './SidebarHeadphones.module.css';

/** 当前配置里的耳机列表；展开的分节与图标态浮层共用。 */
function HeadphoneRows({ onPicked }: { readonly onPicked?: () => void }) {
  const t = useAtomValueRawSync(translateAtom);
  const rig = useAtomValueRawSync(headphoneRigAtom);
  const service = useService(soundPressureKey);
  const current = selectedRig(rig).headphone;
  if (rig.headphones.length === 0) {
    return <p className={styles.empty}>{t('sidebar.headphonesEmpty')}</p>;
  }
  return (
    <div className={styles.scroller}>
      {rig.headphones.map((headphone) => {
        const selected = current?.id === headphone.id;
        return (
          <SidebarItem
            key={headphone.id}
            value={`headphone:${headphone.id}`}
            icon={<Headphones20Regular />}
            label={headphone.name}
            selected={false}
            end={selected ? <Checkmark16Regular /> : undefined}
            aria-pressed={selected}
            data-headphone-entry={headphone.id}
            onSelect={() => {
              service.selectHeadphone(headphone.id);
              onPicked?.();
            }}
          />
        );
      })}
    </div>
  );
}

/** 展开侧边栏里的“我的耳机”分节，位置在媒体库与播放列表之间。 */
export function SidebarHeadphones({ className }: { readonly className?: string }) {
  const t = useAtomValueRawSync(translateAtom);
  const { sections } = useAtomValueRawSync(sidebarPrefsAtom);
  const sidebar = useService(sidebarPrefsKey);
  return (
    <SidebarSection
      className={className}
      label={t('sidebar.headphones')}
      expanded={sections.headphones}
      onToggle={() => sidebar.toggleSection('headphones')}
    >
      <HeadphoneRows />
    </SidebarSection>
  );
}

/** 图标态里的耳机入口：点开浮层，选中后立即切换并收起。 */
export function SidebarHeadphonesRail() {
  const t = useAtomValueRawSync(translateAtom);
  const classes = useSidebarItemStyles();
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={(_, data) => setOpen(data.open)}>
      <PopoverTrigger disableButtonEnhancement>
        <button
          type="button"
          className={mergeClasses(classes.item, classes.compact)}
          aria-label={t('sidebar.headphones')}
          title={t('sidebar.headphones')}
          data-headphone-rail
        >
          <Headphones20Regular />
        </button>
      </PopoverTrigger>
      <PopoverSurface aria-label={t('sidebar.headphones')} data-headphone-flyout>
        <SidebarSection
          label={t('sidebar.headphones')}
          expanded
          collapsible={false}
          onToggle={() => {}}
        >
          <HeadphoneRows onPicked={() => setOpen(false)} />
        </SidebarSection>
      </PopoverSurface>
    </Popover>
  );
}
