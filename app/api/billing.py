"""Flujo de suscripciones y pagos con Stripe.

Incluye checkout, estado de suscripción, portal de cliente y webhook.
"""

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
from app.pricing_plans import billing_pricing_payload
from app.schemas import CheckoutRequest, CheckoutResponse, CancelSubscriptionResponse, PortalResponse, PricingResponse, SubscriptionStatusResponse
from app.services.enrollment_service import sync_user_enrollments

router = APIRouter(prefix="/api/billing", tags=["billing"])


def _resolve_stripe_customer_id(session: Session, user: AppUser) -> str | None:
    """Obtiene customer_id de BD o lo busca en Stripe por email del usuario."""
    existing = str(user.customer_id or "").strip()
    if existing:
        return existing
    if not settings.stripe_secret_key:
        return None
    stripe.api_key = settings.stripe_secret_key
    email = str(user.email or "").strip().lower()
    if not email:
        return None
    try:
        listed = stripe.Customer.list(email=email, limit=10)
        items = listed.get("data") if hasattr(listed, "get") else getattr(listed, "data", [])
        for raw in items or []:
            cid = str(_stripe_to_plain_dict(raw).get("id") or "").strip()
            if cid:
                user.customer_id = cid
                session.add(user)
                session.commit()
                session.refresh(user)
                return cid
    except Exception:
        return None
    return None


def _sync_billing_from_stripe(session: Session, user: AppUser) -> None:
    """Sincroniza IDs de customer/subscription en caso de datos incompletos."""
    _resolve_stripe_customer_id(session, user)
    _resolve_stripe_subscription_id(session, user)


def _resolve_stripe_subscription_id(session: Session, user: AppUser) -> str | None:
    """Obtiene subscription_id de BD o, si falta, la suscripción activa del cliente en Stripe."""
    existing = str(user.subscription_id or "").strip()
    if existing:
        return existing
    customer_id = str(user.customer_id or "").strip()
    if not customer_id:
        customer_id = _resolve_stripe_customer_id(session, user) or ""
    if not customer_id or not settings.stripe_secret_key:
        return None
    stripe.api_key = settings.stripe_secret_key
    try:
        listed = stripe.Subscription.list(customer=customer_id, status="all", limit=20)
        items = listed.get("data") if hasattr(listed, "get") else getattr(listed, "data", [])
        best_id: str | None = None
        for raw in items or []:
            sub_data = _stripe_to_plain_dict(raw)
            status = str(sub_data.get("status") or "").lower()
            sid = str(sub_data.get("id") or "").strip()
            if not sid:
                continue
            if status in {"active", "trialing", "past_due"}:
                best_id = sid
                break
        if best_id:
            user.subscription_id = best_id
            session.add(user)
            session.commit()
            session.refresh(user)
            return best_id
    except Exception:
        return None
    return None


def _stripe_subscription_snapshot(user: AppUser) -> dict:
    """Consulta snapshot de suscripción en Stripe para exponer estado actualizado."""
    sub_id = str(user.subscription_id or "").strip()
    if not sub_id or not settings.stripe_secret_key:
        return {}
    stripe.api_key = settings.stripe_secret_key
    try:
        return _stripe_to_plain_dict(stripe.Subscription.retrieve(sub_id))
    except Exception:
        return {}


@router.get("/pricing", response_model=PricingResponse)
def pricing() -> PricingResponse:
    return PricingResponse(**billing_pricing_payload())


