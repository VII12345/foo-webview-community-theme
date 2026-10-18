import { describe, expect, it } from 'vitest';
import { folderArtworkPath } from '../../../../../src/library/folders/detail/folderArtworkPath.ts';

describe('folderArtworkPath', () => {
  it('普通文件路径原样给封面接口，不带 |subsong:', () => {
    expect(
      folderArtworkPath({
        path: 'E:\\Music\\Album\\01.flac',
        absolutePath: 'E:\\Music\\Album\\01.flac',
      }),
    ).toBe('E:\\Music\\Album\\01.flac');
  });

  it('相对路径退回库里的绝对路径', () => {
    expect(
      folderArtworkPath({
        path: 'file-relative://Music/Album/01.flac',
        absolutePath: 'E:\\Music\\Album\\01.flac',
      }),
    ).toBe('E:\\Music\\Album\\01.flac');
  });

  it('没有曲目时给空串', () => {
    expect(folderArtworkPath(undefined)).toBe('');
  });
});
