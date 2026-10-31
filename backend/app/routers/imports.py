"""Data import (Import Data page and onboarding use the same endpoint)."""
from __future__ import annotations

from typing import Literal, Optional

from fastapi import APIRouter, Depends, File, Form, Query, UploadFile
from sqlalchemy import select
from sqlalchemy.orm import Session

from ..db import get_db
from ..deps import current_business, current_user
from ..errors import ApiError
from ..models import Business, ImportBatch, User
from ..services import imports as svc

router = APIRouter(prefix="/api/imports", tags=["imports"])


@router.post("", status_code=201)
async def upload(file: UploadFile = File(...), dataset: Optional[str] = Form(default=None),
                 source: Literal["import_page", "onboarding"] = Form(default="import_page"),
                 user: User = Depends(current_user), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    content = await file.read(svc.MAX_BYTES + 1)
    results = svc.import_file(db, biz.id, user.id, user.name, file_name=file.filename or "upload", content=content,
                              dataset=dataset or None, source=source)
    db.commit()
    return {"batches": results}


@router.get("")
def history(limit: int = Query(default=50, ge=1, le=200), biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    rows = db.scalars(select(ImportBatch).where(ImportBatch.business_id == biz.id).order_by(ImportBatch.created_at.desc())
                      .limit(limit)).all()
    return {"batches": [svc.out(b) for b in rows],
            "datasets": [{"key": k, "label": d["label"], "required": d["required"], "optional": d["optional"]}
                         for k, d in svc.DATASETS.items()]}


@router.get("/{batch_id}")
def get_batch(batch_id: str, biz: Business = Depends(current_business), db: Session = Depends(get_db)):
    b = db.get(ImportBatch, batch_id)
    if not b or b.business_id != biz.id:
        raise ApiError(404, "import_not_found", "Import not found.")
    return svc.out(b)
