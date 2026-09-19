import {
  A,
  Route,
  type RoutePreloadFunc,
  Router,
  useLocation,
} from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Show, Suspense } from "solid-js";
import { css, cx } from "../../styled-system/css";
import { Retention } from "../entities/retention/retention";
import { REDIRECT_PATH } from "../entities/session/oauth";
import { SignInButton } from "../entities/session/SignInButton";
import {
  authenticated,
  logout,
  takeSignInLanding,
} from "../entities/session/session";
import { statusPath } from "../entities/status/url";
import { FollowList } from "../pages/profile/FollowList";
import { followers, following } from "../pages/profile/follow-list";
import { ProfilePage, ProfilePosts } from "../pages/profile/ProfilePage";
import { preloadProfile } from "../pages/profile/profile-query";
import { media, posts, postsAndReplies } from "../pages/profile/profile-tabs";
import { ThreadPage } from "../pages/thread/ThreadPage";
import {
  preloadThread,
  type ThreadArrival,
} from "../pages/thread/thread-query";
import {
  ReactionsList,
  WhoList,
  WhoListsPage,
} from "../pages/thread/WhoListsPage";
import { boosts, favourites, reactions } from "../pages/thread/who-lists";
import {
  preloadWhoLists,
  type WhoListsArrival,
} from "../pages/thread/who-lists-query";
import { TimelinePage } from "../pages/timeline/TimelinePage";
import { TimelineShell } from "../pages/timeline/TimelineShell";
import { bubble, federated, home, local } from "../pages/timeline/timelines";
import { outlineButton } from "../ui/outline-button";
import { LoginScreen } from "./LoginScreen";
import { OAuthCallback } from "./OAuthCallback";

// The session half of the thread's arrival, composed with the page's own
// preload here at the route table rather than inside it: a thread the sign-in
// returned to has no entry of this app behind it
// (entities/session/session.ts), which is a fact about the arrival, not about
// the thread.
const preloadThreadRoute: RoutePreloadFunc<ThreadArrival> = (args) => {
  const arrival = preloadThread(args);
  const { id } = args.params;
  return id !== undefined && takeSignInLanding(statusPath(id))
    ? { canGoBack: false }
    : arrival;
};

// The same for the lists under a post, keyed by the whole path: the tab
// segment is part of the URL the sign-in returns to, and the landing record
// answers the arrival it names and no other (session.ts).
const preloadWhoListsRoute: RoutePreloadFunc<WhoListsArrival> = (args) => {
  const arrival = preloadWhoLists(args);
  return takeSignInLanding(args.location.pathname)
    ? { canGoBack: false }
    : arrival;
};

// Single centered column, capped only from `md` up (app-shell wireframe
// decision); shared by header and main so their edges align. Below `md` the
// column is full viewport width — this is the invariant the timeline's
// panel/bar treatment keys off of (TimelineShell.tsx): the flush, full-bleed
// bar is only correct exactly while the column is uncapped, so both key off
// the same `md` condition instead of syncing a width literal across files.
const column = { maxWidth: { md: "600px" }, mx: "auto", px: "4" } as const;

// Where the gate screen itself can be showing: the paths the gate stands on
// — the timelines' own, taken from the definitions the routes below are built
// from so the two cannot drift apart — and the callback, which renders that
// same screen when the return leg fails (OAuthCallback.tsx).
const gateScreenPaths: ReadonlySet<string> = new Set([
  REDIRECT_PATH,
  ...[home, local, bubble, federated].map((timeline) => timeline.path),
]);

// Logging out is a data boundary (ADR-0015): an ungated page stays mounted with
// what it fetched under the token, so re-read the document — without waiting
// for the revoke, which logout() has already sent by the time it yields.
const signOut = () => {
  void logout();
  window.location.reload();
};

