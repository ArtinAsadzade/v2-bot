"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.categoryNotDeletedWhere = categoryNotDeletedWhere;
exports.productNotDeletedWhere = productNotDeletedWhere;
exports.activeCategoryWhere = activeCategoryWhere;
exports.activeProductWhere = activeProductWhere;
exports.availableInventoryWhere = availableInventoryWhere;
exports.unassignedInventoryWhere = unassignedInventoryWhere;
const fieldMissingOrNull = (field) => ({
    OR: [{ [field]: null }, { [field]: { isSet: false } }],
});
function categoryNotDeletedWhere() {
    return fieldMissingOrNull("deletedAt");
}
function productNotDeletedWhere() {
    return fieldMissingOrNull("deletedAt");
}
function activeCategoryWhere() {
    return {
        AND: [
            categoryNotDeletedWhere(),
            { isActive: true },
        ],
    };
}
function activeProductWhere() {
    return {
        AND: [
            productNotDeletedWhere(),
            { isActive: true },
        ],
    };
}
function availableInventoryWhere(productId) {
    return {
        ...(productId ? { productId } : {}),
        status: "available",
    };
}
function unassignedInventoryWhere() {
    return {
        AND: [
            fieldMissingOrNull("soldTo"),
            fieldMissingOrNull("soldAt"),
        ],
    };
}
