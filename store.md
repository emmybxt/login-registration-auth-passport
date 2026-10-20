# Parent Storefront and Fulfilment Centres

How good.online (the parent storefront) should sell from every fulfilment centre (FC), while FC subdomains (lekki.good.online, and later ikeja.good.online) stay limited to their own FC.

## Problem

- A user on good.online whose location is Lekki cannot see Lekki food items.
- The business wants good.online to act as the parent site that can sell from every FC, with subdomains for local items only.
- When a new FC such as Ikeja gets its own domain, we need a clear rule for which FC's stock a parent-site order uses.

## Constraints (agreed)

- **A cart always belongs to one FC.**
- **Food is strictly local.** Food delivery is only allowed to areas the food vendor can deliver to.
- **Prices do not vary by FC.**

## How it works today

The code treats a domain and an FC as the same thing.

1. **Each domain resolves to one FC.** `storefrontContextMiddleware` ([storefrontContext.ts](../src/shared/middleware/storefrontContext.ts)) finds the FC whose `domain` matches the request, using `resolveStorefrontDomainContext` ([storefrontSectionConfig.ts](../src/shared/utils/storefrontSectionConfig.ts)).
2. **Listings only show stock at that FC.** `buildStorefrontSellableProductStages` ([product-inventory-query.ts](../src/shared/service/product-inventory-query.ts)) keeps only products with `ProductFulfilmentStock` at the storefront FC. Lekki food stock sits on the Lekki FC, so good.online hides it.
3. **Carts are keyed by user, FC and cart type.** See `CartRepository.getUserCart` ([cartRepository.ts](../src/shared/repositories/cartRepository.ts)). The storefront FC takes priority over the FC the client sends (`getCartLookupFulfilmentCentreId` in [orderFulfilmentPolicy.ts](../src/v1/helpers/orderFulfilmentPolicy.ts)).
4. **Each order has one FC, and its stock comes from that FC.** `reduceStockQuantityOnOrderItems` ([order.ts](../src/v1/helpers/order.ts)) calls `productInventoryService.reduceStockForOrder` with `order.fulfilmentCentre`.
5. **How the order's FC is chosen** (`getOrderFulfilmentCentreIdForStorefront`, `resolveFulfilmentCentreForOrder`):
   - **Lifestyle:** the FC the client sends, otherwise the storefront FC.
   - **Food delivery:** the nearest FC in the delivery region among the vendors' common FCs (`getNearestFulfilmentCentreId` with `requireRegionMatch`). This ignores the cart's FC and does not check stock.

## Design

**The cart's FC decides everything:** what the user sees, which cart they use, which FC the order is assigned to, and where stock is taken from.

| | Parent (good.online) | Subdomain (e.g. lekki.good.online) |
|---|---|---|
| Active FC | Chosen from the user's location (see order below) | Always the subdomain's FC |
| User can switch FC | Yes. Each FC keeps its own cart. | No |
| Sections shown | Whatever that FC's `config` enables | Whatever that FC's `config` enables |
| Listing | Stock at the active FC | Stock at its FC (unchanged) |
| Order FC and stock source | The cart's FC | The cart's FC |

**How the parent picks the active FC**, in order:

1. The FC the user picked in the location picker.
2. The user's saved FC (`User.preferredFulfilmentCentreId`).
3. The nearest FC, by region.
4. A default FC.

### Where stock comes from

The parent site holds no stock. An order placed on good.online takes stock from its cart's FC. For example, a parent-site user whose location resolves to Ikeja uses an Ikeja cart, their order is assigned to Ikeja, and Ikeja's stock goes down.

### Food

- The listing shows food stocked at the cart's FC.
- **Pickup:** the order goes to the cart's FC.
- **Delivery:** the order also goes to the cart's FC. Checkout is blocked unless the delivery address falls inside the vendor's or product's `deliveryAreaRestriction.areaIds` (`DeliveryRegion`).

## Implementation

### Backend

1. **Detach good.online from its FC.** Clear the `domain` on the FC that good.online maps to today. That FC carries on as a normal FC with its existing stock and orders. When a domain has no FC:
   - `resolveStorefrontDomainContext` already returns all sections and no FC id;
   - cart lookup and order FC selection already fall back to the FC the client sends.
2. **Never create a cart without an FC on the parent site.** Today, a missing FC creates a cart with `fulfilmentCentre: { $exists: false }`. On the parent site, fill the FC in using requested FC → `preferredFulfilmentCentreId` → nearest FC. `resolveEffectiveLocationId` covers part of this already. If nothing resolves, return an error instead of creating a cart with no FC.
3. **Listing fallback.** `getInventoryFulfilmentCentreScope` ([items.ts](../src/v1/controllers/items.ts)) returns no FC when the client sends none. With no FC, listings skip the stock filter entirely. Use the same fallback as step 2.
4. **Food delivery uses the cart's FC.** Change the food branch of `getOrderFulfilmentCentreIdForStorefront` and the food delivery block in `createOrder` so that order FC = cart FC, and remove the re-routing by region. Then check the delivery address against the vendor's or product's delivery areas. `deliveryAreaRestriction` currently appears only in the item and vendor create/update paths, so confirm whether checkout enforces it and add the check if it doesn't.
5. **Lock subdomains to their FC.** For lifestyle orders, a requested FC currently takes priority over the storefront FC. On a subdomain, reject any requested FC that isn't the subdomain's own.

### Frontend

- Add a location/FC picker to good.online.
- Always send `fulfilmentCentreId` on the parent site.
- When the user switches FC, load that FC's cart.

### Launching a new FC (e.g. Ikeja)

Create the FC with its domain (`ikeja.good.online`) and section config, assign creators, and add `ProductFulfilmentStock` rows. Parent-site users whose location resolves to Ikeja then get Ikeja carts automatically.

## Open question

On the parent site, what should happen to a **lifestyle item that isn't stocked at the user's active FC**?

- **Hide it (strict).** This is the design above and needs no extra work.
- **Show it with a label such as "from Ikeja".** Adding it puts it in the user's Ikeja lifestyle cart, which is checked out separately. This still keeps one FC per cart, but the frontend has to handle several carts.

Recommendation: launch with the strict version and add labelled items only if the business asks for them.

## Options considered and rejected

- **A parent catalogue with no FC, routed at checkout** (one cart, each line sent to the nearest FC that has stock, split into several orders). Rejected because carts must belong to one FC.
- **Showing food from every FC on the parent site.** Rejected because food is strictly local.
