import { Route, Router } from "@solidjs/router";
import { ErrorBoundary, type ParentProps, Suspense } from "solid-js";

// The app's one ErrorBoundary. API failures never land here — they travel as
// Result values down to the page that rendered them (ADR-0008); anything
// caught here is a genuine bug.
const Layout = (props: ParentProps) => (
  <>
    <header>
      <h1>utaita</h1>
    </header>
    <main>
      <ErrorBoundary
        fallback={(err) => <p>Something went wrong: {String(err)}</p>}
      >
        <Suspense fallback={<p>Loading…</p>}>{props.children}</Suspense>
      </ErrorBoundary>
    </main>
  </>
);

const Home = () => <p>Timeline coming soon.</p>;

const App = () => (
  <Router root={Layout}>
    <Route path="/" component={Home} />
  </Router>
);

export default App;
