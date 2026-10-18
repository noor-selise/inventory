# 0020. Manufacturing: bills of materials, manufacture orders, operations and timesheets

**Date**: 2026-10-18
**Status**: Proposed

## Summary

Multi level bills of materials, manufacture orders that pick raw materials and put away finished goods, operations with costs, timesheets, and buildable quantity. BOMs, orders, and timesheets are plain records and fit Blocks. Picking materials and putting away finished goods are stock postings, and the finished cost depends on safe cost updates, so the stock side waits on spec 0007 and D1.

## Context

PRD §4.6 (MFG-1 to MFG-9), §5.1 MO lifecycle, §5.4 manufactured cost. DB design BOM_COMPONENT, MANUFACTURE_ORDER. A v1.1 (P1) module per the release plan.

## Requirements

**Acceptance criteria**:
- **AC-1**: A BOM lists child products and quantities per unit (in a unit), and children can have their own BOMs (multi level); a product can never contain itself.
- **AC-2**: Operations on a BOM have type, instructions, fixed per unit cost, estimated seconds per unit, hourly cost, track time flag.
- **AC-3**: A manufacture order has finished products, a raw material tree copied from the BOM and editable, location, due date, assignee, and goes Open → In progress → Completed.
- **AC-4**: Picking materials (with lots or serials) posts stock out; putting away finished goods (with new lots or serials) posts stock in on completion.
- **AC-5**: Workers log time per operation (start and end, or estimate); labor cost rolls into finished cost.
- **AC-6**: Finished unit cost = components + operation fixed costs + labor (actual, else estimate).
- **AC-7**: Buildable quantity is shown per product from current component stock.
- **AC-8**: Auto assemble and disassembly. (P2)

## Options considered

### Option 1: BOM as embedded components on a `Bom` document; MO with embedded material tree and timesheets
**Pros**: atomic edits per BOM and MO. **Cons**: the cycle check reads several BOMs.

### Option 2: `BomComponent` rows as in the DB design
**Pros**: component queries ("where used"). **Cons**: no atomic BOM edit.

## Decision

**Chosen option**: Option 1, plus a "where used" index field (`componentIds` array) on `Bom`.

**Implementation skills**: `blocks-data-gateway-configuration`, `blocks-data-gateway-crud`.

## Rationale

Same single document reasoning as orders. The array field keeps "where used" queryable.

## Blocks fit

| PRD | Need | Blocks piece | Verdict |
|---|---|---|---|
| MFG-1 | Multi level BOM, no cycles | Schema + cycle check in app | ✅ Can do; ⚠️ cycle check app only |
| MFG-2 | Operations | Embedded | ✅ Can do |
| MFG-3 | MO lifecycle | Schema + status | ✅ Can do; ⚠️ transitions app only |
| MFG-4 | Pick and put away | Spec 0007 posting | ⚠️ Blocked by D1 |
| MFG-5 | Timesheets | Embedded in MO | ✅ Can do |
| MFG-6 | Finished cost | Browser math + 0007 cost update | ⚠️ Cost update blocked by D1 |
| MFG-7 | Buildable | Browser over component balances | ✅ Can do for one product; ⚠️ list view needs precompute (L3) |
| MFG-9 | Manufacturing reports | Spec 0015 approach | ⚠️ Same limits as 0015 |
| MFG-6, MFG-8 | Auto assemble, disassembly (P2) | MO created automatically or reversed; stock through 0007 | ⚠️ Blocked by D1 |

## Feature design

**Data model sketch**:
- `Bom`: `productId` req (unique), `components` array {`productId`, `qty`, `uom`}, `componentIds` ID array, `operations` array {`typeId`, `instructions`, `fixedCostPerUnit`, `secondsPerUnit`, `hourlyCost`, `trackTime`}.
- `OperationType`: `name`, `isDefault`.
- `ManufactureOrder`: `number` req (unique), `locationId`, `dueDate`, `assigneeId`, `status`, `outputs` array {`productId`, `qty`, `lotNumber`, `serials`}, `materials` array {`lineId`, `productId`, `qty`, `pickedQty`, `lotId`, `serial`}, `timesheets` array {`operationIndex`, `userId`, `startedAt`, `endedAt`, `estimatedSeconds`}, `history` array.

**State transitions**: Open → In progress (first pick) → Completed (put away); cancel reverses picks.

**API surface**: CRUD; actions `pickMaterials`, `logTime`, `complete` calling spec 0007 `post()`.

**Value sourcing**:
| Action | Value | Source |
|---|---|---|
| Complete | finished unit cost | picked component costs + fixed costs + labor ÷ output qty |
| Labor | hours | timesheets, else `secondsPerUnit × qty` |
| Buildable | qty | min over components of available ÷ qty per unit |

**Key invariants**: no BOM cycles; materials picked once per line.

**Security model**: MO View/Edit/Mobile/Prioritize; labor hours View/Edit.

**Critical test scenarios**:
- Happy path: MO for 10 kits picks parts, logs time, completes, kit cost correct, verifies **AC-3**, **AC-4**, **AC-6**
- Failure case: adding product A as a component of itself (through B) is refused, verifies **AC-1**
- Buildable: parts for 7 kits show buildable 7, verifies **AC-7**

## Build plan

1. Push `Bom`, `OperationType`, `ManufactureOrder`, satisfies **AC-1**, **AC-2**, **AC-3**
2. BOM editor with cycle check, satisfies **AC-1**, **AC-2**
3. MO screens and timesheets, satisfies **AC-3**, **AC-5**
4. Pick, put away, cost roll up (after D1), satisfies **AC-4**, **AC-6**
5. Buildable view, satisfies **AC-7**
6. P2: auto assemble, disassembly, satisfies **AC-8**

## Consequences

**Positive**: BOMs and MOs save atomically.
**Negative / tradeoffs**: production stock and cost wait on D1.
**Neutral**: the DB design's `BOM_COMPONENT` table becomes an embedded array.
