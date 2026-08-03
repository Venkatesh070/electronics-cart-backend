# Electronics Cart — Ecommerce Backend

Node + Express + TypeScript + MongoDB API aligned to the **E-commerce Platform Scope** (customer website + admin panel).

Auth: send `Authorization: Bearer <token>` on protected routes.

Roles: `customer` | `support` | `manager` | `admin` | `superadmin`.  
Staff permissions are enforced via `AdminRole` module matrix (`view` / `edit` / `delete`). Superadmins bypass the matrix.

---

## Getting started

```bash
npm install
cp .env.example .env
npm run dev      # http://localhost:5000 (or PORT from .env)
npm run build && npm start
```

**Swagger UI:** [http://localhost:5000/api-docs](http://localhost:5000/api-docs)  
**OpenAPI JSON:** [http://localhost:5000/api-docs.json](http://localhost:5000/api-docs.json)

Use **Authorize** in Swagger and paste a JWT from `/api/auth/login` to try protected routes.

---

## Customer / User APIs

### Auth
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/auth/register` | Public | Register customer |
| POST | `/api/auth/login` | Public | Login, get JWT |
| GET | `/api/auth/me` | User | Current profile |

### Profile
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| PUT | `/api/users/me` | User | Update name / phone / DOB |
| PUT | `/api/users/me/password` | User | Change password |
| PUT | `/api/users/me/notification-preferences` | User | Toggle order/price/promo/support prefs |

### Addresses
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/addresses` | User | List saved addresses |
| POST | `/api/addresses` | User | Add address (labels: home/work/other) |
| PUT | `/api/addresses/:id` | User | Edit address / set default |
| DELETE | `/api/addresses/:id` | User | Delete address |

### Payment methods (tokenized cards / UPI)
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/payment-methods` | User | List saved methods |
| POST | `/api/payment-methods` | User | Add method |
| PUT | `/api/payment-methods/:id/default` | User | Set default |
| DELETE | `/api/payment-methods/:id` | User | Remove |

### Home / catalog
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/banners` | Public | Active homepage/category banners |
| GET | `/api/homepage-blocks` | Public | Active homepage content blocks |
| GET | `/api/flash-sales` | Public | Live flash / deal-of-the-day sales |
| GET | `/api/categories` | Public | Category tree + product counts |
| GET | `/api/categories/:slug` | Public | Category detail |
| GET | `/api/brands` | Public | Brands (incl. featured) |
| GET | `/api/brands/:slug` | Public | Brand detail |
| GET | `/api/products` | Public | PLP: filters (`category`, `brand`, `minPrice`, `maxPrice`, `minRating`, `inStock`, `spec.*`), sort (`price_asc`, `price_desc`, `popularity`, `newest`, `rating`), pagination |
| GET | `/api/products/:id` | Public | PDP by id |
| GET | `/api/products/slug/:slug` | Public | PDP by slug |
| GET | `/api/products/:id/related` | Public | Related / FBT products |
| GET | `/api/products/compare?ids=a,b,c` | Public | Side-by-side compare (max 4) |
| GET | `/api/shipping/estimate?state=&pincode=&subtotal=` | Public | Delivery ETA + fee by location |
| GET | `/api/shipping/zones` | Public | Active shipping zones |

### Search
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/search/autocomplete?q=` | Public | Product / brand / category suggestions |
| GET | `/api/search/trending` | Public | Trending searches |
| GET | `/api/search/recent` | User | Recent searches |
| POST | `/api/search/log` | Optional | Log a search query |

### Wishlist
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/wishlist` | User | Saved items (price-drop via `priceWhenAdded`) |
| POST | `/api/wishlist/items` | User | Add `{ productId }` |
| DELETE | `/api/wishlist/items/:productId` | User | Remove |
| POST | `/api/wishlist/items/:productId/move-to-cart` | User | Move to cart |
| GET | `/api/wishlist/shared/:wishlistId` | Public | Shared wishlist view |

### Cart & checkout
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/cart` | User | Cart with line items |
| GET | `/api/cart/summary?state=` | User | Subtotal, discount, tax, shipping, total |
| GET | `/api/cart/recommendations` | User | Cross-sell recommendations |
| POST | `/api/cart/items` | User | Add item |
| PUT | `/api/cart/items/:productId` | User | Update qty |
| DELETE | `/api/cart/items/:productId` | User | Remove |
| POST | `/api/cart/items/:productId/move-to-wishlist` | User | Move to wishlist |
| DELETE | `/api/cart` | User | Clear cart |
| POST | `/api/cart/coupon` | User | Apply coupon `{ code }` |
| DELETE | `/api/cart/coupon` | User | Remove coupon |
| POST | `/api/cart/gift-card` | User | Apply gift card `{ code }` |
| DELETE | `/api/cart/gift-card/:code` | User | Remove gift card |
| POST | `/api/coupons/validate` | User | Preview coupon validity |
| POST | `/api/orders` | User | Place order (`addressId` or `shippingAddress`, `deliverySlot`, `paymentMethod`) |

### Orders
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/orders` | User | Order history |
| GET | `/api/orders/:id` | User | Order detail / success summary |
| GET | `/api/orders/:id/tracking` | User | Status timeline + courier |
| GET | `/api/orders/:id/invoice` | User | Invoice payload |
| POST | `/api/orders/:id/cancel` | User | Cancel (pending/confirmed/paid) |
| POST | `/api/orders/:id/reorder` | User | Re-add items to cart |

Order statuses: `pending` → `confirmed` → `paid` → `shipped` → `out_for_delivery` → `delivered` (or `cancelled`).

### Returns
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| POST | `/api/returns` | User | Request return/exchange |
| GET | `/api/returns` | User | My return requests |
| GET | `/api/returns/:id` | User | Return status / refund |

### Reviews & Q&A
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/reviews/product/:productId` | Public | Product reviews + rating breakdown |
| GET | `/api/reviews/mine` | User | My reviews |
| GET | `/api/reviews/pending-prompts` | User | Delivered orders awaiting review |
| POST | `/api/reviews` | User | Create review (rating, text, photos) |
| PUT | `/api/reviews/:id` | User | Edit review |
| DELETE | `/api/reviews/:id` | User | Delete review |
| POST | `/api/reviews/:id/report` | User | Flag review |
| GET | `/api/questions/product/:productId` | Public | Product Q&A |
| POST | `/api/questions` | User | Ask a question |

### Notifications
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/notifications` | User | List (read/unread) |
| PUT | `/api/notifications/:id/read` | User | Mark one read |
| PUT | `/api/notifications/read-all` | User | Mark all read |

### Support, CMS, blog, newsletter
| Method | Route | Auth | Description |
|--------|-------|------|-------------|
| GET | `/api/faqs` | Public | Help center FAQs |
| POST | `/api/tickets` | User | Raise ticket (optional order link) |
| GET | `/api/tickets` | User | My tickets |
| GET | `/api/tickets/:id` | User | Ticket detail |
| POST | `/api/tickets/:id/messages` | User | Reply on ticket |
| GET | `/api/pages/:slug` | Public | Static page (About, Policies, Terms) |
| GET | `/api/blog` | Public | Blog listing |
| GET | `/api/blog/:slug` | Public | Article detail |
| POST | `/api/newsletter/subscribe` | Public | Newsletter signup |
| POST | `/api/newsletter/unsubscribe` | Public | Unsubscribe |
| GET | `/api/gift-cards/denominations` | Public | Gift card catalog |
| GET | `/api/gift-cards/balance/:code` | Public | Balance lookup |
| POST | `/api/gift-cards/redeem` | User | Redeem gift card |

---

## Admin APIs

All `/api/admin/*` routes require staff auth + module permission (except where noted).  
Several modules also expose admin endpoints on their resource routers.

### Dashboard, reports, analytics
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/admin/dashboard` | `dashboard:view` | KPIs, trends, status donut, low stock, recent orders |
| GET | `/api/admin/reports?type=sales\|inventory\|customers\|tax&from=&to=` | `reports:view` | Exportable report rows |
| GET | `/api/analytics` | `analytics:view` | Top products/categories, search trends, conversion |

### Products
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| POST | `/api/products` | `products:edit` | Create (details, pricing, images, specs, variants, SEO) |
| PUT | `/api/products/:id` | `products:edit` | Update / publish / draft / archive |
| DELETE | `/api/products/:id` | `products:delete` | Delete |
| PUT | `/api/products/bulk-status` | `products:edit` | Bulk status |
| DELETE | `/api/products/bulk` | `products:delete` | Bulk delete |
| GET | `/api/products/low-stock` | `inventory:view` | Low-stock list |

### Categories & brands
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| POST | `/api/categories` | `categories:edit` | Create |
| PUT | `/api/categories/reorder` | `categories:edit` | Drag-to-reorder tree |
| PUT | `/api/categories/:id` | `categories:edit` | Update |
| DELETE | `/api/categories/:id` | `categories:delete` | Delete |
| POST | `/api/brands` | `brands:edit` | Create |
| PUT | `/api/brands/:id` | `brands:edit` | Update (incl. homepage feature) |
| DELETE | `/api/brands/:id` | `brands:delete` | Delete |

### Inventory
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/admin/inventory/warehouses` | `inventory:view` | Warehouses |
| POST | `/api/admin/inventory/warehouses` | `inventory:edit` | Add warehouse |
| GET | `/api/admin/inventory/low-stock` | `inventory:view` | Low-stock alerts |
| GET | `/api/admin/inventory/adjustments` | `inventory:view` | Stock adjustment log |
| POST | `/api/admin/inventory/adjust` | `inventory:edit` | Adjust stock |
| POST | `/api/admin/inventory/:productId/reorder` | `inventory:edit` | Flag reorder |

### Orders & returns
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/orders/admin` | `orders:view` | Order table (status, payment, date, search) |
| PUT | `/api/orders/:id/status` | `orders:edit` | Update status + tracking |
| GET | `/api/returns/admin` | `returns:view` | Return queue |
| PUT | `/api/returns/:id/status` | `returns:edit` | Approve/reject/refund/replacement |

### Customers
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/admin/customers` | `customers:view` | List + spend stats |
| GET | `/api/admin/customers/:id` | `customers:view` | Profile (orders, addresses, tickets, notes) |
| PUT | `/api/admin/customers/:id/block` | `customers:edit` | Block/unblock |
| POST | `/api/admin/customers/:id/notes` | `customers:edit` | Add admin note |

### Coupons & gift cards
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET/POST/PUT/DELETE | `/api/coupons` | `coupons:*` | Coupon CRUD + usage |
| GET/POST | `/api/gift-cards/denominations` | `gift-cards:*` | Denomination catalog |
| DELETE | `/api/gift-cards/denominations/:id` | `gift-cards:delete` | Remove denomination |
| GET/POST | `/api/gift-cards` | `gift-cards:*` | Issued cards / manual issue |
| PUT | `/api/gift-cards/:id/void` | `gift-cards:edit` | Void card |

### Reviews moderation & support
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/reviews` | `reviews:view` | Moderation queue |
| PUT | `/api/reviews/:id/moderate` | `reviews:edit` | Approve/reject/flag |
| GET | `/api/tickets/admin` | `support:view` | All tickets |
| PUT | `/api/tickets/:id/close` | `support:edit` | Close ticket |
| PUT | `/api/questions/:id/answer` | Admin | Answer product question |
| GET/POST/PUT/DELETE | `/api/faqs` | `cms:*` | FAQ management |

### CMS, banners, flash sales, marketing
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET | `/api/pages/admin` | `cms:view` | List CMS pages |
| POST/PUT/DELETE | `/api/pages` | `cms:*` | Page editor |
| GET | `/api/homepage-blocks/admin` | `cms:view` | All homepage blocks |
| POST/PUT/DELETE | `/api/homepage-blocks` | `cms:*` | Block management |
| GET | `/api/blog/admin` | `blog:view` | All posts |
| POST/PUT/DELETE | `/api/blog` | `blog:*` | Blog editor |
| GET | `/api/banners/admin` | `banners:view` | All banners |
| POST/PUT/DELETE | `/api/banners` | `banners:*` | Banner schedule |
| GET | `/api/flash-sales/admin` | `flash-sales:view` | All sales |
| GET | `/api/flash-sales/:id/performance` | `flash-sales:view` | Live performance |
| POST/PUT/DELETE | `/api/flash-sales` | `flash-sales:*` | Timed sales |
| GET/POST/PUT/DELETE | `/api/admin/campaigns` | `marketing:*` | Email/SMS campaigns |
| POST | `/api/admin/campaigns/:id/send` | `marketing:edit` | Send campaign |
| GET | `/api/newsletter` | `marketing:view` | Newsletter subscribers |

### Taxes, shipping, payments, settings
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET/POST/PUT/DELETE | `/api/admin/taxes` | `taxes:*` | GST / regional tax rules |
| GET/POST/PUT/DELETE | `/api/admin/shipping` | `shipping:*` | Zones, rates, free-shipping, courier |
| GET/PUT | `/api/admin/payment-settings` | `payment-settings:*` | Gateways, methods, credentials |
| GET/PUT | `/api/admin/settings` | `settings:*` | Store info, currency, locale, maintenance |

### Roles, API management, audit
| Method | Route | Permission | Description |
|--------|-------|------------|-------------|
| GET/POST/PUT/DELETE | `/api/admin/roles` | `roles:*` | Role + permission matrix |
| GET/POST | `/api/admin/staff` | `roles:*` | Staff accounts |
| PUT | `/api/admin/staff/:id/role` | `roles:edit` | Assign role |
| GET | `/api/admin/audit-logs` | `audit-logs:view` | Who / what / when |
| GET/POST/DELETE | `/api/admin/api-keys` | `api-management:*` | API key generate/revoke |
| GET/POST/PUT/DELETE | `/api/admin/webhooks` | `api-management:*` | Webhook config |

### Permission module keys

Use these `module` values in `AdminRole.permissions`:

`dashboard`, `products`, `categories`, `brands`, `inventory`, `orders`, `returns`, `customers`, `coupons`, `gift-cards`, `reviews`, `cms`, `blog`, `marketing`, `banners`, `flash-sales`, `taxes`, `shipping`, `payment-settings`, `roles`, `reports`, `analytics`, `audit-logs`, `api-management`, `settings`, `support`

---

## Project structure

```
src/
  config/        # DB connection
  models/        # Mongoose schemas
  controllers/   # Route handlers
  routes/        # Express routers (incl. routes/admin)
  middleware/    # Auth, permissions, errors
  utils/         # Pricing, coupons, audit, notify
  app.ts
  server.ts
```
# ecommerce-server
