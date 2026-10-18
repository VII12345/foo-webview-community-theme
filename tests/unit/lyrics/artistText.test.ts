import { describe, expect, it } from 'vitest';
import { splitArtistText } from '../../../src/lyrics/artistText.ts';

describe('splitArtistText', () => {
  it('拆开顿号、斜杠、分号与西文写法，去掉空白与空名', () => {
    expect(splitArtistText('银临/司南')).toEqual(['银临', '司南']);
    expect(splitArtistText('银临、司南')).toEqual(['银临', '司南']);
    expect(splitArtistText('银临; 司南；A-Lin')).toEqual(['银临', '司南', 'A-Lin']);
    expect(splitArtistText('A feat. B & C, D')).toEqual(['A', 'B', 'C', 'D']);
    expect(splitArtistText('  ')).toEqual([]);
  });

  it('没有分隔符的单个艺人不拆；斜杠两边会同样拆开，比较仍能对上', () => {
    expect(splitArtistText('林俊杰')).toEqual(['林俊杰']);
    expect(splitArtistText('AC/DC')).toEqual(['AC', 'DC']);
  });
});
