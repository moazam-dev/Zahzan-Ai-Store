# Guest Checkout — Design

Date: 2026-08-20
Status: Approved

## Goal

Placing an order must not require an account. A customer can check out as a
guest; a customer who is signed in gets the same form with their email
prefilled. **The email field is compulsory and visible in both cases** — it is
the identity the order is stored against, and the channel every order update is
sent through.

When an account later exists with that email, the guest orders placed with it
appear in that account's order history.

## Decisions taken (with the rejected alternative)

| Decision | Chosen | Rejected |
|---|---|---|
| Guest payment methods | All of them (COD + the three prepaid methods) | COD only |
| Post-order tracking | Emails only — confirmation plus every status change | Also a public track-order page |
| History linking | Match on email at READ time; never rewrite an order | Claim orders at signup |
| Guest cart | Persisted to localStorage, merged on sign-in | Leave it in React state |

## Schema — `supabase/migrations/0005_guest_orders.sql`

| Change | Why |
|---|---|
| `orders.user_id` → nullable | A guest order has no account. The FK stays, so any non-null value is still a real user. |
| `payments.user_id` → nullable | Same, for prepaid guest orders. |
| `orders_customer_email_idx` on `lower(customer_email)` | Order history now looks up by email; without it every account page load is a sequential scan. |

No new table: `user_id is null` IS the definition of a guest order.

## Optional auth

New `optionalAuth(request)` in `lib/auth.js`:

- no `Authorization` header → `{ user: null }`
- valid token → `{ user }`
- **invalid or expired token → `{ user: null }`, NOT a 401**

That last case is deliberate and is the one real difference from `requireAuth`.
Checkout must never hard-fail because a session went stale, and the order still
reaches the customer's history through the email match. `requireAuth` is
unchanged and still guards every other route.

## Order creation — `POST /api/orders`

- `requireAuth` → `optionalAuth`; every `user.*` dereference guarded.
- Email is required server-side in BOTH cases — no silent fallback to the
  account's email. The form prefills it when signed in, but the value stored is
  the value in the field.
- A guest's cart items travel in the request body, because a guest has no
  server-side cart. **Only `productId`, `quantity`, `selectedSize` and
  `selectedColor` are read from that input.** Price, name, SKU, image and stock
  are still re-read from the locked `products` row inside `create_order()`, so a
  guest cannot influence what they are charged. This is the same guarantee the
  logged-in path already had.
- `create_order()` is passed `null` for the user. Its cart-clearing step is
  already a no-op for a null user, so the function itself needs no change.

## Reading orders

`GET /api/orders`, `GET /api/orders/my-orders`:

```sql
where user_id = $1
   or (user_id is null and lower(customer_email) = lower($2))
```

Nothing is ever rewritten. A guest order surfaces as soon as an account exists
with that email — whether the account is created afterwards, or already existed
and the customer happened to check out signed out. `GET /api/orders/:id` and the
cancel route use the same ownership rule.

## Prepaid guest orders

Proof uploaded DURING checkout works as soon as auth is optional. For uploading
it LATER, the confirmation email carries a link holding a signed token: a JWT
scoped to one order id, minted by `generateOrderAccessToken` in `lib/jwt.js`.
`verifyToken` explicitly rejects scoped tokens, so an order link can never be
used as a login. `_submitPaymentProof.js` and `GET /api/payments/order/:orderId`
accept either a signed-in owner or a valid token for that order.

## Frontend

- `components/CheckoutModal.jsx` — email field always rendered and required;
  prefilled from the account when signed in, blank otherwise. The `if (!token)
  return` gate is removed. Guest cart items are sent in the request body.
- `views/Product.jsx` — the "Please sign in to complete your purchase." alert and
  redirect on Buy Now are removed.
- `context/CartContext.jsx` — the guest cart is persisted to localStorage and
  merged into the server cart on sign-in.
- Account order history needs no change; the server does the matching.

## Emails

Confirmation and every status-change email already send to `customer_email`, so
guests are covered with no change. The only addition is the signed payment link
in the confirmation email for non-COD orders.

## Known exposure, accepted

Registration sets `is_email_verified = true` without ever sending a verification
email, so nothing in this system proves email ownership. Consequently, if someone
types another person's email at guest checkout, that order — including the
orderer's name, phone and shipping address — appears in that person's order
history.

This is inherent to "link orders by email", which is the requested behaviour, and
it was raised with the user before implementation and accepted. The clean fix is
to make history-matching conditional on a verified email address; that requires
verification-on-signup, which is a separate piece of work and is NOT part of this
change.

## Out of scope

Admin panel (no query there joins `users`, so guest orders already appear),
products, newsletter, virtual try-on, storage.
