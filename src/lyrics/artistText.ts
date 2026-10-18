/**
 * 艺人栏的拆分：标签里常见的「、」「/」「;」与西文写法都要认。
 * 两边（要找的那一首与候选）用同一套拆分，比较时才能对上。
 */
const SEPARATOR = /\s*(?:、|\/|;|；|, | & | feat\. | ft\. )\s*/i;

export function splitArtistText(text: string): string[] {
  return text
    .split(SEPARATOR)
    .map((name) => name.trim())
    .filter(Boolean);
}
