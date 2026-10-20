import { createDarkTheme, createLightTheme, type Theme } from '@fluentui/react-components';
import { tealBrand } from './brand.ts';

/**
 * 取消键盘焦点框：焦点圈都画在 `colorStrokeFocus2` 这一个 token 上——Fluent 的组件把它画在
 * 带 `data-fui-focus-visible` 的元素的 `::after` 边框与标签栏的 `box-shadow` 上，本仓库自己的
 * `:focus-visible` 规则也一律引它。把这个 token 置成透明，所有焦点框一并消失，不必逐处改样式。
 *
 * 改在主题对象上而不是 CSS 类上：Fluent 把主题写成一条挂在 provider 根上的 class 规则，那条规则在
 * 样式表里排在 Griffel 的原子类之后，同优先级时它说了算——类里再声明一遍会被盖掉。
 * 焦点本身与 Tab 顺序不受影响，只是键盘聚焦不再有可见提示。
 */
export function withoutFocusRing(theme: Theme): Theme {
  theme.colorStrokeFocus2 = 'transparent';
  return theme;
}

/** 两档主题都由同一条青绿 ramp 生成；深浅跟随系统，按 `colorSchemeAtom` 选档。 */
export const lightTheme: Theme = withoutFocusRing(createLightTheme(tealBrand));
export const darkTheme: Theme = withoutFocusRing(createDarkTheme(tealBrand));

export type ColorScheme = 'light' | 'dark';

export function themeFor(scheme: ColorScheme): Theme {
  return scheme === 'dark' ? darkTheme : lightTheme;
}
