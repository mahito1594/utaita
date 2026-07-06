import { Route, Router } from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Suspense } from "solid-js";
import { css } from "../../styled-system/css";
import { getHomeTimeline } from "../pages/timeline/queries";
import { TimelinePage } from "../pages/timeline/TimelinePage";

// Single centered column on every viewport (app-shell wireframe decision);
// shared by header and main so their edges align.
const column = { maxWidth: "600px", mx: "auto", px: "4" } as const;

// The app's one ErrorBoundary. API failures never land here — they travel as
// Result values down to the page that rendered them (ADR-0008); anything
// caught here is a genuine bug.
const Layout = (props: ParentProps) => (
  <>
    <header
      class={css({
        bg: "bg.surface",
        borderBottomWidth: "1px",
        borderColor: "border.default",
      })}
    >
      <h1
        class={css({
          ...column,
          py: "3",
          fontSize: "lg",
          fontWeight: "semibold",
          color: "text.brand",
        })}
      >
        utaita
      </h1>
    </header>
    <main class={css({ ...column, py: "4" })}>
      <ErrorBoundary
        fallback={(err) => <p>Something went wrong: {String(err)}</p>}
      >
        <Suspense
          fallback={<p class={css({ color: "text.muted" })}>Loading…</p>}
        >
          {props.children}
        </Suspense>
      </ErrorBoundary>
    </main>
  </>
);

const App = () => (
  <Router root={Layout}>
    <Route
      path="/"
      component={TimelinePage}
      preload={() => getHomeTimeline()}
    />
  </Router>
);

export default App;
