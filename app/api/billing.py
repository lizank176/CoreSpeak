from __future__ import annotations

from datetime import datetime, timedelta

import stripe
from sqlalchemy.exc import IntegrityError
from fastapi import APIRouter, Depends, Header, HTTPException, Request, status
from sqlmodel import Session, select

from app.config import settings
from app.db import get_session
from app.dependencies import get_current_user, require_premium_or_grace
from app.models import AppUser, BillingRecord, PaymentProvider, StripeWebhookEvent
from app.schemas import CheckoutRequest, CheckoutResponse, PortalResponse, PricingResponse, SubscriptionStatusResponse
from app.services.enrollment_service import sync_user_enrollments

router = APIRouter(prefix="/api/billing", tags=["billing"])


@router.get("/pricing", response_model=PricingResponse)
def pricing() -> PricingResponse:
    return PricingResponse(
        free_plan={
            "name": "Gratis",
            "price_eur_month": 0,
            "features": [
                "1 idioma activo",
                "2 lecciones por dia",
                "Retos basicos",
            ],
        },
        premium_plan={
            "name": "Premium",
            "price_eur_month": 5,
            "features": [
                "Idiomas ilimitados",
                "Feedback IA detallado",
                "Retos avanzados y contenido exclusivo",
                "Historial de facturacion",
            ],
        },
    )


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
def subscription_status(user: AppUser = Depends(get_current_user)) -> SubscriptionStatusResponse:
    status_value = user.subscription_status or "inactive"
    if user.is_premium and status_value == "inactive":
        status_value = "active"
    return SubscriptionStatusResponse(
        is_premium=user.is_premium,
        subscription_status=status_value,
        subscription_id=user.subscription_id,
        customer_id=user.customer_id,
        expiry_date=user.expiry_date,
        premium_grace_until=user.premium_grace_until,
    )


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(
    payload: CheckoutRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CheckoutResponse:
    _ = payload
    if not settings.stripe_secret_key or not settings.stripe_price_id_monthly:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configura STRIPE_SECRET_KEY y STRIPE_PRICE_ID_MONTHLY en .env",
        )

    stripe.api_key = settings.stripe_secret_key
    success_url = settings.stripe_success_url or f"{settings.app_base_url}/ui/checkout_success.html?session_id={{CHECKOUT_SESSION_ID}}"
    cancel_url = settings.stripe_cancel_url or f"{settings.app_base_url}/ui/checkout_cancel.html"
    try:
        customer_id = user.customer_id
        if not customer_id:
            customer = stripe.Customer.create(email=user.email, metadata={"user_id": str(user.id)})
            customer_id = customer.id
            user.customer_id = customer_id
        checkout_session = stripe.checkout.Session.create(
            mode="subscription",
            line_items=[{"price": settings.stripe_price_id_monthly, "quantity": 1}],
            success_url=success_url,
            cancel_url=cancel_url,
            metadata={"user_id": str(user.id)},
            customer=customer_id,
            allow_promotion_codes=True,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"Stripe checkout error: {exc}",
        ) from exc

    if user.customer_id:
        session.add(user)
        session.commit()

    return CheckoutResponse(
        checkout_url=checkout_session.url or "",
        provider="stripe",
        message="Checkout Stripe generado correctamente.",
    )


