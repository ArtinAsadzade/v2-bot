export const DEFAULT_PAGE_SIZE = 10;
export const MAX_PAGE_SIZE = 25;

export function normalizePage(rawPage?: string | number) {
  const page = Number(rawPage ?? 1);
  return Number.isInteger(page) && page > 0 ? page : 1;
}

export function getPagination(rawPage?: string | number, rawPageSize?: string | number) {
  const page = normalizePage(rawPage);
  const requestedPageSize = Number(rawPageSize ?? DEFAULT_PAGE_SIZE);
  const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, MAX_PAGE_SIZE) : DEFAULT_PAGE_SIZE;

  return {
    page,
    pageSize,
    skip: (page - 1) * pageSize,
    take: pageSize,
  };
}

export function getTotalPages(total: number, pageSize = DEFAULT_PAGE_SIZE) {
  return Math.max(1, Math.ceil(total / pageSize));
}