// The app's one ErrorBoundary. API failures never land here — they travel as
// Result values down to the page that rendered them (ADR-0008); anything
// caught here is a genuine bug.
const Layout = (props: ParentProps) => {
  const location = useLocation();
  // The gate screen carries its own way in, so the header hides its "Log in"
  // on those paths only; a page's error row may still offer a second one.
  const onGateScreen = () => gateScreenPaths.has(location.pathname);

  return (
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
            {/* The way back to the top of the home timeline from anywhere,
              wearing the heading's own colour rather than a link's. */}
            <A
              href="/"
              class={css({ color: "inherit", textDecoration: "none" })}
            >
              utaita
            </A>
          </h1>
          <Show when={authenticated()}>
            <button
              type="button"
              onClick={signOut}
              class={cx(
                outlineButton({ tone: "neutral" }),
                css({ color: "text.muted" }),
              )}
            >
              Log out
            </button>
          </Show>
          <Show when={!authenticated() && !onGateScreen()}>
            <SignInButton />
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
};

// The gate is a layout route, not a redirect: unauthenticated visits render
// the login screen in place at whatever URL was opened — no /login URL
// exists. That URL is also what login() saves for the return leg, so a deep
// link survives a full sign-in. The callback sits outside as a sibling so the
// gate can never swallow the return leg (discussion decision 2026-07-12).
// It wraps the timelines alone: a shared URL is readable without a session,
// and the instance decides what an anonymous reader may see
// (docs/adr/0015-sign-in-gates-only-personal-surfaces.md).
const AuthGate = (props: ParentProps) => (
  <Show when={authenticated()} fallback={<LoginScreen />}>
    {props.children}
  </Show>
);

// One `<Route>` entry per timeline rather than a single dynamic-segment
// route: a distinct path is what makes solid-router remount `TimelinePage`
// (and so create a fresh store) on every tab switch — a `:timeline` param
// route would instead keep the same instance alive across a param change.
// The paths come from the definitions the switcher tabs link to, so the
// route table and the tabs cannot drift into a link that matches nothing.
const HomeTimelinePage = () => <TimelinePage timeline={home} />;
const LocalTimelinePage = () => <TimelinePage timeline={local} />;
const BubbleTimelinePage = () => <TimelinePage timeline={bubble} />;
const FederatedTimelinePage = () => <TimelinePage timeline={federated} />;

// Same reasoning for the profile tabs: one leaf per tab so a switch remounts
// the list (and its store) under a header the layout route keeps.
const ProfilePostsTab = () => <ProfilePosts tab={posts} />;
const ProfileRepliesTab = () => <ProfilePosts tab={postsAndReplies} />;
const ProfileMediaTab = () => <ProfilePosts tab={media} />;

// The two follow lists are leaves of the same route for the same reason, even
// though the tab bar does not name them: they are reached from the header's
// counts (docs/design/profile-page-20260830.html).
const ProfileFollowingList = () => <FollowList list={following} />;
const ProfileFollowersList = () => <FollowList list={followers} />;

// The same one-leaf-per-tab shape for the lists under a post (who-lists.ts).
const FavouritedByList = () => <WhoList list={favourites} />;
const RebloggedByList = () => <WhoList list={boosts} />;

// The session is passed in rather than read inside the retention component:
// the stack has to be dropped on sign-out by an explicit signal rather than
// by trusting an unmount to dispose it — nothing unmounts the retaining route
// on the way out of a session.
const RetainingRoutes = (props: ParentProps) => (
  <Retention signedIn={authenticated()}>{props.children}</Retention>
);

// `scrollRestoration`: the router records `window.scrollY` per history entry
// and restores it once routing settles after a pop. The scrolling container
// is the document — which is why TimelineShell's panel must never clip — so
// that offset is the whole story, and no hand-rolled save/restore is needed.
// It only applies to back/forward: a push (a switcher tab) still lands at the
// top, which is the intended behavior for switching timelines.
const App = () => (
  <Router root={Layout} scrollRestoration>
    <Route path={REDIRECT_PATH} component={OAuthCallback} />
    {/* Retention wraps every route the reader may step into and come back
        from — the timelines and the detail routes alike, since it is leaving
        the timeline route that destroys the page holding the content. It sits
        above the gate rather than below it because the detail routes outside
        the gate retain too; signing out still drops the stack, by the
        `signedIn` signal RetainingRoutes passes down (retention.tsx). */}
    <Route component={RetainingRoutes}>
      <Route component={AuthGate}>
        {/* The four leaves share this one route definition, which is what
            keeps the shell's switcher tabs (and the focused link among them)
            mounted while the page below them is recreated. */}
        <Route component={TimelineShell}>
          <Route path={home.path} component={HomeTimelinePage} />
          <Route path={local.path} component={LocalTimelinePage} />
          <Route path={bubble.path} component={BubbleTimelinePage} />
          <Route path={federated.path} component={FederatedTimelinePage} />
        </Route>
      </Route>
      {/* The URL shape is profilePath's (src/entities/status/mention.ts),
          which also says why it is neither /@:acct nor /users/ */}
      <Route
        path="/accounts/:acct"
        component={ProfilePage}
        preload={preloadProfile}
      >
        <Route path={posts.path} component={ProfilePostsTab} />
        <Route path={postsAndReplies.path} component={ProfileRepliesTab} />
        <Route path={media.path} component={ProfileMediaTab} />
        <Route path={following.path} component={ProfileFollowingList} />
        <Route path={followers.path} component={ProfileFollowersList} />
      </Route>
      {/* The URL shape is statusPath's (src/entities/status/url.ts). Unlike
          the timelines, this route fetches through the router's own data
          layer, so the preload is what starts the requests (ADR-0004). */}
      <Route
        path="/statuses/:id"
        component={ThreadPage}
        preload={preloadThreadRoute}
      />
      {/* The accounts behind the post's counts, on the same path with the
          list as a further segment (who-lists.ts). A parent route with
          children matches through them only, so the conversation above
          keeps `/statuses/:id` to itself. */}
      <Route
        path="/statuses/:id"
        component={WhoListsPage}
        preload={preloadWhoListsRoute}
      >
        <Route path={favourites.path} component={FavouritedByList} />
        <Route path={boosts.path} component={RebloggedByList} />
        <Route path={reactions.path} component={ReactionsList} />
      </Route>
    </Route>
  </Router>
);

export default App;
