import { redirect } from "next/navigation";

// The public landing lives in a separate repo (https://klinkdotfun.live).
// Its "Launch" button drops users straight into our app at "/", and we
// punt them into the dashboard — the dashboard layout shows a sign-in
// gate modal on top when the JWT cookie is missing, so the wallet flow
// happens over the dashboard chrome rather than on a separate page.
export const dynamic = "force-dynamic";

export default function HomePage() {
  redirect("/dashboard");
}
