"use client";
export default function Error({ error, reset }){
  return (
    <div className="max-w-xl mx-auto mt-16 p-6 rounded bg-red-50 text-red-700 shadow">
      <h1 className="font-bold text-lg mb-2">Something went wrong.</h1>
      <pre className="text-xs whitespace-pre-wrap">{error?.message || String(error)}</pre>
      <button onClick={() => reset()} className="mt-4 px-3 py-2 rounded bg-red-600 text-white text-sm">Try again</button>
    </div>
  );
}