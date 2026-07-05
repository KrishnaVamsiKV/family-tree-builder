import Script from "next/script";
import { redirect } from "next/navigation";
import { getSession } from "../lib/auth";
import { MARKUP } from "../lib/markup";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (!session) redirect("/login");

  return (
    <>
      {/* app.css styles the tree UI; scoped to this page via the link tag */}
      <link rel="stylesheet" href="/app.css" />
      <div id="app-root" dangerouslySetInnerHTML={{ __html: MARKUP }} />
      <Script src="/app.js" strategy="afterInteractive" />
    </>
  );
}
