# 0029. Stock on the product: rationale

## Options considered

### Alternative A: A stock quantity field on the product

Put a field such as `Product.openingStock` or `Product.onHand` on the product. The dialog writes it directly, and a background step turns it into stock.

*   **Pros**:
    *   It is the smallest form change: one number field.
    *   It is what the user's request literally describes.
*   **Cons**:
    *   **Two sources of truth.** Stock in this repo is per location, bin, lot and serial (`InventoryBalance`). One number can't say where the stock is, which lot it belongs to, or what it cost.
    *   **It goes stale.** The field is wrong after the first sale, receipt or transfer. Keeping it in sync would mean a second writer to stock outside `posting.ts`, which spec 0026 exists to prevent.
    *   **Editing it has no meaning.** Changing 40 to 37 on the product would either silently create an adjustment with no reason, or overwrite a computed number.
*   **Reason for Rejection**: It breaks the single stock ledger. The same user benefit (type stock on the product) comes from creating real adjustments behind the form.

### Alternative B: A link from the product to a pre-filled Adjustments page

Keep the product dialog as it is. After saving a stocked product, show "Add opening stock", which opens the existing **New adjustment** form with the reason, the product and the default location already filled in.

*   **Pros**:
    *   It is the least new UI: the existing adjustment editor is reused unchanged.
    *   Nothing new can go wrong in posting.
*   **Cons**:
    *   It is still two screens and two saves, so it only shortens the detour the user complained about.
    *   It does nothing for "see the product's stock in one place". The user still opens **Stock** to see quantities.
    *   The cost bug (G4) and the unit lock (G5) still need fixing anyway.
*   **Reason for Rejection**: It doesn't meet G1 or G2.
    *   It is kept as a fallback: if the in-dialog rows prove too heavy, "Add opening stock → pre-filled adjustment" is the cheaper version of G1.

### Alternative C: A full product detail page instead of a dialog

Replace the dialog with a `/products/:id` page holding tabs for Details, Stock, Movements, Lots, Reorder and Vendors. Create would become `/products/new`.

*   **Pros**:
    *   It has room for everything about a product.
    *   Pages have their own addresses, so they can be linked and bookmarked.
    *   It matches Zoho Inventory and Odoo.
*   **Cons**:
    *   It means a new route and moving every existing dialog section (`ProductDialog.tsx`, 621 lines, plus `ProductVendors`).
    *   Every place that opens the dialog today changes too, such as the products list and the price lists.
    *   Most of the work is moving existing UI, not solving the stock problem.
*   **Reason for Rejection**: It is too large for the problem being solved. The Stock tab is built as a separate component (`ProductStockTab.tsx`) so it can move onto a detail page later unchanged. This is listed under Future Improvements.

### Alternative D: A new "opening stock" document type instead of an adjustment

Add a `sourceType: "opening"` and its own document, separate from `StockAdjustment`.

*   **Pros**:
    *   Opening stock would be clearly separate in reports.
    *   It could have its own rules, such as one per product and location.
*   **Cons**:
    *   It needs a new schema, a new numbering rule, and new list, retry and cancel screens, all copies of what adjustments already do.
    *   The PRD and the seeder already treat opening stock as an adjustment with the "Opening stock" reason.
    *   Spec 0017's CSV import plans the same thing.
*   **Reason for Rejection**: The reason already separates opening stock in reports and filters. A new document type adds code without adding anything users can do.

### Alternative E: Change stock by typing the difference instead of the new total

The Adjust stock dialog asks "Add or remove how many?", like the Adjustments page's in/out lines.

*   **Pros**: It matches the existing Adjustments page.
*   **Cons**: After a count, people know the new total, not the difference. Making them subtract by hand invites wrong signs and wrong numbers.
*   **Reason for Rejection**: The dialog asks for the new total and shows the difference it worked out ("−3") before saving. The Adjustments page keeps in/out lines, because it handles many products at once.
