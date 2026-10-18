# Business PRD — Cloud Inventory & Order Management for SMBs

**Status:** Draft v1 · **Date:** 2026-10-18 · **Reference product studied:** inFlow Inventory (inflowinventory.com)

> This PRD is derived from a reverse-engineering study of inFlow's public surface:
> its marketing/feature pages, pricing page, help-center articles, and its public
> OpenAPI 3.0.4 specification (84 endpoints, 97 schemas, API version `2026-09-29`).
> It describes **what the business must do**, not how inFlow looks. No visual design,
> copy, branding or UI layout is reused. Where we deliberately diverge from or improve
> on the reference, it is marked **[Our call]**.
>
> Evidence tags: **[API]** = observed in the public OpenAPI spec · **[Site]** = stated on
> marketing/pricing pages · **[Help]** = stated in help center · **[Inferred]** = deduced
> from combined evidence, not directly stated.

---

## 1. Product summary

A cloud inventory and order-management system for small and mid-sized product
businesses (1–50 staff) that have outgrown spreadsheets but don't need an ERP.
It tracks **what you have, where it is, what it cost, what's committed, and what to
reorder**, and it runs the full **buy → stock → (make) → sell → ship → get paid**
cycle, syncing financials to the accounting system rather than replacing it.

### 1.1 Problem
SMB product companies run inventory in spreadsheets plus an accounting tool. This causes:
- Stock-outs and over-stock (no reorder logic, no view of committed stock).
- Wrong margins (no landed cost, no COGS per order).
- Shipping errors (no pick/pack discipline, no barcode scanning).
- No traceability for recalls (lots/serials/expiry not tracked).
- Data re-entry between storefronts, warehouse, and accounting.

### 1.2 Product lines (packaging the same core)
| Edition | Who | Core promise | Evidence |
|---|---|---|---|
| **Inventory** | Wholesalers, distributors, retailers, field service | Stock levels, sales, purchasing, reordering | [Site] |
| **Manufacturing** | Light assemblers, kitters, makers | Everything in Inventory + BOMs, manufacture orders, operations, labor | [Site] |
| **Stockroom** | Clinics, trades, asset/tool cribs, supply closets | Scan stock in/out only; unlimited scan-only users | [Site] |

### 1.3 Target segments & use cases [Site]
Wholesale/distribution · Warehouse management · Asset/tool tracking · Field service
(HVAC, solar/PV installers — "warehouse → truck" transfers) · Light manufacturing/kitting ·
B2B sellers wanting a private ordering portal.

### 1.4 Goals (first 12 months) [Our call]
| Goal | Metric | Target |
|---|---|---|
| Activation | Trial accounts that import products **and** complete one order within 14 days | ≥ 40% |
| Accuracy | Customers' cycle-count variance (absolute units / counted units) | < 2% after 90 days |
| Retention | Logo churn, monthly | < 2% |
| Expansion | Accounts buying ≥1 add-on by month 6 | ≥ 30% |
| Integration | Accounts with accounting sync connected | ≥ 60% |

