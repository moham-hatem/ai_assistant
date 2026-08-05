export function createCorsHeaders(request: Request): HeadersInit {
  const configuredOrigin = Deno.env.get('PUBLIC_APP_ORIGIN')?.trim();
  const requestOrigin = request.headers.get('origin');
  const allowedOrigin = configuredOrigin && requestOrigin === configuredOrigin
    ? configuredOrigin
    : configuredOrigin
      ? configuredOrigin
      : '*';

  return {
    'Access-Control-Allow-Origin': allowedOrigin,
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Content-Type': 'application/json; charset=utf-8',
    'Vary': 'Origin',
  };
}

export function jsonResponse(
  request: Request,
  body: unknown,
  status = 200,
): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: createCorsHeaders(request),
  });
}
