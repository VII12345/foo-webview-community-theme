// soundPressureHints.ts — 声压读不出数时给用户看的原因。
//
// 从 SoundPressureCell 抽出来：右栏的格子与迷你播放器的读数都要用同一套说法，
// 但迷你播放器只要文字、不需要把整个浮层面板拉进渲染路径。

import type { MessageKey } from '../../i18n/en.ts';
import type { SoundPressureReading } from '../../playback/soundPressure.ts';
import type { SoundPressureAuto } from './soundPressureReading.ts';

export function stateHint(reading: SoundPressureReading): MessageKey | null {
  switch (reading.state) {
    case 'no-device':
      return 'immersive.soundPressureNoDevice';
    case 'no-amp':
      return 'immersive.soundPressureNoAmp';
    case 'no-headphone':
      return 'immersive.soundPressureNoHeadphone';
    case 'no-loudness':
      return 'immersive.soundPressureNoLoudness';
    default:
      return null;
  }
}

export function autoHint(auto: SoundPressureAuto): MessageKey | null {
  switch (auto.reason) {
    case 'unsupported':
      return 'settings.dx52Unsupported';
    case 'unauthorized':
      return 'settings.dx52Unauthorized';
    case 'waiting':
      return 'settings.dx52Waiting';
    case 'partial':
      return 'settings.dx52Partial';
    case 'connecting':
      return 'settings.dx52Connecting';
    case 'busy':
      return 'settings.dx52Busy';
    case 'error':
      return 'settings.dx52Error';
    case 'not-usb':
      return 'settings.dx52NotUsb';
    case 'line':
      return 'settings.dx52LineOutput';
    case 'off':
      return 'settings.dx52PoweredOff';
    default:
      return null;
  }
}
