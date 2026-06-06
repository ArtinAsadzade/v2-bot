"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.MAX_PAGE_SIZE = exports.DEFAULT_PAGE_SIZE = void 0;
exports.normalizePage = normalizePage;
exports.getPagination = getPagination;
exports.getTotalPages = getTotalPages;
exports.DEFAULT_PAGE_SIZE = 10;
exports.MAX_PAGE_SIZE = 25;
function normalizePage(rawPage) {
    const page = Number(rawPage ?? 1);
    return Number.isInteger(page) && page > 0 ? page : 1;
}
function getPagination(rawPage, rawPageSize) {
    const page = normalizePage(rawPage);
    const requestedPageSize = Number(rawPageSize ?? exports.DEFAULT_PAGE_SIZE);
    const pageSize = Number.isInteger(requestedPageSize) && requestedPageSize > 0 ? Math.min(requestedPageSize, exports.MAX_PAGE_SIZE) : exports.DEFAULT_PAGE_SIZE;
    return {
        page,
        pageSize,
        skip: (page - 1) * pageSize,
        take: pageSize,
    };
}
function getTotalPages(total, pageSize = exports.DEFAULT_PAGE_SIZE) {
    return Math.max(1, Math.ceil(total / pageSize));
}
