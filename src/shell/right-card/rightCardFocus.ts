import { RIGHT_CARD_KEY_ATTR } from './rightCardContext.ts';

/**
 * 右侧卡收起后把焦点交给可见的入口键。信息页本身没有键，优先当前页（若存在），否则用第一个可见的
 * 队列/歌词键；两个入口各可能在导航行与标题栏出现，全部遍历，别只取第一个。
 */
export function focusRightCardKey(page?: string): void {
  const keys = [...document.querySelectorAll<HTMLElement>(`[${RIGHT_CARD_KEY_ATTR}]`)].filter(
    (key) => key.checkVisibility(),
  );
  const preferred = page ? keys.find((key) => key.getAttribute(RIGHT_CARD_KEY_ATTR) === page) : null;
  (preferred ?? keys[0])?.focus({ preventScroll: true });
}

/** 菜单里点关闭后，Fluent 会先把焦点还给触发键；等它做完再把焦点交还给入口。 */
export function closeRightCard(
  services: { readonly card: { close(): void } },
  page?: string,
): void {
  services.card.close();
  requestAnimationFrame(() => focusRightCardKey(page));
}