@router.get("/subscription-status", response_model=SubscriptionStatusResponse)
def subscription_status(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> SubscriptionStatusResponse:
    """Devuelve estado consolidado de suscripción para UI de configuración."""
    _sync_billing_from_stripe(session, user)
    status_value = user.subscription_status or "inactive"
    if user.is_premium and status_value == "inactive":
        status_value = "active"
    cancel_at_period_end = status_value in {"cancel_at_period_end", "canceled"}
    expiry_date = user.expiry_date
    sub_data = _stripe_subscription_snapshot(user)
    if sub_data:
        cancel_at_period_end = bool(sub_data.get("cancel_at_period_end"))
        if cancel_at_period_end:
            status_value = "cancel_at_period_end"
        period_end = sub_data.get("current_period_end")
        if period_end:
            expiry_date = datetime.utcfromtimestamp(int(period_end))
    return SubscriptionStatusResponse(
        is_premium=user.is_premium,
        subscription_status=status_value,
        subscription_id=user.subscription_id,
        customer_id=user.customer_id,
        expiry_date=expiry_date,
        premium_grace_until=user.premium_grace_until,
        cancel_at_period_end=cancel_at_period_end,
        can_manage_portal=bool(user.customer_id),
        can_cancel=bool(user.subscription_id) and not cancel_at_period_end,
    )


@router.post("/cancel-subscription", response_model=CancelSubscriptionResponse)
def cancel_subscription(
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CancelSubscriptionResponse:
    """Marca cancelación al final del período pagado (no cancela inmediatamente)."""
    _sync_billing_from_stripe(session, user)
    subscription_id = user.subscription_id or _resolve_stripe_subscription_id(session, user)
    if not subscription_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No tienes una suscripción de pago activa. Si Premium te lo concedió un administrador, contacta con soporte.",
        )
    if not settings.stripe_secret_key:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="El sistema de pagos no está configurado. Contacta con soporte para darte de baja.",
        )

    stripe.api_key = settings.stripe_secret_key
    try:
        sub = stripe.Subscription.modify(subscription_id, cancel_at_period_end=True)
        sub_data = _stripe_to_plain_dict(sub)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo cancelar la suscripción: {exc}",
        ) from exc

    access_until = user.expiry_date
    period_end = sub_data.get("current_period_end")
    if period_end:
        access_until = datetime.utcfromtimestamp(int(period_end))
        user.expiry_date = access_until
    user.subscription_status = "cancel_at_period_end"
    user.subscription_id = subscription_id
    session.add(user)
    session.commit()

    until_text = access_until.strftime("%d/%m/%Y") if access_until else "el final del periodo pagado"
    return CancelSubscriptionResponse(
        message=(
            f"Baja confirmada. No se te volverá a cobrar. "
            f"Mantienes Premium hasta {until_text}."
        ),
        cancel_at_period_end=True,
        access_until=access_until,
        subscription_status=user.subscription_status,
    )


@router.post("/checkout", response_model=CheckoutResponse)
def create_checkout(
    payload: CheckoutRequest,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> CheckoutResponse:
    """Crea sesión de checkout de Stripe para plan mensual."""
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
    session: Session = Depends(get_session),
) -> PortalResponse:
    """Abre sesión del billing portal de Stripe para autogestión del usuario."""
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Configura STRIPE_SECRET_KEY")
    customer_id = _resolve_stripe_customer_id(session, user)
    if not customer_id:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="No encontramos pagos de Stripe vinculados a tu cuenta. Si te cobran, contacta con soporte indicando tu email.",
        )
    stripe.api_key = settings.stripe_secret_key
    return_url = f"{settings.app_base_url.rstrip('/')}/ui/configuracion.html"
    try:
        portal = stripe.billing_portal.Session.create(
            customer=customer_id,
            return_url=return_url,
        )
    except Exception as exc:
        raise HTTPException(status_code=status.HTTP_502_BAD_GATEWAY, detail=f"Stripe portal error: {exc}") from exc
    return PortalResponse(portal_url=portal.url, message="Portal de cliente listo")


