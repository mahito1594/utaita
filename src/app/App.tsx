import { Route, Router } from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Show, Suspense } from "solid-js";
import { css } from "../../styled-system/css";
import { ProfilePage } from "../pages/profile/ProfilePage";
import { getHomeTimeline } from "../pages/timeline/queries";
import { TimelinePage } from "../pages/timeline/TimelinePage";
import { LoginScreen } from "./LoginScreen";
import { OAuthCallback } from "./OAuthCallback";
import { REDIRECT_PATH } from "./oauth";
import { authenticated, logout } from "./session";

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
      <div
        class={css({
          ...column,
          py: "3",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
        })}
      >
        <h1
          class={css({
            fontSize: "lg",
            fontWeight: "semibold",
            color: "text.brand",
          })}
        >
          utaita
        </h1>
        <Show when={authenticated()}>
          <button
            type="button"
            onClick={() => void logout()}
            class={css({
              px: "3",
              py: "1",
              fontSize: "sm",
              color: "text.muted",
              borderWidth: "1px",
              borderColor: "border.default",
              borderRadius: "md",
              bg: "bg.surface",
              cursor: "pointer",
              _hover: { bg: "bg.subtle" },
            })}
          >
            Log out
          </button>
        </Show>
      </div>
    </header>
    <main class={css({ ...column, py: "4" })}>
      <ErrorBoundary
        fallback={(err) => <p>Something went wrong: {String(err)}</p>}
      >
        <Suspense
          fallback={
            <p role="status" class={css({ color: "text.muted" })}>
              Loading…
            </p>
          }
        >
          {props.children}
        </Suspense>
      </ErrorBoundary>
    </main>
  </>
);

// The gate is a layout route, not a redirect: unauthenticated visits render
// the login screen in place at whatever URL was opened — no /login URL
// exists. The opened URL does not survive a full login, though: the OAuth
// return leg always lands on "/" (moot while "/" is the only route). The
// callback sits outside as a sibling so the gate can never swallow the
// return leg (discussion decision 2026-07-12).
const AuthGate = (props: ParentProps) => (
  <Show when={authenticated()} fallback={<LoginScreen />}>
    {props.children}
  </Show>
);

const App = () => (
  <Router root={Layout}>
    <Route path={REDIRECT_PATH} component={OAuthCallback} />
    <Route component={AuthGate}>
      {/* preload skipped while logged out: it could only cache a 401 */}
      <Route
        path="/"
        component={TimelinePage}
        preload={() => (authenticated() ? getHomeTimeline() : undefined)}
      />
      {/* /@:acct is not expressible in solid-router (a segment is dynamic
          only when it starts with ":"), hence /users/ — see profilePath */}
      <Route path="/users/:acct" component={ProfilePage} />
    </Route>
  </Router>
);

export default App;
