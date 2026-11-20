# Security Specification (Phase 0)

## 1. Data Invariants
1. Every document ID across all collections must match `^[a-zA-Z0-9_-]+$` and be <= 128 characters.
2. Users may only read or update their own `/users/{userId}` document (no PII leakage to other signed-in users).
3. A building's `ownerId` is immutable and must equal `request.auth.uid` on creation.
4. Subcollection records (`/apartments`, `/payments`, `/appliances`, `/repairTickets`, `/defects`, `/calendarEvents`, `/expenses`) cannot exist without a parent `/buildings/{buildingId}` document and may only be accessed by verified members or the building owner.
5. Tenants cannot modify rent amounts, payment amounts, or building settings; they may only update meter readings on their own apartment, upload payment proof (`status: 'pending_verification'`) on their own bills, and create new repair tickets (`status: 'reported'`).
6. Creating or deleting an expense must atomically update the parent building's `reserveFundBalance` (`getAfter` check).
7. Terminal states (`confirmed_paid` on payments, `completed` on repairTickets, `verified_fixed` on defects) lock subsequent non-admin edits.
8. All `allow list` rules evaluate `resource.data` directly without `get()` or `exists()` lookups.

## 2. The "Dirty Dozen" Payloads (Expected: PERMISSION_DENIED)
1. **Unauthenticated read**: Unauthenticated client reading `/buildings/bld-1`.
2. **Unverified email write**: Signed-in user with `email_verified: false` creating `/buildings/bld-1`.
3. **ID poisoning**: Creating `/buildings/invalid$id..with.dots`.
4. **Identity spoofing**: Creating `/buildings/bld-2` with `ownerId: "victim-uid"`.
5. **Shadow / ghost field injection**: Updating `/users/uid-1` with `{ name: "X", isAdmin: true }`.
6. **Cross-user PII read**: User A reading `/users/user-b`.
7. **Self-assigned building membership**: Creating `/buildings/bld-1/members/attackerUid` with `role: "owner"` without an invite.
8. **Tenant rent tampering**: Tenant updating `/buildings/bld-1/apartments/apt-5` with `monthlyRent: 1`.
9. **Tenant payment self-confirmation**: Tenant updating `/buildings/bld-1/payments/pay-1` with `status: "confirmed_paid"`.
10. **Terminal state bypass**: Modifying a `confirmed_paid` payment or `completed` repair ticket as non-admin.
11. **Orphaned expense without reserve-fund update**: Creating `/buildings/bld-1/expenses/exp-1` without atomically decrementing `buildings/bld-1.reserveFundBalance`.
12. **Blanket list scraping**: Listing `/buildings` without scoping to `ownerId`, `memberUids`, or admin.