### 1.5 Non-goals (v1)
- General ledger / full accounting (we **sync to** QuickBooks Online / Xero, we don't replace them).
- Payroll, HR, CRM pipelines, MRP finite-capacity scheduling.
- Native B2C storefront (we integrate with Shopify/WooCommerce/etc.; B2B portal is in scope).
- Multi-company consolidation (one tenant = one company; see §9).

---

## 2. Personas

| Persona | Role | Primary jobs | Key access |
|---|---|---|---|
| **Owner/Admin** | Founder, ops manager | Configure, view margins, approve spend, run reports | All, incl. costs & settings |
| **Sales rep** | Inside sales | Quote, order, follow up on payment | Sales; may be restricted to *own* customers/orders |
| **Purchaser** | Buyer | Act on reorder suggestions, raise POs, track vendors | Purchasing; approval limit |
| **Warehouse staff** | Picker/packer/receiver | Pick, pack, ship, receive, count, transfer — mostly on mobile with scanner | Fulfillment only; often restricted to certain locations |
| **Production worker** | Assembler | Pick raw materials, log time on operations, put away finished goods | Manufacturing mobile only |
| **Stockroom user** | Technician, nurse | Scan items out/in against a job | Scan app only, PIN-identified, no web seat |
| **B2B customer** (external) | Buyer at a retailer | Browse their catalog & prices, place orders, pay | Portal only |
| **Integrator/agent** (machine) | API client, AI agent | Read/write data, react to events | API key, scoped to company |

---

## 3. Core concepts (domain glossary)

| Concept | Definition | Evidence |
|---|---|---|
| **Product** (item) | Something you buy, sell, make, or track. Type is **Stocked**, **Non-stocked**, or **Service** — fixed once set. | [API] `itemType` |
| **Standard UoM** | The unit inventory is counted in (e.g., *each*). Products may have a separate **purchasing UoM** and **sales UoM** with a conversion ratio (e.g., 1 case = 12 each). | [API] |
| **Category** | Multi-level tree; one company default. | [API] |
| **Product group / variants** | A parent (e.g., "T-shirt") with options (Size, Color) whose combinations are individual products. | [API] |
| **Location** | A warehouse, store, truck, or site. One default. | [API] |
| **Sublocation** | Bin/shelf/aisle inside a location (free-text code, suggested by system). | [API] |
| **Lot** | A batch with lot number and optional manufacture/expiry/sell-by dates. | [API] |
| **Serial** | Unique unit identifier; one serial = one standard unit. | [API] |
| **Inventory line** | Quantity on hand for (product, location, sublocation, lot, serial). | [API] |
| **Pricing scheme** | A named price list in one currency, tax-inclusive or not, assigned to customers. Prices are **fixed** or **markup over cost**. | [API] |
| **Taxing scheme / tax code** | Up to **two** tax components (e.g., GST + PST) with optional compounding and on-shipping flags; tax codes give per-product rates (e.g., exempt). | [API] |
| **Reorder settings** | Per product **per location**: reorder point, reorder quantity, method (PO / manufacture / transfer), preferred vendor or source location. | [API] |
| **Quantities** | *On hand, reserved, picked, available, on order, in transit, buildable, anticipated* — see §5.3. | [API] |

---

## 4. Functional requirements by module

Priority: **P0** = MVP launch blocker · **P1** = launch+1 quarter · **P2** = later.

### 4.1 Products & catalog
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| PRD-P1 | Create products with name (unique), SKU (optional, unique if set), description, category, type, standard UoM, images (multiple, one default), dimensions & weight, remarks. | P0 | [API] |
| PRD-P2 | Multiple barcodes per product; generate barcodes; scan to look up. | P0 | [API][Site] |
| PRD-P3 | Alternate purchasing & sales UoM with conversion ratio. | P0 | [API] |
| PRD-P4 | Tracking flags: **serials**, **lots**, **expiry** (expiry requires lots). Immutable once set, stocked products only. | P0 | [API] |
| PRD-P5 | Shelf-life days, sell-before-expiry days, expiry notification days → drive default lot dates and expiry alerts. | P1 | [API] |
| PRD-P6 | Deactivate (soft-hide) products, never hard-delete if transactions exist. | P0 | [API] |
| PRD-P7 | Product groups with up to N options and option values; each variant is a full product; bulk-create variants. | P1 | [API] |
| PRD-P8 | Vendor items: per vendor code, cost (in vendor currency, per purchasing UoM), lead time; ordered preference. | P0 | [API] |
| PRD-P9 | Customs data: HS tariff code, country of origin (pre-fills shipping customs). | P1 | [API] |
| PRD-P10 | Up to 10 configurable custom fields (text, dropdown, date, checkbox, numeric), optionally scoped to a category. | P1 | [API] |
| PRD-P11 | CSV import/export for products, customers, vendors, stock levels, prices. Guided import with column mapping and dry-run. | P0 | [Site] |
| PRD-P12 | File attachments on products. | P1 | [API] |

### 4.2 Inventory control
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| INV-1 | Multiple locations with sublocations (bins). Plan-gated location count. | P0 | [API][Site] |
| INV-2 | **Stock adjustments** with reason codes (system + user-defined), date, location, lines (product, sublocation, lot/serial, ±qty). Cancel voids movements. | P0 | [API] |
| INV-3 | **Stock transfers** between locations with statuses **Open → In transit → Completed**; stock leaves source on *send*, arrives at destination on *receive*; in-transit quantity visible. Optional approval right. | P0 | [API] |
| INV-4 | **Stock counts**: create count for a location → split into **count sheets** assigned to people → system snapshots expected qty → staff enter counted qty → **review** variance → complete posts adjustments. Statuses: Open → In progress → In review → Completed. | P0 | [API] |
| INV-5 | **Cost adjustments**: set a new unit cost effective on a date (per serial for serialized items). | P1 | [API] |
| INV-6 | Real-time quantity model (§5.3) per product, per location and company-wide. | P0 | [API] |
| INV-7 | Full movement history (who, what, when, from which document) for every quantity change — the audit trail. | P0 | [Site] |
| INV-8 | Lot/serial **traceability**: forward (which customers received lot X) and backward (which PO supplied serial Y). | P1 | [Site] |
| INV-9 | Expired lots are excluded from automatic allocation; FEFO (first-expiry-first-out) suggestion on pick. | P1 | [API][Site] |
| INV-10 | Negative inventory blocked by default; overridable per action by authorized users / API header. | P0 | [API] |
| INV-11 | Suggested sublocations for put-away and picking (where the product already lives / last used). | P1 | [API] |

### 4.3 Reordering & replenishment
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| RO-1 | Per product × location reorder point, reorder quantity, method (**Purchase order**, **Manufacture order**, **Stock transfer**), preferred vendor or source location, default sublocation. | P0 | [API] |
| RO-2 | Reorder list: items whose *anticipated* qty (on hand − reserved + on order) < reorder point. | P0 | [API] |
| RO-3 | One-click generation of POs grouped by vendor / transfers grouped by source / MOs. | P0 | [Site] |
| RO-4 | Recommended reorder point from sales velocity × vendor lead time + safety stock. | P1 | [Site] |
| RO-5 | Low-stock email/in-app alerts. | P0 | [Site] |

### 4.4 Sales (order-to-cash)
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| SO-1 | **Sales quote** → convert to **sales order** (and back). | P0 | [API] |
| SO-2 | Order header: customer, contact, billing/shipping address (snapshot), location, pricing scheme, currency + exchange rate, taxing scheme, payment terms → due date, sales rep, assigned team member, PO number (customer's), requested ship date, freight, external ID & source (for integrations), remarks per stage. | P0 | [API] |
| SO-3 | Lines: product, description override, qty in UoM, unit price, discount (% or fixed), tax code, service-completed flag. **Negative qty lines = returns**, with "discard (damaged) vs restock". | P0 | [API] |
| SO-4 | **Fulfillment stages**, each independently recordable and partially completable: **Pick** (from location/sublocation/lot/serial) → **Pack** (into numbered containers) → **Ship** (containers, carrier, tracking no., date) → **Restock** (returns). | P0 | [API] |
| SO-5 | **Picking session**: "start picking" allocates stock and locks the order; failures (out of stock, only expired lots) are reported per line; "stop picking" releases. | P1 | [API] |
| SO-6 | Two status dimensions shown separately: **Inventory status** (Quote, Unconfirmed, Unfulfilled, Started, Fulfilled) and **Payment status** (Quote, Unconfirmed, Uninvoiced, Invoiced, Partial, Paid, Owing). Derived, not user-set. | P0 | [API] |
| SO-7 | **Invoice**: mark invoiced with date; email invoice/receipt PDFs from editable templates. | P0 | [API][Site] |
| SO-8 | **Payments**: multiple per order; types Payment, Refund, Apply credit, Convert to credit, Batch payment; method & reference. Customer balance and store credit per currency. | P0 | [API] |
| SO-9 | **Order confirmation gate**: orders can require confirmation by a user with the *Confirm* right — triggered e.g. by credit-limit breach. | P1 | [API][Help] |
| SO-10 | **Customer credit limits**: an order that pushes outstanding balance over limit becomes *Unconfirmed* until confirmed. | P1 | [Help] |
| SO-11 | **Prioritization**: drag-order fulfillment queue; allocate stock to highest priority first; show "can ship now" vs "needs stock". | P1 | [API][Site] |
| SO-12 | **Back orders**: partial pick/ship; remaining qty stays open. | P0 | [Site] |
| SO-13 | **Dropship**: order ships from vendor; generate linked PO with ship-to = customer. | P2 | [Site] |
| SO-14 | Quick actions (single-call): pick all, pack all, ship all, invoice, pay in full, fulfill, restock, cancel, convert. | P0 | [API] |
| SO-15 | COGS and profit per order, available once completed; non-customer costs (e.g., commissions) deducted from profit. | P0 | [API] |
| SO-16 | Shipping labels: rate-shop carriers, buy and print labels, customs info, auto-email tracking. | P1 | [Site][API] |
| SO-17 | Sales-rep restriction: reps see only their customers/orders. | P1 | [Site] |

### 4.5 Purchasing (procure-to-pay)
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| PO-1 | **Purchase quote (RFQ)** → **purchase order**. | P0 | [API] |
| PO-2 | **Approval workflow**: status Unapproved until approved by a team member whose **approval limit** ≥ order total. | P1 | [API][Help] |
| PO-3 | Header: vendor, contact, vendor address snapshot, ship-to address & company name (dropship), receive location, currency/exchange rate, taxing scheme, payment terms, carrier, requested ship date, vendor's order number, freight, **non-vendor costs** (% or fixed). | P0 | [API] |
| PO-4 | Lines: product, vendor item code, qty in UoM, unit price, discount, tax code; **negative qty = return to vendor**. | P0 | [API] |
| PO-5 | **Receive** (partial, multiple receipts) into location/sublocation with lot/serial capture; scan-to-receive. **Unstock** returned items. | P0 | [API][Site] |
| PO-6 | **Landed cost**: freight + non-vendor costs allocated to received stocked lines by **value (default), weight, or volume**. | P0 | [Help][API] |
| PO-7 | Pay vendors (partial, batch), vendor balance/credit per currency, aging (current/1–30/31–60/61+). | P0 | [API] |
| PO-8 | Statuses: Inventory (Quote, Unapproved, Unfulfilled, Started, Fulfilled) and Payment (Quote, Unapproved, Unpaid, Partial, Paid, Owing). | P0 | [API] |
| PO-9 | Last vendor recorded on product; vendor price list updated from latest PO (with prompt). | P1 | [API][Inferred] |

### 4.6 Manufacturing (Manufacturing edition)
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| MFG-1 | **Bill of materials**: product → child products × qty (in UoM); **multi-level** (sub-assemblies). | P0 | [API] |
| MFG-2 | **Operations** on a BOM: operation type, instructions, fixed per-unit cost, estimated seconds per unit, per-hour cost, track-time flag. | P1 | [API] |
| MFG-3 | **Manufacture order**: finished products + raw material tree (editable per order), location, due date, assigned to, status Open → In progress → Completed. | P0 | [API] |
| MFG-4 | **Pick** raw materials (with lot/serial), **put away** finished goods (with new lot/serial); put-away takes effect on completion. Pick↔line matching for traceability. | P0 | [API] |
| MFG-5 | **Timesheets** per operation per worker (start/end or estimated duration); labor cost rolled into finished goods cost. | P1 | [API] |
| MFG-6 | **Auto-assemble**: selling/picking a kit with insufficient stock auto-creates an MO. | P2 | [API] |
| MFG-7 | **Quantity buildable** from current component stock; optionally counted in "available". | P1 | [API] |
| MFG-8 | **Disassembly** (reverse BOM). | P2 | [Site] |
| MFG-9 | Reports: materials variance, WIP cost, operation variance, timesheets. | P1 | [Site] |

### 4.7 Stockroom (scan-only)
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| STK-1 | Unlimited **stockroom users** (name + optional 4-digit PIN), no web seat, mobile scan app only. | P1 | [Site][API] |
| STK-2 | Admin-defined **workflows** (e.g., "Restock", "Check out to job", "Transfer to truck") mapping to an adjustment or transfer with required custom fields (job number, site ID). | P1 | [Site] |
| STK-3 | Each scan is recorded as a stock adjustment/transfer **attributed to the stockroom user**. | P1 | [API] (`stockroom-scans` deprecated in favour of adjustments) |
| STK-4 | Reports: who took what, scans in last 30 days, low-stock alerts. | P1 | [Site] |

### 4.8 B2B portal ("Showroom")
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| B2B-1 | Unlimited portals; each is public or password-protected / invite-only. | P1 | [Site] |
| B2B-2 | Per-portal product selection, visible fields, pricing scheme, branding (colors, logo), custom domain. | P1 | [Site] |
| B2B-3 | Live stock availability shown (or hidden). | P1 | [Site] |
| B2B-4 | Cart → checkout creates a sales order (source = portal), optionally *Unconfirmed* for review. | P1 | [Site][Inferred] |
| B2B-5 | Online card payment at checkout (US/CA initially). | P2 | [Site] |
| B2B-6 | Abandoned cart tracking, automated reminder emails, abandoned-cart report. | P2 | [Site] |
| B2B-7 | **[Our call]** Customer portal accounts (per buyer login) with order history and reorder — inFlow uses shared passwords; we use real accounts. | P1 | — |

### 4.9 Reporting & analytics
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| RPT-1 | Standard report library (≈50): **Sales** (by product, profit, returns, tax, payments, back orders, rep, traceability, abandoned carts) · **Purchasing** (PO summary/details/status, vendor payments, purchase tax, vendor price list) · **Inventory** (summary, details, aging, by location, historical/as-of date, movement, estimated duration, reorder, recommended reorder point, price list, count, cost, cost log, adjustments, transfers, scans, lot expiry) · **Manufacturing** (MO summary, materials variance, WIP, materials, finished products, timesheets, operation variance) · **Admin** (team activity). | P0 (core 20) / P1 (rest) | [Site] |
| RPT-2 | Filters, grouping, column chooser, save & share reports, export CSV/PDF. | P0 | [API][Site] |
| RPT-3 | Configurable home dashboard widgets. | P1 | [Site] |
| RPT-4 | **AI report assistant**: natural-language question → report/answer, respecting user's access rights (never exposes cost to users without cost access). | P2 | [Site] |
| RPT-5 | Long reports run as async jobs (status NotStarted/InProgress/Success/Error) with downloadable result. | P1 | [API] |

### 4.10 Settings, customization & documents
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| SET-1 | Company profile, home currency, multi-currency with auto or manual exchange rates. | P0 | [API][Site] |
| SET-2 | Customizable document numbering per type (prefix + padded sequence). | P0 | [Site] |
| SET-3 | Document templates (invoice, quote, PO, pick list, packing slip, labels) and email templates; remove vendor branding on paid plans. | P0/P1 | [Site] |
| SET-4 | Custom fields (§4.1) on sales/purchase/manufacture orders, customers, vendors, counts, transfers, adjustments, lots; per-type "print on document" toggles. | P1 | [API] |
| SET-5 | Payment terms (name, days due), taxing schemes, pricing schemes, adjustment reasons, operation types, carriers, payment methods. | P0 | [API] |
| SET-6 | **Close transactions**: lock records older than a cutoff date or N days after fulfillment; sales orders use invoice date (else order date), POs use order date, counts/MOs use completion date; unfulfilled orders never close. | P1 | [Help] |
| SET-7 | Barcode label designer and printing (incl. mobile Bluetooth printers). | P1 | [Site] |

### 4.11 Users, security & access
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| SEC-1 | Team members (seat-licensed) with email login, 2FA; SSO (Google, Microsoft Entra, Okta, OneLogin) as add-on. | P0 / P2 SSO | [Site] |
| SEC-2 | **Granular access rights** (~50) by module × action, e.g. Sales Order View/Edit/Pick/Confirm/Prioritize, Customer View/Edit, Sales Price Edit, PO View/Edit/Receive, Vendor View/Edit, Reorder Edit, Count View/Edit/Count-only, Transfer View/Edit/Approve, Adjust View/Edit, Current stock View, History View, Product View/Edit, **Cost View/Edit**, Category Edit, MO View/Edit/Mobile/Prioritize, Stockroom scan View/Edit, Labor hours (est./actual) View/Edit, Settings View/Edit, Import, Export, Backup, Print settings, Restore/Reset, Integrations, Reports View. | P0 basic / P1 advanced | [API] |
| SEC-3 | **[Our call]** Ship roles (Admin, Manager, Sales, Purchasing, Warehouse, Production, Read-only) as editable bundles of rights; per-user overrides. | P0 | — |
| SEC-4 | Location restriction: user can access all or a subset of locations. | P1 | [API] |
| SEC-5 | PO approval limit per user. | P1 | [Help] |
| SEC-6 | Audit: every record stores last-modified-by (user, system, or API key) and time; full change history for orders. | P0 | [API] |
| SEC-7 | Optimistic concurrency: edits fail if the record changed since read (row version). | P0 | [API] |
| SEC-8 | Data rollback/point-in-time restore (via support), daily backups, 256-bit TLS. | P0 | [Site] |

### 4.12 Integrations & platform
| ID | Requirement | Pri | Evidence |
|---|---|---|---|
| INT-1 | **Accounting**: QuickBooks Online, Xero — push invoices, bills, payments, inventory value; two-way payment sync. | P0 | [Site] |
| INT-2 | **E-commerce**: Shopify, WooCommerce, Amazon, Squarespace natively — import orders, push stock levels; long tail (eBay, Etsy, BigCommerce, Magento, Walmart, Faire, …) via an integration partner. | P0 (Shopify) / P1 | [Site] |
| INT-3 | **Shipping**: carrier rate shopping/labels via an aggregator (EasyPost-like); ShipStation. | P1 | [Site][API] |
| INT-4 | **Payments**: card processing for invoices and portal (US/CA); Square. | P2 | [Site] |
| INT-5 | **EDI** (SPS Commerce, CommerceHub) via partner. | P2 | [Site] |
| INT-6 | **Public REST API**: API-key auth, company-scoped, JSON; upsert-by-client-generated-UUID; `include` related entities; filter/sort; cursor pagination (max 100/page); row-version concurrency; rate limit (token bucket ~60/min, burst 300); date-versioned via `Accept` header. | P0 | [API] |
| INT-7 | **Webhooks**: HMAC-signed; events `*.created` / `*.updated` for customer, vendor, product, sales/purchase/manufacturing order, stock adjustment/transfer/count, plus `inventory.updated`; auto-disable after repeated failures. | P0 | [API] |
| INT-8 | **MCP server** exposing API operations as AI-agent tools, same auth. | P1 | [API] |
| INT-9 | Zapier app. | P1 | [Site] |

### 4.13 Platforms
Web app (primary) · iOS & Android apps (fulfillment, receiving, counting, scanning,
manufacturing timesheets; work offline-tolerant) · hardware: rugged Android scanner, Bluetooth
label printer. [Site] **[Our call]** No Windows desktop client — web + PWA only.

---

## 5. Key business rules

### 5.1 Document lifecycles
**Sales order**
```
Quote ──convert──► Order ──(needs confirmation?)──► Unconfirmed ──confirm──► Unfulfilled
                                                                              │ pick/pack/ship (partial ok)
                                                                              ▼
                                                    Started ──all lines shipped──► Fulfilled
Payment track (independent): Uninvoiced → Invoiced → Partial → Paid   (Owing = overpaid/refund due)
Completed = fulfilled AND returns processed AND paid.  Cancel = void all movements + payments.
```
**Purchase order**: Quote → Unapproved → (approve) → Unfulfilled → Started → Fulfilled; Payment: Unpaid → Partial → Paid.
**Stock transfer**: Open → In transit (stock leaves source) → Completed (stock arrives).
**Stock count**: Open → In progress → In review → Completed (adjustments posted).
**Manufacture order**: Open → In progress (materials picked) → Completed (finished goods put away).

### 5.2 Inventory posting
- Every quantity change comes from a **document line** (receive, pick, restock, unstock,
  adjustment, transfer send/receive, MO pick/put, count completion). No direct edits to on-hand. [API]
- Quantities are stored in the product's **standard UoM**; documents keep the entered UoM
  and the conversion used. [API]
- Serialized: one inventory row per serial; quantity is always 0 or 1. [API]
- Cancelling a document reverses its movements; closed periods (§4.10 SET-6) block edits.

### 5.3 Quantity definitions (must match exactly everywhere) [API]
| Quantity | Definition |
|---|---|
| **On hand** | Physically present (incl. reserved) minus already picked |
| **Picked** | Picked on SO/MO, awaiting ship/consumption |
| **Reserved** | Committed to open SO lines, MO raw materials, outgoing transfers, and builds for negative anticipated stock — not yet picked |
| **On order** | Ordered not received: open PO lines + unfinished MO outputs + incoming transfers |
| **In transit** | Sent on a transfer, not yet received |
| **Available** | On hand − reserved (+ buildable, if product opts in) |
| **Buildable** | Units makeable from current component stock via BOM |
| **Anticipated** | On hand − reserved + on order (drives reordering) |

### 5.4 Costing [Help]
- Default **moving average**: new avg = (old qty × old avg + received qty × landed unit cost) / (old qty + received qty).
- **FIFO** (and optionally LIFO) as a company setting with cost layers; adjustments-in use current cost.
- **Landed unit cost** = vendor unit price after discount, converted to home currency
  + allocated freight + allocated non-vendor costs + allocated service lines on the PO.
- COGS is fixed at the moment stock leaves (pick/ship) and stored on the sales order.
- Manufactured cost = Σ component costs + operation fixed costs + labor (actual timesheets, else estimates).
- Serialized items may carry individual cost.

### 5.5 Pricing & tax [API]
- Price resolution on a sales line: customer's pricing scheme → product price in that
  scheme (fixed or markup % over current cost) → fallback default scheme; then customer
  default discount; then line discount; **[Our call]** then volume price breaks (qty tiers).
- Tax: two components; tax 2 may compound on tax 1; each may apply to shipping;
  per-line tax code; tax-inclusive schemes back-calculate.
- Multi-currency: each order stores currency + exchange rate (manual or auto-pulled with date).

### 5.6 Numbering, defaults & integrity
- Unique: product name; SKU if set; document numbers per type.
- Exactly one default per: location, category, pricing scheme, taxing scheme, operation type.
- Lookup records (customers, vendors, products, locations, schemes) **deactivate**, never delete, once referenced.
- Customer/vendor defaults (terms, pricing, tax, carrier, location, rep, addresses, discount, currency, lead time) pre-fill new orders.

---

## 6. Packaging & pricing (reference market data) [Site]

The reference vendor's USD pricing (annual billing per month / monthly billing):

| Inventory | Mfg equivalent | Seats | Locations | Annual /mo | Monthly |
|---|---|---|---|---|---|
| Lite | Start Up ($169/$199) | 2 | 1, no sublocations | $99 | $129 |
| Core | Growth ($399/$479) | 5 | 5 | $299 | $379 |
| Pro | Scale ($629/$759) | 10 | Unlimited | $499 | $629 |
| Max | Expansion ($859/$1,029) | 20 | Unlimited | $699 | $879 |

Stockroom: $69/mo annual (unlimited scan users + 2 admins; +$5/location).
Add-ons: extra seat $29 (volume tiers down to $14) · serials $39 · lots $39 · API & MCP $49 (included Pro+) ·
B2B portal $39 (included Pro+) · Stockroom $39 · advanced access rights $69 (included Pro+) ·
extra integration $49–89 · unlimited integrations $119–159 · SSO (quote).
Services: onboarding $499 (mandatory on most plans), training $999, implementation $2,999.
Commercial terms: 14-day trial, no card; upgrade prorated; downgrade next cycle; 30-day refund.

**[Our call] Positioning recommendation:** the reference monetizes basic capabilities
(lots, serials, API) as add-ons and charges mandatory onboarding. Our wedge:
1. **Free tier** (1 user, 1 location, 100 SKUs) for self-serve acquisition.
2. **Lots/serials/API included** from the second tier.
3. **No mandatory onboarding**; in-product guided setup + importer instead.
4. Usage-based seat pricing with free view-only seats.
The entitlement system (§9) must support plan limits (seats, locations, sublocations,
integrations, SKUs, orders/month) and feature flags (manufacturing, lots, serials, portal,
API, advanced rights, SSO, white-label) per subscription.

---

## 7. Non-functional requirements
| Area | Requirement |
|---|---|
| Availability | 99.9% monthly; status page; 24/7 monitoring |
| Performance | Product search < 300 ms p95 at 100k SKUs; order save < 500 ms p95; quantity summary for 1 product < 100 ms |
| Scale per tenant | 250k products, 5M inventory movements/yr, 200 locations, 100 concurrent users |
| Correctness | Inventory posting is transactional; quantities reconstructible from the movement ledger at any date |
| Concurrency | Optimistic locking on all editable records; pick allocation uses row locks to avoid double-allocation |
| Security | TLS 1.2+, encryption at rest, tenant isolation enforced in DB (row-level security), 2FA, SSO, API keys hashed, webhook HMAC |
| Privacy | GDPR/PIPEDA: data export & deletion per tenant; data residency US/EU/CA **[Our call]** |
| Backup | Point-in-time recovery 30 days; tenant-level rollback |
| Mobile | Offline queue for scans/counts with conflict resolution |
| Accessibility | WCAG 2.2 AA for web |
| Localization | Currency formatting per currency (decimals, separators, symbol position, negative style); dates/time zone per company; UI i18n-ready |
| API | Versioned, rate-limited, idempotent upserts by client UUID |

---

## 8. Release plan
| Phase | Scope |
|---|---|
| **MVP (P0)** | Products/UoM/barcodes/categories, locations+sublocations, adjustments, transfers, counts, moving-average costing + landed cost, reorder list, sales quote→order→pick/pack/ship→invoice→pay→return, purchase quote→order→receive→pay→return, customers/vendors, pricing & taxing schemes, multi-currency, core 20 reports, CSV import/export, roles & basic rights, REST API + webhooks, QuickBooks Online, Shopify, mobile pick/receive/count |
| **v1.1 (P1)** | Lots/serials/expiry & traceability, variants, custom fields, approvals & credit limits, close transactions, manufacturing (BOM, MO, operations, timesheets), Stockroom, B2B portal, shipping labels, Xero, Woo/Amazon, advanced rights, location restrictions, dashboards, async reports, MCP server, Zapier |
| **v2 (P2)** | AI report assistant, auto-assemble, disassembly, dropship, portal payments & abandoned carts, EDI/long-tail marketplaces, SSO, FIFO/LIFO |

---

## 9. Assumptions, open questions, risks
| # | Item | Type |
|---|---|---|
| 1 | inFlow's API exposes no **user-defined volume price breaks** entity even though "volume pricing" is marketed; likely modelled via pricing schemes. We add explicit price tiers. | Inferred / Our call |
| 2 | inFlow stores at most two tax components; regions needing 3+ (e.g., some US city/county/state stacks) need a tax-engine integration (Avalara/TaxJar). | Risk |
| 3 | Sublocations are free-text in the reference; we make them first-class records (with optional free-text auto-create) for bin-level reporting. | Our call |
| 4 | Accounting sync is one of the top churn drivers in this category; reliability (retries, mapping UI, error inbox) must be P0 quality. | Risk |
| 5 | Credit limits are beta in the reference; confirm desired behaviour (hard block vs confirm gate). | Open |
| 6 | Multi-company / multi-entity for groups of businesses is out of scope; revisit for agencies/3PLs. | Open |
| 7 | 3PL (storing stock for other businesses) not covered; would need owner on inventory lines. | Open |

---

## 10. Sources
- Reference site: <https://www.inflowinventory.com/> and feature pages (`/features/all-features`,
  `/features/sales-and-invoicing`, `/features/purchase-order-software`, `/features/inventory-control`,
  `/features/manufacturing-software`, `/features/reporting`, `/features/b2b-portal`, `/integrations`,
  `/inflow-stockroom`, `/software-pricing-inflow`) — fetched 2026-10-18.
- Public API spec: <https://cloudapi.inflowinventory.com/docs/api/swagger.json> (OpenAPI 3.0.4, version `2026-09-29`).
- Help center: [Costing options](https://www.inflowinventory.com/support/cloud/can-i-choose-how-to-handle-cost-moving-average-fifo-lifo-etc) ·
  [How inFlow calculates cost/COGS](https://www.inflowinventory.com/support/cloud/inflow-cloud-calculate-cost-item-cost-goods-sold) ·
  [Customer credit limits](https://www.inflowinventory.com/support/cloud/how-to-set-customer-credit-limits) ·
  [PO approvals](https://www.inflowinventory.com/support/cloud/how-to-set-up-purchase-order-approvals) ·
  [Protect completed orders](https://www.inflowinventory.com/support/cloud/protect-completed-orders-modified/).
- Not observed: the logged-in web app UI and its private APIs (behind authentication; not inspected).
