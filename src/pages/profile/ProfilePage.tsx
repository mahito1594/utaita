import { useParams } from "@solidjs/router";
import { css } from "../../../styled-system/css";

// Stub: reserves /users/:acct so mention taps land somewhere in-app instead
// of dead-tapping (ADR-0011). The profile session implements the real page —
// and must verify whether /api/v1/accounts/:id accepts a nickname in the id
// slot (Pleroma heritage, unmeasured).
export const ProfilePage = () => {
  const params = useParams();
  return (
    <section>
      <h2 class={css({ fontSize: "lg", fontWeight: "semibold" })}>
        @{params["acct"]}
      </h2>
      <p class={css({ color: "text.muted", mt: "2" })}>
        Profiles are not implemented yet.
      </p>
    </section>
  );
};
