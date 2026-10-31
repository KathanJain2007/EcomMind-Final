"""Sales channels EcomMind knows about, and their API integration points.

No marketplace API adapter is implemented yet, so no channel is ever reported
as connected. Orders are recorded in EcomMind by the seller (or, later, by an
adapter). When an adapter is added, it registers in ADAPTERS and reads its
credentials from the environment variables listed here.
"""
from __future__ import annotations

import os
from dataclasses import dataclass, field
from typing import Callable, Optional


@dataclass(frozen=True)
class Channel:
    id: str
    name: str
    commission_pct: float  # of the order value
    fixed_fee: int  # paise per order
    credential_env: tuple[str, ...] = field(default_factory=tuple)
    docs: str = ""


CHANNELS: dict[str, Channel] = {c.id: c for c in [
    Channel("amazon", "Amazon India", 14.5, 25_00, ("AMAZON_SP_API_CLIENT_ID", "AMAZON_SP_API_CLIENT_SECRET", "AMAZON_SP_API_REFRESH_TOKEN"),
            "Amazon Selling Partner API (Seller Central developer registration)"),
    Channel("flipkart", "Flipkart", 12.0, 20_00, ("FLIPKART_APP_ID", "FLIPKART_APP_SECRET"), "Flipkart Marketplace Seller API"),
    Channel("meesho", "Meesho", 1.5, 5_00, ("MEESHO_SUPPLIER_API_KEY",), "Meesho supplier panel API access"),
    Channel("shopify", "Shopify Storefront", 2.0, 0, ("SHOPIFY_STORE_DOMAIN", "SHOPIFY_ADMIN_API_TOKEN"), "Shopify Admin API custom app"),
    Channel("instagram", "Instagram Shopping", 5.0, 0, ("META_COMMERCE_ACCESS_TOKEN", "META_CATALOG_ID"), "Meta Commerce Manager catalog API"),
]}

# channel id -> adapter that pushes listings / pulls orders. Empty until one is built.
ADAPTERS: dict[str, Callable[..., object]] = {}

SHIPPING_PER_UNIT = 45_00  # estimated, paise
PACKAGING_PER_UNIT = 15_00
GST_PCT = 18.0  # included in the selling price


def credentials_present(ch: Channel) -> bool:
    return bool(ch.credential_env) and all(os.environ.get(v) for v in ch.credential_env)


def connection_status(ch: Channel) -> tuple[str, str]:
    if ch.id in ADAPTERS and credentials_present(ch):
        return "connected", "Synchronised through the marketplace API."
    if credentials_present(ch):
        return "credentials_only", "Credentials are set, but no API adapter for this channel is built yet. Orders are recorded in EcomMind."
    return "not_connected", "No marketplace API connected. Record orders from this channel in EcomMind."


def get(channel_id: str) -> Optional[Channel]:
    return CHANNELS.get(channel_id)