@router.post("/portal", response_model=PortalResponse)
def create_portal_session(
    user: AppUser = Depends(get_current_user),
) -> PortalResponse:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Configura STRIPE_SECRET_KEY")
    if not user.customer_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Usuario sin customer_id de Stripe")
    stripe.api_key = settings.stripe_secret_key
    try:
        portal = stripe.billing_portal.Session.create(
            customer=user.customer_id,
            return_url=f"{settings.app_base_url}/ui/dashboard.html",
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Stripe portal error: {exc}") from exc
    return PortalResponse(portal_url=portal.url, message="Portal de cliente listo")


@router.post("/webhooks/stripe")
async def stripe_webhook(
    request: Request,
    stripe_signature: str | None = Header(default=None, alias="Stripe-Signature"),
    session: Session = Depends(get_session),
) -> dict:
    if not settings.stripe_secret_key or not settings.stripe_webhook_secret:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Configura STRIPE_SECRET_KEY y STRIPE_WEBHOOK_SECRET en .env",
        )
    if not stripe_signature:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe-Signature header")

    stripe.api_key = settings.stripe_secret_key
    payload_bytes = await request.body()
    try:
        event = stripe.Webhook.construct_event(payload_bytes, stripe_signature, settings.stripe_webhook_secret)
    except stripe.error.SignatureVerificationError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook signature") from exc
    except ValueError as exc:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Invalid webhook payload") from exc

    event_id = str(event.get("id") or "").strip()
    event_type = event.get("type", "unknown")
    if not event_id:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Missing Stripe event id")

    # Idempotencia: si el evento ya fue procesado, salimos sin volver a aplicar efectos.
    session.add(StripeWebhookEvent(event_id=event_id, event_type=event_type))
    try:
        session.commit()
    except IntegrityError:
        session.rollback()
        return {"received": True, "event_type": event_type, "idempotent": True}

    data = event.get("data", {}).get("object", {})
    if event_type == "checkout.session.completed":
        user_id = int(data.get("metadata", {}).get("user_id", "0"))
        if user_id:
            user = session.get(AppUser, user_id)
            if user:
                paid_until = datetime.utcnow() + timedelta(days=30)
                user.is_premium = True
                user.subscription_id = data.get("subscription")
                user.customer_id = data.get("customer")
                user.subscription_status = "active"
                user.expiry_date = paid_until
                user.premium_grace_until = None
                session.add(user)
                sync_user_enrollments(session, user)
                session.add(
                    BillingRecord(
                        user_id=user.id or 0,
                        provider=PaymentProvider.STRIPE,
                        subscription_id=user.subscription_id,
                        customer_id=user.customer_id,
                        amount_cents=int(data.get("amount_total", 0)),
                        currency=(data.get("currency", "eur") or "eur").upper(),
                        status="paid",
                        paid_at=datetime.utcnow(),
                        expires_at=paid_until,
                        raw_payload_json=event,
                    )
                )
                session.commit()
    elif event_type == "invoice.payment_failed":
        user_id = int(data.get("metadata", {}).get("user_id", "0"))
        user = session.get(AppUser, user_id) if user_id else None
        if not user and data.get("customer"):
            user = session.exec(select(AppUser).where(AppUser.customer_id == data.get("customer"))).first()
        if user:
            user.subscription_status = "past_due"
            user.premium_grace_until = datetime.utcnow() + timedelta(hours=24)
            session.add(user)
            session.commit()
    elif event_type in {"customer.subscription.deleted", "customer.subscription.updated"}:
        subscription_id = data.get("id")
        if subscription_id:
            user = session.exec(select(AppUser).where(AppUser.subscription_id == subscription_id)).first()
            if user:
                if event_type == "customer.subscription.deleted":
                    user.is_premium = False
                    user.subscription_status = "canceled"
                else:
                    user.subscription_status = str(data.get("status") or "active")
                period_end = data.get("current_period_end")
                if period_end:
                    user.expiry_date = datetime.utcfromtimestamp(int(period_end))
                session.add(user)
                session.commit()

    return {"received": True, "event_type": event_type, "idempotent": False}


@router.get("/history")
def billing_history(
    user: AppUser = Depends(require_premium_or_grace),
    session: Session = Depends(get_session),
) -> list[dict]:
    rows = session.exec(select(BillingRecord).where(BillingRecord.user_id == user.id)).all()
    rows = sorted(rows, key=lambda r: r.id or 0, reverse=True)
    return [
        {
            "id": r.id,
            "provider": r.provider,
            "status": r.status,
            "amount_cents": r.amount_cents,
            "currency": r.currency,
            "paid_at": r.paid_at,
            "expires_at": r.expires_at,
        }
        for r in rows
    ]