@router.get("/checkout-session/{session_id}")
def checkout_session_status(
    session_id: str,
    user: AppUser = Depends(get_current_user),
    session: Session = Depends(get_session),
) -> dict:
    if not settings.stripe_secret_key:
        raise HTTPException(status_code=status.HTTP_500_INTERNAL_SERVER_ERROR, detail="Configura STRIPE_SECRET_KEY")

    stripe.api_key = settings.stripe_secret_key
    try:
        checkout_session = stripe.checkout.Session.retrieve(session_id)
    except Exception as exc:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"No se pudo consultar la sesión de Stripe: {exc}",
        ) from exc

    data = _stripe_to_plain_dict(checkout_session)
    metadata = _stripe_to_plain_dict(data.get("metadata") or {})
    session_user_id = int(str(metadata.get("user_id") or "0") or "0")
    customer_id = str(data.get("customer") or "").strip() or None
    customer_details = _stripe_to_plain_dict(data.get("customer_details") or {})
    customer_email = str(customer_details.get("email") or data.get("customer_email") or "").strip() or None

    owns_session = False
    if session_user_id and session_user_id == int(user.id or 0):
        owns_session = True
    elif customer_id and user.customer_id and customer_id == user.customer_id:
        owns_session = True
    elif customer_email and customer_email.lower() == str(user.email or "").lower():
        owns_session = True
    if not owns_session:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Sesión de pago no encontrada")

    if str(data.get("payment_status") or "").lower() == "paid":
        _apply_paid_checkout_to_user(session, user, data)

    return {
        "id": data.get("id"),
        "status": data.get("status"),
        "payment_status": data.get("payment_status"),
        "customer_email": customer_email,
        "customer_id": customer_id,
        "subscription_id": data.get("subscription"),
        "amount_total": data.get("amount_total"),
        "currency": data.get("currency"),
    }


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
                _apply_paid_checkout_to_user(session, user, data, raw_payload=event)
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


def _apply_paid_checkout_to_user(
    session: Session,
    user: AppUser,
    checkout_data: dict,
    *,
    raw_payload: dict | None = None,
) -> None:
    paid_until = datetime.utcnow() + timedelta(days=30)
    subscription_id = str(checkout_data.get("subscription") or "").strip() or None
    customer_id = str(checkout_data.get("customer") or "").strip() or None
    amount_cents = int(checkout_data.get("amount_total") or 0)
    currency = str(checkout_data.get("currency") or "eur").upper()

    user.is_premium = True
    user.subscription_id = subscription_id
    user.customer_id = customer_id
    user.subscription_status = "active"
    user.expiry_date = paid_until
    user.premium_grace_until = None
    session.add(user)
    sync_user_enrollments(session, user)

    existing_record = None
    if subscription_id:
        existing_record = session.exec(
            select(BillingRecord).where(
                BillingRecord.user_id == int(user.id or 0),
                BillingRecord.subscription_id == subscription_id,
                BillingRecord.status == "paid",
            )
        ).first()
    if existing_record is None and customer_id:
        existing_record = session.exec(
            select(BillingRecord).where(
                BillingRecord.user_id == int(user.id or 0),
                BillingRecord.customer_id == customer_id,
                BillingRecord.amount_cents == amount_cents,
                BillingRecord.status == "paid",
            )
        ).first()

    if existing_record:
        existing_record.expires_at = paid_until
        existing_record.paid_at = existing_record.paid_at or datetime.utcnow()
        existing_record.raw_payload_json = raw_payload or checkout_data
        session.add(existing_record)
    else:
        session.add(
            BillingRecord(
                user_id=user.id or 0,
                provider=PaymentProvider.STRIPE,
                subscription_id=subscription_id,
                customer_id=customer_id,
                amount_cents=amount_cents,
                currency=currency,
                status="paid",
                paid_at=datetime.utcnow(),
                expires_at=paid_until,
                raw_payload_json=raw_payload or checkout_data,
            )
        )

    session.commit()


def _stripe_to_plain_dict(value: object) -> dict:
    plain = _stripe_to_plain(value)
    return plain if isinstance(plain, dict) else {}


def _stripe_to_plain(value: object) -> object:
    if value is None:
        return None
    if isinstance(value, dict):
        return {str(k): _stripe_to_plain(v) for k, v in value.items()}
    if isinstance(value, (list, tuple)):
        return [_stripe_to_plain(item) for item in value]
    if hasattr(value, "to_dict_recursive"):
        try:
            return _stripe_to_plain(value.to_dict_recursive())
        except Exception:
            pass
    raw = getattr(value, "_data", None)
    if isinstance(raw, dict):
        return {str(k): _stripe_to_plain(v) for k, v in raw.items()}
    return value


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

