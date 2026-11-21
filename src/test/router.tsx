import {
  createRouter,
  type MemoryHistoryAdapter,
  memoryHistory,
  type RouteDefinition,
} from "@solidjs/router";
import { render } from "@solidjs/testing-library";
import type { Component, ParentProps } from "solid-js";

/**
 * Renders a route table on a memory history, the way App.tsx renders the
 * app's own on the browser's. `root` stands where App.tsx's layout does:
 * around every matched route, holding the boundary a page's pending reads
 * fall into when the page has none of its own.
 *
 * A router is created per call because router 2 fixes its route table at
 * creation, and each test file mirrors a different slice of App.tsx's.
 */
export const renderRoutes = (
  routes: readonly RouteDefinition[],
  options: {
    history?: MemoryHistoryAdapter;
    root?: Component<ParentProps>;
  } = {},
) => {
  const history = options.history ?? memoryHistory();
  const Router = createRouter({ routes, history });
  const Root = options.root ?? ((props: ParentProps) => <>{props.children}</>);
  return {
    history,
    ...render(() => (
      <Router>{(props) => <Root>{props.children}</Root>}</Router>
    )),
  };
};
