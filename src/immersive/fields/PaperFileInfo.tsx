import { useAtomValueRawSync } from 'jotai/react';
import type { CSSProperties } from 'react';
import { currentTrackAtom } from '../../playback/playback.ts';
import { moduleHidden } from '../page/immersiveComponents.ts';
import { MISSING, formatChannels, formatKHz, formatKbps, formatMB } from '../paper/paperScale.ts';
import { trackExtrasAtom } from './trackExtras.ts';
import styles from './PaperFileInfo.module.css';

/** 图纸右栏的文件信息 3 × 2：采样率、位深、声道、码率、文件大小、格式；缺值写 `—`。 */
export function PaperFileInfo({
  hidden = new Set<string>(),
  style,
}: {
  readonly hidden?: ReadonlySet<string>;
  /** 编排器里挪过这一块时，落位由外层给。 */
  readonly style?: CSSProperties;
} = {}) {
  const track = useAtomValueRawSync(currentTrackAtom);
  const { bitDepth } = useAtomValueRawSync(trackExtrasAtom);
  const items = [
    { id: 'sampleRate', key: 'Sample rate', value: formatKHz(track?.sampleRate) },
    { id: 'bitDepth', key: 'Bit depth', value: bitDepth || MISSING },
    { id: 'channels', key: 'Channels', value: formatChannels(track?.channels) },
    { id: 'bitrate', key: 'Bitrate', value: formatKbps(track?.bitrate) },
    { id: 'fileSize', key: 'File size', value: formatMB(track?.fileSize) },
    { id: 'format', key: 'Format', value: track?.codec || MISSING },
  ].filter((item) => !moduleHidden(hidden, `right.fileInfo.${item.id}` as never));
  return (
    <dl className={styles['file-info']} style={style}>
      {items.map((item) => (
        <div key={item.id} className={styles.field}>
          <dt className={styles.key}>{item.key}</dt>
          <dd className={styles.value} data-field={item.id}>
            {item.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}
