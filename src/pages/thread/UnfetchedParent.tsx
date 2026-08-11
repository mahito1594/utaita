import { createSignal, Show } from "solid-js";
import { css } from "../../../styled-system/css";
import type { ApiError } from "../../api/client";
import type { Result } from "../../api/result";
import type { Status } from "../../entities/status/types";
import { safeExternalHref } from "../../entities/status/url";
import { outlineButton } from "../../ui/outline-button";

/** Why an ingest attempt left the parent still missing. */
type IngestFailure =
  | { readonly kind: "request"; readonly error: ApiError }
  /** The instance answered, but does not have the post (thread-api.ts). */
  | { readonly kind: "absent" };

const messageFor = (failure: IngestFailure): string => {
  if (failure.kind === "absent") {
    return "This instance couldn't fetch that post — it may be deleted, private, or on an instance it can't reach.";
  }
  if (failure.error.kind === "network") {
    return "Connection failed — check your network.";
  }
  // Akkoma answers an unauthenticated request with either code depending on
  // the endpoint, so both mean "no valid user" (TimelinePage.tsx).
  if (failure.error.status === 401 || failure.error.status === 403) {
    return "Sign-in required to fetch a remote post.";
  }
  return `Couldn't fetch that post (${failure.error.status}).`;
};

// A dashed frame is the conventional sign of a thing that is not there yet, and
// it stays legible next to the solid frame a post the instance does hold gets
// when it is quoted (QuoteCard.tsx) — the two must not read as the same object.
const ghostCard = css({
  display: "flex",
  flexDirection: "column",
  gap: "1",
  borderWidth: "1px",
  borderStyle: "dashed",
  borderColor: "border.default",
  borderRadius: "md",
  p: "3",
});

const note = css({ fontSize: "xs", color: "text.muted" });
const failureNote = css({ fontSize: "xs", color: "error.default" });

const actions = css({
  display: "flex",
  alignItems: "center",
  gap: "3",
  flexWrap: "wrap",
});

// Marked as leaving the app, and secondary to the button beside it: pulling
// the post into the conversation is the default, and the original is the
// fallback for when the instance cannot (ADR-0011).
const externalLink = css({
  fontSize: "xs",
  color: "text.muted",
  textDecoration: "underline",
});

/**
 * The stand-in for a parent this instance has never ingested, with the action
 * that fetches it.
 *
 * Nothing here fires on its own. Ingesting is a remote round trip taking
 * seconds and a write to the instance's database (thread-api.ts): a view that
 * started one by rendering would have every reply in sight commit the instance
 * to fetching from a stranger, which is not a side effect a reader can be
 * assumed to have asked for.
 *
 * With no AP id there is nothing to ask for, so the row says what it knows and
 * stops there.
 */
export const UnfetchedParent = (props: {
  apId: string | null;
  onFetch: (apId: string) => Promise<Result<Status | null, ApiError>>;
}) => {
  const [fetching, setFetching] = createSignal(false);
  const [failure, setFailure] = createSignal<IngestFailure>();

  // "Fetch new remote resource" is the wording Akkoma's own frontend uses for
  // this operation; a reader who has seen it there meets the same phrase here.
  const label = () => {
    if (fetching()) return "Fetching…";
    return failure() === undefined ? "Fetch new remote resource" : "Retry";
  };

  // One button across idle / in flight / failed, guarded by `aria-disabled`
  // rather than swapped out or `disabled`: either would blur the button the
  // reader just pressed, and the outcome is announced right next to it.
  const request = async (apId: string): Promise<void> => {
    if (fetching()) return;
    setFetching(true);
    setFailure(undefined);
    const result = await props.onFetch(apId);
    setFetching(false);
    if (!result.ok) setFailure({ kind: "request", error: result.error });
    else if (result.value === null) setFailure({ kind: "absent" });
    // A fetched parent needs no report: it is now a row of its own, and this
    // one is gone with the reply's placeholder.
  };

  return (
    <div class={ghostCard}>
      {/* The card's own "replying to @who" line would claim the parent is on
          hand; this says otherwise while there is nothing to open. */}
      <p class={note}>
        This instance has not fetched the post this replies to.
      </p>

      <Show when={failure()}>
        {(shown) => (
          <p role="alert" class={failureNote}>
            {messageFor(shown())}
          </p>
        )}
      </Show>

      <Show when={props.apId}>
        {(apId) => (
          <div class={actions}>
            <button
              type="button"
              class={outlineButton({ tone: "neutral" })}
              aria-disabled={fetching() ? "true" : undefined}
              aria-busy={fetching() ? "true" : undefined}
              onClick={() => void request(apId())}
            >
              {label()}
            </button>
            <Show when={safeExternalHref(apId())}>
              {(href) => (
                <a
                  href={href()}
                  target="_blank"
                  rel="noopener noreferrer"
                  class={externalLink}
                >
                  External source
                </a>
              )}
            </Show>
          </div>
        )}
      </Show>
    </div>
  );
};
