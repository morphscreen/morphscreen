import { LiveAnswer } from "./answer";

// A server component: the page renders on the server, the answer in the browser.
export default function Page() {
  return (
    <main>
      <LiveAnswer />
    </main>
  );
}
