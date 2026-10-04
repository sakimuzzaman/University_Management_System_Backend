export interface PageParams {
  page?: number;
  limit?: number;
}

export function getPagination(query: PageParams) {
  const page = Math.max(1, query.page ?? 1);
  const limit = Math.min(100, Math.max(1, query.limit ?? 10));
  const skip = (page - 1) * limit;
  return { page, limit, skip };
}

export function pageMeta(total: number, page: number, limit: number) {
  return {
    page,
    limit,
    total,
    totalPages: Math.ceil(total / limit) || 1,
  };
}