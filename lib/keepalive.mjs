// Netlify closes a response that sends no bytes for about 30 seconds, while AI web research
// often takes longer. Stream whitespace every few seconds (valid leading JSON whitespace) and
// write the JSON body when the work finishes. The HTTP status is always 200 once streaming has
// started, so failures carry an `error` field (and `status`) in the body instead.
export function keepAliveJSON(work, { interval = 4000 } = {}) {
  const encoder = new TextEncoder();
  let timer;
  const stream = new ReadableStream({
    async start(controller) {
      controller.enqueue(encoder.encode(' '));
      timer = setInterval(() => { try { controller.enqueue(encoder.encode(' ')); } catch {} }, interval);
      let body;
      try { body = await work(); }
      catch (error) { body = { error: error?.publicMessage || 'The request could not be completed. Please retry.', status: error?.status || 503 }; }
      clearInterval(timer);
      try { controller.enqueue(encoder.encode(JSON.stringify(body))); controller.close(); } catch {}
    },
    cancel() { clearInterval(timer); },
  });
  return new Response(stream, { status: 200, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Accel-Buffering': 'no' } });
}
// Run `work(signal)` with an abort signal that fires after `ms` milliseconds.
export async function withDeadline(ms, work) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try { return await work(controller.signal, Date.now() + ms); }
  finally { clearTimeout(timer); }
}
