import type { LibraryTrack } from 'foo-webview-sdk';

/**
 * 封面接口要纯文件路径；`trackPathOf` 会给 CUE/多轨曲目追加 `|subsong:N`，封面接口可能不认。
 * 相对路径退回库里的绝对路径。
 */
export function folderArtworkPath(
  track: Pick<LibraryTrack, 'path' | 'absolutePath'> | undefined,
): string {
  if (!track) return '';
  return track.path.startsWith('file-relative://') ? track.absolutePath : track.path;
}
