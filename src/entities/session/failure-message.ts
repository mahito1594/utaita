import type { ApiError } from "../../api/client";

// The one place an ApiError becomes a sentence. `subject` is a noun phrase
// ("this account", "older posts"); `signedIn` is passed in so this stays pure.
// 401/403/404 follow ADR-0015 (docs/adr/0015-sign-in-gates-only-personal-surfaces.md);
// a new meaning for a status (e.g. a 403 for a missing scope) is a new branch
// here. SignInButton does not use this: what fails there is the sign-in itself.
export const failureMessage = (
  error: ApiError,
  subject: string,
  signedIn: boolean,
): string => {
  if (error.kind === "network") {
    return `Couldn't load ${subject} — check your network.`;
  }
  const { status, message } = error;
  if (status === 401 || status === 403) {
    return `Sign-in required to view ${subject}.`;
  }
  if (status === 404) {
    return signedIn
      ? `Couldn't find ${subject} on this instance.`
      : `Couldn't find ${subject} on this instance, or it needs a sign-in to see.`;
  }
  return `Couldn't load ${subject} (${status}${message ? `: ${message}` : ""}).`;
};
