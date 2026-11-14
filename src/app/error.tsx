"use client";
export default function ErrorPage({ reset }: { reset: () => void }) { return <main className="gate"><h1>Studsmith couldn’t open this view.</h1><p>Your saved projects are still on this computer.</p><button onClick={reset}>Try again</button></main>; }
