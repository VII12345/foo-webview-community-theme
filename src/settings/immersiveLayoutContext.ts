import { createContext, type ReactNode } from 'react';

/** 沉浸编排器（设置页的"沉浸编排"一组）由装配层注入。 */
export const ImmersiveLayoutContext = createContext<ReactNode>(null);
