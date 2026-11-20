export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

export async function api<T = any>(url: string, method = 'GET', body?: unknown): Promise<T> {
  const res = await fetch(url, {
    method,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error || 'Сървърът не отговаря. Опитай пак.');
  return data;
}

export const saveRecord = (collection: string, record: { id: string }) =>
  api(`/api/data/${collection}/${encodeURIComponent(record.id)}`, 'PUT', record);
